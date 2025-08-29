#!/usr/bin/env node
/*
 Minimal MCP server exposing a single tool `delegate` to spawn Codex CLI
 sub-agents with clean context via an ephemeral workdir and injected persona.

 Dependency footprint is minimal by default (zod). We implement a tiny
 JSON-RPC-over-stdio MCP wrapper compatible with basic MCP usage
 (initialize, tools/list, tools/call). If you later install a full MCP helper,
 you can swap it with minimal code changes.
*/

import { mkdtempSync, writeFileSync, cpSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, basename, extname } from 'path';
import { spawn } from 'child_process';
import { z } from 'zod';

const SERVER_NAME = 'codex-subagents';
const SERVER_VERSION = '0.1.0';
const START_TIME = Date.now();

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
});

export type DelegateParams = z.infer<typeof DelegateParamsSchema>;

// Spawn helper
export function run(cmd: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }>
{
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    child.on('error', (err: unknown) => resolve({ code: 127, stdout, stderr: String(err) }));
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
  // Fast path mirroring. This may be large; see SECURITY.md for alternatives.
  cpSync(srcCwd, dest, { recursive: true, force: true });
}

// -------- Dynamic agents loading from directory --------
export function getAgentsDir(argv: string[] = process.argv, env = process.env): string | undefined {
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
    join(process.cwd(), 'agents'),
    join(process.cwd(), '.codex-subagents', 'agents'),
    // Fallback: alongside the installed server (dist/../agents or src/../agents)
    join(__dirname, '..', 'agents'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

function parseFrontmatter(md: string): { attrs: Record<string, string>; body: string } {
  if (!md.startsWith('---')) return { attrs: {}, body: md };
  const end = md.indexOf('\n---');
  if (end === -1) return { attrs: {}, body: md };
  const raw = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s*\n/, '');
  const attrs: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (m) attrs[m[1]] = m[2];
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

export async function delegateHandler(params: unknown) {
  const parsed = DelegateParamsSchema.parse(params);
  const agentName = parsed.agent;
  const dynamic = loadAgentsFromDir(getAgentsDir());
  const registry: Record<string, AgentSpec> = { ...AGENTS, ...dynamic };
  const known = registry[agentName as AgentKey] ?? registry[agentName];
  const spec: AgentSpec | undefined = known ?? (parsed.persona && parsed.profile ? {
    persona: parsed.persona,
    profile: parsed.profile,
    approval_policy: parsed.approval_policy,
    sandbox_mode: parsed.sandbox_mode,
  } : undefined);
  if (!spec) {
    return {
      ok: false,
      code: 2,
      stdout: '',
      stderr:
        `Unknown agent: ${agentName}. Create agents/<name>.md or pass persona+profile inline. ` +
        'See README.md “Custom agents”.',
      working_dir: '',
    };
  }
  const cwd = parsed.cwd ?? process.cwd();
  const workdir = prepareWorkdir((known ? (agentName as AgentKey) : 'reviewer'));
  // Write persona regardless of source
  const personaContent = spec.persona;
  writeFileSync(join(workdir, 'AGENTS.md'), `# Persona: ${agentName}\n\n${personaContent}\n`, 'utf8');
  if (parsed.mirror_repo) {
    try {
      mirrorRepoIfRequested(cwd, workdir, true);
    } catch (e) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr:
          `Failed to mirror repo into temp dir: ${String(e)}. ` +
          'Consider disabling mirroring or using git worktree (see docs).',
        working_dir: workdir,
      };
    }
  }

  // Check that codex binary exists or provide actionable error.
  const codexCheck = await run(process.platform === 'win32' ? 'where' : 'which', ['codex']);
  if (codexCheck.code !== 0) {
    return {
      ok: false,
      code: 127,
      stdout: '',
      stderr:
        'codex binary not found in PATH. Install Codex CLI and ensure it is on PATH. ' +
        'See README.md for setup instructions.',
      working_dir: workdir,
    };
  }

  const args = ['exec', '--profile', spec.profile, parsed.task];
  const execCwd = parsed.mirror_repo ? workdir : cwd;
  const res = await run('codex', args, execCwd);
  return {
    ok: res.code === 0 && res.stdout.trim().length > 0,
    code: res.code,
    stdout: res.stdout.trim(),
    stderr: res.stderr.trim(),
    working_dir: workdir,
  };
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
        const len = parseInt(match[1], 10);
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
        const req = JSON.parse(line) as JsonRpcRequest;
        this.handleRequest(req);
      } catch {
        // ignore parse error
      }
    }
  }

  private write(obj: Record<string, unknown>) {
    const payload = JSON.stringify(obj);
    process.stdout.write(payload + '\n');
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
        const args = p.arguments;
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
          const data = await tool.handler(args ?? {});
          this.writeMessage({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                { type: 'text', text: JSON.stringify(data, null, 2) },
              ],
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.writeMessage({
            jsonrpc: '2.0',
            id,
            error: { code: -32000, message: msg },
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
