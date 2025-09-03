import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export type PlanStatus = 'in_progress' | 'completed' | 'error';

interface StepState {
  id: string;
  name: string;
  status: PlanStatus;
}

interface RunState {
  dir: string;
  steps: StepState[];
  cache: string[];
  degraded: boolean;
  start: number;
}

const runs = new Map<string, RunState>();

export type LogEvent = {
  ts?: string;
  run_id: string;
  event: 'request_started' | 'step_started' | 'step_update' | 'step_completed' | 'step_error' | 'request_completed';
  agent: string;
  agent_version?: string;
  step_id?: string;
  parent_step_id?: string;
  step_idx?: number;
  name?: string;
  input_summary?: string;
  decision?: string;
  status?: 'started' | 'streaming' | 'completed' | 'error';
  duration_ms?: number;
  output_summary?: string;
  error?: { type: string; message: string; stack?: string };
  steps_total?: number;
  steps_succeeded?: number;
  steps_failed?: number;
  elapsed_ms?: number;
};

export function logEvent(baseDir: string | undefined, ev: LogEvent, notify?: (method: string, params?: unknown) => void) {
  let state = runs.get(ev.run_id);
  if (ev.event === 'request_started') {
    const dir = join(baseDir ?? process.cwd(), 'orchestration', ev.run_id);
    mkdirSync(dir, { recursive: true });
    state = { dir, steps: [], cache: [], degraded: false, start: Date.now() };
    runs.set(ev.run_id, state);
  }
  if (!state) return;

  switch (ev.event) {
    case 'step_started': {
      state.steps.forEach(s => { if (s.status === 'in_progress') s.status = 'completed'; });
      if (ev.step_id && ev.name) {
        state.steps.push({ id: ev.step_id, name: ev.name, status: 'in_progress' });
      }
      break;
    }
    case 'step_completed': {
      if (ev.step_id) {
        const s = state.steps.find(x => x.id === ev.step_id);
        if (s) s.status = 'completed';
      }
      break;
    }
    case 'step_error': {
      if (ev.step_id) {
        const s = state.steps.find(x => x.id === ev.step_id);
        if (s) s.status = 'error';
      }
      break;
    }
    case 'request_completed': {
      ev.steps_total = ev.steps_total ?? state.steps.length;
      ev.steps_succeeded = ev.steps_succeeded ?? state.steps.filter(s => s.status === 'completed').length;
      ev.steps_failed = ev.steps_failed ?? state.steps.filter(s => s.status === 'error').length;
      ev.elapsed_ms = ev.elapsed_ms ?? (Date.now() - state.start);
      break;
    }
  }

  const record = { ...ev, ts: ev.ts ?? new Date().toISOString() };
  const line = JSON.stringify(record) + '\n';
  try {
    if (state.cache.length) {
      appendFileSync(join(state.dir, 'request.log.jsonl'), state.cache.join(''), 'utf8');
      state.cache = [];
      state.degraded = false;
    }
    appendFileSync(join(state.dir, 'request.log.jsonl'), line, 'utf8');
  } catch {
    state.cache.push(line);
    if (!state.degraded && notify) notify('console', { text: 'logging degraded; caching locally' });
    state.degraded = true;
  }

  if (notify) {
    const planLines = state.steps.map((s, idx) => `${idx + 1}. ${s.name} — ${s.status}`);
    switch (ev.event) {
      case 'step_started':
      case 'step_completed':
      case 'step_error':
      case 'request_completed':
        setImmediate(() => notify('update_plan', { steps: planLines }));
        break;
      case 'step_update':
        if (ev.output_summary) {
          const text = ev.output_summary.slice(0, 120);
          setImmediate(() => notify('console', { text }));
        }
        break;
    }
  }

  if (ev.event === 'request_completed') {
    runs.delete(ev.run_id);
  }
}
