"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const codex_subagents_mcp_1 = require("../src/codex-subagents.mcp");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
(0, vitest_1.describe)('Zod validation', () => {
    (0, vitest_1.it)('accepts minimal valid input and defaults mirror_repo', () => {
        const parsed = codex_subagents_mcp_1.DelegateParamsSchema.parse({ agent: 'reviewer', task: 'test' });
        (0, vitest_1.expect)(parsed.agent).toBe('reviewer');
        (0, vitest_1.expect)(parsed.task).toBe('test');
        (0, vitest_1.expect)(parsed.mirror_repo).toBe(false);
    });
});
(0, vitest_1.describe)('Workdir creation', () => {
    (0, vitest_1.it)('creates a temp directory and keeps it', () => {
        const dir = (0, codex_subagents_mcp_1.prepareWorkdir)('reviewer');
        (0, vitest_1.expect)((0, fs_1.existsSync)(dir)).toBe(true);
        // Do not delete: we want artifacts for inspection. Cleanup advisory only.
    });
});
(0, vitest_1.describe)('Mirroring', () => {
    const src = (0, path_1.join)((0, os_1.tmpdir)(), `mcp-src-${Date.now()}`);
    const dest = (0, path_1.join)((0, os_1.tmpdir)(), `mcp-dest-${Date.now()}`);
    vitest_1.it.skipIf(process.env.CI === 'true')('mirrors directory contents', () => {
        (0, fs_1.mkdirSync)(src, { recursive: true });
        (0, fs_1.writeFileSync)((0, path_1.join)(src, 'file.txt'), 'content', 'utf8');
        (0, fs_1.mkdirSync)(dest, { recursive: true });
        (0, codex_subagents_mcp_1.mirrorRepoIfRequested)(src, dest, true);
        (0, vitest_1.expect)((0, fs_1.existsSync)((0, path_1.join)(dest, 'file.txt'))).toBe(true);
        (0, fs_1.rmSync)(src, { recursive: true, force: true });
        (0, fs_1.rmSync)(dest, { recursive: true, force: true });
    });
});
(0, vitest_1.describe)('Spawn wrapper', () => {
    (0, vitest_1.it)('returns error when command missing', async () => {
        const res = await (0, codex_subagents_mcp_1.run)('non-existent-command-xyz', [], undefined);
        (0, vitest_1.expect)(res.code).toBe(127);
    });
});
//# sourceMappingURL=server.test.js.map