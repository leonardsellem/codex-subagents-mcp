import { describe, it, expect } from 'vitest';
import { getAgentsDir } from '../src/codex-subagents.mcp';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('getAgentsDir args/env', () => {
  it('resolves from --agents-dir <path> (split)', () => {
    const base = mkdtempSync(join(tmpdir(), 'agd-'));
    const target = join(base, 'agents');
    mkdirSync(target, { recursive: true });
    const resolved = getAgentsDir(['node', 'x', '--agents-dir', target], process.env, base);
    expect(resolved).toBe(target);
    rmSync(base, { recursive: true, force: true });
  });
  it('resolves from --agents-dir=<path> (equals)', () => {
    const base = mkdtempSync(join(tmpdir(), 'agd-'));
    const target = join(base, 'agents');
    mkdirSync(target, { recursive: true });
    const resolved = getAgentsDir(['node', 'x', `--agents-dir=${target}`], process.env, base);
    expect(resolved).toBe(target);
    rmSync(base, { recursive: true, force: true });
  });
  it('resolves from CODEX_SUBAGENTS_DIR env', () => {
    const base = mkdtempSync(join(tmpdir(), 'agd-'));
    const target = join(base, 'agents');
    mkdirSync(target, { recursive: true });
    const env = { ...process.env, CODEX_SUBAGENTS_DIR: target } as NodeJS.ProcessEnv;
    const resolved = getAgentsDir(['node', 'x'], env, base);
    expect(resolved).toBe(target);
    rmSync(base, { recursive: true, force: true });
  });
});

