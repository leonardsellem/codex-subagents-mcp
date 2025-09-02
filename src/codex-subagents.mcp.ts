#!/usr/bin/env node
/*
 Minimal MCP server exposing a single tool `delegate` to spawn Codex CLI
 sub-agents with clean context via an ephemeral workdir and injected persona.

 Dependency footprint is minimal by default (zod). We implement a tiny
 JSON-RPC-over-stdio MCP wrapper compatible with basic MCP usage
 (initialize, tools/list, tools/call). If you later install a full MCP helper,
 you can swap it with minimal code changes.
*/

import { mkdtempSync, writeFileSync, cpSync, existsSync, readdirSync, readFileSync, statSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, basename, extname, resolve } from 'path';
import { spawn } from 'child_process';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { routeThroughOrchestrator, loadTodo, saveTodo, appendStep, updateStep, applyOrchestratorMarkersToTodo } from './orchestration';

const SERVER_NAME = 'codex-subagents';
const SERVER_VERSION = '0.1.0';
const START_TIME = Date.now();
export const ORCHESTRATOR_TOKEN = randomBytes(16).toString('hex');
// Tracks the active orchestration request while the orchestrator agent is running.
// Used to transparently inject token/request_id into nested delegate calls
// so steps are logged without personas needing to pass secrets.
let CURRENT_ORCHESTRATION_REQUEST_ID: string | undefined;

// Personas and profiles
type AgentKey = 'reviewer' | 'debugger' | 'security';
export type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type AgentSpec = {
  profile: string;
  persona: string;
  approval_policy?: ApprovalPolicy;
  sandbox_mode?: SandboxMode;
};

export const AGENTS: Record<AgentKey, AgentSpec> = {
  reviewer: {
    profile: 'reviewer',
    persona:
      [
        'You are a senior code reviewer focused on clarity and maintainability.',
        'Goals: readability, naming, structure, tests, error handling, security, performance.',
        'Method:',
        '- Skim repo structure; identify affected modules.',
        '- Review diffs and hotspots; note risks and complexity.',
        '- Propose concrete, minimal patches with rationale.',
        'Output:',
        '- A prioritized list of issues (critical → nice-to-have).',
        '- Unified diffs or file-level patches for the top items.',
        '- Clear next steps to land improvements safely.',
      ].join('\n'),
  },
  debugger: {
    profile: 'debugger',
    persona:
      [
        'You are a root-cause debugger. You prioritize reproduction and minimal fixes.',
        'Method:',
        '- Reproduce: identify failing tests or real-world triggers.',
        '- Isolate: bisect, add focused assertions or logs, minimize scope.',
        '- Fix: implement the smallest change that resolves the root cause.',
        '- Verify: add/adjust tests; ensure no regressions.',
        'Output:',
        '- Root cause summary with evidence (stack traces, repro steps).',
        '- The minimal patch (diff) and why it’s safe.',
        '- Prevention notes (tests, lint rules, invariants).',
      ].join('\n'),
  },
  security: {
    profile: 'security',
    persona:
      [
        'You are a pragmatic security auditor for application code.',
        'Scope: secret exposure, unsafe shell usage, SSRF, path traversal, deserialization,',
        'dependency risks, auth/z logic gaps, and obvious injection vectors.',
        'Method:',
        '- Map entry points and trust boundaries; prefer grep + codeflow inspection.',
        '- Flag risky APIs and patterns; propose safer alternatives.',
        '- Balance risk/effort and suggest incremental hardening steps.',
        'Output:',
        '- Findings with severity, impact, and exploitability.',
        '- Concrete code changes or configs to mitigate.',
        '- Policy/ops recommendations where relevant.',
      ].join('\n'),
  },
};

// Zod schema for tool parameters
export const DelegateParamsSchema = z.object({
  // Allow custom agent names. If unknown, require persona+profile inline.
  agent: z.string().min(1, 'agent name is required'),
  task: z.string().min(1, 'task is required'),
  cwd: z.string().optional(),
  mirror_repo: z.boolean().default(false),
  // Optional ad-hoc agent definition when not found in registry
  profile: z.string().optional(),
  persona: z.string().optional(),
  approval_policy: z.enum(['never', 'on-request', 'on-failure', 'untrusted']).optional(),
  sandbox_mode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
  token: z.string().optional(),
  request_id: z.string().optional(),
});

export type DelegateParams = z.infer<typeof DelegateParamsSchema>;

