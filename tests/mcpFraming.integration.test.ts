import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';

function frame(msg: any) {
  const json = JSON.stringify(msg);
  const body = Buffer.from(json, 'utf8');
  const header = `Content-Length: ${body.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'utf8'), body]);
}

function waitNextChunk(proc: ReturnType<typeof spawn>, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const onData = (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const idx = buf.indexOf('\n'.charCodeAt(0));
      if (idx !== -1) {
        const line = buf.slice(0, idx).toString('utf8').trim();
        cleanup();
        resolve(line);
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
    const initLine = await waitNextChunk(proc);
    const init = JSON.parse(initLine);
    expect(init.result.serverInfo.name).toBeDefined();
    proc.stdin.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
    const listLine = await waitNextChunk(proc);
    const list = JSON.parse(listLine);
    const toolNames = list.result.tools.map((t: any) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(['delegate', 'list_agents', 'validate_agents']));
    proc.kill();
  });
});

