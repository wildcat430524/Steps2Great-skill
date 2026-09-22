#!/usr/bin/env node
/**
 * sync-from-upstream.mjs —— 把 StepsToGreat 的框架文件镜像进本 skill 的 references/
 *
 * 为什么需要它：本 skill 的协议内容不是在 StepsToGreat 里手抄一份，而是**镜像**它。
 * 有了这张映射表，上游改协议 → 跑一次 `node _build/sync-from-upstream.mjs` 即同步完成；
 * 映射表本身也是「谁对应谁」的文档。
 *
 * 用法：
 *   node _build/sync-from-upstream.mjs                      # 用默认源 E:/StepsToGreat
 *   node _build/sync-from-upstream.mjs --from <目录>        # 指定 StepsToGreat 检出位置
 *   node _build/sync-from-upstream.mjs --dry                # 只报告，不落盘
 *   node _build/sync-from-upstream.mjs --prune              # 删掉 references/ 里已不在映射内的文件
 *
 * 铁律：只读上游，绝不写上游。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const FROM = resolve(argOf('--from', 'E:/StepsToGreat'));
/** 本仓库根 = 本脚本所在目录（_build/）的上一级 */
const TO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DRY = args.includes('--dry');
const PRUNE = args.includes('--prune');

/**
 * 映射表：源相对路径（相对 StepsToGreat）→ 目标相对路径（相对本仓库）。
 * 以 `/` 结尾的键表示整棵子树按同一前缀平移。
 * 目标为 `null` 表示「刻意不要」（例如英文镜像、测试夹具），链接落到它时降级为纯文本路径。
 */
const MAP = [
  ['AGENTS.md', 'SKILL.md'],
  ['CONTEXT.md', 'references/CONTEXT.md'],

  ['协议/', 'references/协议/'],
  ['学科包/', 'references/学科包/'],
  ['模板/', 'references/模板/'],
  ['示例/', 'references/示例/'],
  ['教程/', 'references/教程/'],

  ['_tools/validate-state.mjs', 'scripts/validate-state.mjs'],
  ['docs/', 'references/docs/'],

  // 注意：学生工作区的脚手架（我的学习/*、资料/*）**不由本脚本镜像** ——
  // 上游那些文件里的相对链接（../协议/、../../AGENTS.md）在工作区里不存在，
  // 必须改成工作区口径。它们手写在 templates/workspace/ 里，见该目录的 README。
];

/**
 * 对镜像结果做定点改写：source 相对路径 → [[正则, 替换], ...]。
 * 用于把上游「仓库口径」的小细节改成「skill 口径」，避免正文里留下指向不存在的路径。
 */
