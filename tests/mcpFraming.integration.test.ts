import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';

function frame(msg: any) {
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
          // advance buffer in case of more frames
          buf = buf.slice(start + len);
          try {
            const parsed = JSON.parse(body);
            if (parsed && parsed.method && !parsed.result && !parsed.error) {
              // notification; keep waiting for a response
              return;
            }
          } catch {
            // if not JSON, return as-is
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

describe('MCP framing (initialize, tools/list)', () => {
  it('responds to framed initialize and tools/list', async () => {
    const bin = join(process.cwd(), 'dist', 'codex-subagents.mcp.js');
    const proc = spawn(process.execPath, [bin], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
    const initBody = await readFramed(proc);
    const init = JSON.parse(initBody);
    expect(init.result.serverInfo.name).toBeDefined();
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
    const listBody = await readFramed(proc);
    const list = JSON.parse(listBody);
    const toolNames = list.result.tools.map((t: any) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(['delegate', 'list_agents', 'validate_agents']));
    try { proc.stdin.end(); proc.kill(); } catch { /* ignore in sandbox */ }
  });
});
