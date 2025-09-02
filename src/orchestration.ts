import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DelegateParams } from './codex-subagents.mcp';
import { tmpdir } from 'os';

export type Step = {
  id: string;
  title: string;
  agent: string;
  status: 'queued' | 'running' | 'done' | 'blocked' | 'canceled';
  stdout_path: string | null;
  stderr_path: string | null;
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

export function routeThroughOrchestrator(params: DelegateParams) {
  const preferredCwd = params.cwd ?? process.cwd();
  const request_id = params.request_id || randomUUID();
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
