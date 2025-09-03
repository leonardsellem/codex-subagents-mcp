import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DelegateParams } from './codex-subagents.mcp';
import { tmpdir } from 'os';
import { logEvent } from './logging';

export type Step = {
  id: string;
  title: string;
  agent: string;
  status: 'queued' | 'running' | 'done' | 'blocked' | 'canceled';
  stdout_path: string | null;
  stderr_path: string | null;
  // Full input/prompt that triggered the step (exact delegated task)
  prompt?: string | null;
  // Path to a file containing the exact prompt (for large inputs)
  prompt_path?: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
};

export type Todo = {
  request_id: string;
  created_at: string;
  user_prompt: string;
  requested_agent: string;
  status: 'active' | 'done' | 'canceled';
  steps: Step[];
  next_actions: string[];
  summary: string | null;
};

function todoPath(request_id: string, cwd: string) {
  return join(cwd, 'orchestration', request_id, 'todo.json');
}

export function loadTodo(request_id: string, cwd: string): Todo {
  const path = todoPath(request_id, cwd);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as Todo;
}

export function saveTodo(todo: Todo, cwd: string) {
  const path = todoPath(todo.request_id, cwd);
  const temp = path + '.tmp';
  writeFileSync(temp, JSON.stringify(todo, null, 2), 'utf8');
  renameSync(temp, path);
}

export function appendStep(todo: Todo, partial: Pick<Step, 'title' | 'agent' | 'status'> & Partial<Step>) {
  const id = `step-${todo.steps.length + 1}`;
  const step: Step = {
    id,
    title: partial.title,
    agent: partial.agent,
    status: partial.status,
    stdout_path: partial.stdout_path ?? null,
    stderr_path: partial.stderr_path ?? null,
    prompt: partial.prompt ?? null,
    prompt_path: partial.prompt_path ?? null,
    started_at: partial.started_at ?? null,
    ended_at: partial.ended_at ?? null,
    notes: partial.notes ?? null,
  };
  todo.steps.push(step);
  return step;
}

export function updateStep(todo: Todo, id: string, patch: Partial<Step>) {
  const idx = todo.steps.findIndex(s => s.id === id);
  if (idx !== -1) {
    todo.steps[idx] = { ...todo.steps[idx], ...patch };
  }
}

export function finalize(todo: Todo, summary: string, status: 'done' | 'canceled' = 'done') {
  todo.status = status;
  todo.summary = summary;
}

// ----- Orchestrator output parsing (THINK/DECISION markers) -----

export type OrchestratorMarker =
  | { type: 'think'; text: string }
  | { type: 'decision'; text: string }
  | { type: 'note'; text: string };

/**
 * Parses orchestrator stdout for structured markers the persona emits.
 * Supported forms (single-line markers):
 *   [[ORCH-THINK]] {"text":"..."}
 *   [[ORCH-DECISION]] {"text":"..."}
 *   [[ORCH-NOTE]] free text after marker
 */
export function parseOrchestratorMarkers(stdout: string): OrchestratorMarker[] {
  const markers: OrchestratorMarker[] = [];
  const lines = (stdout || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('[[ORCH-THINK]]')) {
      const payload = line.replace('[[ORCH-THINK]]', '').trim();
      try {
        const obj = JSON.parse(payload);
        if (obj && typeof obj.text === 'string' && obj.text.trim()) {
          markers.push({ type: 'think', text: String(obj.text).trim() });
        }
      } catch {
        // ignore malformed JSON
      }
    } else if (line.startsWith('[[ORCH-DECISION]]')) {
      const payload = line.replace('[[ORCH-DECISION]]', '').trim();
      try {
        const obj = JSON.parse(payload);
        if (obj && typeof obj.text === 'string' && obj.text.trim()) {
          markers.push({ type: 'decision', text: String(obj.text).trim() });
        }
      } catch {
        // ignore malformed JSON
      }
    } else if (line.startsWith('[[ORCH-NOTE]]')) {
      const text = line.replace('[[ORCH-NOTE]]', '').trim();
      if (text) markers.push({ type: 'note', text });
    }
  }
  return markers;
}

/**
 * Applies parsed markers to a todo as additional steps authored by the orchestrator.
 */
export function applyOrchestratorMarkersToTodo(request_id: string, cwd: string, stdout: string) {
  try {
    const todo = loadTodo(request_id, cwd);
    const markers = parseOrchestratorMarkers(stdout);
    if (markers.length === 0) return;
    for (const m of markers) {
      appendStep(todo, {
        title: `${m.type}: ${m.text.slice(0, 80)}`,
        agent: 'orchestrator',
        status: 'done',
        notes: m.text,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });
    }
    saveTodo(todo, cwd);
  } catch {
    // best-effort, ignore errors
  }
}

export function routeThroughOrchestrator(params: DelegateParams, activeRequestId?: string) {
  const preferredCwd = params.cwd ?? process.cwd();
  const request_id = params.request_id || activeRequestId || randomUUID();
  // Ensure we have a writable orchestration directory, fallback to tmp if needed
  let cwdUsed = preferredCwd;
  let root = join(cwdUsed, 'orchestration', request_id);
  try {
    mkdirSync(root, { recursive: true });
  } catch {
    cwdUsed = join(tmpdir(), 'codex-subagents');
    root = join(cwdUsed, 'orchestration', request_id);
    mkdirSync(root, { recursive: true });
  }
  const todoFile = join(root, 'todo.json');
  if (!existsSync(todoFile)) {
    const todo: Todo = {
      request_id,
      created_at: new Date().toISOString(),
      user_prompt: params.task,
      requested_agent: params.agent,
      status: 'active',
      steps: [],
      next_actions: [],
      summary: null,
    };
    saveTodo(todo, cwdUsed);
  }
  // Initialize audit log
  try {
    logEvent(cwdUsed, {
      run_id: request_id,
      event: 'request_started',
      agent: 'orchestrator',
    });
  } catch {
    // best effort
  }
  const envelope = [
    '[[ORCH-ENVELOPE]]',
    JSON.stringify({
      request_id,
      requested_agent: params.agent,
      cwd: cwdUsed,
      mirror_repo: params.mirror_repo ?? false,
      profile: params.profile ?? null,
      has_persona: Boolean(params.persona),
    }, null, 2),
    '[[/ORCH-ENVELOPE]]',
    '',
    params.task,
  ].join('\n');
  return { agent: 'orchestrator', task: envelope, request_id, cwd: cwdUsed } as unknown as DelegateParams & { agent: 'orchestrator' };
}
