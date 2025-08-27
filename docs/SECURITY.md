## Security — codex-subagents-mcp

This server exposes a single MCP tool (`delegate`) that shells out to `codex exec` with a tailored profile and persona. Because MCP servers run outside of Codex’s sandbox, treat this as a high-trust component with a narrow, auditable surface.

### Trust boundaries

- MCP server process: Full host access (inherits user permissions). Keep tool surface minimal. Review code.
- Codex exec profiles: Control sandboxing and approvals per agent (`~/.codex/config.toml`). Example defaults:
  - `reviewer`: `read-only`, `on-request`
  - `debugger`: `workspace-write`, `on-request`
  - `security`: `workspace-write`, `never`

### Risks and mitigations

- Shelling out (`codex exec`): Ensure the `task` string originates from a trusted user. This tool does not pass arbitrary file paths or extra flags from untrusted sources.
- Secrets exposure: Avoid mirroring secrets into temp dirs unless necessary. Prefer `git worktree` to isolate without duplicating secrets.
- SSRF / network egress: Respect Codex profile/network settings. This MCP server itself does not make network calls except for spawning local `codex`.
- Path traversal: `cwd` is used as provided; avoid passing untrusted paths. If in doubt, whitelist to known repos.
- Supply chain: Minimal dependencies; audit `package-lock.json` when pinning versions. Update periodically.

### Recommended defaults

- Keep `mirror_repo=false` by default. For large repos or sensitive data, use `git worktree` instead of recursive copy.
- Use stricter sandbox for `reviewer` (read-only) and enable approvals. Relax only as needed for `debugger`.
- For `security`, maintain workspace-write but keep tasks explicit and scoped.

### Custom agents

- Custom agents are resolved from a directory (`--agents-dir` or `CODEX_SUBAGENTS_DIR`).
- Agent names map to filenames; personas are plain text in files. Prefer reviewing these files the same way you review code.
- Frontmatter/JSON keys (`approval_policy`, `sandbox_mode`) are validated against allowed sets and treated as advisory metadata. Enforce actual behavior via Codex profiles.
- Ad-hoc agents via tool params (`persona` + `profile` + optional `approval_policy`/`sandbox_mode`) are supported for rapid experiments; consider promoting stable ones to the file registry.

Validation tool:
- Use `validate_agents` regularly to detect malformed or risky definitions before use. It surfaces per-file errors and warnings.

### Audit tips

- Review `src/codex-subagents.mcp.ts` for the only tool offered and how parameters are validated (Zod).
- Grep for `spawn(` to audit shell-outs. There is a single `codex` invocation and a `which/where codex` check.
- Check logs and return payloads for unintended data exposure.
