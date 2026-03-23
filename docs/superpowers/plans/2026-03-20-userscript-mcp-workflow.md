# Userscript MCP Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bb-browser reliably support AI-driven userscript creation, installation, debugging, regression testing, and Tampermonkey export across different computers.

**Architecture:** Keep `chrome.userScripts` as the real userscript dev runtime, keep browser/CDP tooling as the debugging companion, and upgrade `@bb-browser/userscript-mcp` into the high-level workflow entrypoint. Centralize diagnostics, workspace status, and runtime path handling in shared utilities so both setup and recovery are deterministic.

**Tech Stack:** TypeScript, Node.js, MCP SDK, Chrome Extension MV3, `chrome.userScripts`, esbuild, pnpm workspaces, Node test runner

---

**Execution note:** This plan assumes normal git metadata is available. If the working copy does not contain `.git`, replace commit steps with a local checkpoint note and continue.

### Task 1: Add Shared Diagnostics and Runtime Path Primitives

**Files:**
- Create: `packages/shared/src/userscript-status.ts`
- Create: `packages/shared/src/runtime-paths.ts`
- Create: `packages/shared/tests/userscript-status.test.mjs`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing shared tests for diagnostics, next-step selection, and platform-safe runtime paths**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createUserscriptDiagnostic,
  deriveUserscriptNextStep,
  getRuntimePaths,
} from "../dist/index.js";

test("deriveUserscriptNextStep prefers metadata repair before build", () => {
  const next = deriveUserscriptNextStep({
    projectExists: true,
    metadataValid: false,
    entryExists: true,
    buildExists: false,
    runtimeInstalled: false,
    publishConfigured: false,
  });

  assert.equal(next.action, "repair_metadata");
});

test("getRuntimePaths never uses a hard-coded unix tmp root", () => {
  const paths = getRuntimePaths({ homeDir: "/tmp/home", tmpDir: "/var/tmp" });
  assert.match(paths.pidFilePath, /bb-browser/);
  assert.doesNotMatch(paths.pidFilePath, /^\/tmp\/bb-browser\.pid$/);
});
```

- [ ] **Step 2: Run the shared package tests to verify the new cases fail**

Run: `corepack pnpm --filter @bb-browser/shared test`
Expected: FAIL with missing exports such as `deriveUserscriptNextStep` or `getRuntimePaths`

- [ ] **Step 3: Implement shared status helpers and runtime-path helpers**

```ts
export interface UserscriptNextStep {
  action:
    | "create_project"
    | "repair_metadata"
    | "create_entry"
    | "build"
    | "install"
    | "publish"
    | "debug";
  reason: string;
}

export function deriveUserscriptNextStep(status: UserscriptWorkspaceStatus): UserscriptNextStep {
  if (!status.projectExists) return { action: "create_project", reason: "Project root is missing" };
  if (!status.metadataValid) return { action: "repair_metadata", reason: "Project metadata is invalid" };
  if (!status.entryExists) return { action: "create_entry", reason: "Userscript entry file is missing" };
  if (!status.buildExists) return { action: "build", reason: "Build artifact has not been created yet" };
  if (!status.runtimeInstalled) return { action: "install", reason: "Runtime is not installed in the extension" };
  if (!status.publishConfigured) return { action: "publish", reason: "Tampermonkey install URL is not configured" };
  return { action: "debug", reason: "Project is ready for runtime debugging" };
}
```

- [ ] **Step 4: Export the new helpers from the shared package**

```ts
export {
  type UserscriptDiagnostic,
  type UserscriptEnvironmentStatus,
  type UserscriptWorkspaceStatus,
  type UserscriptNextStep,
  createUserscriptDiagnostic,
  deriveUserscriptNextStep,
  getRuntimePaths,
} from "./userscript-status.js";
```

- [ ] **Step 5: Re-run shared tests and confirm they pass**

Run: `corepack pnpm --filter @bb-browser/shared test`
Expected: PASS for both existing userscript metadata tests and new status/path tests

- [ ] **Step 6: Commit or checkpoint the shared foundations**

```bash
git add packages/shared/src/index.ts packages/shared/src/userscript-status.ts packages/shared/src/runtime-paths.ts packages/shared/tests/userscript-status.test.mjs
git commit -m "feat(shared): add userscript diagnostics primitives"
```

### Task 2: Harden Browser Discovery and Cross-Platform Daemon Paths

**Files:**
- Create: `packages/userscript-mcp/src/environment.ts`
- Create: `packages/userscript-mcp/tests/environment.test.mjs`
- Modify: `packages/cli/src/cdp-discovery.ts`
- Modify: `packages/daemon/src/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests for browser discovery precedence and runtime path usage**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { discoverBrowserCandidate, getDaemonPidFilePath } from "../dist/environment.js";

