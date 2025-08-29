# codex-subagents-mcp

Claude-style sub-agents (reviewer, debugger, security) for Codex CLI via a tiny MCP server. Each call spins up a clean context in a temp workdir, injects a persona via `AGENTS.md`, and runs `codex exec --profile <agent>` to preserve isolated state.

## Quickstart

- Prereqs: Node.js >= 18, npm, Codex CLI installed and on PATH.
- Install deps and build:

```
npm install
npm run build
```

- Start server (manual run):

```
npm start
```

## Wiring with Codex CLI

Copy-paste and adjust the absolute path to your build output:

```
# ~/.codex/config.toml
[mcp_servers.subagents]
command = "node"
args    = ["/absolute/path/to/dist/codex-subagents.mcp.js"]

[profiles.reviewer]
model = "gpt-5"
approval_policy = "on-request"
sandbox_mode    = "read-only"

[profiles.debugger]
model = "o3"
approval_policy = "on-request"
sandbox_mode    = "workspace-write"

[profiles.security]
model = "gpt-5"
approval_policy = "never"
sandbox_mode    = "workspace-write"
```

Usage (in Codex):

- “Review my last commit. Use the reviewer sub-agent.”
- “Reproduce and fix the failing tests in api/ using the debugger sub-agent.”
- “Audit for secrets and unsafe shell calls; propose fixes with rationale using the security sub-agent.”

AGENTS hint to drop into your repo’s `AGENTS.md`:

```
When a task matches a sub-agent specialty, call the MCP tool:

- Code review → subagents.delegate(agent="reviewer", task="<my task>")
- Debugging   → subagents.delegate(agent="debugger", task="<my task>")
- Security    → subagents.delegate(agent="security", task="<my task>")

Prefer tool calls over in-thread analysis to keep the main context clean.
```

Note: MCP servers run outside Codex’s sandbox. Keep surfaces narrow and audited. This server exposes a single tool: `delegate`.

## Tool: `delegate`

- Parameters:
  - `agent`: string — built-in (`reviewer | debugger | security`) or a custom agent name
  - `task`: string (required)
  - `cwd?`: string (defaults to current working directory)
  - `mirror_repo?`: boolean (default false). If true and `cwd` provided, mirrors the repo into the temp workdir for maximal isolation.
  - `profile?` and `persona?`: optional ad-hoc definition when `agent` is not found in registry. Provide both.
- Behavior:
  1. Creates a temp workdir; writes `AGENTS.md` with the agent persona.
  2. Optionally mirrors the repo into the temp dir via `cp -R` fast path.
     - Safer alternative (recommended for large repos): `git worktree add <tempdir> <branch-or-HEAD>` (documented in `docs/INTEGRATION.md`).
  3. Spawns `codex exec --profile <agent-profile> "<task>"` with `cwd` set to the temp dir if mirrored, else your provided `cwd`.
  4. Returns JSON: `{ ok, code, stdout, stderr, working_dir }`.

## Custom agents

Add agents without code changes:

1) File-based registry (recommended)

- Create an agents directory and point the server to it via either:
  - Config args: add `"--agents-dir", "/path/to/agents"` in `~/.codex/config.toml` under the MCP server args
  - Env var: `CODEX_SUBAGENTS_DIR=/path/to/agents`
  - Defaults (auto-detected): `./agents` or `./.codex-subagents/agents`

- Define agents as files using the basename as the agent name:

Example `agents/perf.md`:

```
---
profile: debugger
approval_policy: on-request   # one of: never | on-request | on-failure | untrusted
sandbox_mode: workspace-write # one of: read-only | workspace-write | danger-full-access
---
You are a pragmatic performance analyst. Identify hotspots, measure, propose minimal fixes with benchmarks.
```

Or JSON `agents/migrations.json`:

```
{
  "profile": "debugger",
  "approval_policy": "on-request",
  "sandbox_mode": "workspace-write",
  "persona": "You plan and validate safe DB migrations with rollbacks.",
  "personaFile": null
}
```

2) Ad-hoc agent via tool params

Call `delegate` with a new name and supply both `profile` and `persona`:

```
subagents.delegate(
  agent="perf",
  task="Analyze render jank",
  profile="debugger",
  approval_policy="on-request",
  sandbox_mode="workspace-write",
  persona="You are a perf specialist..."
)
```

List available agents:

```
tools.call name=list_agents
```

Validation: `approval_policy` and `sandbox_mode` are validated against the allowed values above. They are advisory metadata and should match the Codex profile you run under. Enforce actual behavior via profiles in `~/.codex/config.toml`.

Validate agent files:

```
tools.call name=validate_agents
# or
tools.call name=validate_agents arguments={"dir":"/abs/path/to/agents"}
```
Returns per-file errors/warnings and a summary. Invalid values are flagged; missing `profile` in Markdown is a warning (loader defaults to `default`).

## Build, Lint, Test

```
npm install
npm run build
npm run lint
npm test
```

## E2E Demo

Runs the server over stdio and calls `delegate` for each agent; the tool itself uses the Codex CLI under the hood.

```
npm run e2e
```

What it does:
1. Builds the server.
2. Prints `codex --version` if available.
3. Starts the MCP server over stdio; calls `tools/list` and then `tools/call delegate` with sample tasks for reviewer/debugger/security.
4. Pretty-prints the JSON results.

If `codex` is missing, the result includes a clear error with next steps.

## Troubleshooting

### MCP timeouts
- Ensure the config uses an **absolute path** to `dist/codex-subagents.mcp.js`.
- Verify no logs are written to stdout; set `DEBUG_MCP=1` to log timing to stderr.
- If Codex CLI still hangs, run with `DEBUG_MCP=1` and check that `initialized` appears promptly (<2s).

### Misc
- “codex not found”: Install Codex CLI and ensure it is on PATH. Re-run `npm run e2e`.
- No output: Check that your profiles in `~/.codex/config.toml` match the names used by this server.
- Large repos: Prefer `git worktree` over `mirror_repo=true` (see `docs/INTEGRATION.md`).

## Docs

- `docs/INTEGRATION.md`: deeper wiring, profiles, AGENTS.md guidance.
- `docs/SECURITY.md`: isolation, trust boundaries, sandbox guidance.
- `docs/OPERATIONS.md`: logs, env vars, upgrades.

## License

MIT