const TRANSFORM = [
  [
    '_tools/validate-state.mjs',
    [
      // skill 里没有仓库根可言，默认校验对象应是**当前工作目录**（学生工作区）
      [/const REPO_ROOT = join\(HERE, '\.\.'\);/,
       "const REPO_ROOT = process.cwd(); // skill 版：默认校验当前工作目录（学生工作区）"],
      [/node _tools\/validate-state\.mjs/g, 'node scripts/validate-state.mjs'],
      [/`_tools\/validate-state\.mjs`/g, '`scripts/validate-state.mjs`'],
      [/校验本仓库 我的学习\//g, '校验当前目录的 我的学习/'],
      // 回归测试夹具没有镜像进来 —— 用法行保留但注明，免得学生以为丢了文件
      [/^(\s*\*?\s*node scripts\/validate-state\.mjs\s+--fixtures\s+)\S+(\s+#.*)?$/gm,
       '$1<上游回归测试集，本 skill 未附带>$2'],
    ],
  ],
];

/** 精确文件映射（含上面的脚手架）：先于 SKIP 判定，SKIP 只拦目录通配。 */
const EXACT = new Map(MAP.filter(([from]) => !from.endsWith('/')));

/** 刻意不镜像的路径（体积、与学生有关）。`.en.md` 不在此列 —— 它们落到 references/en/。 */
const SKIP = [
  /^AGENTS\.en\.md$/,
  /^宣传视频\//,
  /^我的学习\//,
  /^资料\//,
  /^tests\//,
  /^docs\/[^/]*\/_[^/]*$/, // 上游 docs/ 下划线开头的中间产物（如 docs/simulations/_抽取-*.md）
  /\.(mp4|png|jpg)$/,
];

const SKIP_REASON = [
  [/^AGENTS\.en\.md$/, '英文契约：内容已重写进 SKILL.md 与 README.en.md（不整文件镜像）'],
  [/^宣传视频\//, '视频与封面素材，不属于 skill 资源'],
  [/^我的学习\//, '学习者数据，由 init-workspace 在学生工作区里生成（脚手架已单独映射）'],
  [/^资料\//, '学习者资料，属于学生工作区（脚手架已单独映射）'],
  [/^tests\//, '上游回归测试夹具，不属于 skill 资源'],
  [/^docs\/[^/]*\/_[^/]*$/, '上游 docs/ 下划线开头的中间产物'],
  [/\.(mp4|png|jpg)$/, '二进制素材'],
];

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * 英文镜像的落点：`协议/00_导师协议.en.md` → `references/en/协议/00_导师协议.en.md`。
 * 英文版照样镜像（对英文用户有用），只是与中文版分开放，避免同名混淆。
 */
function englishTarget(p) {
  if (!/\.en\.md$/.test(p)) return null;
  const base = p.replace(/\.en\.md$/, '.md');
  for (const [from, to] of MAP) {
    if (from.endsWith('/')) {
      if (base.startsWith(from)) return 'references/en/' + to.slice('references/'.length) + base.slice(from.length).replace(/\.md$/, '.en.md');
    } else if (base === from) {
      return 'references/en/' + (to.startsWith('references/') ? to.slice('references/'.length) : to).replace(/\.md$/, '.en.md');
    }
  }
  return null;
}

/** 源相对路径 → 目标相对路径；未命中或命中 SKIP 返回 null。 */
function mapPath(srcRel) {
  const p = srcRel.split(sep).join('/');
  if (EXACT.has(p)) return EXACT.get(p);
  const en = englishTarget(p);
  if (en !== null) return en;
  if (SKIP.some((re) => re.test(p))) return null;
  for (const [from, to] of MAP) {
    if (from.endsWith('/')) {
      if (p.startsWith(from)) return to + p.slice(from.length);
    } else if (p === from) {
      return to;
    }
  }
  return null;
}

function walk(dirAbs, rel = '') {
  const out = [];
  for (const name of readdirSync(dirAbs)) {
    const abs = join(dirAbs, name);
    const r = rel ? rel + '/' + name : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, r));
    else out.push(r);
  }
  return out;
}

/** 收集映射表覆盖到的全部源文件 */
function collect() {
  const roots = MAP.filter(([from]) => from.endsWith('/')).map(([from]) => from.replace(/\/$/, ''));
  const files = [];
  for (const [from] of MAP) {
    if (from.endsWith('/')) continue;
    const abs = join(FROM, from);
    if (existsSync(abs) && statSync(abs).isFile()) files.push(from);
  }
  for (const root of roots) {
    const abs = join(FROM, root);
    if (!existsSync(abs)) continue;
    for (const r of walk(abs)) files.push(root + '/' + r);
  }
  return files;
}

/** 把文件正文里的相对链接重写为「目标视角」的链接；无法映射的降级为纯文本路径。 */
function rewriteLinks(body, srcFileRel, dstFileRel) {
  const srcDir = srcFileRel.includes('/') ? srcFileRel.slice(0, srcFileRel.lastIndexOf('/')) : '';
  const dstDir = dstFileRel.includes('/') ? dstFileRel.slice(0, dstFileRel.lastIndexOf('/')) : '';
  const downgraded = [];

  const out = body.replace(LINK_RE, (whole, text, target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return whole;
    const m = /^([^#]*)(#.*)?$/.exec(target);
    const targetPath = m[1];
    const hash = m[2] ?? '';
    const resolvedSrc = posixJoin(srcDir, targetPath);
    const mapped = mapPath(resolvedSrc);
    if (mapped === null) {
      const shown = resolvedSrc.split(sep).join('/');
      downgraded.push(shown);
      return '`' + (text && text !== target ? `${text}（${shown}）` : shown) + '`';
    }
    let rel = relative(dstDir || '.', mapped).split(sep).join('/');
    if (rel === '') rel = mapped.slice(mapped.lastIndexOf('/') + 1);
    return `[${text}](${rel}${hash})`;
  });

  return { out, downgraded };
}

/** POSIX 风格拼接 + 归一化：链接解析必须用 `/`，不能用平台分隔符（Windows 上 join 会给 `\`）。 */
function posixJoin(dir, p) {
  return norm((dir ? dir + '/' : '') + p.split(sep).join('/'));
}

function norm(p) {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

const BANNER =
  '> 📄 **只读镜像**（Steps2Great-skill ← StepsToGreat，由 `_build/sync-from-upstream.mjs` 生成；改内容请改上游再同步）。\n' +
  '> 路径口径：`我的学习/`、`资料/`、`学科/`（= `我的学习/学科/`）指**学生工作区**；`协议/`、`学科包/`、`模板/` 指本 skill 的 `references/` 下同名目录。\n';

/** 这些行在镜像时丢弃（英文版指向、上游专属的仓库结构说明） */
const DROP_LINE = [/^\s*>?\s*英文版：/, /^\s*English version:/i, /^\s*>?\s*英文：/];

const files = collect().filter((f) => mapPath(f) !== null);
const written = [];
const downgradedAll = new Map();

for (const srcFileRel of [...files].sort()) {
  const dstFileRel = mapPath(srcFileRel);
  const abs = join(FROM, srcFileRel);
  const raw = readFileSync(abs, 'utf8');

  if (dstFileRel === 'SKILL.md') {
    console.log(`  跳过 ${srcFileRel}（SKILL.md 手写，见文件头的映射说明）`);
    continue;
  }

  let body = raw;
  let downgraded = [];
  if (srcFileRel.endsWith('.md')) {
    body = raw.split(/\r?\n/).filter((l) => !DROP_LINE.some((re) => re.test(l))).join('\n');
    ({ out: body, downgraded } = rewriteLinks(body, srcFileRel, dstFileRel));
    body = body.replace(/^\s*---\s*\n/, ''); // 去掉紧邻的分隔线（丢行后可能形成孤儿 ---）
  }

  // 定点改写（skill 口径修正），在链接重写之后做，避免刚改出来的路径又被改写
  for (const [re, to] of TRANSFORM.find(([f]) => f === srcFileRel)?.[1] ?? []) {
    body = body.replace(re, to);
  }

  if (downgraded.length) downgradedAll.set(dstFileRel, [...new Set(downgraded)]);

  const content = srcFileRel.endsWith('.md') ? BANNER + '\n' + body : body;
  written.push(dstFileRel);
  if (!DRY) {
    mkdirSync(dirname(join(TO, dstFileRel)), { recursive: true });
    writeFileSync(join(TO, dstFileRel), content, 'utf8');
  }
}

if (PRUNE && !DRY) {
  const kept = new Set(written);
  for (const r of walk(join(TO, 'references'))) {
    const dstRel = 'references/' + r.split(sep).join('/');
    if (!kept.has(dstRel) && !dstRel.endsWith('README.md')) {
      rmSync(join(TO, dstRel));
      console.log(`  删除（已不在映射内）${dstRel}`);
    }
  }
}

console.log(`源  ：${FROM}`);
console.log(`目标：${TO}`);
const skipped = walk(FROM).filter((f) => SKIP.some((re) => re.test(f.split(sep).join('/'))));
console.log(`\n镜像 ${written.length} 个文件${DRY ? '（--dry，未落盘）' : ''}`);
for (const f of written) console.log('  ✓ ' + f);

console.log(`\n刻意跳过 ${skipped.length} 个文件：`);
for (const [re, why] of SKIP_REASON) {
  const hits = walk(FROM).filter((f) => re.test(f.split(sep).join('/')));
  if (hits.length) console.log(`  ✗ ${String(hits.length).padStart(3)} 个 —— ${why}`);
}

if (downgradedAll.size) {
  console.log('\nℹ️ 链接改写说明：');
  let wsCount = 0;
  for (const [file, links] of downgradedAll) {
    const ws = links.filter((l) => /^(我的学习|资料)\//.test(l));
    const other = links.filter((l) => !/^(我的学习|资料)\//.test(l));
    wsCount += ws.length;
    if (ws.length) console.log(`  🔒 ${file} —— 工作区路径，保留为纯文本（学生工作区里才有）：${ws.join('、')}`);
    for (const l of other) console.log(`  ⚠️ ${file} —— ${l} 未镜像（上游专属，已降级为文本）`);
  }
  if (wsCount) console.log('  （banner 已说明：以 我的学习/ 资料/ 开头的路径指学习者工作区）');
}
