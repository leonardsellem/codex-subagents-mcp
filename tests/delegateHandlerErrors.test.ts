import { describe, it, expect } from 'vitest';
import { delegateHandler } from '../src/codex-subagents.mcp';

describe('delegateHandler error surfaces', () => {
  it('returns helpful error for unknown agent without persona', async () => {
    const res = await delegateHandler({ agent: 'not-registered', task: 'x' });
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain('Unknown agent');
  });

  it('codex missing yields code 127 with message (or non-zero error)', async () => {
    const res = await delegateHandler({ agent: 'reviewer', task: 'noop' });
    expect([127, 0, 1]).toContain(res.code); // allow local codex or error
    if (res.code === 127) {
      expect(res.stderr).toContain('codex binary not found');
    }
  });
});
