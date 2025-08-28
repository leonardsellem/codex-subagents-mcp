# Repository Guidelines

This repository implements a minimal MCP server that provides Claude‑style sub‑agents for Codex CLI. Keep changes focused, auditable, and safe by preserving a narrow tool surface.

## Project Structure & Module Organization
- `src/` – MCP server (`codex-subagents.mcp.ts`).
- `dist/` – compiled JS (`codex-subagents.mcp.js`).
- `tests/` – unit tests (Vitest).
- `scripts/` – e2e demo (`e2e-demo.ts`).
- `docs/` – `INTEGRATION.md`, `SECURITY.md`, `OPERATIONS.md`.
- `agents/` (optional) – custom agent definitions (`*.md`/`*.json`).
- `README.md`, `ROADMAP.md`, `CHANGELOG.md`.

## Build, Test, and Development Commands
- `npm run build` – compile TypeScript → `dist/`.
- `npm start` – run the stdio MCP server from `dist/`.
- `npm run dev` – run directly via `tsx` for local iteration.
- `npm test` – run unit tests (Vitest).
- `npm run e2e` – build, start server, call sample sub‑agents.
- `npm run lint` – ESLint checks.

## Coding Style & Naming Conventions
- Language: TypeScript 5, Node.js ≥ 18, CommonJS output.
- Linting: ESLint + `@typescript-eslint` (no unused vars, Node env).
- Indentation: 2 spaces; keep lines concise.
- Names: PascalCase for types/interfaces; camelCase for variables/functions; UPPER_SNAKE_CASE for module‑level constants.
- Files: kebab‑case for multiword filenames; tests in `tests/*.test.ts`.

## Testing Guidelines
- Framework: Vitest. Place tests in `tests/` with `*.test.ts`.
- Run: `npm test`. Avoid network in unit tests; mock `spawn` for process calls.
- E2E: `npm run e2e` (expects `codex` binary + configured profiles).

## Commit & Pull Request Guidelines
- Commits: imperative subject (≤72 chars), focused changes, rationale in body.
- Update docs (`README`, `docs/*`, `ROADMAP`) when behavior or usage changes.
- PRs: description, testing notes (unit/e2e), relevant screenshots or sample tool output, linked issues.
- Do not edit `dist/` manually; it is build output.

## Security & Configuration Tips
- MCP runs outside Codex’s sandbox—treat as high‑trust. Keep the surface minimal.
- Prefer `git worktree` over `mirror_repo` for large/sensitive repos.
- Align agent metadata (`approval_policy`, `sandbox_mode`) with Codex profiles.
- Use tools to audit: `list_agents`, `validate_agents`.

## Agent‑Specific Instructions
- Add custom agents to `agents/`:
  - Markdown with frontmatter:
    ```md
    ---
    profile: debugger
    approval_policy: on-request
    sandbox_mode: workspace-write
    ---
    You are a pragmatic performance analyst...
    ```
  - JSON: `{ "profile": "debugger", "persona": "..." }`.
- Validate: `tools.call name=validate_agents`.
- Invoke: `subagents.delegate(agent="perf", task="<task>")`.

 
