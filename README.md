# codex-subagents-mcp

[![CI](https://github.com/leonardsellem/codex-subagents-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardsellem/codex-subagents-mcp/actions/workflows/ci.yml)
![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![GitHub stars](https://img.shields.io/github/stars/leonardsellem/codex-subagents-mcp?style=social)

File‑based sub‑agents for Codex CLI. One MCP tool. Zero fluff.

- Auditable: agents are files reviewed in PRs
- CI‑friendly: `validate_agents`, `list_agents`
- Safer ops: temp workdirs, quiet stdout, git worktree isolation

Claude‑style sub‑agents for Codex CLI via a tiny MCP server. Each call spins up a clean context in a temp workdir, injects a persona via `AGENTS.md`, and runs `codex exec --profile <agent>` to preserve isolated state.

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

Tools exposed by this server:
- Primary: `delegate`
- Support: `list_agents`, `validate_agents`

Agents directory discovery (in order): `--agents-dir` arg, `CODEX_SUBAGENTS_DIR` env, then defaults `./agents`, `./.codex-subagents/agents`, `dist/../agents`.

### 60‑second Quickstart (copy‑paste)

```
# 1) Install + build
npm i && npm run build

# 2) Point Codex at the built server (absolute paths recommended)
# ~/.codex/config.toml
[mcp_servers.subagents]
command = "/usr/bin/env"
args    = ["node", "/ABS/PATH/TO/dist/codex-subagents.mcp.js", "--agents-dir", "/ABS/PATH/TO/agents"]

# Example profiles you can reference from agent frontmatter
[profiles.review]
model = "gpt-5"
approval_policy = "on-request"
sandbox_mode    = "read-only"

[profiles.debugger]
model = "o3"
approval_policy = "on-request"
sandbox_mode    = "workspace-write"

# 3) In Codex, verify tools and agents
tools.call name=list_agents
tools.call name=validate_agents

# 4) Delegate one task to an agent
subagents.delegate(agent="review", task="Summarize and review the last commit")
```

Tip: See `docs/SECURITY.md` for trust boundaries and `docs/OPERATIONS.md` for E2E and logging.

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
Route all work through the orchestrator:

subagents.delegate(agent="orchestrator", task="<goal>")

Example security review routed via orchestrator:

subagents.delegate(agent="orchestrator", task="Audit the repo for secrets and unsafe shell calls")

Prefer tool calls over in-thread analysis to keep the main context clean.
```

Note: MCP servers run outside Codex’s sandbox. Keep surfaces narrow and audited. This server exposes a single tool: `delegate`.

## Who This Is For / Not For

- For: teams already on Codex CLI who want auditable specialist agents and CI gating.
- Not for: folks seeking a general agent framework or multi‑tool orchestrator.

## Terminology: Agents vs Profiles

- `agent` (what you pass to `subagents.delegate`): the name of an agent loaded from your registry directory. The name is the file basename, e.g., `agents/review.md` → agent `review`.
- `profile` (Codex CLI): an execution profile you define in `~/.codex/config.toml` under `[profiles.<name>]`. Agents typically specify which profile to use via frontmatter (`profile: <name>`), but agent names and profile names don’t have to match.

There are no hardcoded built‑in agent names. The server loads agents from disk (`agents/*.md|*.json`) or accepts an ad‑hoc agent when both `persona` and `profile` are provided inline.

## Tool: `delegate`

- Parameters:
  - `agent`: string — the agent name from your registry (basename of `agents/<name>.md|json`)
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

## Safety & Operations

| Concern | This repo does |
| --- | --- |
| Prevent handshake break | No stdout logs; debug only to stderr (`DEBUG_MCP=1`) |
| Reduce blast radius | Temp workdir + optional `git worktree` isolation |
| Gate risky personas | `validate_agents` + profiles/approvals alignment |
| Network surface | Single tool (`delegate`); Codex handles model I/O |
| Auditability | Agents live as files; reviewable in PRs |

## Troubleshooting MCP timeouts

> Warning: Stdout must be newline‑delimited JSON only. Any logs on stdout will break the MCP handshake. Use `DEBUG_MCP=1` to emit diagnostics to stderr.

- “codex not found”: Install Codex CLI and ensure it is on PATH. Re-run `npm run e2e`.
- Timeout on startup: confirm the config points at the absolute `dist/codex-subagents.mcp.js` path and passes `--agents-dir`.
- Logs on stdout break the handshake. Set `DEBUG_MCP=1` to log timing to stderr only.
- The server speaks newline-delimited JSON; older configs expecting HTTP headers will stall.
- Large repos: prefer `git worktree` over `mirror_repo=true` (see `docs/INTEGRATION.md`).
- Slow start: agent files are loaded lazily after initialization.

## Agent Recipes (starter personas)

These come as file‑based agents under `agents/`. Each link includes a one‑line goal and suggested metadata (frontmatter).

- `agents/review.md`: Code review and refactor checklist. Frontmatter: `profile: review` (suggested: `approval_policy: on-request`, `sandbox_mode: read-only`).
- `agents/debugger.md`: Reproduce failures and propose minimal fixes. Frontmatter: `profile: debugger` (suggested: `approval_policy: on-request`, `sandbox_mode: workspace-write`).
- `agents/security.md`: Threat modeling and concrete mitigations. Frontmatter: `profile: security` (suggested: `approval_policy: never`, `sandbox_mode: workspace-write`).
- `agents/perf.md`: Identify hotspots; measure and optimize. Frontmatter: `profile: default` (suggested: `approval_policy: on-request`, `sandbox_mode: workspace-write`).
- `agents/docs.md`: Improve and restructure docs. Frontmatter: `profile: default` (suggested: `approval_policy: on-request`, `sandbox_mode: read-only`).
- `agents/a11y.md`: Accessibility reviews and fixes. Frontmatter: `profile: default` (suggested: `approval_policy: on-request`, `sandbox_mode: read-only`).

Invite PRs that add new agents—see “Contribute an agent”.

## Contribute an agent (fast path)

1. Fork and create `agents/<name>.md` with frontmatter:

   ```yaml
   profile: debugger
   approval_policy: on-request
   sandbox_mode: workspace-write
   ```

   Then describe the persona in free text.
2. Run `tools.call name=validate_agents`.
3. Open a PR using the “Agent request / contribution” template.

We track requested personas in GitHub Discussions (open a new topic under Show & Tell if none exists yet).

## Comparisons

- vs. building your own MCP server: this repo keeps a single tool and file‑based agents to minimize attack surface.
- vs. complex orchestrators: this intentionally avoids graphs/routers—Codex CLI profiles + file personas keep it simple.

If this project helps, a star helps others discover it.

## Docs

- `docs/INTEGRATION.md`: deeper wiring, profiles, AGENTS.md guidance.
- `docs/SECURITY.md`: isolation, trust boundaries, sandbox guidance.
- `docs/OPERATIONS.md`: logs, env vars, upgrades.

## License

MIT