test("explicit browser path wins over default candidates", async () => {
  const result = await discoverBrowserCandidate({
    platform: "win32",
    env: { BB_BROWSER_EXECUTABLE: "C:\\\\Custom\\\\chrome.exe" },
    pathEntries: [],
    existingPaths: new Set(["C:\\\\Custom\\\\chrome.exe"]),
  });

  assert.equal(result?.executablePath, "C:\\\\Custom\\\\chrome.exe");
});

test("daemon pid path comes from shared runtime paths", () => {
  assert.match(getDaemonPidFilePath({ tmpDir: "C:\\\\Temp", homeDir: "C:\\\\Users\\\\me" }), /bb-browser/);
});
```

- [ ] **Step 2: Run the userscript MCP tests to verify the new environment cases fail**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: FAIL with missing `environment.js` exports

- [ ] **Step 3: Implement layered browser discovery helpers**

```ts
export async function discoverBrowserCandidate(input: DiscoverBrowserInput): Promise<BrowserCandidate | null> {
  return (
    fromExplicitExecutable(input) ||
    fromKnownInstallPaths(input) ||
    fromPathLookup(input) ||
    fromManagedBrowserState(input) ||
    (await fromOpenClaw(input))
  );
}
```

- [ ] **Step 4: Switch daemon PID handling to shared runtime paths**

```ts
import { getRuntimePaths } from "@bb-browser/shared";

const PID_FILE_PATH = getRuntimePaths().pidFilePath;
```

- [ ] **Step 5: Refactor CLI CDP discovery to use the new layered browser detection strategy**

```ts
const candidate = await discoverBrowserCandidate();
if (!candidate) {
  return null;
}
```

- [ ] **Step 6: Re-run userscript MCP tests and a daemon build**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: PASS for new environment tests

Run: `corepack pnpm --filter @bb-browser/daemon build`
Expected: PASS with no TypeScript errors

- [ ] **Step 7: Commit or checkpoint the cross-platform environment fixes**

```bash
git add packages/userscript-mcp/src/environment.ts packages/userscript-mcp/tests/environment.test.mjs packages/cli/src/cdp-discovery.ts packages/daemon/src/index.ts
git commit -m "fix(runtime): harden browser discovery and daemon paths"
```

### Task 3: Add Workspace Inspection and Structured Tool Responses

**Files:**
- Create: `packages/userscript-mcp/src/workspace-status.ts`
- Create: `packages/userscript-mcp/src/tool-response.ts`
- Create: `packages/userscript-mcp/tests/workspace-status.test.mjs`
- Modify: `packages/userscript-mcp/src/project.ts`

- [ ] **Step 1: Write failing tests for workspace classification and recovery hints**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { inspectUserscriptWorkspace } from "../dist/workspace-status.js";

test("missing entry file suggests create_entry", async () => {
  const status = await inspectUserscriptWorkspace({
    rootDir,
    runtimeLookup: async () => false,
  });

  assert.equal(status.nextStep.action, "create_entry");
});
```

- [ ] **Step 2: Run the userscript MCP test suite to verify the workspace tests fail**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: FAIL with missing `workspace-status.js` module or missing `inspectUserscriptWorkspace`

- [ ] **Step 3: Implement workspace inspection and next-step derivation**

```ts
export async function inspectUserscriptWorkspace(input: InspectWorkspaceInput): Promise<UserscriptWorkspaceStatus> {
  const metadata = await tryReadMetadata(input.rootDir);
  const buildExists = await fileExists(getProjectPaths(input.rootDir, metadata ?? undefined).distPath);
  const runtimeInstalled = await input.runtimeLookup(deriveScriptId(input.rootDir, metadata ?? fallbackMetadata));

  return {
    projectExists: await dirExists(input.rootDir),
    metadataValid: Boolean(metadata),
    entryExists: await fileExists(path.join(input.rootDir, "src", "main.ts")),
    buildExists,
    runtimeInstalled,
    publishConfigured: Boolean(metadata?.downloadURL || metadata?.updateURL),
    nextStep: deriveUserscriptNextStep(...),
    diagnostics: [...],
  };
}
```

