#!/usr/bin/env node
/**
 * regression-sync.mjs —— 镜像脚本的回归测试（钉住「sync 覆盖 skill 侧修复」这个坑）
 *
 * 背景（真实踩过）：
 *   修好 `scripts/validate-state.mjs` 的三个缺陷后，跑了一次 sync 做模板链接改写，
 *   三个修复被上游版本**静默覆盖**，回归测试立刻 3/7 变红。
 *   根因：**「镜像目标」与「手改文件」是同一个文件**。
 *
 * 本测试断言这个结构问题已被堵住：
 *   S1  正常 sync 后，skill 独占文件的修复指纹仍在，且退出码 0
 *   S2  故意用 --refresh-owned 让它被上游覆盖 → sync **必须**报错并退出码 1
 *   S3  覆盖之后，状态校验器的回归测试**确实**会失败（证明保护不是摆设）
 *   S4  恢复后一切正常（退出码 0、回归全绿）
 *
 * 用法：node tests/regression-sync.mjs
 * 退出码：0 = 全部符合预期 / 1 = 不符合预期
 */

import { existsSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SYNC = join(ROOT, '_build', 'sync-from-upstream.mjs');
const VALIDATOR = join(ROOT, 'scripts', 'validate-state.mjs');
const BACKUP = join(HERE, '.tmp-validator-backup.mjs');
const UPSTREAM = process.env.STEPS2GREAT_UPSTREAM || 'E:/StepsToGreat';

const results = [];
const add = (id, name, pass, detail = '') => results.push({ id, name, pass, detail });

function run(cmd, cmdArgs) {
  try {
    const stdout = execFileSync(process.execPath, cmdArgs, { encoding: 'utf8', cwd: ROOT });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: error.status ?? 1, out: String(error.stdout ?? '') + String(error.stderr ?? '') };
  }
}

// 没有上游检出时跳过（CI 上就是这种情况）
if (!existsSync(UPSTREAM)) {
  console.log(`⏭  跳过：找不到上游检出 ${UPSTREAM}`);
  console.log('   （镜像相关测试只在有上游时才有意义；可用 STEPS2GREAT_UPSTREAM 指定）');
  process.exit(0);
}

if (!existsSync(VALIDATOR)) {
  console.error(`❌ 找不到 ${VALIDATOR}`);
  process.exit(1);
}

// 备份，保证任何情况下都能恢复
copyFileSync(VALIDATOR, BACKUP);
const restore = () => {
  if (existsSync(BACKUP)) {
    copyFileSync(BACKUP, VALIDATOR);
    rmSync(BACKUP, { force: true });
  }
};

try {
  // ── S1 正常 sync：指纹完好、退出码 0 ──────────────────────────────
  {
    const r = run('sync', [SYNC]);
    const marks = ['I11（全量）', 'stripPathNote', '自述尚未创建'];
    const text = readFileSync(VALIDATOR, 'utf8');
    const missing = marks.filter((m) => !text.includes(m));
    add(
      'S1',
      '正常 sync 不破坏 skill 修复（退出码 0，指纹完好）',
      r.code === 0 && missing.length === 0,
      `退出码=${r.code}${missing.length ? ` 缺失指纹：${missing.join('、')}` : ''}`,
    );
  }

  // ── S2 强制刷新：必须报错 + 退出码 1 ──────────────────────────────
  {
    const r = run('sync-refresh', [SYNC, '--refresh-owned']);
    const flagged = /修复指纹丢失/.test(r.out);
    add('S2', '被上游覆盖时 sync 必须报错并退出码 1', r.code === 1 && flagged, `退出码=${r.code}，报错=${flagged}`);
  }

  // ── S3 覆盖后回归确实失败（证明保护有意义）────────────────────────
  {
    const r = run('regression', [join(HERE, 'regression-state.mjs')]);
    add('S3', '覆盖后状态校验器回归测试确实失败（保护不是摆设）', r.code === 1, `回归退出码=${r.code}`);
  }

  // ── S4 恢复后一切正常 ────────────────────────────────────────────
  {
    restore();
    const r = run('regression2', [join(HERE, 'regression-state.mjs')]);
    add('S4', '恢复后回归全绿', r.code === 0, `回归退出码=${r.code}`);
  }
} finally {
  restore();
}

console.log(`镜像脚本回归测试：${results.length} 个用例\n`);
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.id}  ${r.name}`);
  if (!r.pass && r.detail) console.log(`     ${r.detail}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed === 0 ? `✅ 全部 ${results.length} 个用例符合预期` : `❌ ${failed}/${results.length} 个用例不符合预期`}`);
process.exit(failed ? 1 : 0);
