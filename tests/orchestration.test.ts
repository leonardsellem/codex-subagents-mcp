import { describe, it, expect } from 'vitest';
import { routeThroughOrchestrator, loadTodo, finalize, saveTodo } from '../src/orchestration';
import { delegateHandler, ORCHESTRATOR_TOKEN, delegateBatchHandler } from '../src/codex-subagents.mcp';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeCwd() {
  return mkdtempSync(join(tmpdir(), 'orch-'));
}

describe('routing', () => {
  it('rewrites to orchestrator and creates todo', () => {
    const cwd = makeCwd();
    const routed = routeThroughOrchestrator({ agent: 'security', task: 'scan', cwd } as any);
    expect(routed.agent).toBe('orchestrator');
    const todo = loadTodo(routed.request_id, cwd);
    expect(todo.requested_agent).toBe('security');
  });
});

describe('token gating', () => {
  it('rejects nested delegate without token', async () => {
    const res = await delegateHandler({ agent: 'security', task: 'x', request_id: 'req1' });
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain('Only orchestrator');
  });
  it('allows delegate with token', async () => {
    const res = await delegateHandler({ agent: 'security', task: 'x', token: ORCHESTRATOR_TOKEN });
    expect(res.code).not.toBe(0);
  });
});

describe('batch', () => {
  it('handles mixed token gating', async () => {
    const res = await delegateBatchHandler({
      items: [
        { agent: 'reviewer', task: 'a', request_id: 'req' },
        { agent: 'debugger', task: 'b', request_id: 'req', token: ORCHESTRATOR_TOKEN },
      ],
    });
    expect(res.results.length).toBe(2);
    expect(res.results[0].stderr).toContain('Only orchestrator');
    expect(res.results[1].code).not.toBe(0);
  });
  it('accepts legacy single-item shape', async () => {
    const res = await delegateBatchHandler({ agent: 'reviewer', task: 'a' });
    expect(res.results.length).toBe(1);
  });
});

describe('todo lifecycle', () => {
  it('records steps with outputs', async () => {
    const cwd = makeCwd();
    const routed = routeThroughOrchestrator({ agent: 'reviewer', task: 'check', cwd } as any);
    await delegateHandler({ agent: 'debugger', task: 'run', token: ORCHESTRATOR_TOKEN, request_id: routed.request_id, cwd });
    const todo = loadTodo(routed.request_id, cwd);
    expect(todo.steps.length).toBe(1);
    expect(todo.steps[0].status).toBe('blocked');
  });
});

describe('e2e multi-step', () => {
  it('tracks multiple steps', async () => {
    const cwd = makeCwd();
    const routed = routeThroughOrchestrator({ agent: 'orchestrator', task: 'plan', cwd } as any);
    const req = routed.request_id;
    await delegateHandler({ agent: 'reviewer', task: 'r', token: ORCHESTRATOR_TOKEN, request_id: req, cwd });
    await delegateHandler({ agent: 'debugger', task: 'd', token: ORCHESTRATOR_TOKEN, request_id: req, cwd });
    await delegateHandler({ agent: 'security', task: 's', token: ORCHESTRATOR_TOKEN, request_id: req, cwd });
    const todo = loadTodo(req, cwd);
    expect(todo.steps.length).toBe(3);
    finalize(todo, 'summary');
    saveTodo(todo, cwd);
  });
});
