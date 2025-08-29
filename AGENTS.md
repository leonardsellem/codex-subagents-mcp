# Agents

Author custom sub‑agents without code changes by adding files to an agents registry directory. The MCP server loads definitions from `agents/*.md` and `agents/*.json`. Agent names map to file basenames (e.g., `agents/perf.md` registers agent `perf`).

- Point the server to your agents directory via `--agents-dir` or `CODEX_SUBAGENTS_DIR`. It also auto-detects `./agents` or `./.codex-subagents/agents` when not provided.
- Keep personas task‑oriented and concise; avoid generic, unfocused instructions.

## Markdown agent (frontmatter + persona)

Create `agents/<name>.md`:

```md
---
profile: debugger
approval_policy: on-request   # never | on-request | on-failure | untrusted
sandbox_mode: workspace-write # read-only | workspace-write | danger-full-access
---
You are a pragmatic performance analyst. Identify hotspots, propose minimal, measurable fixes, and outline validation steps with lightweight metrics.
```

Required: `profile`. Optional: `approval_policy`, `sandbox_mode`. The body is the persona text injected for the sub‑agent.

## JSON agent

Create `agents/<name>.json`:

```json
{
  "profile": "debugger",
  "persona": "You plan and validate safe DB migrations with rollbacks.",
  "approval_policy": "on-request",
  "sandbox_mode": "workspace-write"
}
```

Required: `profile`, `persona`. Optional: `approval_policy`, `sandbox_mode`.

## Tips

- Validate registry: `tools.call name=validate_agents` (optionally pass `{ "dir": "/abs/path" }`).
- List available agents: `tools.call name=list_agents`.
- Align metadata with Codex profiles you run under; enforce behavior in `~/.codex/config.toml`.
- Keep personas short, specific, and action‑biased; prefer concrete checklists over philosophy.

## Usage Hint

When a task matches a sub‑agent specialty, call the MCP tool:

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

Prefer tool calls over in‑thread analysis to keep the main context clean.

## Related docs

- docs/INTEGRATION.md
- docs/SECURITY.md
