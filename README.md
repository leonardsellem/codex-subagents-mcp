# codex-subagents-mcp

Claude-style sub-agents for Codex CLI via a tiny MCP server. Each call spins up a clean context in a temp workdir, injects a persona via `AGENTS.md`, and runs `codex exec --profile <agent>` to preserve isolated state.

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

 Build the server and point Codex at the **absolute** path to the compiled entrypoint. Pass the agents directory explicitly so the server doesn't scan until after the handshake. The server also falls back to an `agents/` folder adjacent to the installed binary (e.g. `dist/../agents`) if `--agents-dir` and `CODEX_SUBAGENTS_DIR` are not provided:

```
# ~/.codex/config.toml
[mcp_servers.subagents]
command = "/absolute/path/to/node"
args    = ["/absolute/path/to/dist/codex-subagents.mcp.js", "--agents-dir", "/absolute/path/to/agents"]

[profiles.review]
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

- “Review my last commit. Use the review sub-agent.”
- “Reproduce and fix the failing tests in api/ using the debugger sub-agent.”
- “Audit for secrets and unsafe shell calls; propose fixes with rationale using the security sub-agent.”

## AGENTS hint to drop into your repo’s `AGENTS.md`

```
When a task matches a sub-agent specialty, call the MCP tool:

- Orchestrate multi-step → `subagents.delegate(agent="orchestrator", task="<task>")`
- iOS → `subagents.delegate(agent="ios", task="<task>")`
- Web → `subagents.delegate(agent="web", task="<task>")`
- UX → `subagents.delegate(agent="ux", task="<task>")`
- Test → `subagents.delegate(agent="test", task="<task>")`
- DevOps → `subagents.delegate(agent="devops", task="<task>")`
- Code review → `subagents.delegate(agent="review", task="<task>")`
- Security → `subagents.delegate(agent="security", task="<task>")`
- Performance → `subagents.delegate(agent="perf", task="<task>")`
- API → `subagents.delegate(agent="api", task="<task>")`
- Docs → `subagents.delegate(agent="docs", task="<task>")`
- Git/PRs → `subagents.delegate(agent="git", task="<task>")`
- Research → `subagents.delegate(agent="research", task="<task>")`
- Customer discovery → `subagents.delegate(agent="custdev", task="<task>")`
- Pricing/monetization → `subagents.delegate(agent="pricing", task="<task>")`
- Copywriting → `subagents.delegate(agent="copy", task="<task>")`
- Analytics/experiments → `subagents.delegate(agent="analytics", task="<task>")`
- Accessibility → `subagents.delegate(agent="a11y", task="<task>")`
- Obsidian vault → `subagents.delegate(agent="obsidian", task="<task>")`
- Focus coaching → `subagents.delegate(agent="coach", task="<task>")`

Prefer tool calls over in-thread analysis to keep the main context clean.
```

Note: MCP servers run outside Codex’s sandbox. Keep surfaces narrow and audited. This server exposes a single tool: `delegate`.

## Tool: `delegate`

- Parameters:
  - `agent`: string — e.g., `review | debugger | security` or a custom agent name
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

Note: Do not edit `dist/` manually; it is build output.

## E2E Demo

Automated end-to-end check using the real Codex CLI:

```
npm run e2e
```

It will:
1. Build the project.
2. Write a temporary `~/.codex/config.toml` pointing to the built server.
3. Run `/mcp` to verify the server is connected.
4. Pick the first agent on disk and call `subagents.delegate`.

The script requires `OPENAI_API_KEY` and a working Codex CLI binary.

## Troubleshooting MCP timeouts

- “codex not found”: Install Codex CLI and ensure it is on PATH. Re-run `npm run e2e`.
- Timeout on startup: confirm the config points at the absolute `dist/codex-subagents.mcp.js` path and passes `--agents-dir`.
- Logs on stdout break the handshake. Set `DEBUG_MCP=1` to log timing to stderr only.
- The server speaks newline-delimited JSON; older configs expecting HTTP headers will stall.
- Large repos: prefer `git worktree` over `mirror_repo=true` (see `docs/INTEGRATION.md`).
- Slow start: agent files are loaded lazily after initialization.

## Docs

- `docs/INTEGRATION.md`: deeper wiring, profiles, AGENTS.md guidance.
- `docs/SECURITY.md`: isolation, trust boundaries, sandbox guidance.
- `docs/OPERATIONS.md`: logs, env vars, upgrades.

## License

MIT