export const DelegateBatchParamsSchema = z.object({
  items: z.array(DelegateParamsSchema),
  token: z.string().optional(),
});
export type DelegateBatchParams = z.infer<typeof DelegateBatchParamsSchema>;

// Spawn helper
export function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }>
{
  function sanitizedEnv(base: NodeJS.ProcessEnv = process.env) {
    const allow = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'SHELL', 'TERM', 'TMPDIR'];
    const prefixAllow = ['CODEX_', 'SUBAGENTS_'];
    const out: Record<string, string> = {};
    for (const k of allow) if (base[k]) out[k] = String(base[k]);
    for (const [k, v] of Object.entries(base)) {
      if (prefixAllow.some((p) => k.startsWith(p)) && typeof v !== 'undefined') out[k] = String(v);
    }
    return out;
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: sanitizedEnv() });
    const outChunks: Array<string | Buffer> = [];
    const errChunks: Array<string | Buffer> = [];
    child.stdout.on('data', (d) => outChunks.push(d));
    child.stderr.on('data', (d) => errChunks.push(d));
    const toUtf8 = (arr: Array<string | Buffer>) =>
      Buffer.concat(arr.map((x) => (Buffer.isBuffer(x) ? x : Buffer.from(String(x))))).toString('utf8');

    // Hard timeout to avoid hanging the test suite if codex blocks
    const timeoutMs = Number(process.env.SUBAGENTS_EXEC_TIMEOUT_MS || 2000);
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) { void e; }
      resolve({ code: 1, stdout: toUtf8(outChunks), stderr: toUtf8(errChunks) || 'codex execution timeout' });
    }, Math.max(500, timeoutMs));

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout: toUtf8(outChunks), stderr: toUtf8(errChunks) });
    });
    child.on('error', (err: unknown) => {
      clearTimeout(timer);
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      const msg = code === 'ENOENT'
        ? 'codex binary not found in PATH. Install Codex CLI and ensure it is on PATH. See README.md for setup instructions.'
        : String(err);
      resolve({ code: 127, stdout: '', stderr: msg });
    });
  });
}

export function prepareWorkdir(agent: AgentKey): string {
  return mkdtempSync(join(tmpdir(), `codex-${agent}-`));
}

export function writePersona(workdir: string, agent: AgentKey): void {
  const spec = AGENTS[agent];
  const content = `# Persona: ${agent}\n\n${spec.persona}\n\n` +
    [
      'Operating guide:',
      '- Respect the project’s constraints and existing style.',
      '- Prefer minimal, incremental changes with clear tests.',
      '- State assumptions; call out tradeoffs and alternatives.',
    ].join('\n');
  writeFileSync(join(workdir, 'AGENTS.md'), content, 'utf8');
}

export function mirrorRepoIfRequested(srcCwd: string | undefined, dest: string, mirror: boolean): void {
  if (!mirror) return;
  if (!srcCwd) return;
  // Validate and filter sensitive paths by default
  const base = resolve(process.cwd());
  const src = resolve(srcCwd);
  if (!(src === base || src.startsWith(base + '/'))) {
    throw new Error(`Refusing to mirror outside base cwd: ${src}`);
  }
  const skip = new Set(['.git', '.ssh', '.env', '.env.local', 'node_modules']);
  const mirrorAll = process.env.SUBAGENTS_MIRROR_ALL === '1';
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (p: string) => {
      if (mirrorAll) return true;
      const name = basename(p);
      return !skip.has(name);
    },
  });
}

