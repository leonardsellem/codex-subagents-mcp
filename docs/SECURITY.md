# Security

This MCP server runs outside the Codex sandbox and inherits your user permissions. Treat it as high‑trust and keep the surface narrow (one tool: `delegate`) and auditable.

See also: `docs/INTEGRATION.md` (configuration) and `docs/OPERATIONS.md` (operations, logs, env).

## Trust Boundaries
- MCP process: Full host access under your user; review changes carefully.
- Codex profiles: Enforce sandboxing and approvals per agent in `~/.codex/config.toml`.

## Risks + Mitigations (Least‑Privilege)
- Shell exec (`codex exec`): Command injection/overbroad execution.
  - Mitigate: Pass only trusted `task` text; avoid untrusted flags; validate agent metadata.
- Secrets exposure: Reading tokens/keys from workspace or env.
  - Mitigate: Prefer `read-only` for review agents; scope tasks; use `git worktree` over full mirroring for isolation.
- Network egress/data exfiltration: Agents leaking data.
  - Mitigate: Use restrictive Codex profiles; keep MCP tool surface minimal; avoid adding networked tools here.
- Path traversal/unsafe `cwd`: Acting on unintended paths.
  - Mitigate: Whitelist repos/paths; do not accept untrusted `cwd`.
- Supply chain: Dependency compromise.
  - Mitigate: Minimal deps; locked versions; periodic updates and review.
- Log leakage: Sensitive content in stderr/stdout.
  - Mitigate: Default quiet logs; enable debug locally only; redact when possible.

## Secure Defaults
- Narrow tool surface: keep only `delegate` unless clearly justified.
- Align agent metadata (`approval_policy`, `sandbox_mode`) with Codex profiles (profiles enforce behavior).
- Favor approvals (`on-request`) for high‑risk work; relax intentionally and sparingly.
- Prefer `git worktree` for large/sensitive repos; avoid `mirror_repo` unless necessary.

## Agent Hygiene
- Store agents in a reviewed directory (`--agents-dir` or `CODEX_SUBAGENTS_DIR`).
- Validate regularly:
  - `tools.call name=validate_agents`
- List loaded agents:
  - `tools.call name=list_agents`

## Auditing Pointers
- Review `src/codex-subagents.mcp.ts` (schema validation, the single spawn site).
- Search for `spawn(` to confirm the sole `codex` call path.
- Verify logs do not leak sensitive payloads; spot‑check via `npm run e2e`.

## Incident Response (Quick)
- Remove the server from `~/.codex/config.toml` to disable.
- Rotate affected credentials/secrets.
- Quarantine and review the agents directory; re‑run `validate_agents`.
