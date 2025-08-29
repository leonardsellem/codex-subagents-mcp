import { describe, it, expect } from 'vitest';
import { getAgentsDir } from '../src/codex-subagents.mcp';
import { existsSync } from 'fs';

describe('getAgentsDir resolution', () => {
  it('resolves an existing agents directory', () => {
    const resolved = getAgentsDir([], {} as unknown as NodeJS.ProcessEnv);
    expect(resolved).toBeDefined();
    expect(resolved?.endsWith('agents')).toBe(true);
    expect(existsSync(resolved!)).toBe(true);
  });
});