// -------- Dynamic agents loading from directory --------
export function getAgentsDir(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  currentDir: string = process.cwd(),
): string | undefined {
  const fromArg = argv.find((a) => a.startsWith('--agents-dir'));
  if (fromArg) {
    const parts = fromArg.split('=');
    if (parts.length === 2 && parts[1]) return parts[1];
    const idx = argv.indexOf(fromArg);
    if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  }
  if (env.CODEX_SUBAGENTS_DIR) return env.CODEX_SUBAGENTS_DIR;
  // Common defaults. Prefer explicit, then CWD, then next to the installed server binary.
  const candidates = [
    // Project-local defaults
    join(currentDir, 'agents'),
    join(currentDir, '.codex-subagents', 'agents'),
    // Fallback: alongside the installed server (dist/../agents or src/../agents)
    join(__dirname, '..', 'agents'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

function parseFrontmatter(md: string): { attrs: Record<string, string>; body: string } {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { attrs: {}, body: md };
  const raw = m[1];
  const body = md.slice(m[0].length);
  const attrs: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (kv) attrs[kv[1]] = kv[2];
  }
  return { attrs, body };
}

export function loadAgentsFromDir(dir?: string): Record<string, AgentSpec> {
  if (!dir) return {};
  if (!existsSync(dir)) return {};
  const out: Record<string, AgentSpec> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) continue;
      const name = basename(entry, extname(entry));
      if (entry.endsWith('.md')) {
        const raw = readFileSync(full, 'utf8');
        const { attrs, body } = parseFrontmatter(raw);
        const profile = (attrs.profile || attrs.agent_profile || 'default').trim();
        let approval_policy: ApprovalPolicy | undefined;
        let sandbox_mode: SandboxMode | undefined;
        const ap = attrs.approval_policy?.trim();
        const sm = attrs.sandbox_mode?.trim();
        if (ap && ['never', 'on-request', 'on-failure', 'untrusted'].includes(ap)) {
          approval_policy = ap as ApprovalPolicy;
        }
        if (sm && ['read-only', 'workspace-write', 'danger-full-access'].includes(sm)) {
          sandbox_mode = sm as SandboxMode;
        }
        out[name] = { profile, persona: body.trim(), approval_policy, sandbox_mode };
      } else if (entry.endsWith('.json')) {
        const obj = JSON.parse(readFileSync(full, 'utf8')) as Partial<AgentSpec> & { personaFile?: string };
        let persona = obj.persona;
        if (!persona && obj.personaFile) {
          const p = join(dir, obj.personaFile);
          if (existsSync(p)) persona = readFileSync(p, 'utf8');
        }
        const ap = obj.approval_policy;
        const sm = obj.sandbox_mode;
        let approval_policy: ApprovalPolicy | undefined;
        let sandbox_mode: SandboxMode | undefined;
        if (ap && ['never', 'on-request', 'on-failure', 'untrusted'].includes(ap)) {
          approval_policy = ap as ApprovalPolicy;
        }
        if (sm && ['read-only', 'workspace-write', 'danger-full-access'].includes(sm)) {
          sandbox_mode = sm as SandboxMode;
        }
        if (obj.profile && persona) out[name] = { profile: obj.profile, persona, approval_policy, sandbox_mode } as AgentSpec;
      }
    } catch {
      // ignore bad entries
    }
  }
  return out;
}

type ToolRunResult = { ok: boolean; code: number; stdout: string; stderr: string; working_dir: string };
function failure(stderr: string, code = 1, working_dir = ''): ToolRunResult {
  return { ok: false, code, stdout: '', stderr, working_dir };
}

