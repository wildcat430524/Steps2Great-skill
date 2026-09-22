#!/usr/bin/env node
/**
 * validate-state.mjs —— 学习状态校验器
 *
 * 查什么：`我的学习/00-学习档案.md` 的三处状态（🚦 交接 / 📊 掌握 / ⏳ 待办）
 * 是否**自洽**、**有证据**、**没提前推进**。
 *
 * 判定口径 = `协议/04_状态机.md` 第 4 节的 10 条不变式（I1–I10）。
 * 工具只校验「自洽性与证据」，不校验「教学质量」（见状态机第 6 节边界）。
 *
 * 用法：
 *   node scripts/validate-state.mjs                        # 校验当前目录的 我的学习/
 *   node scripts/validate-state.mjs --root <目录>           # 校验任意学习目录
 *   node scripts/validate-state.mjs --fixtures <上游回归测试集，本 skill 未附带>  # 跑回归测试集
 *   node scripts/validate-state.mjs --json                 # 机器可读输出
 *   node scripts/validate-state.mjs --quiet                # 只输出问题
 *
 * 退出码：0 = 全过 / 1 = 违反不变式 / 2 = 用法错误或读不到档案
 *
 * 纪律：本脚本**只读**，绝不写任何文件。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.cwd(); // skill 版：默认校验当前工作目录（学生工作区）

// ── 参数 ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const JSON_OUT = argv.includes('--json');

function argValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const FIXTURES = argValue('--fixtures');
const ROOT = argValue('--root');

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`用法：
  node scripts/validate-state.mjs                          校验当前目录的 我的学习/
  node scripts/validate-state.mjs --root <目录>             校验任意学习目录
  node scripts/validate-state.mjs --fixtures <目录>         跑回归测试集
  node scripts/validate-state.mjs --json                   机器可读输出
  node scripts/validate-state.mjs --quiet                  只输出问题

判定口径见 协议/04_状态机.md 第 4 节（不变式 I1–I10）。`);
  process.exit(0);
}

// ── 学习档案解析 ─────────────────────────────────────────────

const PROFILE_REL = join('我的学习', '00-学习档案.md');

/** 空模板标记：出现即视为尚未开始（I2）
 *  只认「尚未开始」—— 模板的 🚦 与 📊 两处都有它，可靠。
 *  不要用「（暂无）」「（尚未进行）」当标记：已经开始的档案里也会保留这类空行，
 *  一旦当成标记，「已开始但待办为空」会被误判成空模板 → 静默跳过全部检查。 */
const BLANK_MARKERS = ['尚未开始'];

/** 占位符：字段值等于这些时视为「没填」 */
const PLACEHOLDER_VALUES = new Set([
  '', '—', '-', '--', '<路径>', '<学科名>', '<课名>', '<yyyy-mm-dd>',
  '<知识点>', '<填>', '<事项>', '（尚未开始）', '（暂无）', '（尚未进行）',
]);

function isPlaceholder(v) {
  if (v === undefined || v === null) return true;
  const t = String(v).trim();
  if (PLACEHOLDER_VALUES.has(t)) return true;
  // 「—」或「–」开头 = 占位约定（常见写法：`—（#2 尚未发布）`、`— 不适用`）。
  // 破折号开头在语义上就是「不填/不适用」，不应当作路径去解析。
  if (/^[—–-]/.test(t)) return true;
  if (/^`.+`$/.test(t) && /^`<[^>]*>`$/.test(t)) return true; // `<xxx>`
  if (/^<.*>$/.test(t)) return true;
  // 「自述尚未创建」= 合法的未到时状态，不是「忘了填」。
  // 真实写法（弱模型实测，两种都对但形式不同）：
  //   ① `我的学习/学科/Python/00-摸底测试.md（待建，学生作答后创建）`
  //   ② `待发布（摸底通过后建 我的学习/学科/Python/01-<课名>/01_教学引导.md）`
  // 模型在**诚实标注文件还没建**；判成「指向不存在的文件」等于惩罚诚实。
  // 与 03_落档事件表 §6「情形 A（尚未发布）」同义：给提示、不判失败。
  if (/待建|待发布|尚未|未创建|未发布|作答后(创建|生成)|还没建|not yet|to be created|pending/i.test(t)) return true;
  return false;
}

