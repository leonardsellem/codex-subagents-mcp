# Orchestration

All work is routed through the `orchestrator` agent. Calls to `subagents.delegate` with any other agent are rewritten server‑side and wrapped with metadata so the orchestrator can plan the work.

## Routing

```
subagents.delegate(agent="security", task="scan for secrets")
```

is rewritten to:

```
subagents.delegate(agent="orchestrator", task="<enveloped task>")
```

The envelope includes the original agent, cwd, and a generated `request_id`. A per‑request folder `orchestration/<request_id>/` tracks lifecycle state. While the orchestrator is running, the server auto‑injects a token and the current `request_id` into nested `delegate`/`delegate_batch` calls so steps are recorded without personas passing secrets.

## Token gating

Only the orchestrator may delegate further. The server issues a random `ORCHESTRATOR_TOKEN` on startup and injects it into orchestrator sub‑delegations. Attempts to delegate without the token are rejected with `"Only orchestrator can delegate. Pass server-injected token."`

## delegate_batch

The orchestrator can run independent steps in parallel via `delegate_batch(items, token)`. Results retain item ordering and share the same token gating.

## To‑Do persistence

Each request creates `orchestration/<request_id>/todo.json` with step entries. Steps capture status, timestamps, and paths to stdout/stderr logs under `orchestration/<request_id>/steps/<step-id>/`.

Summary & next actions:
- After the orchestrator run completes, the server saves:
  - `summary`: first 500 characters of orchestrator stdout (falls back to stderr if stdout is empty)
  - `next_actions`: up to 5 bullet‑like lines parsed from orchestrator stdout (supports `-`, `*`, `•`, and numbered `1.` lists)

Status progression:
- `todo.status` transitions to `done` automatically when no steps are still `running`.

## Example

```
subagents.delegate(agent="orchestrator", task="Audit for secrets")
```

The orchestrator parses the envelope, schedules a security review, and updates the To‑Do file as each step runs.

## Timeout guard

Set `SUBAGENTS_EXEC_TIMEOUT_MS` (default `2000`) to cap `codex exec` duration and avoid hanging runs in CI.
