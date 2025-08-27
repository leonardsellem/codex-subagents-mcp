# Roadmap — codex-subagents

## P0 — Core (ship a usable MVP)
- [x] Implement MCP server with `delegate` tool (TS, Node ≥18)
- [x] Personas + profiles wired (reviewer/debugger/security)
- [x] Build pipeline and dist artifact
- [x] README with Codex config + quickstart
- [x] E2E demo proves end-to-end invocation from Codex (script added; requires user profiles configured)

## P1 — Safety & DX
- [x] SECURITY.md with threat model and mitigations
- [x] `validate_agents` tool for agent definitions (errors/warnings per file)
- [ ] Input validation hardening (Zod schemas + length caps)
- [ ] Structured logs + `--verbose` flag and env var switches
- [ ] Optional `git worktree` mirroring path

## P2 — Quality & Tests
- [x] Unit tests for parameters, mirroring, spawn
- [x] Tests for agent loader + validation
- [ ] e2e smoke across agents in CI (matrix linux/macos)

## P3 — Extensibility
- [x] Agent registry loaded from `agents/*.md` / `*.json`
- [x] `list_agents` tool
- [ ] Additional agents (perf, docs, migrations)
- [ ] Configurable per-agent flags (network, sandbox_mode)

## Next Session Plan
- Hook up optional `git worktree` support behind a flag. Acceptance: mirrors use worktree, docs updated, e2e path covered.
- Add length caps to `task` + truncation with warning. Acceptance: Zod caps + tests updated.
- Integrate basic structured logging (JSON lines). Acceptance: env/flag toggles + docs.
- Add CI e2e smoke across agents (linux/macos). Acceptance: green pipeline with list_agents + validate_agents + one delegate call.

> Maintenance rule: Update statuses and checkboxes after each session; roll unfinished items to “Next Session Plan”.