- [ ] **Step 4: Add structured success/error helpers for MCP tools**

```ts
export function userscriptToolError(error: string, hint: string, action?: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error, hint, action }, null, 2) }],
    isError: true,
  };
}
```

- [ ] **Step 5: Re-run userscript MCP tests to confirm workspace logic passes**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: PASS for workspace status and existing project build tests

- [ ] **Step 6: Commit or checkpoint the status and response layer**

```bash
git add packages/userscript-mcp/src/workspace-status.ts packages/userscript-mcp/src/tool-response.ts packages/userscript-mcp/src/project.ts packages/userscript-mcp/tests/workspace-status.test.mjs
git commit -m "feat(userscript-mcp): add workspace status inspection"
```

### Task 4: Expose `userscript_doctor` and `userscript_project_status`

**Files:**
- Create: `packages/userscript-mcp/src/workflow.ts`
- Create: `packages/userscript-mcp/tests/workflow-status.test.mjs`
- Modify: `packages/userscript-mcp/src/index.ts`
- Modify: `packages/userscript-mcp/src/runtime.ts`

- [ ] **Step 1: Write failing tests for doctor and project-status workflow helpers**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildUserscriptDoctorReport, buildUserscriptProjectStatus } from "../dist/workflow.js";

test("doctor reports extension mismatch with actionable fix", async () => {
  const report = await buildUserscriptDoctorReport({
    capabilities: { extensionConnected: false, userScriptsAvailable: false, minimumRequirementsMet: false },
    environment: fakeEnvironment,
  });

  assert.equal(report.ready, false);
  assert.equal(report.diagnostics[0].action, "Load the unpacked extension in chrome://extensions");
});
```

- [ ] **Step 2: Run the userscript MCP tests to verify the new workflow tests fail**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: FAIL with missing `buildUserscriptDoctorReport` or `buildUserscriptProjectStatus`

- [ ] **Step 3: Implement reusable workflow helpers**

```ts
export async function buildUserscriptDoctorReport(input: DoctorInput) {
  const diagnostics = collectEnvironmentDiagnostics(input);
  return {
    ready: diagnostics.every((item) => item.level !== "error"),
    environment: input.environment,
    capabilities: input.capabilities,
    diagnostics,
  };
}
```

- [ ] **Step 4: Wire MCP tools in `packages/userscript-mcp/src/index.ts`**

```ts
server.tool(
  "userscript_doctor",
  "Inspect whether the machine and optional project are ready for userscript development",
  { rootDir: z.string().optional() },
  async ({ rootDir }) => textResult(await buildUserscriptDoctorPayload({ rootDir }))
);
```

- [ ] **Step 5: Re-run userscript MCP tests and a package build**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: PASS for doctor/status workflow tests

Run: `corepack pnpm --filter @bb-browser/userscript-mcp build`
Expected: PASS and emit `dist/index.js`

- [ ] **Step 6: Commit or checkpoint the new high-level status tools**

```bash
git add packages/userscript-mcp/src/workflow.ts packages/userscript-mcp/src/index.ts packages/userscript-mcp/src/runtime.ts packages/userscript-mcp/tests/workflow-status.test.mjs
git commit -m "feat(userscript-mcp): add doctor and project status tools"
```

### Task 5: Add `userscript_dev_run` and Normalize Regression Debug Output

**Files:**
- Create: `packages/userscript-mcp/tests/workflow-dev-run.test.mjs`
- Modify: `packages/userscript-mcp/src/workflow.ts`
- Modify: `packages/userscript-mcp/src/index.ts`

- [ ] **Step 1: Write failing tests for the high-level dev loop orchestration**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runUserscriptDevCycle } from "../dist/workflow.js";

test("dev cycle builds, installs, clears state, and returns debug artifacts", async () => {
  const result = await runUserscriptDevCycle(fakeDeps, {
    rootDir: "/tmp/demo",
    url: "https://example.com/app",
    settleMs: 750,
  });

  assert.equal(result.ready, true);
  assert.match(result.summary, /install/i);
  assert.equal(result.logs.length, 1);
  assert.equal(result.jsErrors.length, 0);
});
```

- [ ] **Step 2: Run the userscript MCP tests to verify the orchestration test fails**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: FAIL because `runUserscriptDevCycle` is not implemented or missing fields

