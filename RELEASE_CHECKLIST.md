# Release Checklist — codex-subagents-mcp

## Pre‑flight QA
- Node ≥18 verified (`node -v`).
- Install, build, lint, test:
  - `npm ci` (or `npm install`)
  - `npm run build`
  - `npm run lint`
  - `npm test`
- E2E prerequisites:
  - `codex` binary on `PATH` (`which codex`)
  - `OPENAI_API_KEY` set for Codex CLI
  - Profiles present in `~/.codex/config.toml` for the agents you’ll try (e.g., `[profiles.review]`, `[profiles.debugger]`, `[profiles.security]`)
- E2E smoke: `npm run e2e` (verifies MCP handshake and a `subagents.delegate` call)

## Versioning & Changelog
- Bump `version` in `package.json` (SemVer).
- Update `CHANGELOG.md` with notable changes.
- Create a Git tag: `git tag vX.Y.Z && git push --tags`.

## Docs Sanity Pass
- README: Quickstart + wiring examples copy/paste clean.
- Cross‑links: `docs/INTEGRATION.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md`, `AGENTS.md`.
- Single H1 per Markdown file.
- Env vars consistent with code: `CODEX_SUBAGENTS_DIR`, `DEBUG_MCP`.
- Clear guidance not to edit `dist/` manually.

## Dist & Scripts
- `dist/codex-subagents.mcp.js` present after build.
- `npm start` runs the server from `dist/`.
- `npm run dev` works for local iteration.

## Posting Plan
- Prepare posts per `MARKETING.md` (HN title + body, Reddit drafts, X tweet/thread).
- Add UTMs to all links.
- Schedule: HN + Reddit first, X shortly after.

## After Launch
- Monitor and reply to comments during the first day (set aside time windows).
- Track interest: GitHub stars, traffic, issues, and thread activity.
- Capture feedback/requests into issues; triage for the next patch.