/** 去掉 markdown 装饰与反引号，取出裸值。
 *  **不剥括号说明** —— 那是「自述尚未创建」的信息载体，必须留给 isPlaceholder 判断；
 *  只有在真要当路径解析时才由 resolveRel / linkTarget 剥掉。 */
function clean(v) {
  if (v === undefined) return '';
  return String(v)
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

/** 把「路径 + 括号说明」削成纯路径（仅用于真的要解析路径时） */
function stripPathNote(v) {
  if (v === undefined) return '';
  return String(v)
    .replace(/[（(][^（()）]*[)）]\s*$/g, '')
    .trim();
}

/** 从「| **key** | value |」形态的表行里取值 */
function tableValue(block, key) {
  const re = new RegExp(`^\\|\\s*\\*{0,2}${key}\\*{0,2}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'm');
  const m = re.exec(block);
  return m ? clean(m[1]) : undefined;
}

/** 切出某个二级标题下的正文（到下一个同级/更高级标题为止） */
function section(text, headingRe) {
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start < 0) return '';
  const out = [];
  for (let i = start; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** 提取 markdown 表格的数据行（跳过分隔行与表头） */
function tableRows(block) {
  const rows = [];
  for (const line of block.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // 分隔行
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!cells.length) continue;
    rows.push(cells);
  }
  return rows;
}

/** 把表格体切成「表头 + 数据行」——第一行是表头 */
function parseTable(block) {
  const rows = tableRows(block);
  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0], rows: rows.slice(1) };
}

// ── 校验核心 ─────────────────────────────────────────────────

function parseProfile(text) {
  return {
    isBlank: BLANK_MARKERS.some((m) => text.includes(m)),
    info: section(text, /^##\s*📋/),
    handoff: section(text, /^##\s*🚦/),
    mastery: section(text, /^##\s*📊/),
    todo: section(text, /^##\s*⏳/),
    index: section(text, /^##\s*📚/),
  };
}

/** 「最终复评结果」是否已填写（不是空占位） */
function hasFinalVerdict(answerText) {
  const m = /^##\s*最终复评结果\s*$/m.exec(answerText);
  if (!m) return { filled: false, reason: '没有「最终复评结果」小节' };
  const after = answerText.slice(m.index + m[0].length);
  // 截到下一个二级标题
  const next = after.search(/^##\s/m);
  const body = (next >= 0 ? after.slice(0, next) : after).trim();
  if (!body) return { filled: false, reason: '「最终复评结果」小节是空的' };
  if (/（.*由导师填写）|（待填）|<yyyy-mm-dd>/.test(body)) {
    return { filled: false, reason: '「最终复评结果」仍是占位内容' };
  }
  if (!/最终结论|复评日期/.test(body)) {
    return { filled: false, reason: '「最终复评结果」缺「复评日期」或「最终结论」' };
  }
  return { filled: true, body };
}

/**
 * I11：回答文档里「最终复评结果」/「正确答案与解析」各只能出现一次，
 * 且不得残留模板自带的空占位块。
 *
 * 为什么需要：`模板/学生回答模板.md` 末尾预置了两个占位小节。
 * 弱模型实测（GLM-5.3-Flash low）在文档中间正确写出了最终复评，
 * 但**忘了删掉模板自带的空占位块** → 同一份文档出现两份「最终复评结果」
 * （一份已填、一份说「待导师填写」）。接手的人会看到互相矛盾的两个复评区，
 * 正对应本项目最忌讳的「同一信息写多处 → 不敢确定哪份准」。
 * 现有 I6 只找第一个小节，填了就通过，**抓不到这种情况**。
 */
function checkDuplicateSections(answerText) {
  const issues = [];
  for (const name of ['最终复评结果', '正确答案与解析']) {
    const re = new RegExp(`^##\\s*${name}\\s*$`, 'gm');
    const count = (answerText.match(re) || []).length;
    if (count > 1) {
      issues.push(`「${name}」小节出现 ${count} 次（应只 1 次）`);
    }
  }
  // 残留模板占位文本
  if (/（整课所有轮次通过后由导师填写）|（评估完成后由导师填写）/.test(answerText)) {
    issues.push('残留模板占位块「（整课所有轮次通过后由导师填写）」');
  }
  return issues;
}

/** 复评表里是否有非 ✅ 的适用维度 */
function verdictHasFailure(body) {
  const { header, rows } = parseTable(body);
  if (!rows.length) return { any: false, detail: '' };
  // 找维度列（排除题号与结论）
  const dimIdx = [];
  header.forEach((h, i) => {
    if (/概念|逻辑|规范|语法|表达|推导|表述|答题|维度/.test(h)) dimIdx.push(i);
  });
  if (!dimIdx.length) dimIdx.push(...header.map((_, i) => i).filter((i) => i > 0 && i < header.length - 1));
  const bad = [];
  for (const r of rows) {
    for (const i of dimIdx) {
      const cell = (r[i] || '').trim();
      if (!cell) continue;
      if (/不适用|N\/A|—\s*不适用|-{2}/.test(cell)) continue;
      if (!cell.includes('✅')) bad.push(`${r[0] || '?'}: ${header[i] || '?'}=${cell}`);
    }
  }
  return { any: bad.length > 0, detail: bad.join(', ') };
}

function validate(rootDir) {
  const problems = []; // 违反不变式（硬错误）
  const warnings = []; // 提示（不改也能跑）
  const infos = [];

  const profileAbs = join(rootDir, PROFILE_REL);
  if (!existsSync(profileAbs)) {
    return {
      status: 'SKIPPED',
      problems,
      warnings,
      infos: [`没有学习档案（${PROFILE_REL}）—— 尚未开始使用，跳过状态校验。`],
    };
  }

  // 档案里的相对链接是**相对于档案自己所在目录**写的（即 我的学习/），
  // 与 check.mjs 第 277 行的口径一致：`../协议/xx.md` → <root>/协议/xx.md
  const BASE_DIR = dirname(profileAbs);

  const text = readFileSync(profileAbs, 'utf8');
  const p = parseProfile(text);

  // ── I1：五个区块齐全 ──────────────────────────────────────
  const required = [
    ['📋 学生信息', p.info],
    ['🚦 当前交接状态', p.handoff],
    ['📊 掌握表', p.mastery],
    ['⏳ 待办表', p.todo],
    ['📚 课次索引', p.index],
  ];
  const missing = required.filter(([, body]) => !body.trim()).map(([n]) => n);
  if (missing.length) {
    problems.push(`[I1] 学习档案缺区块：${missing.join(' / ')} —— 接手时读不到状态`);
  }

  // ── I2：空模板直接跳过 ────────────────────────────────────
  if (p.isBlank) {
    infos.push('档案是空模板（含「（尚未开始）」）→ 状态 = NEW，跳过后续检查。');
    return { status: 'BLANK', problems, warnings, infos };
  }

  // ── 解析 🚦 ───────────────────────────────────────────────
  const curLessonRaw = tableValue(p.handoff, '当前课次');
  const teachDoc = tableValue(p.handoff, '教学文档');
  const answerDoc = tableValue(p.handoff, '回答文档');
  const curSubject = tableValue(p.handoff, '当前学科');

  const curLessonNum = (() => {
    const m = /#(\d+)/.exec(curLessonRaw || '');
    return m ? Number(m[1]) : undefined;
  })();

  const resolveRel = (v) => {
    if (isPlaceholder(v)) return undefined;
    // 到这一步才剥括号说明（`xx.md（待建）` → `xx.md`）
    const cleaned = stripPathNote(clean(v)).split('#')[0].trim();
    if (!cleaned) return undefined;
    return resolveAny(cleaned);
  };

  /** 宽容解析：档案里的相对链接可能相对于「档案所在目录」或「项目根目录」写。
   *  两个候选依次试，都不存在则返回「相对档案目录」的那个（报错信息更好读）。 */
  const resolveAny = (rel) => {
    const a = resolve(BASE_DIR, rel);
    if (existsSync(a)) return a;
    const b = resolve(rootDir, rel);
    if (existsSync(b)) return b;
    return a;
  };

  // ── I3：🚦 里的文档路径必须存在 ───────────────────────────
  for (const [label, val] of [['教学文档', teachDoc], ['回答文档', answerDoc]]) {
    if (val === undefined) continue;
    if (isPlaceholder(val)) {
      warnings.push(`[I3] 🚦 的 ${label} 仍是占位值「${val}」—— 若已开课，请填真实路径`);
      continue;
    }
    const abs = resolveRel(val);
    if (!abs || !existsSync(abs)) {
      problems.push(`[I3] 🚦 的 ${label} 指向不存在的文件 → ${clean(val)}`);
    }
  }

  // ── 解析 📚 课次索引 ──────────────────────────────────────
  const idxTable = parseTable(p.index);
  const idxCol = (name) => idxTable.header.findIndex((h) => h.includes(name));
  const cLesson = idxCol('课次');
  const cTopic = idxCol('知识点');
  const cTeach = idxCol('教学文档');
  const cAnswer = idxCol('回答文档');

  const lessons = []; // {num, topic, teach, answer}
  for (const r of idxTable.rows) {
    const numM = /#(\d+)/.exec(r[cLesson] || '');
    if (!numM) continue;
    lessons.push({
      num: Number(numM[1]),
      topic: clean(r[cTopic] || ''),
      teach: clean(r[cTeach] || ''),
      answer: clean(r[cAnswer] || ''),
    });
  }

  // ── I4：📚 索引路径存在 ───────────────────────────────────
  for (const l of lessons) {
    for (const [label, raw] of [['教学文档', l.teach], ['回答文档', l.answer]]) {
      if (isPlaceholder(raw)) continue;
      const m = /\[[^\]]*\]\(([^)\s]+)\)/.exec(raw) || /^([^\s|]+)$/.exec(raw);
      const target = m ? m[1].split('#')[0] : raw;
      const abs = resolveAny(target);
      if (!existsSync(abs)) {
        problems.push(`[I4] 📚 课次 #${l.num} 的${label}指向不存在的文件 → ${target}`);
      }
    }
  }

  // ── 解析 📊 掌握表 ────────────────────────────────────────
  const masTable = parseTable(p.mastery);
  const mCol = (name) => masTable.header.findIndex((h) => h.includes(name));
  const mTopic = mCol('知识点');
  const mStatus = mCol('状态');
  const mDate = mCol('评估日期');
  const mNote = mCol('备注');

  const mastery = masTable.rows
    .filter((r) => (r[mTopic] || '') && !isPlaceholder(r[mTopic]))
    .map((r) => ({
      topic: clean(r[mTopic]),
      status: clean(r[mStatus] || ''),
      date: clean(r[mDate] || ''),
      note: clean(r[mNote] || ''),
    }));

  const isMastered = (s) => /✅/.test(s) && /已掌握|掌握/.test(s);

  // 找某知识点在 📚 里对应的回答文档路径
  const answerDocFor = (topic) => {
    // 1) 优先按课次编号匹配（📊 的备注里常带 #N）
    const byNum = /#(\d+)/.exec(topic);
    if (byNum) {
      const l = lessons.find((x) => x.num === Number(byNum[1]));
      if (l) return l.answer;
    }
    // 2) 按知识点名近似匹配
    const hit = lessons.find((x) => x.topic && (x.topic.includes(topic.slice(0, 6)) || topic.includes(x.topic.slice(0, 6))));
    return hit ? hit.answer : undefined;
  };

  /** 从表格单元格里取出「证据文件路径」。
   *  宽容四种真实写法：
   *    ① markdown 链接 `[x](路径)`
   *    ② 裸路径 `学科/xx/01_学生回答.md`
   *    ③ 带标签 + 反引号 + 后缀说明：`证据：\`学科/xx/01_学生回答.md\`「最终复评结果」（2 处代改…）`
   *    ④ 路径 + 说明 `学科/xx/01_学生回答.md；首次 1 处概念错误…`
   *
   *  ③ 是最容易踩的：备注列常把「证据入口」和「一句结论」写在同格里，
   *  若只按分隔符取第一段，会拿到 `证据：\`学科/xx/01_学生回答.md\`「最终复评结果」（2`
   *  —— 它**含有 `/`**，于是通过了「像不像路径」的检查，却根本 resolve 不出来 → 误报 I6。
   *  （弱模型实测 GLM-5.3-Flash 就是这样写备注的，被误判为「证据文件不存在」。）
   *  正确做法：优先抠出**以 .md 结尾的路径本身**，而不是取第一个片段。 */
  const linkTarget = (cell) => {
    if (!cell) return undefined;
    // ① markdown 链接最优先
    const m = /\[[^\]]*\]\(([^)\s]+)\)/.exec(cell);
    if (m) return m[1].split('#')[0].trim() || undefined;
    // ②③④ 抠出第一个「像路径」的片段：允许中文/字母/数字/._-/ 与反引号包裹
    const candidate = /`([^`]*?\.md\#?[^`]*)`|([\w\u4e00-\u9fa5./\-]*\.md)/i.exec(cell);
    if (candidate) {
      const raw = (candidate[1] ?? candidate[2]).split('#')[0].trim();
      if (raw) return raw;
    }
    // 退化：整格当成单一路径（老写法）
    const first = cell.split(/[；;，,\s]/)[0].trim();
    if (first && /\/|\.md$/i.test(first)) return first;
    return undefined;
  };

  // ── I6 / I7 / I8：掌握声明必须有证据 ──────────────────────
  let masteredCount = 0;
  for (const m of mastery) {
    if (!isMastered(m.status)) continue;
    masteredCount++;

    // I8：评估日期必须是真实日期
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date) && !/\d{4}-\d{2}-\d{2}/.test(m.date)) {
      problems.push(`[I8] 📊「${m.topic}」标为已掌握，但评估日期不是真实日期 → 「${m.date}」`);
    }

    // I6：必须找得到回答文档，且其中「最终复评结果」已填写
    const relAnswer = linkTarget(m.note) || linkTarget(answerDocFor(m.topic) || '');
    if (!relAnswer) {
      problems.push(`[I6] 📊「${m.topic}」标为已掌握，但在 📚 索引里找不到对应的回答文档（备注需给出证据入口）`);
      continue;
    }
    const abs = resolveAny(relAnswer);
    if (!existsSync(abs)) {
      problems.push(`[I6] 📊「${m.topic}」标为已掌握，但证据文件不存在 → ${relAnswer}`);
      continue;
    }
    const answerText = readFileSync(abs, 'utf8');
    const v = hasFinalVerdict(answerText);
    if (!v.filled) {
      problems.push(`[I6] 📊「${m.topic}」标为已掌握，但 ${relAnswer} 里${v.reason} —— 掌握缺少证据`);
      continue;
    }
    // I11：重复小节 / 残留模板占位（注：这里只顺手查「已掌握」行引用的文档；
    // 全量扫描在下面的独立 I11 段，见那段注释里的原因）
    const dups = checkDuplicateSections(answerText);
    if (dups.length) {
      problems.push(`[I11] ${relAnswer}：${dups.join('；')} —— 同一信息写多处，接手时不敢确定哪份准`);
    }
    // I7：复评表里适用维度须全 ✅
    const f = verdictHasFailure(v.body);
    if (f.any) {
      problems.push(`[I7] 📊「${m.topic}」标为已掌握，但复评表里有非 ✅ 的适用维度（${f.detail}）—— 状态自相矛盾`);
    }
  }

  // ── I9：不许提前推进 ─────────────────────────────────────
  if (curLessonNum !== undefined) {
    const earlier = lessons.filter((l) => l.num < curLessonNum);
    for (const l of earlier) {
      const m = mastery.find((x) => l.topic && (x.topic.includes(l.topic.slice(0, 6)) || l.topic.includes(x.topic.slice(0, 6))));
      if (m && /⏳|待作答|未作答/.test(m.status)) {
        problems.push(
          `[I9] 提前推进：🚦 已在 #${curLessonNum}，但 📚 的 #${l.num}「${l.topic}」在 📊 里仍是「${m.status}」`,
        );
      }
    }
    // 当前课的编号必须出现在 📚 索引里
    if (!lessons.some((l) => l.num === curLessonNum)) {
      warnings.push(`[I9] 🚦 当前课次 #${curLessonNum} 没有出现在 📚 课次索引里`);
    }
  }

  // ── I11（全量）：所有回答文档都查重复小节 / 残留占位 ──────
  //
  // 为什么必须独立成段、扫**全部**回答文档：
  // I11 原先写在上面 `isMastered` 循环体内部，只有「某一课被标为已掌握」时
  // 才会顺带检查那一份回答文档。后果是：一份回答文档若已经出现两份
  // 「最终复评结果」（正是 I11 想拦的「同一信息写多处」），
  // 而 📊 里对应行还是 `⏳ 待作答` / 尚未写入，校验器**照样 PASSED**。
  // 弱模型实测（DeepSeek-V4.1-Flash off）就撞上了这个时序缺口 ——
  // 它一度同时存在空占位块与已填小节，而校验器报 PASSED，是它自己 grep 才发现的。
  // 判据本来就与「是否已声明掌握」无关：**同一文档出现两份复评区就是错的**，
  // 无论当时掌握表写了什么。
  {
    const seenDocs = new Set();
    for (const l of lessons) {
      // 只对**回答文档**做重复小节检查（教学文档里没有这两个小节）。
      // 注意不要把教学文档路径先塞进 seenDocs —— 档案里「教学文档」与「回答文档」
      // 常常指向同一个文件，先塞会让随后那一次检查被当成「已看过」而跳过。
      const raw = l.answer;
      if (isPlaceholder(raw)) continue;
      const target = linkTarget(raw) || clean(raw).split('#')[0].trim();
      if (!target || !/\.md$/i.test(target)) continue;
      const abs = resolveAny(target);
      if (!existsSync(abs) || seenDocs.has(abs)) continue;
      seenDocs.add(abs);
      const dups = checkDuplicateSections(readFileSync(abs, 'utf8'));
      if (dups.length) {
        problems.push(`[I11] ${target}：${dups.join('；')} —— 同一信息写多处，接手时不敢确定哪份准`);
      }
    }
    // 兜底：📚 索引没登记、但磁盘上确实存在的回答文档也要查
    // （例如学生在摸底/中途阶段，索引还没补齐的情形）
    const bucket = join(rootDir, '我的学习', '学科');
    const walkAnswers = (dir) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        let st;
        try {
          st = statSync(abs);
        } catch {
          continue;
        }
        if (st.isDirectory()) walkAnswers(abs);
        else if (name === '01_学生回答.md' && !seenDocs.has(abs)) {
          seenDocs.add(abs);
          const dups = checkDuplicateSections(readFileSync(abs, 'utf8'));
          if (dups.length) {
            const relDoc = relative(rootDir, abs).split(sep).join('/');
            problems.push(`[I11] ${relDoc}：${dups.join('；')} —— 同一信息写多处，接手时不敢确定哪份准`);
          }
        }
      }
    };
    walkAnswers(bucket);
  }

  // ── I5：⏳ 待办表的证据入口存在 ───────────────────────────
  const todoTable = parseTable(p.todo);
  const tCol = (name) => todoTable.header.findIndex((h) => h.includes(name));
  const tItem = tCol('事项');
  const tEvidence = tCol('证据入口');
  for (const r of todoTable.rows) {
    const item = clean(r[tItem] || '');
    const ev = clean(r[tEvidence] || '');
    if (isPlaceholder(item)) continue;
    if (isPlaceholder(ev)) continue;
    const target = linkTarget(ev);
    if (!target) continue;
    const abs = resolveAny(target);
    if (!existsSync(abs)) {
      problems.push(`[I5] ⏳ 待办「${item}」的证据入口指向不存在的文件 → ${target}`);
    }
  }

  // ── I10：待办表不得重复「当前正在上的课」 ─────────────────
  if (curLessonRaw && !isPlaceholder(curLessonRaw)) {
    for (const r of todoTable.rows) {
      const item = clean(r[tItem] || '');
      if (!item || isPlaceholder(item)) continue;
      const h = clean(r[tEvidence] || '');
      if (teachDoc && answerDoc
        && h && clean(teachDoc) && clean(answerDoc)
        && (h.includes(clean(teachDoc)) && h.includes(clean(answerDoc)))) {
        problems.push(`[I10] ⏳ 待办表重复了「当前正在上的课」（${item}）—— 状态应只在 🚦 维护`);
      }
    }
  }

  return {
    status: problems.length ? 'FAILED' : 'PASSED',
    subject: curSubject,
    currentLesson: curLessonRaw,
    masteredCount,
    problems,
    warnings,
    infos,
  };
}

