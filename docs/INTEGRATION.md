# Integration — codex-subagents-mcp

This document explains how to wire the MCP server into Codex CLI and how to guide usage via `AGENTS.md`.

### Register the MCP server

Add the following block to `~/.codex/config.toml`, updating the path to your built file:

```
[mcp_servers.subagents]
command = "node"
args    = ["/absolute/path/to/dist/codex-subagents.mcp.js"]

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

Notes:
- The MCP server runs outside the Codex sandbox. Keep the exposed tools minimal; this server exposes `delegate`, plus support tools `list_agents` and `validate_agents`.
- Profiles control Codex execution for sub-agents. You can set stricter sandboxing (e.g., `read-only` for review) and different models per agent.

### How it works

The MCP tool `delegate`:
1. Creates a temp directory.
2. Writes an `AGENTS.md` persona tailored to the selected agent.
3. Optionally mirrors the repo into the temp directory for isolation (`mirror_repo=true`).
4. Spawns `codex exec --profile <agent-profile> "<task>"` with `cwd` set appropriately.
5. Returns `{ ok, code, stdout, stderr, working_dir }` to the calling thread.

### Custom agents

Point the server to a directory of agent definitions:

- Via args in `~/.codex/config.toml`:

```
[mcp_servers.subagents]
command = "node"
args    = ["/absolute/path/to/dist/codex-subagents.mcp.js", "--agents-dir", "/abs/path/to/agents"]
```

- Or via environment variable when launching Codex:

```
CODEX_SUBAGENTS_DIR=/abs/path/to/agents codex
```

Agent file formats:
- Markdown: `agents/<name>.md` with optional YAML frontmatter for `profile`, body as persona.
- JSON: `agents/<name>.json` with `{ "profile": "...", "approval_policy": "...", "sandbox_mode": "...", "persona": "..." }` (or `personaFile`).

Validated frontmatter/JSON keys:
- `profile`: string (required)
- `approval_policy`: one of `never | on-request | on-failure | untrusted`
- `sandbox_mode`: one of `read-only | workspace-write | danger-full-access`
These are validated and treated as advisory metadata; align your Codex profiles accordingly.

Defaults for agents directory (when neither arg nor env are provided): `./agents`, `./.codex-subagents/agents`, then `dist/../agents`.

List agents:

```
tools.call name=list_agents
```

Validate agent definitions:

```
tools.call name=validate_agents
# Optional directory override
tools.call name=validate_agents arguments={"dir":"/abs/path/to/agents"}
```
This reports a summary and per-file issues (errors/warnings). Invalid enum values are flagged. Markdown without `profile` yields a warning (loader defaults to `default`).

### Repo guidance (AGENTS.md)

Recommend this hint in your repo’s `AGENTS.md` to nudge Codex:

```
When a task matches a sub-agent specialty, call the MCP tool:

- Orchestrate multi-step → subagents.delegate(agent="orchestrator", task="<task>")
- iOS → subagents.delegate(agent="ios", task="<task>")
- Web → subagents.delegate(agent="web", task="<task>")
- UX → subagents.delegate(agent="ux", task="<task>")
- Test → subagents.delegate(agent="test", task="<task>")
- DevOps → subagents.delegate(agent="devops", task="<task>")
- Code review → subagents.delegate(agent="review", task="<task>")
- Security → subagents.delegate(agent="security", task="<task>")
- Performance → subagents.delegate(agent="perf", task="<task>")
- API → subagents.delegate(agent="api", task="<task>")
- Docs → subagents.delegate(agent="docs", task="<task>")
- Git/PRs → subagents.delegate(agent="git", task="<task>")
- Research → subagents.delegate(agent="research", task="<task>")
- Customer discovery → subagents.delegate(agent="custdev", task="<task>")
- Pricing/monetization → subagents.delegate(agent="pricing", task="<task>")
- Copywriting → subagents.delegate(agent="copy", task="<task>")
- Analytics/experiments → subagents.delegate(agent="analytics", task="<task>")
- Accessibility → subagents.delegate(agent="a11y", task="<task>")
- Obsidian vault → subagents.delegate(agent="obsidian", task="<task>")
- Focus coaching → subagents.delegate(agent="coach", task="<task>")

Prefer tool calls over in-thread analysis to keep the main context clean.
```

### Mirroring strategies

- Fast path (default): `mirror_repo=true` copies the entire tree into the temp directory via `cpSync`. Best for small/medium repos.
- Safer alternative (recommended for larger repos):

```
git worktree add /tmp/codex-security-123 HEAD
```

This avoids copying and gives isolation without rewriting in-place state. You can then pass `cwd` to the worktree path and set `mirror_repo=false`.

### Example prompts in Codex

- Reviewer: “Review the last commit for readability and add an actionable patch.”
- Debugger: “Reproduce and fix the failing unit test in foo.spec.ts.”
- Security: “Scan for secrets and unsafe shell exec usage; propose fixes.”
### Terminology

- Agent: Name resolved from your registry files (`agents/<name>.md|json`). Example: `agents/review.md` registers agent `review`.
- Profile: Codex CLI execution profile (`~/.codex/config.toml` under `[profiles.<name>]`). Agents can declare a `profile` in frontmatter to select which profile Codex should use when delegating.

Agents are loaded from disk (or constructed ad‑hoc by passing both `persona` and `profile` inline). There are no hardcoded built‑in agent names.
