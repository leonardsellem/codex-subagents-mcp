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