// ── 回归测试集模式 ───────────────────────────────────────────

function runFixtures(dir) {
  if (!existsSync(dir)) {
    console.error(`❌ 找不到测试集目录：${dir}`);
    process.exit(2);
  }
  const cases = [];
  for (const name of readdirSync(dir)) {
    const caseDir = join(dir, name);
    if (!statSync(caseDir).isDirectory()) continue;
    const expectPath = join(caseDir, 'expected.json');
    if (!existsSync(expectPath)) continue;
    cases.push({ name, caseDir, expect: JSON.parse(readFileSync(expectPath, 'utf8')) });
  }
  if (!cases.length) {
    console.error(`❌ ${dir} 下没有找到任何带 expected.json 的用例`);
    process.exit(2);
  }

  const results = [];
  let failed = 0;
  for (const c of cases) {
    const r = validate(c.caseDir);
    const actualStatus = r.status;
    const wantStatus = c.expect.status;
    const statusOk = actualStatus === wantStatus;

    // 期望命中的不变式（如 ["I6","I7"]）必须都出现在报错里
    const wantIds = c.expect.invariants || [];
    const hitIds = new Set();
    for (const msg of r.problems) {
      const m = /^\[(I\d+)\]/.exec(msg);
      if (m) hitIds.add(m[1]);
    }
    const missingIds = wantIds.filter((id) => !hitIds.has(id));

    const ok = statusOk && missingIds.length === 0;
    if (!ok) failed++;
    results.push({ name: c.name, ok, actualStatus, wantStatus, missingIds, wantIds, problems: r.problems });
  }

  console.log('');
  console.log(`🧪 状态校验回归测试：${cases.length} 个用例`);
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    console.log(`   ${mark} ${r.name}  （期望 ${r.wantStatus} / 实际 ${r.actualStatus}）`);
    if (!r.ok) {
      if (r.missingIds.length) console.log(`        未命中不变式：${r.missingIds.join(', ')}`);
      for (const p of r.problems) console.log(`        · ${p}`);
    }
  }
  console.log('');
  if (failed) {
    console.log(`❌ ${failed}/${cases.length} 个用例未通过。`);
    process.exit(1);
  }
  console.log(`✅ ${cases.length} 个用例全部通过。`);
  console.log('');
  process.exit(0);
}

