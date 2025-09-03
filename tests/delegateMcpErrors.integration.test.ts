import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';

function frame(msg: Record<string, unknown>) {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, 'utf8');
  const header = `Content-Length: ${body.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'utf8'), body]);
}

function readFramed(proc: ReturnType<typeof spawn>, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const headerEndCRLF = buf.indexOf(Buffer.from('\r\n\r\n'));
      const headerEndLF = buf.indexOf(Buffer.from('\n\n'));
      const headerEnd = headerEndCRLF !== -1 ? headerEndCRLF : headerEndLF;
      const sepLen = headerEndCRLF !== -1 ? 4 : (headerEndLF !== -1 ? 2 : 0);
      if (headerEnd !== -1) {
        const header = buf.slice(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) { buf = buf.slice(headerEnd + sepLen); return; }
        const len = parseInt(m[1], 10);
        const start = headerEnd + sepLen;
        if (buf.length >= start + len) {
          const body = buf.slice(start, start + len).toString('utf8');
          buf = buf.slice(start + len);
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.method && !parsed.result && !parsed.error) {
              return;
            }
          } catch {
            /* ignore */
          }
          cleanup();
          resolve(body);
        }
      }
    };
    const to = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
    function cleanup() { clearTimeout(to); proc.stdout.off('data', onData); }
    proc.stdout.on('data', onData);
  });
}

function startServer() {
  const bin = join(process.cwd(), 'dist', 'codex-subagents.mcp.js');
  return spawn(process.execPath, [bin], { stdio: ['pipe', 'pipe', 'pipe'] });
}

describe('delegate MCP error handling', () => {
  it('returns structured result for invalid params', async () => {
    const proc = startServer();
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    await readFramed(proc);
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delegate', arguments: { agent: 'reviewer' } } }));
    const body = await readFramed(proc);
    const resp = JSON.parse(body);
    expect(resp.error).toBeUndefined();
    const content = JSON.parse(resp.result.content[0].text);
    expect(content.ok).toBe(false);
    expect(content.code).toBe(2);
    expect(content.stderr).toContain('Invalid delegate arguments');
    try { proc.stdin.end(); proc.kill(); } catch { /* ignore */ }
  });

  it('returns structured result for unknown agent', async () => {
    const proc = startServer();
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    await readFramed(proc);
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delegate', arguments: { agent: 'not-registered', task: 'x' } } }));
    const body = await readFramed(proc);
    const resp = JSON.parse(body);
    expect(resp.error).toBeUndefined();
    const content = JSON.parse(resp.result.content[0].text);
    expect(content.ok).toBe(false);
    expect(content.code).toBe(2);
    expect(content.stderr).toContain('Unknown agent');
    try { proc.stdin.end(); proc.kill(); } catch { /* ignore */ }
  });

  it('returns structured result when codex missing', async () => {
    const proc = startServer();
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    await readFramed(proc);
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delegate', arguments: { agent: 'reviewer', task: 'noop' } } }));
    const body = await readFramed(proc);
    const resp = JSON.parse(body);
    expect(resp.error).toBeUndefined();
    const content = JSON.parse(resp.result.content[0].text);
    expect([0, 1, 127]).toContain(content.code);
    if (content.code === 127) {
      expect(content.stderr).toContain('codex binary not found');
    }
    try { proc.stdin.end(); proc.kill(); } catch { /* ignore */ }
  });
});
