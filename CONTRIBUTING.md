# Contributing

Thanks for helping improve `bb-browser`.

## Development setup

```bash
corepack pnpm install
```

## Validation

Run these before opening a pull request:

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm verify
```

`pnpm verify` runs the release build and checks the publishable package with `npm pack --dry-run`.

## Architecture

```text
CLI (packages/cli) -> Daemon (packages/daemon) -> Chrome Extension (packages/extension)
```

Shared protocol types live in `packages/shared/src/protocol.ts`.

When adding a new browser command, update all of these:

1. `packages/shared/src/protocol.ts`
2. `packages/extension/src/background/command-handler.ts`
3. `packages/cli/src/commands/<name>.ts`
4. `packages/cli/src/index.ts`
5. Extension permissions in `packages/extension/manifest.json` when needed

## Conventions

- Chinese for user-facing CLI strings, English for code and comments
- Follow existing command patterns, especially `packages/cli/src/commands/trace.ts`
- Commit messages should use `<type>(<scope>): <summary>`
- Valid types: `fix`, `feat`, `refactor`, `chore`, `docs`

## Scope of this repository

- Core runtime, CLI, daemon, MCP server, and extension changes belong here
- Community site adapters belong in [`bb-sites`](https://github.com/epiral/bb-sites)

## Pull requests

- Keep PRs focused
- Include screenshots or command output for behavior changes when helpful
- Call out breaking changes explicitly