export async function delegateHandler(params: unknown) {
  const parsed = DelegateParamsSchema.safeParse(params);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((i) => i.message).join('; ');
    return failure(`Invalid delegate arguments: ${summary}`, 2);
  }
  const p = parsed.data;
  // Pre-check unknown agents to satisfy error-surface tests without routing
  const preDynamic = loadAgentsFromDir(getAgentsDir());
  const preRegistry: Record<string, AgentSpec> = { ...AGENTS, ...preDynamic };
  const preKnown = preRegistry[p.agent as AgentKey] ?? preRegistry[p.agent];
  const hasInline = Boolean(p.persona && p.profile);
  if (p.agent !== 'orchestrator' && p.token !== ORCHESTRATOR_TOKEN && !p.request_id) {
    if (!preKnown && !hasInline) {
      return failure(
        `Unknown agent: ${p.agent}. Create agents/<name>.md or pass persona+profile inline. ` +
          'See README.md “Custom agents”.',
        2,
      );
    }
  }
  // Token gating & routing
  if (p.agent !== 'orchestrator') {
    if (p.token !== ORCHESTRATOR_TOKEN) {
      if (p.request_id) {
        return failure('Only orchestrator can delegate. Pass server-injected token.');
      }
      const routed = routeThroughOrchestrator(p);
      return delegateHandler({ ...p, ...routed });
    }
  } else {
    if (!p.request_id) {
      const routed = routeThroughOrchestrator(p);
      p.request_id = routed.request_id;
      p.task = routed.task;
      // Propagate the writable cwd chosen by the router (may fallback to tmp)
      if (routed.cwd) p.cwd = routed.cwd as string;
    } else {
      let cwdEnsure = p.cwd ?? process.cwd();
      try {
        mkdirSync(join(cwdEnsure, 'orchestration', p.request_id), { recursive: true });
      } catch {
        // Fallback to tmp if current cwd is not writable
        cwdEnsure = join(tmpdir(), 'codex-subagents');
        mkdirSync(join(cwdEnsure, 'orchestration', p.request_id), { recursive: true });
        p.cwd = cwdEnsure;
      }
    }
  }

  const agentName = p.agent;
  const dynamic = loadAgentsFromDir(getAgentsDir());
  const registry: Record<string, AgentSpec> = { ...AGENTS, ...dynamic };
  const known = registry[agentName as AgentKey] ?? registry[agentName];
  const spec: AgentSpec | undefined = known ?? (p.persona && p.profile ? {
    persona: p.persona,
    profile: p.profile,
    approval_policy: p.approval_policy,
    sandbox_mode: p.sandbox_mode,
  } : undefined);
  if (!spec) {
    return failure(
      `Unknown agent: ${agentName}. Create agents/<name>.md or pass persona+profile inline. ` +
        'See README.md “Custom agents”.',
      2,
    );
  }
  const cwd = p.cwd ?? process.cwd();
  let stepId: string | undefined;
  if (p.agent !== 'orchestrator' && p.token === ORCHESTRATOR_TOKEN && p.request_id) {
    const todo = loadTodo(p.request_id, cwd);
    const step = appendStep(todo, {
      title: p.task.split('\n')[0].slice(0, 80),
      agent: p.agent,
      status: 'running',
      prompt: p.task,
      started_at: new Date().toISOString(),
    });
    saveTodo(todo, cwd);
    stepId = step.id;
  }
  const workdir = prepareWorkdir((known ? (agentName as AgentKey) : 'reviewer'));
  // Write persona regardless of source
  const personaContent = spec.persona;
  writeFileSync(join(workdir, 'AGENTS.md'), `# Persona: ${agentName}\n\n${personaContent}\n`, 'utf8');
  if (p.mirror_repo) {
    try {
      mirrorRepoIfRequested(cwd, workdir, true);
    } catch (e) {
      return failure(
        `Failed to mirror repo into temp dir: ${String(e)}. ` +
          'Consider disabling mirroring or using git worktree (see docs).',
        1,
        workdir,
      );
    }
  }

  const args = ['exec', '--profile', spec.profile, p.task];
  const execCwd = p.mirror_repo ? workdir : cwd;
  const isOrchestrator = p.agent === 'orchestrator';
  let res: { code: number; stdout: string; stderr: string };
  if (isOrchestrator && p.request_id) {
    const prev = CURRENT_ORCHESTRATION_REQUEST_ID;
    CURRENT_ORCHESTRATION_REQUEST_ID = p.request_id;
    try {
      res = await run('codex', args, execCwd);
    } finally {
      CURRENT_ORCHESTRATION_REQUEST_ID = prev;
    }
  } else {
    res = await run('codex', args, execCwd);
  }
  // If orchestrator ran, automatically populate summary and next_actions from its output
  if (isOrchestrator && p.request_id) {
    try {
      const todo = loadTodo(p.request_id, cwd);
      const out = (res.stdout || '').trim();
      // Summary: first 500 chars of stdout or stderr fallback
      const base = out.length > 0 ? out : (res.stderr || '').trim();
      todo.summary = base ? base.slice(0, 500) : `Orchestration updated at ${new Date().toISOString()}`;
      // Next actions: extract up to 5 bullet-like lines
      const lines = out.split(/\r?\n/);
      const bullets: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (/^(?:[-*•]\s+|\d+\.\s+)/.test(t)) {
          const normalized = t.replace(/^(?:[-*•]\s+|\d+\.\s+)/, '').trim();
          if (normalized) bullets.push(normalized);
          if (bullets.length >= 5) break;
        }
      }
      todo.next_actions = bullets;
      saveTodo(todo, cwd);
      // Parse orchestrator THINK/DECISION markers and add to todo steps
      applyOrchestratorMarkersToTodo(p.request_id, cwd, out);
    } catch {
      // best-effort; ignore failures here
    }
  }
  if (stepId && p.request_id) {
    const todo = loadTodo(p.request_id, cwd);
    const stepDir = join(cwd, 'orchestration', p.request_id, 'steps', stepId);
    mkdirSync(stepDir, { recursive: true });
    // Persist exact prompt and outputs for auditability
    writeFileSync(join(stepDir, 'prompt.txt'), (p.task || '').toString(), 'utf8');
    writeFileSync(join(stepDir, 'stdout.txt'), res.stdout, 'utf8');
    writeFileSync(join(stepDir, 'stderr.txt'), res.stderr, 'utf8');
    updateStep(todo, stepId, {
      ended_at: new Date().toISOString(),
      status: res.code === 0 ? 'done' : 'blocked',
      prompt_path: join('steps', stepId, 'prompt.txt'),
      stdout_path: join('steps', stepId, 'stdout.txt'),
      stderr_path: join('steps', stepId, 'stderr.txt'),
    });
    // Update overall todo status: if no steps are running, mark as done.
    const anyRunning = todo.steps.some(s => s.status === 'running');
    todo.status = anyRunning ? 'active' : 'done';
    saveTodo(todo, cwd);
  }
  return {
    ok: res.code === 0 && res.stdout.trim().length > 0,
    code: res.code,
    stdout: res.stdout.trim(),
    stderr: res.stderr.trim(),
    working_dir: workdir,
  };
}

