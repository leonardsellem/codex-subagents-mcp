import { describe, it, expect } from 'vitest';
import { loadAgentsFromDir } from '../src/codex-subagents.mcp';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('frontmatter parsing handles CRLF and line-anchored fences', () => {
  it('parses CRLF frontmatter and trims body', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-fm-crlf-'));
    const md = [
      '---\r\n',
      'profile: debugger\r\n',
      'approval_policy: on-request\r\n',
      'sandbox_mode: workspace-write\r\n',
      '---\r\n',
      'Persona body here.\r\n',
    ].join('');
    writeFileSync(join(dir, 'perf.md'), md, 'utf8');
    const reg = loadAgentsFromDir(dir);
    expect(reg.perf.profile).toBe('debugger');
    expect(reg.perf.approval_policy).toBe('on-request');
    expect(reg.perf.sandbox_mode).toBe('workspace-write');
    expect(reg.perf.persona).toBe('Persona body here.\r\n');
    rmSync(dir, { recursive: true, force: true });
  });
});

