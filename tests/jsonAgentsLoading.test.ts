import { describe, it, expect } from 'vitest';
import { loadAgentsFromDir } from '../src/codex-subagents.mcp';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('JSON agents personaFile', () => {
  it('loads persona from personaFile path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-json-'));
    writeFileSync(join(dir, 'body.txt'), 'JSON persona here.', 'utf8');
    const json: Record<string, unknown> = {
      profile: 'reviewer',
      personaFile: 'body.txt',
      approval_policy: 'on-request',
      sandbox_mode: 'read-only',
    };
    writeFileSync(join(dir, 'review.json'), JSON.stringify(json), 'utf8');
    const reg = loadAgentsFromDir(dir);
    expect(reg.review.profile).toBe('reviewer');
    expect(reg.review.persona).toBe('JSON persona here.');
    expect(reg.review.approval_policy).toBe('on-request');
    expect(reg.review.sandbox_mode).toBe('read-only');
    rmSync(dir, { recursive: true, force: true });
  });
});

