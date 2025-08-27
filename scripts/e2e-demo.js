#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const buffer_1 = require("buffer");
function startServer() {
    const child = (0, child_process_1.spawn)('node', ['dist/codex-subagents.mcp.js'], {
        stdio: ['pipe', 'pipe', 'inherit'],
    });
    let buf = buffer_1.Buffer.alloc(0);
    const pending = new Map();
    let id = 1;
    child.stdout.on('data', (chunk) => {
        buf = buffer_1.Buffer.concat([buf, chunk]);
        while (true) {
            const headerEnd = buf.indexOf('\r\n\r\n');
            if (headerEnd === -1)
                break;
            const header = buf.slice(0, headerEnd).toString('utf8');
            const m = /Content-Length:\s*(\d+)/i.exec(header);
            if (!m) {
                buf = buf.slice(headerEnd + 4);
                continue;
            }
            const len = parseInt(m[1], 10);
            const total = headerEnd + 4 + len;
            if (buf.length < total)
                break;
            const body = buf.slice(headerEnd + 4, total).toString('utf8');
            buf = buf.slice(total);
            const msg = JSON.parse(body);
            const rid = msg.id;
            const res = msg.result ?? msg.error;
            const fn = pending.get(rid);
            if (fn) {
                pending.delete(rid);
                fn(res);
            }
        }
    });
    const send = (method, params) => new Promise((resolve) => {
        const thisId = id++;
        pending.set(thisId, resolve);
        const payload = buffer_1.Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: thisId, method, params }), 'utf8');
        const header = buffer_1.Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'utf8');
        child.stdin.write(header);
        child.stdin.write(payload);
    });
    return {
        send,
        close: () => child.kill('SIGTERM'),
    };
}
async function run(cmd, args) {
    return new Promise((res) => {
        const child = (0, child_process_1.spawn)(cmd, args);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('close', (code) => res({ code: code ?? 0, stdout, stderr }));
        child.on('error', (err) => res({ code: 127, stdout, stderr: String(err) }));
    });
}
async function main() {
    console.log('Building server...');
    const build = await run('npm', ['run', 'build']);
    if (build.code !== 0) {
        console.error(build.stderr || build.stdout);
        process.exit(build.code);
    }
    console.log('Checking codex --version...');
    const ver = await run(process.platform === 'win32' ? 'where' : 'which', ['codex']);
    if (ver.code !== 0) {
        console.warn('codex not found; e2e will still run but will show an actionable error');
    }
    console.log('Starting MCP server...');
    const rpc = startServer();
    await rpc.send('initialize', { clientInfo: { name: 'e2e', version: '0' } });
    const list = await rpc.send('tools/list');
    console.log('Tools:', list.tools.map((t) => t.name).join(', '));
    const samples = [
        { agent: 'reviewer', task: 'Review the last commit for readability.' },
        { agent: 'debugger', task: 'Reproduce and fix the failing test in foo.spec.ts.' },
        { agent: 'security', task: 'Scan for secrets and unsafe shell usage; propose fixes.' },
    ];
    for (const s of samples) {
        console.log(`\nCalling delegate for agent=${s.agent} ...`);
        const res = await rpc.send('tools/call', {
            name: 'delegate',
            arguments: { agent: s.agent, task: s.task, mirror_repo: false },
        });
        const asText = res?.content?.[0]?.text ?? '';
        console.log(asText);
    }
    rpc.close();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=e2e-demo.js.map