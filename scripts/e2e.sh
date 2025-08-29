#!/usr/bin/env bash
set -euo pipefail

# Build the project
npm run build >/tmp/e2e-build.log && tail -n 20 /tmp/e2e-build.log

# Temporary home with Codex config
TMP_HOME="$(mktemp -d)"
CONFIG_DIR="$TMP_HOME/.codex"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.toml" <<CFG
[mcp_servers.subagents]
command = "node"
args = ["$(pwd)/dist/codex-subagents.mcp.js"]

[profiles.default]
model = "gpt-4o-mini"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
CFG

export HOME="$TMP_HOME"
export OPENAI_API_KEY="${OPENAI_API_KEY:?}"

# 1. list MCP servers and assert ours is present
codex exec '/mcp' | tee "$TMP_HOME/mcp.txt"
grep -q 'codex-subagents' "$TMP_HOME/mcp.txt"

# 2. delegate to an existing agent
codex exec 'subagents.delegate(agent="devops", task="Say hello from devops")' | tee "$TMP_HOME/delegate.txt"
# ensure we got some output
if [ ! -s "$TMP_HOME/delegate.txt" ]; then
  echo "delegate returned no output" >&2
  exit 1
fi
