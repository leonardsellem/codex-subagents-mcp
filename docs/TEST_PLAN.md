# Test Plan — codex-subagents-mcp

This plan defines how we validate the MCP server that exposes a `subagents.delegate` tool for Codex CLI. It aligns tests to critical behaviors, sets coverage targets, and specifies CI gates and local workflows.

## Scope
- Server: `src/codex-subagents.mcp.ts` (MCP JSON-RPC framing, tool registry, delegate execution, error shaping).
- Orchestration: `src/orchestration.ts` (todo steps, batching, token gating).
- Agents registry: loaders for `agents/*.md` and `agents/*.json` (frontmatter, persona, metadata).
- E2E: build → launch server → list tools → run a delegate.

## Test Layers
- Unit: Pure modules and guards (Zod validation, path resolution, frontmatter parsing, registry loading, spawn wrappers).
- Integration: MCP framing (initialize, tools/list), delegate request/response shaping, error paths (unknown agent, invalid params, codex missing), workdir mirroring.
- Contract: Schema compatibility for MCP messages and tool params/results; snapshot minimal frames and validate against Zod.
- Smoke: Fast e2e that builds, boots server, verifies `/mcp`, exercises one delegate end-to-end.
- E2E: Full flow using `scripts/e2e.sh` (or `scripts/e2e-demo.js`) against a temporary Codex config.

## Critical Paths
- JSON-RPC framing and response completeness (initialize, tools/list, call, error).
- Delegate execution lifecycle: timeout, stdout/stderr capture, exit codes, structured result.
- Agents directory resolution (arg/env/defaults) and file parsing (MD/JSON) including invalid metadata.
- Workdir creation/mirroring and cleanup resilience.
- Token gating and batch orchestration paths.

## Coverage Targets
- Global: 85% lines, 85% branches.
- Critical modules: 95%+ on framing, delegate runner, Zod schemas, registry parsing.
- Gate: fail CI if global < 80% or any critical file < 90%.

## CI Gates (GitHub Actions)
- Pull Requests (fast):
  - Lint + Unit + Integration on Linux only.
  - Smoke test (single delegate) with `SUBAGENTS_EXEC_TIMEOUT_MS=3000`.
  - Coverage report uploaded; gate per thresholds above.
- Nightly matrix (ubuntu, macos, windows):
  - Lint + Unit + Integration + E2E (`scripts/e2e.sh`).
  - Extended timeout `SUBAGENTS_EXEC_TIMEOUT_MS=6000`.
  - Persist JUnit + coverage artifacts; record test durations.

## Flaky & Timeouts
- Hard cap delegate runs with `SUBAGENTS_EXEC_TIMEOUT_MS` (default 2000). In CI, set explicitly per job.
- Mark tests as flaky only with issue link; auto-rerun once on failure in CI matrix.
- Use per-test timeouts (Vitest) for integration/E2E; prefer 5–10s caps.
- Log timing for slowest 10 tests; open issues when >2× baseline.

## Local Dev Workflow
- Unit/Integration: `npm test` or `vitest` (add `-t <name>` to focus).
- Watch: `vitest --watch` for inner-loop feedback.
- E2E smoke: `npm run e2e` (requires Codex CLI; runs in tmp HOME).
- Fixtures: minimal agents in `agents/`; add corrupted/edge cases for parser tests.

## Gaps & Additions (Backlog)
- Contract tests: Snapshot minimal MCP frames (initialize, tools/list, tool call) and validate against Zod.
- Delegate smoke tests: Exercise happy path and unknown-agent/invalid-params with assertions on error payload.
- Registry fuzzing: Malformed frontmatter / invalid JSON fields; ensure graceful degradation.
- Cross-platform path tests: Windows path separators for agents dir resolution and mirroring.

## Security Tests (Specialized)
- Secret scanning in repo and spawned commands (simulate accidental `env` echo; ensure redaction).
- Disallow unsafe shell: assert spawn wrapper rejects `;`/`&&` injections in agent tasks.
- Token gating: tests for nested delegate denial without token; allow with token.
- Dependency audit step in CI (moderate severity gate).

## Performance/Reliability Tests (Specialized)
- Cold start: build + first `initialize` under 2s on CI Linux.
- Delegate latency: typical task returns within 1.5s using mini model stub.
- Timeout behavior: assert hard timeout returns structured error within `timeoutMs+200ms`.
- Resource cleanup: no orphan processes, temp dirs cleaned.

## Accessibility (N/A)
- No UI surfaces; skip. If future UI added, adopt a11y checks (axe) and keyboard flows.

## Metrics & Reporting
- Coverage: text + lcov; upload in CI; track trend.
- JUnit XML for Vitest and E2E smoke; surface flaky re-runs.
- Timing: list top slow tests; add baseline file to compare in CI.

## Rollout
- Phase 1 (week 1): Add contract + smoke tests; enable coverage gate at 75%.
- Phase 2 (week 2): Raise gate to 80/90 (global/critical); add Windows path tests.
- Phase 3 (week 3): Nightly full matrix with E2E; enable flaky auto-rerun.
- Phase 4 (ongoing): Perf baselines and alerts on regressions >20%.

## Ownership
- Test owners: core maintainers of MCP server.
- PR checklist: tests added/updated; CI green; coverage thresholds met.

### Quick Commands
- Run all tests: `npm test`
- Run focused: `vitest -t "<name>"`
- E2E smoke: `npm run e2e`
- Increase subagent timeout locally: `SUBAGENTS_EXEC_TIMEOUT_MS=6000 npm test`
