# Userscript MCP Workflow Design

**Date:** 2026-03-20

**Goal**

Strengthen the project so AI agents can reliably create, install, debug, regression-test, and export Tampermonkey-compatible userscripts by controlling the local browser through MCP, with setup and recovery behavior that works across different computers.

**Problem Summary**

The repository already contains most low-level building blocks:

- Browser control through CLI/MCP/CDP
- Extension-based `chrome.userScripts` runtime
- Shared userscript metadata helpers
- A dedicated `userscript-mcp` package with scaffold/build/install/publish/test tools

However, the current experience is still fragile for cross-machine reuse:

- Environment assumptions are partially hard-coded
- Runtime state is split across multiple paths with no single diagnostic view
- AI agents must compose many low-level tools manually
- Failure modes are not consistently structured for automatic recovery
- Cross-platform filesystem behavior is not fully normalized

This design turns the existing pieces into a stable hybrid workflow:

- `chrome.userScripts` remains the primary runtime for real userscript behavior
- CDP/browser automation remains available for page inspection, debugging, and regression checks
- `userscript-mcp` becomes the high-level AI workflow entrypoint

## Architecture

The recommended architecture is a hybrid model:

1. `packages/userscript-mcp` becomes the main agent-facing workflow layer
2. `packages/mcp` remains the generic browser control layer
3. `packages/extension` remains the actual userscript dev runtime
4. `packages/shared` becomes the single source of truth for status models, diagnostics, metadata, and error envelopes

This keeps runtime behavior realistic while preserving strong reverse-engineering and regression capabilities.

### Runtime Responsibilities

**Userscript runtime**

- Real execution through `chrome.userScripts`
- `GM_*` bridge support
- Runtime log capture
- Runtime storage capture
- `GM_xmlhttpRequest` tracking
- Publish/install metadata synchronization

**Browser debugging runtime**

- Open target pages
- Snapshot DOM/accessibility tree
- Perform browser interactions
- Capture network activity
- Capture console and JS errors
- Record trace steps for regression scenarios

**Agent workflow layer**

- Diagnose environment before acting
- Create or inspect userscript projects
- Build and install/update scripts
- Drive debug loops
- Run end-to-end regression verification
- Export or locally publish Tampermonkey artifacts

## Target User Flow

The target AI workflow should be:

1. Run `userscript_doctor`
2. Inspect the target page with browser tools as needed
3. Create or update a userscript project
4. Build the userscript
5. Install or update it in the extension runtime
6. Open the target page and observe logs/errors/network
7. Iterate until behavior is correct
8. Run regression checks
9. Export or publish the `.user.js` artifact for Tampermonkey

The important design choice is that agents should not need to manually infer which subsystem is healthy or what to do next. The tooling should tell them.

## Design Principles

- Prefer real userscript semantics over simulated page injection
- Prefer structured diagnostics over free-form error text
- Prefer one high-level workflow tool over many loosely connected low-level calls
- Prefer cross-platform OS APIs over platform-specific temp or path assumptions
- Preserve the existing protocol boundaries unless a shared status model reduces duplication
- Keep CDP as a debugging and verification companion, not the source of truth for userscript execution

## New Shared Status Model

Add a shared workspace and environment status model in `packages/shared`.

### Proposed Types

- `DiagnosticLevel`: `"info" | "warn" | "error"`
- `DiagnosticAction`: executable next-step guidance for humans and agents
- `UserscriptDiagnostic`
- `UserscriptEnvironmentStatus`
- `UserscriptWorkspaceStatus`
- `UserscriptNextStep`

### UserscriptEnvironmentStatus

This model should answer:

- Was a supported browser executable found?
- Which browser/channel was found?
- Is a managed or external browser reachable?
- Is the daemon reachable?
- Is the extension connected?
- Is `chrome.userScripts` available?
- Does the browser meet minimum version requirements?
- Can the publish server bind successfully?

### UserscriptWorkspaceStatus

This model should answer:

- Does the target project root exist?
- Is `meta.json` present and valid?
- Is `src/main.ts` present?
- Can metadata be parsed and validated?
- Does `dist/*.user.js` exist?
- Is a matching userscript currently installed in the runtime?
- Is publish info present?
- What is the recommended next step?

### Error Envelope

High-level tools should consistently return machine-friendly failures shaped like:

```json
{
  "error": "Technical reason",
  "hint": "Human-readable explanation",
  "action": "Executable recovery step"
}
```

This format matches the repository guidance and gives agents a deterministic recovery path.

## MCP Capability Changes

`packages/userscript-mcp` should expose a more workflow-oriented surface.

### New or Enhanced Tools

**`userscript_doctor`**

Purpose:

- Return environment diagnostics plus actionable fixes

Outputs:

- Browser detection result
- Extension connectivity
- `chrome.userScripts` capability
- Version compatibility
- Publish server availability
- Optional project-level status if `rootDir` is provided
- `error` / `hint` / `action` diagnostics

**`userscript_project_status`**

Purpose:

