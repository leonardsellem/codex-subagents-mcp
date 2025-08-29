import { describe, it, expect } from 'vitest';
import { getAgentsDir } from '../src/codex-subagents.mcp';
import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('getAgentsDir resolution', () => {
  it('falls back to server-adjacent agents/ when cwd has none (no arg, no env)', () => {
    const emptyCwd = mkdtempSync(join(tmpdir(), 'no-agents-'));
    const resolved = getAgentsDir([], {} as unknown as NodeJS.ProcessEnv, emptyCwd);
    expect(resolved).toBeDefined();
    expect(resolved?.endsWith('agents')).toBe(true);
    expect(existsSync(resolved!)).toBe(true);
  });
});
