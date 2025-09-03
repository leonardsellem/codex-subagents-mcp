import { describe, it, expect } from 'vitest';
import { parseOrchestratorMarkers, applyOrchestratorMarkersToTodo, loadTodo } from '../src/orchestration';
import { routeThroughOrchestrator } from '../src/orchestration';
import type { DelegateParams } from '../src/codex-subagents.mcp';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeCwd() {
  return mkdtempSync(join(tmpdir(), 'orch-markers-'));
}

describe('orchestrator markers parsing', () => {
  it('parses THINK/DECISION/NOTE markers', () => {
    const out = [
      'noise before',
      '[[ORCH-THINK]] {"text":"consider security first"}',
      '[[ORCH-DECISION]] {"text":"delegate security + tests"}',
      '[[ORCH-NOTE]] kickoff batch',
      'other text',
    ].join('\n');
    const markers = parseOrchestratorMarkers(out);
    expect(markers.map(m => m.type)).toEqual(['think', 'decision', 'note']);
  });
});

describe('apply markers into todo', () => {
  it('appends orchestrator steps from stdout markers', () => {
    const cwd = makeCwd();
    const routed = routeThroughOrchestrator({ agent: 'reviewer', task: 'plan', cwd } as DelegateParams);
    const out = [
      '[[ORCH-THINK]] {"text":"map critical paths"}',
      '[[ORCH-DECISION]] {"text":"delegate review"}',
    ].join('\n');
    applyOrchestratorMarkersToTodo(routed.request_id, cwd, out);
    const todo = loadTodo(routed.request_id, cwd);
    const orchSteps = todo.steps.filter(s => s.agent === 'orchestrator');
    expect(orchSteps.length).toBe(2);
    expect(orchSteps[0].notes).toContain('critical paths');
  });
});

