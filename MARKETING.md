# Marketing Plan — codex-subagents-mcp

## Positioning
- Developer‑first MCP server that adds task‑specific sub‑agents to Codex CLI with one simple tool: `delegate`.
- Tiny, auditable surface (single tool) with file‑based agent registry you can version‑control.
- Pragmatic DX: copy/pasteable setup, validation tools (`list_agents`, `validate_agents`), and clear security guidance.

## ICP (Ideal Customer Profile)
- OSS maintainers and indie developers who already use Codex CLI.
- Small teams that want specialized “review/debug/security/docs/perf” helpers without heavy agent frameworks.
- DevOps/SREs and CLI‑native engineers who value explicit, scriptable workflows.

## Messaging Pillars
- Minimal & Safe: one MCP tool, stderr‑only debug logs, clear trust boundaries.
- Plug‑and‑Play: agents live in `agents/*.md|*.json`; no code changes needed.
- Practical & Measurable: validate registry, run end‑to‑end, and delegate tasks that ship.
- Opinionated, not rigid: frontmatter for `profile`, optional `approval_policy`/`sandbox_mode`.

## Differentiators
- Single‑purpose MCP server (delegate only) → easy to audit/operate.
- File‑based sub‑agents with frontmatter → immediate customization and reviewability in code‑review.
- Built‑in validation (`validate_agents`) and discovery (`list_agents`).
- Sensible defaults and guidance on isolation (`git worktree` vs mirroring) and `DEBUG_MCP`.

## Suggested Launch Timing
- Primary window: Tue–Thu 9–11am PT (HN + US/EU overlap).
- Soft‑launch on GitHub (README polish), then HN Show + Reddit within 1–2 hours.
- Post on X after first signs of traction (or if queued, 30–60 minutes before HN to seed early feedback).

## Channels & Plans

### Hacker News (Show HN)
- Angle: tiny, auditable MCP server that brings sub‑agents to Codex CLI with zero fluff.
- Link: `https://github.com/leonardsellem/codex-subagents-mcp?utm_source=hn&utm_medium=post&utm_campaign=launch`

Title options (pick one):
- Show HN: Sub‑agents for Codex CLI via a tiny MCP server
- Show HN: Minimal MCP server to delegate task‑specific agents in Codex CLI
- Show HN: File‑based sub‑agents for Codex CLI (tiny MCP server)

Main text (paste in body):

I built a minimal MCP server that adds task‑specific sub‑agents to Codex CLI with a single tool: `delegate`.

Why:
- Keep the surface tiny and auditable (one tool), but make it easy to define “review / debug / security / docs / perf” personas in version‑controlled files.
- Provide a realistic path to isolate/validate work (temp dirs, optional repo mirroring, `git worktree` guidance).

Highlights:
- File‑based agents: `agents/*.md|*.json` (frontmatter validates, `validate_agents` checks errors/warnings)
- Tools: `delegate`, plus `list_agents` and `validate_agents`
- Clear DX docs (wiring, security, operations) and an e2e demo script
- Node ≥18; build to `dist/`; no runtime network calls in the server itself

Repo (docs + examples):
https://github.com/leonardsellem/codex-subagents-mcp?utm_source=hn&utm_medium=post&utm_campaign=launch

Happy to answer questions and hear where it falls short (especially safety/ops). If you try it: what agents would you add first?

### Reddit
General link with UTM: `https://github.com/leonardsellem/codex-subagents-mcp?utm_source=reddit&utm_medium=post&utm_campaign=launch`

Tailored drafts:

1) r/programming

Title: Minimal MCP server to bring sub‑agents to Codex CLI (file‑based, easy to audit)

Body:
I built a tiny MCP server that adds task‑specific sub‑agents to Codex CLI via one tool: `delegate`.

- Agents are plain files (`agents/*.md|*.json`) with frontmatter; use `validate_agents` to catch issues.
- Clear security/ops docs; e2e demo script included.
- Designed to be boring and safe: single tool, stderr‑only debug, guidance for `git worktree` isolation.

Repo + docs: https://github.com/leonardsellem/codex-subagents-mcp?utm_source=reddit&utm_medium=post&utm_campaign=launch
Curious what personas you’d add first—or what would make this safer.

2) r/node (or r/CommandLine)

Title: Codex CLI sub‑agents with a tiny Node MCP server

Body:
If you use Codex CLI, this adds “delegate” so you can run task‑specific agents (e.g., review/debug/security) with clean temp workdirs.

- Node ≥18; build to `dist/`.
- Agents live in files; validate via `tools.call name=validate_agents`.
- DX focus: minimal deps, explicit config, copy/pasteable examples.

Try it: https://github.com/leonardsellem/codex-subagents-mcp?utm_source=reddit&utm_medium=post&utm_campaign=launch
Feedback on DX or safety trade‑offs welcome.

3) r/devops

Title: Safer “delegate” flow for Codex CLI (sub‑agents + isolation tips)

Body:
This adds sub‑agents to Codex CLI via a single MCP tool. Emphasis on operational clarity (stderr‑only debug, isolation via `git worktree` over full repo mirrors) and validating agent registry files.

Docs + repo: https://github.com/leonardsellem/codex-subagents-mcp?utm_source=reddit&utm_medium=post&utm_campaign=launch
Would love to hear how you’d operate this in a stricter environment (profiles, approvals, CI e2e, etc.).

### X (Twitter)

Primary tweet:

I built a tiny MCP server for Codex CLI that adds task‑specific sub‑agents with one tool: `delegate`.
File‑based agents (`agents/*.md|*.json`), `list_agents` + `validate_agents`, clear security/ops docs.
Repo: https://github.com/leonardsellem/codex-subagents-mcp?utm_source=twitter&utm_medium=tweet&utm_campaign=launch

Short thread (3–5 posts):

1) Need “review / debug / security / docs / perf” sub‑agents in Codex CLI without a big framework? I made a tiny MCP server that only exposes `delegate`.

2) Agents are just files with frontmatter. `validate_agents` catches errors/warnings. You can version them alongside your code.

3) Operational guardrails: stderr‑only debug via `DEBUG_MCP=1`, isolation guidance (`git worktree` for large repos), and e2e demo.

4) Repo + docs: https://github.com/leonardsellem/codex-subagents-mcp?utm_source=twitter&utm_medium=thread&utm_campaign=launch
Tell me what agents you’d add, or where it feels unsafe/confusing.

## Tracking Checklist
- Add UTMs to links by channel (HN/Reddit/X) and medium (post/thread/comment).
- Measure: GitHub stars, clones/traffic, issues/discussions, HN/Reddit comments, and e2e success (reports).
- Calendar slots for active replies: first 6–8 hours post; evening check; next‑morning sweep.
- Capture Qs/objections in an issue; iterate docs and README quickly.

## Follow‑Up Plan
- Day 0: Be present in comments; clarify safety/ops choices; add quick fixes to docs (typos, link issues) if surfaced.
- Day 3: Share a “what we heard + changes” update as comments on the original threads (if allowed) and a short X thread.
- Day 7: Post a changelog snapshot + roadmap tweaks; consider a short write‑up on design choices (why single tool, file‑based registry, etc.).