// ── 主流程 ───────────────────────────────────────────────────

if (FIXTURES) runFixtures(resolve(process.cwd(), FIXTURES));

const targetRoot = ROOT ? resolve(process.cwd(), ROOT) : REPO_ROOT;
const result = validate(targetRoot);

if (JSON_OUT) {
  console.log(JSON.stringify({ root: targetRoot, ...result }, null, 2));
  process.exit(result.status === 'FAILED' ? 1 : 0);
}

if (!QUIET) {
  console.log('');
  console.log(`🔍 状态校验：${relative(process.cwd(), join(targetRoot, PROFILE_REL)) || PROFILE_REL}`);
}

if (result.status === 'SKIPPED') {
  console.log('ℹ️  没有学习档案 —— 跳过（尚未开始使用）。');
  console.log('');
  process.exit(0);
}

if (!QUIET) {
  if (result.status === 'BLANK') {
    console.log('   状态：NEW（空模板）');
  } else {
    console.log(`   状态：${result.status}  |  学科：${result.subject || '—'}  |  当前课次：${result.currentLesson || '—'}`);
    console.log(`   已掌握知识点：${result.masteredCount}`);
  }
  for (const i of result.infos) console.log(`   ℹ️  ${i}`);
}

if (result.warnings.length) {
  console.log(`\n⚠️  提示 ${result.warnings.length} 条：`);
  for (const w of result.warnings) console.log(`   - ${w}`);
}

if (result.problems.length) {
  console.log(`\n❌ 违反不变式 ${result.problems.length} 条（口径见 协议/04_状态机.md 第 4 节）：`);
  for (const p of result.problems) console.log(`   - ${p}`);
  console.log('');
  process.exit(1);
}

if (!QUIET) {
  if (result.status === 'BLANK') {
    console.log('✅ 空模板无需校验。开课后请重跑本命令。');
  } else {
    console.log('✅ 状态自洽：路径存在、掌握有证据、无提前推进。');
  }
  console.log('');
}
process.exit(0);