export async function delegateBatchHandler(params: unknown) {
  try {
    if (params && typeof params === 'object' && 'agent' in (params as Record<string, unknown>)) {
      const single = await delegateHandler(params);
      return { results: [single] };
    }
    const parsed = DelegateBatchParamsSchema.safeParse(params);
    if (!parsed.success) {
      const summary = parsed.error.issues.map((i) => i.message).join('; ');
      return { results: [failure(`Invalid delegate arguments: ${summary}`, 2)] };
    }
    const results = await Promise.allSettled(
      parsed.data.items.map((item) => delegateHandler({ ...item, token: item.token ?? parsed.data.token }))
    );
    return {
      results: results.map((r) =>
        r.status === 'fulfilled'
          ? r.value
          : { ok: false, code: 1, stdout: '', stderr: String(r.reason), working_dir: '' }
      ),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { results: [{ ok: false, code: 1, stdout: '', stderr: msg, working_dir: '' }] };
  }
}

// ---------------- Tiny MCP stdio server -----------------
// Implements a narrow slice of MCP sufficient for tools/list and tools/call.

type JsonRpcId = number | string | null;
type JsonRpcRequest = { jsonrpc: '2.0'; id: JsonRpcId; method: string; params?: unknown };
type JsonRpcResponse = { jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

type ToolDef = {
  name: string;
  description: string;
  inputSchema: unknown; // JSON Schema
  handler: (args: unknown) => Promise<unknown>;
};

class TinyMCPServer {
  private tools: Map<string, ToolDef> = new Map();
  private buffer: Buffer = Buffer.alloc(0);
  private static readonly MAX_BYTES = 1_000_000; // 1MB cap
  private framing: 'unknown' | 'cl' | 'nl' = 'unknown';

  constructor(private name: string, private version: string) {
    process.stdin.on('data', (chunk: Buffer) => this.onData(chunk));
    process.stdin.on('error', (err: unknown) => console.error('stdin error', err));
    // Ensure the process starts reading immediately
    process.stdin.resume();
  }

  addTool(def: ToolDef) {
    this.tools.set(def.name, def);
  }

  start() {
    // no-op: listening on stdin already
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > TinyMCPServer.MAX_BYTES * 2) {
      // prevent unbounded growth (DoS guard)
      this.buffer = Buffer.alloc(0);
      return;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const crlfIdx = this.buffer.indexOf('\r\n\r\n');
      const lfIdx = this.buffer.indexOf('\n\n');
      if (crlfIdx !== -1 || lfIdx !== -1) {
        const headerEnd = crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx) ? crlfIdx : lfIdx;
        const sepLen = crlfIdx !== -1 && (lfIdx === -1 || crlfIdx < lfIdx) ? 4 : 2;
        const header = this.buffer.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(header);
        if (!match) {
          // Malformed; drop headers and continue scanning
          this.buffer = this.buffer.slice(headerEnd + sepLen);
          continue;
        }
        this.framing = 'cl';
        const len = parseInt(match[1], 10);
        if (!Number.isFinite(len) || len < 0 || len > TinyMCPServer.MAX_BYTES) {
          this.buffer = this.buffer.slice(headerEnd + sepLen);
          continue;
        }
        const total = headerEnd + sepLen + len;
        if (this.buffer.length < total) break;
        const body = this.buffer.slice(headerEnd + sepLen, total).toString('utf8');
        this.buffer = this.buffer.slice(total);
        try {
          const req = JSON.parse(body) as JsonRpcRequest;
          this.handleRequest(req);
        } catch {
          // ignore parse error
        }
        continue;
      }

      const nlIdx = this.buffer.indexOf('\n');
      if (nlIdx === -1) break;
      const line = this.buffer.slice(0, nlIdx).toString('utf8').trim();
      this.buffer = this.buffer.slice(nlIdx + 1);
      if (!line) continue;
      try {
        this.framing = 'nl';
        const req = JSON.parse(line) as JsonRpcRequest;
        this.handleRequest(req);
      } catch {
        // ignore parse error
      }
    }
  }

  private write(obj: Record<string, unknown>) {
    const payload = JSON.stringify(obj);
    if (this.framing === 'cl') {
      const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
      process.stdout.write(header + payload);
    } else {
      process.stdout.write(payload + '\n');
    }
  }

  private writeMessage(obj: JsonRpcResponse) {
    this.write(obj);
  }

  private writeNotification(method: string, params?: unknown) {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private async handleRequest(req: JsonRpcRequest) {
    const isNotification = req.id === undefined;
    const id = isNotification ? null : req.id;
    try {
      if (req.method === 'initialize') {
        const now = Date.now();
        if (process.env.DEBUG_MCP) {
          console.error(
            `[${new Date().toISOString()}] initialize received after ${now - START_TIME}ms`,
          );
        }
        const result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: this.name, version: this.version },
        };
        this.writeMessage({ jsonrpc: '2.0', id, result });
        setTimeout(() => {
          this.writeNotification('initialized');
          if (process.env.DEBUG_MCP) {
            console.error(
              `[${new Date().toISOString()}] initialized sent after ${Date.now() - START_TIME}ms`,
            );
          }
        }, 0);
        return;
      }
      if (req.method === 'tools/list') {
        const tools = Array.from(this.tools.values()).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        this.writeMessage({ jsonrpc: '2.0', id, result: { tools } });
        return;
      }
      if (req.method === 'tools/call') {
        const p = (req.params ?? {}) as { name?: string; arguments?: unknown };
        const name = p.name;
        let args: unknown = p.arguments;
        if (!name || !this.tools.has(name)) {
          this.writeMessage({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${name}` },
          });
          return;
        }
        const tool = this.tools.get(name)!;
        try {
          // Inject orchestration context for nested delegate calls
          if (CURRENT_ORCHESTRATION_REQUEST_ID && (name === 'delegate' || name === 'delegate_batch')) {
            if (name === 'delegate') {
              const base: Record<string, unknown> = (args && typeof args === 'object') ? (args as Record<string, unknown>) : {};
              const tokenVal = ('token' in base) ? (base['token'] as unknown) : undefined;
              const reqVal = ('request_id' in base) ? (base['request_id'] as unknown) : undefined;
              args = {
                ...base,
                token: (typeof tokenVal === 'string' && tokenVal.length > 0) ? tokenVal : ORCHESTRATOR_TOKEN,
                request_id: (typeof reqVal === 'string' && reqVal.length > 0) ? reqVal : CURRENT_ORCHESTRATION_REQUEST_ID,
              };
            } else if (name === 'delegate_batch') {
              const base: Record<string, unknown> = (args && typeof args === 'object') ? (args as Record<string, unknown>) : {};
              const maybeItems = 'items' in base ? base['items'] : undefined;
              const itemsIn: Array<Record<string, unknown>> = Array.isArray(maybeItems) ? (maybeItems as Array<Record<string, unknown>>) : [];
              const items = itemsIn.map((it) => {
                const tok = (it && typeof it === 'object' && 'token' in it) ? (it as Record<string, unknown>)['token'] : undefined;
                const rid = (it && typeof it === 'object' && 'request_id' in it) ? (it as Record<string, unknown>)['request_id'] : undefined;
                return {
                  ...(it || {}),
                  token: (typeof tok === 'string' && tok.length > 0) ? tok : ORCHESTRATOR_TOKEN,
                  request_id: (typeof rid === 'string' && rid.length > 0) ? rid : CURRENT_ORCHESTRATION_REQUEST_ID,
                } as Record<string, unknown>;
              });
              const batchToken = ('token' in base) ? base['token'] : undefined;
              args = {
                ...base,
                items,
                token: (typeof batchToken === 'string' && batchToken.length > 0) ? batchToken : ORCHESTRATOR_TOKEN,
              } as Record<string, unknown>;
            }
          }
          const data = await tool.handler(args ?? {});
          this.writeMessage({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                { type: 'text', text: (process.env.DEBUG_MCP ? JSON.stringify(data, null, 2) : JSON.stringify(data)) },
              ],
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (process.env.DEBUG_MCP) {
            this.writeNotification('tool/error', { name, message: msg });
          }
          const failObj = failure(msg);
          this.writeMessage({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(failObj) }],
            },
          });
        }
        return;
      }

      if (req.method === 'shutdown') {
        this.writeMessage({ jsonrpc: '2.0', id, result: null });
        return;
      }

      if (!isNotification) {
        // Default: method not found for requests
        this.writeMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isNotification) {
        this.writeMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: msg },
        });
      }
    }
  }
}

// Server wiring
function toJsonSchema(_schema: z.ZodTypeAny) {
  // Very small bridge using zod-to-json-schema would be ideal, but to keep
  // dependencies minimal we handwrite the schema here.
  return {
    type: 'object',
    properties: {
      agent: { type: 'string' },
      task: { type: 'string' },
      cwd: { type: 'string' },
      mirror_repo: { type: 'boolean', default: false },
      profile: { type: 'string' },
      persona: { type: 'string' },
      approval_policy: { type: 'string', enum: ['never', 'on-request', 'on-failure', 'untrusted'] },
      sandbox_mode: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'] },
    },
    required: ['agent', 'task'],
    additionalProperties: false,
  };
}

const server = new TinyMCPServer(SERVER_NAME, SERVER_VERSION);
if (process.env.DEBUG_MCP) {
  console.error(`[${new Date().toISOString()}] server starting`);
}

server.addTool({
  name: 'delegate',
  description:
    'Run a named sub-agent as a clean Codex exec with its own persona/profile.',
  inputSchema: toJsonSchema(DelegateParamsSchema),
  handler: (args: unknown) => delegateHandler(args),
});

server.addTool({
  name: 'delegate_batch',
  description: 'Run multiple sub-agents in parallel',
  inputSchema: toJsonSchema(DelegateBatchParamsSchema),
  handler: (args: unknown) => delegateBatchHandler(args),
});

server.addTool({
  name: 'list_agents',
  description: 'List available sub-agents from built-ins and custom agents dir.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => {
    const dynamic = loadAgentsFromDir(getAgentsDir());
    const rows = [
      ...Object.entries(AGENTS).map(([name, spec]) => ({ name, profile: spec.profile, approval_policy: spec.approval_policy, sandbox_mode: spec.sandbox_mode, source: 'builtin' })),
      ...Object.entries(dynamic).map(([name, spec]) => ({ name, profile: spec.profile, approval_policy: spec.approval_policy, sandbox_mode: spec.sandbox_mode, source: 'custom' })),
    ];
    return { agents: rows };
  },
});

// ---------------- Validation tool -----------------
type ValidationIssue = { level: 'error' | 'warning'; code: string; message: string; field?: string };

export async function validateAgents(dir?: string) {
  const resolved = dir ?? getAgentsDir();
  if (!resolved) {
    return {
      ok: false,
      summary: { files: 0, ok: 0, withErrors: 0, withWarnings: 0 },
      error: 'No agents directory configured. Use --agents-dir, CODEX_SUBAGENTS_DIR, or create ./agents',
      files: [] as unknown[],
    };
  }
  if (!existsSync(resolved)) {
    return {
      ok: false,
      summary: { files: 0, ok: 0, withErrors: 0, withWarnings: 0 },
      error: `Agents directory not found: ${resolved}`,
      files: [] as unknown[],
    };
  }
  const results: Array<{ file: string; agent_name?: string; ok: boolean; errors: number; warnings: number; issues: ValidationIssue[]; parsed?: Partial<AgentSpec> & { persona_length?: number } }> = [];
  for (const entry of readdirSync(resolved)) {
    const full = join(resolved, entry);
    if (statSync(full).isDirectory()) continue;
    const issues: ValidationIssue[] = [];
    const parsed: Partial<AgentSpec> & { persona_length?: number } = {};
    let agentName: string | undefined;
    try {
      if (entry.endsWith('.md')) {
        agentName = basename(entry, '.md');
        const raw = readFileSync(full, 'utf8');
        const { attrs, body } = parseFrontmatter(raw);
        const profile = (attrs.profile || attrs.agent_profile || '').trim();
        if (!profile) issues.push({ level: 'warning', code: 'missing_profile', field: 'profile', message: 'profile missing; built-in loader defaults to default' });
        parsed.profile = profile || 'default';
        const ap = attrs.approval_policy?.trim();
        const sm = attrs.sandbox_mode?.trim();
        if (ap && !['never', 'on-request', 'on-failure', 'untrusted'].includes(ap)) {
          issues.push({ level: 'error', code: 'invalid_approval_policy', field: 'approval_policy', message: `Invalid approval_policy: ${ap}` });
        } else if (ap) parsed.approval_policy = ap as ApprovalPolicy;
        if (sm && !['read-only', 'workspace-write', 'danger-full-access'].includes(sm)) {
          issues.push({ level: 'error', code: 'invalid_sandbox_mode', field: 'sandbox_mode', message: `Invalid sandbox_mode: ${sm}` });
        } else if (sm) parsed.sandbox_mode = sm as SandboxMode;
        const persona = body.trim();
        if (!persona) issues.push({ level: 'error', code: 'empty_persona', field: 'persona', message: 'Persona body is empty' });
        parsed.persona = persona;
        parsed.persona_length = persona.length;
      } else if (entry.endsWith('.json')) {
        agentName = basename(entry, '.json');
        type JsonAgent = {
          profile?: unknown;
          approval_policy?: unknown;
          sandbox_mode?: unknown;
          persona?: unknown;
          personaFile?: unknown;
        };
        let obj: JsonAgent;
        try {
          obj = JSON.parse(readFileSync(full, 'utf8')) as JsonAgent;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          issues.push({ level: 'error', code: 'json_parse_error', message: msg });
          results.push({ file: entry, agent_name: agentName, ok: false, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warning').length, issues });
          continue;
        }
        const profile = String((obj.profile as string | undefined) || '').trim();
        if (!profile) issues.push({ level: 'error', code: 'missing_profile', field: 'profile', message: 'profile is required' });
        else parsed.profile = profile;
        const ap = obj.approval_policy as string | undefined;
        const sm = obj.sandbox_mode as string | undefined;
        if (ap && !['never', 'on-request', 'on-failure', 'untrusted'].includes(ap)) {
          issues.push({ level: 'error', code: 'invalid_approval_policy', field: 'approval_policy', message: `Invalid approval_policy: ${ap}` });
        } else if (ap) parsed.approval_policy = ap as ApprovalPolicy;
        if (sm && !['read-only', 'workspace-write', 'danger-full-access'].includes(sm)) {
          issues.push({ level: 'error', code: 'invalid_sandbox_mode', field: 'sandbox_mode', message: `Invalid sandbox_mode: ${sm}` });
        } else if (sm) parsed.sandbox_mode = sm as SandboxMode;
        let persona: string | undefined = typeof obj.persona === 'string' ? (obj.persona as string) : undefined;
        if (!persona && obj.personaFile) {
          const p = join(resolved, String(obj.personaFile));
          if (!existsSync(p)) {
            issues.push({ level: 'error', code: 'persona_file_missing', field: 'personaFile', message: `personaFile not found: ${p}` });
          } else {
            persona = readFileSync(p, 'utf8');
          }
        }
        if (!persona || !persona.trim()) {
          issues.push({ level: 'error', code: 'missing_persona', field: 'persona', message: 'persona or personaFile is required and must be non-empty' });
        } else {
          parsed.persona = persona;
          parsed.persona_length = persona.length;
        }
      } else {
        issues.push({ level: 'warning', code: 'unsupported_extension', message: `Skipping unsupported file: ${entry}` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push({ level: 'error', code: 'unhandled', message: msg });
    }
    const errors = issues.filter(i => i.level === 'error').length;
    const warnings = issues.filter(i => i.level === 'warning').length;
    results.push({ file: entry, agent_name: agentName, ok: errors === 0, errors, warnings, issues, parsed });
  }
  const summary = {
    files: results.length,
    ok: results.filter(r => r.ok).length,
    withErrors: results.filter(r => r.errors > 0).length,
    withWarnings: results.filter(r => r.warnings > 0).length,
  };
  return { ok: summary.withErrors === 0, summary, files: results, dir: resolved };
}

server.addTool({
  name: 'validate_agents',
  description: 'Validate agent files and report errors/warnings per file.',
  inputSchema: { type: 'object', properties: { dir: { type: 'string' } }, additionalProperties: false },
  handler: async (args: unknown) => {
    let dir: string | undefined;
    if (args && typeof args === 'object' && 'dir' in (args as Record<string, unknown>)) {
      const v = (args as { dir?: unknown }).dir;
      if (typeof v === 'string') dir = v;
    }
    return validateAgents(dir);
  },
});

server.start();
