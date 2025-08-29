import { describe, it, expect } from 'vitest';
import { getAgentsDir } from '../src/codex-subagents.mcp';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('getAgentsDir resolution', () => {
  it('falls back to server-adjacent agents/ when CWD has none', () => {
    const originalCwd = process.cwd();
    const isolated = join(tmpdir(), `cwd-${Date.now()}`);
    try {
      // Move to an empty tmp dir so CWD-based detection does not trigger
      // (intentionally not creating agents/ there).
      process.chdir(isolated);
    } catch {
      // If chdir fails, skip test gracefully.
      return;
    }
    try {
      const resolved = getAgentsDir([], {} as unknown as NodeJS.ProcessEnv);
      expect(resolved).toBeDefined();
      expect(resolved?.endsWith('agents')).toBe(true);
      expect(existsSync(resolved!)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

