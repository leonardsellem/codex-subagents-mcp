import { describe, it, expect } from 'vitest';
import { DelegateParamsSchema, prepareWorkdir, mirrorRepoIfRequested, run, loadAgentsFromDir, validateAgents } from '../src/codex-subagents.mcp';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Zod validation', () => {
  it('accepts minimal valid input and defaults mirror_repo', () => {
    const parsed = DelegateParamsSchema.parse({ agent: 'reviewer', task: 'test' });
    expect(parsed.agent).toBe('reviewer');
    expect(parsed.task).toBe('test');
    expect(parsed.mirror_repo).toBe(false);
  });
});

describe('Workdir creation', () => {
  it('creates a temp directory and keeps it', () => {
    const dir = prepareWorkdir('reviewer');
    expect(existsSync(dir)).toBe(true);
    // Do not delete: we want artifacts for inspection. Cleanup advisory only.
  });
});

describe('Mirroring', () => {
  it('mirrors directory contents under base cwd', () => {
    const base = process.cwd();
    const src = join(base, `tmp-mcp-src-${Date.now()}`);
    const dest = join(base, `tmp-mcp-dest-${Date.now()}`);
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'file.txt'), 'content', 'utf8');
    mkdirSync(dest, { recursive: true });
    mirrorRepoIfRequested(src, dest, true);
    expect(existsSync(join(dest, 'file.txt'))).toBe(true);
    rmSync(src, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  });
});

describe('Spawn wrapper', () => {
  it('returns error when command missing', async () => {
    const res = await run('non-existent-command-xyz', [], undefined);
    expect(res.code).toBe(127);
  });
});

describe('Custom agents loading', () => {
  it('loads .md with frontmatter', () => {
    const dir = join(tmpdir(), `agents-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const md = `---\nprofile: debugger\napproval_policy: on-request\nsandbox_mode: workspace-write\n---\nYou are a performance expert.`;
    writeFileSync(join(dir, 'perf.md'), md, 'utf8');
    const reg = loadAgentsFromDir(dir);
    expect(reg.perf.profile).toBe('debugger');
    expect(reg.perf.persona).toContain('performance expert');
    expect(reg.perf.approval_policy).toBe('on-request');
    expect(reg.perf.sandbox_mode).toBe('workspace-write');
    rmSync(dir, { recursive: true, force: true });
  });
  it('ignores invalid policy values gracefully', () => {
    const dir = join(tmpdir(), `agents-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const md = `---\nprofile: reviewer\napproval_policy: unknown\nsandbox_mode: not-a-mode\n---\nPersona text.`;
    writeFileSync(join(dir, 'weird.md'), md, 'utf8');
    const reg = loadAgentsFromDir(dir);
    expect(reg.weird.profile).toBe('reviewer');
    expect(reg.weird.approval_policy).toBeUndefined();
    expect(reg.weird.sandbox_mode).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('validate_agents tool logic', () => {
  it('reports errors and warnings per file', async () => {
    const base = join(tmpdir(), `agents-validate-${Date.now()}`);
    mkdirSync(base, { recursive: true });
    // Valid MD
    writeFileSync(join(base, 'ok.md'), `---\nprofile: reviewer\n---\nPersona ok.`, 'utf8');
    // Invalid JSON (missing persona)
    writeFileSync(join(base, 'bad.json'), JSON.stringify({ profile: 'debugger', approval_policy: 'nope' }), 'utf8');
    // Unsupported ext
    writeFileSync(join(base, 'notes.txt'), 'hello', 'utf8');
    const res = await validateAgents(base);
    expect(res.dir).toBe(base);
    expect(res.summary.files).toBe(3);
    const bad = res.files.find(f => f.file === 'bad.json');
    expect(bad?.errors).toBeGreaterThan(0);
    const notes = res.files.find(f => f.file === 'notes.txt');
    expect(notes?.warnings).toBeGreaterThan(0);
    rmSync(base, { recursive: true, force: true });
  });
});
