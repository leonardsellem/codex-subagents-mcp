## Operations — codex-subagents-mcp

### Running

- Build: `npm run build`
- Start: `npm start` (stdio MCP server)
- Dev: `npm run dev` (tsx)

### Logs

This server writes minimal logs to stderr (by default none). For debugging, wrap with your preferred supervisor or add temporary logging as needed.

Environment variables to consider:
- `DEBUG=*` or your own flags (add `if (process.env.DEBUG)` branches if you extend logging).
- `MCP_LOG_LEVEL`: not used by default here, but you can wire it to change verbosity.

### Upgrading

- Update dependencies: `npm outdated` → `npm update` (or pin new ranges).
- Rebuild: `npm run build`.
- Restart Codex CLI to reattach servers.

### Versioning & release

- SemVer. Track notable changes in `CHANGELOG.md`.
- Bump version in `package.json` and tag releases.

