# Operations

## Running

- Build: `npm run build`
- Start: `npm start` (stdio MCP server)
- Dev: `npm run dev` (tsx)

## End‑to‑End (E2E)

- Command: `npm run e2e`
- Prereqs:
  - `codex` binary on `PATH`
  - Codex profiles configured in `~/.codex/config.toml` (the script expects working profiles for the sub‑agents you call)
- Notes: The E2E script builds the project, starts the MCP server, verifies the `/mcp` connection, and exercises at least one agent via `subagents.delegate`.

## Environment

Set these to tune behavior and wiring:
- `CODEX_SUBAGENTS_DIR`: Absolute path to your agents registry directory (overrides auto‑discovery).
- `DEBUG_MCP=1`: Enables lightweight MCP handshake timing to stderr (never stdout). Useful to diagnose initialize/initialized timing and tool calls without breaking the JSON‑RPC stream.
- `OPENAI_API_KEY`: Required by Codex CLI to run real model calls during E2E.

## Logs

- Default: quiet. All diagnostics go to stderr, not stdout.
- Debug: set `DEBUG_MCP=1` to print timestamped handshake and tool call markers (still stderr‑only). Keep disabled in normal operation.

## Troubleshooting

- MCP handshake stalls (no `initialize/initialized`):
  - Ensure no stdout logging is added before or during handshake; stdout must be newline‑delimited JSON only.
  - Point Codex at the absolute `dist/codex-subagents.mcp.js` path and a real Node runtime.
  - Enable `DEBUG_MCP=1` and watch stderr for timing clues.
- Timeouts on tool calls:
  - Large repos: prefer `git worktree` over `mirror_repo=true` for isolation without heavy copies.
  - Split very long tasks; ensure the selected Codex profile suits the work (e.g., `workspace-write` for debuggers).
- `codex: command not found`:
  - Install Codex CLI and ensure it’s on `PATH` (check with `which codex`).
- `Unknown tool: delegate` or empty tool list:
  - Confirm the server is the built JS from `dist/` and that Codex is connected (`/mcp`).
- `No agents directory configured` error:
  - Provide `--agents-dir`, set `CODEX_SUBAGENTS_DIR`, or create an `./agents` directory next to the built server.
- No logs visible:
  - Run the server manually (`npm start`) to observe stderr output; keep stdout clean.

## Upgrading

- Update dependencies: `npm outdated` → `npm update` (or pin new ranges).
- Rebuild: `npm run build`.
- Restart Codex CLI to reattach servers.

## Versioning & Release

- SemVer. Track notable changes in `CHANGELOG.md`.
- Bump version in `package.json` and tag releases.
