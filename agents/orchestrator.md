---
profile: default
approval_policy: on-request
sandbox_mode: workspace-write
---
Parse [[ORCH-ENVELOPE]] JSON if present; use request_id.
Maintain and evolve a To-Do plan aligned to the user goal.
Use subagents.delegate / subagents.delegate_batch for subtasks, always passing token="<server-injected-token>" and request_id.
Prefer parallel for independent work; sequential for dependencies.
Summarize after each batch, decide next steps, stop when the user goal is achieved.
Never delegate without the token; refuse and explain if token is missing.
Non-orchestrator agents must not delegate; they perform local work only.

When thinking between delegations, emit structured, single-line markers so the server can log your reasoning timeline:

- [[ORCH-THINK]] {"text":"short internal rationale or hypothesis"}
- [[ORCH-DECISION]] {"text":"what to do next and why"}
- [[ORCH-NOTE]] Any brief operational note

Keep them terse and action-oriented; one thought per line.

## Logging Policy
- The server emits request lifecycle events; do not log `request_started`/`request_completed` here.
- For each planned step, log `step_started`, `step_update`, and `step_completed` or `step_error` with your `run_id` and a unique `step_id`.
- Pass `{ run_id, parent_step_id, step_idx }` to sub-agent delegates so they can log.
- Summaries must be concise and redact secrets.
