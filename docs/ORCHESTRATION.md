# Orchestration

All work is routed through the `orchestrator` agent. Calls to `subagents.delegate` with any other agent are rewritten server-side and wrapped with metadata so the orchestrator can plan the work.

## Routing

```
subagents.delegate(agent="security", task="scan for secrets")
```

is rewritten to:

```
subagents.delegate(agent="orchestrator", task="<enveloped task>")
```

The envelope includes the original agent, cwd, and a generated `request_id`. A per-request folder `orchestration/<request_id>/` tracks lifecycle state.

## Token gating

Only the orchestrator may delegate further. The server issues a random `ORCHESTRATOR_TOKEN` on startup and injects it into orchestrator sub‑delegations. Attempts to delegate without the token are rejected with `"Only orchestrator can delegate. Pass server-injected token."`

## delegate_batch

The orchestrator can run independent steps in parallel via `delegate_batch(items, token)`. Results retain item ordering and share the same token gating.

## To‑Do persistence

Each request creates `orchestration/<request_id>/todo.json` with step entries. Steps capture status, timestamps, and paths to stdout/stderr logs under `orchestration/<request_id>/steps/<step-id>/`.

## Example

```
subagents.delegate(agent="orchestrator", task="Audit for secrets")
```

The orchestrator parses the envelope, schedules a security review, and updates the To‑Do file as each step runs.