- [ ] **Step 3: Implement the dev cycle orchestration helper**

```ts
export async function runUserscriptDevCycle(deps: WorkflowDeps, input: DevRunInput) {
  const project = await deps.buildProject(input.rootDir);
  const install = await deps.installWithFallback(project);
  if (!install.success) return failFromResponse(install, "Install failed", "Run userscript_doctor first");

  const open = await deps.runCommand({ action: "open", url: input.url });
  const tabId = open.data?.tabId;

  await deps.runCommand({ action: "network", networkCommand: "clear", tabId });
  await deps.runCommand({ action: "errors", errorsCommand: "clear", tabId });
  await deps.runCommand({ action: "wait", waitType: "time", ms: input.settleMs ?? 1000, tabId });

  return deps.collectDebugArtifacts(project, tabId);
}
```

- [ ] **Step 4: Update `userscript_regression_run` to reuse the same artifact-normalization helpers**

```ts
const debugArtifacts = await collectDebugArtifacts(...);
return textResult({
  ...debugArtifacts,
  assertions,
  passed,
});
```

- [ ] **Step 5: Re-run the userscript MCP tests and the root test suite**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: PASS for dev-run and regression helper tests

Run: `corepack pnpm test`
Expected: PASS for shared and userscript-mcp packages

- [ ] **Step 6: Commit or checkpoint the dev-loop tooling**

```bash
git add packages/userscript-mcp/src/workflow.ts packages/userscript-mcp/src/index.ts packages/userscript-mcp/tests/workflow-dev-run.test.mjs
git commit -m "feat(userscript-mcp): add dev run workflow"
```

### Task 6: Add a Minimal Project Generator and Finish Documentation

**Files:**
- Create: `packages/userscript-mcp/tests/workflow-generate.test.mjs`
- Modify: `packages/userscript-mcp/src/workflow.ts`
- Modify: `packages/userscript-mcp/src/index.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write a failing test for generating a project draft from page intent**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { generateUserscriptDraft } from "../dist/workflow.js";

test("generateUserscriptDraft creates scaffold inputs from url and intent", async () => {
  const draft = await generateUserscriptDraft({
    url: "https://example.com/dashboard",
    intent: "Add export buttons to each report card",
    projectName: "Dashboard Export Helper",
  });

  assert.equal(draft.metadata.name, "Dashboard Export Helper");
  assert.deepEqual(draft.metadata.match, ["https://example.com/dashboard*"]);
  assert.match(draft.entryTemplate, /report card/i);
});
```

- [ ] **Step 2: Run the userscript MCP tests to verify the draft-generation test fails**

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: FAIL because `generateUserscriptDraft` is missing

- [ ] **Step 3: Implement a minimal draft generator and wire `userscript_generate_from_page`**

```ts
export function generateUserscriptDraft(input: GenerateDraftInput) {
  const target = new URL(input.url);
  return {
    metadata: createUserscriptMetadata({
      name: input.projectName,
      version: "0.1.0",
      description: input.intent,
      match: [`${target.origin}${target.pathname}*`],
      grant: ["GM_getValue", "GM_setValue", "GM_addStyle"],
    }),
    entryTemplate: `async function main() {\n  console.log(${JSON.stringify(input.intent)});\n}\n\nvoid main();\n`,
  };
}
```

- [ ] **Step 4: Document the new workflow in both READMEs**

```md
1. Run `bb-browser-userscript-mcp`
2. Call `userscript_doctor`
3. Call `userscript_generate_from_page` or `userscript_project_init`
4. Call `userscript_dev_run`
5. Export with `userscript_export_tampermonkey`
```

- [ ] **Step 5: Run the final verification commands**

Run: `corepack pnpm --filter @bb-browser/shared build`
Expected: PASS

Run: `corepack pnpm --filter @bb-browser/userscript-mcp build`
Expected: PASS

Run: `corepack pnpm --filter @bb-browser/userscript-mcp test`
Expected: PASS

Run: `corepack pnpm test`
Expected: PASS

Run: `corepack pnpm build`
Expected: PASS and refresh `dist/` plus `extension/`

- [ ] **Step 6: Commit or checkpoint the generator and docs**

```bash
git add packages/userscript-mcp/src/workflow.ts packages/userscript-mcp/src/index.ts packages/userscript-mcp/tests/workflow-generate.test.mjs README.md README.zh-CN.md
git commit -m "feat(userscript-mcp): add project generation workflow"
```

