# Runbook: codex-subagents-mcp

## Reproduce
1. `npm install`
2. `npm run build`
3. Configure Codex CLI:
   ```toml
   # ~/.codex/config.toml
   [mcp_servers.subagents]
   command = "node"
   args = ["/absolute/path/to/dist/codex-subagents.mcp.js"]
   ```
4. Launch Codex and run `/mcp`.

## Fix
- Ensure the server prints only JSON to stdout.
- Use `DEBUG_MCP=1` for verbose stderr logs.
- Agents on disk are loaded lazily after the initialize handshake.

## Verify
1. `npm test`
2. `npm run build`
3. `npm run e2e` – exercises handshake and delegates sample tasks.
