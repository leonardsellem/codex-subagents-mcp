# Contributing

Thanks for helping improve this MCP server. Please keep changes focused, auditable, and safe by preserving a narrow tool surface.

## Setup

- Node.js >= 18
- Install dependencies: `npm install`
- Build: `npm run build`

## Scripts

- `npm run build`: compile TypeScript to `dist/`
- `npm run dev`: run via `tsx` for fast iteration
- `npm start`: run the stdio MCP server from `dist/`
- `npm run lint`: ESLint checks
- `npm test`: unit tests (Vitest)
- `npm run e2e`: end-to-end demo using Codex CLI

## PR checklist

- Update docs when behavior or usage changes (`README`, `docs/*`, `AGENTS.md`)
- Do not edit `dist/` manually (build output)
- Keep changes focused with clear rationale

## References

- README.md
- docs/ (INTEGRATION.md, SECURITY.md, OPERATIONS.md)
- AGENTS.md