- Report the current project state without mutating anything

Outputs:

- Project ID
- Script ID
- Metadata validity
- Paths
- Existing build artifact presence
- Runtime installation presence
- Publish presence
- Recommended next step

**`userscript_dev_run`**

Purpose:

- Execute the standard debug loop in one call

Flow:

1. Build project
2. Install or update runtime
3. Open target URL
4. Clear page errors/network buffers
5. Wait for runtime activation
6. Return combined summary:
   - install result
   - userscript logs
   - userscript errors
   - JS errors
   - network requests
   - page URL/tab info

This tool reduces agent orchestration complexity and makes iterative debugging much more stable.

**`userscript_regression_run`**

Enhancements:

- Preserve current behavior
- Add clearer failure classification
- Include recommended follow-up
- Normalize output for passed/failed step and assertion summaries

**`userscript_generate_from_page`**

Purpose:

- Generate a project draft from page context and task intent

Initial scope:

- Create metadata suggestions
- Create project scaffold
- Generate a starter `src/main.ts`
- Optionally persist a simple regression scenario

This does not need to fully automate all code generation in the first iteration. It should provide a strong structured starting point.

## Internal Implementation Changes

### `packages/shared`

Add:

- Shared diagnostic and workspace status types
- Error envelope helpers
- Shared browser detection result types

Keep:

- Existing userscript metadata parsing and validation helpers

### `packages/userscript-mcp`

Refactor responsibilities into smaller units:

- `environment.ts`
  Environment and browser detection logic
- `workspace-status.ts`
  Project inspection logic
- `tool-response.ts`
  Structured error/success formatting
- `project.ts`
  Keep scaffold/build responsibilities, but avoid making it the only place with state knowledge

Enhance:

- Tool output consistency
- Recovery hints
- Cross-platform safety

### `packages/mcp`

Keep the generic browser tools intact.

Potential enhancement:

- Share the same environment diagnostic helpers where relevant so both MCP servers describe the environment consistently.

### `packages/extension`

Keep the extension as the real userscript runtime.

Enhance only where it improves stability:

- More explicit runtime status reporting
- Consistent error messages for install/update failures
- Clearer publish synchronization feedback

### `packages/daemon`

Review daemon platform assumptions.

Important fix:

- PID file path is currently hard-coded to `/tmp/bb-browser.pid`, which is not cross-platform safe.

Move runtime temp artifacts to a platform-safe location using:

- `os.tmpdir()`
- or a stable app-specific directory under the user home directory

## Cross-Platform Reliability Requirements

### Browser Discovery

Replace narrow browser lookup with layered discovery:

1. Explicit CLI argument or environment variable
2. Known install paths per platform
3. PATH lookup for common Chromium executables
4. Existing managed browser state
5. OpenClaw when available

This should support at least:

- Google Chrome
- Chromium
- Microsoft Edge
- Brave

### Runtime Paths

Normalize all runtime-managed paths:

- Managed browser data dir
- PID file
- Publish cache
- Port tracking files

Requirements:

- No Unix-only hard-coded paths
- No assumptions about existing directories
- Safe creation with clear error messages

### Port and Bind Behavior

High-level tools should:

- Prefer ephemeral ports when safe
- Surface bind failures with structured recovery suggestions
- Avoid silent conflicts

## Testing Strategy

This change should be driven by test-first additions where feasible.

### Shared Tests

Add tests for:

- New diagnostic/status model helpers
- Error envelope normalization
- Userscript workspace status derivation

### Userscript MCP Tests

Add tests for:

- Browser discovery fallbacks
- Project status classification
- `userscript_doctor` structured output
- `userscript_dev_run` orchestration behavior with mocked command execution
- Publish diagnostics and failure handling

### Existing Tests

Preserve and extend:

- `packages/shared/tests/userscript.test.mjs`
- `packages/userscript-mcp/tests/project.test.mjs`

## Acceptance Criteria

The work is complete when all of the following are true:

1. An AI agent can use MCP to diagnose whether the machine is ready for userscript development.
2. The diagnostics clearly explain why setup is blocked and what exact recovery action to take.
3. An AI agent can scaffold or inspect a userscript project without guessing hidden state.
4. An AI agent can build and install/update the script in the extension runtime through a single stable workflow.
5. An AI agent can debug using userscript logs plus browser errors/network data.
6. An AI agent can run repeatable regression verification against a target page.
7. An AI agent can export or locally publish a Tampermonkey-compatible `.user.js`.
8. The implementation avoids OS-specific temporary path assumptions and works across different computers.

## Non-Goals

- Replacing the extension runtime with pure CDP injection
- Implementing a full autonomous code generator that solves all site-specific logic in one step
- Rewriting the entire browser automation stack
- Adding unrelated refactors outside the userscript workflow and cross-platform robustness scope

## Implementation Notes

The repo currently is not available as a normal git working tree in this environment, so the spec can be written locally but cannot be committed from this session unless git metadata is restored or the repository is re-opened from the actual git root.
