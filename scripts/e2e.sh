#!/usr/bin/env bash
set -euo pipefail

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
SERVER="$REPO_DIR/dist/codex-subagents.mcp.js"
AGENTS_DIR="$REPO_DIR/agents"
NODE_BIN=$(command -v node)

npm run build >/tmp/e2e-build.log

TMP_HOME=$(mktemp -d)
mkdir -p "$TMP_HOME/.codex"
cat > "$TMP_HOME/.codex/config.toml" <<CONFIG
[mcp_servers.subagents]
command = "$NODE_BIN"
args = ["$SERVER", "--agents-dir", "$AGENTS_DIR"]
CONFIG

# list connected MCP servers
echo "Listing MCP servers..." >&2
LIST_OUTPUT=$(HOME="$TMP_HOME" npx --yes @openai/codex exec -m gpt-4o-mini "/mcp" 2>&1)
echo "$LIST_OUTPUT"
echo "$LIST_OUTPUT" | grep -q "codex-subagents"

# pick first agent
AGENT=$(ls "$AGENTS_DIR" | head -n 1 | sed 's/\.[^.]*$//')

echo "Delegating to agent: $AGENT" >&2
DELEGATE_OUTPUT=$(HOME="$TMP_HOME" npx --yes @openai/codex exec -m gpt-4o-mini "tools.call name=subagents.delegate arguments={\"agent\":\"$AGENT\",\"task\":\"test\"}" 2>&1)
echo "$DELEGATE_OUTPUT"
echo "$DELEGATE_OUTPUT" | grep -q '"ok": true'
