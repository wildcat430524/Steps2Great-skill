# Steps2Great-skill

> **把任何支持 Agent Skills 的 AI，变成你的一对一导师。**
> 摸底 → 排路线 → 每轮只出 1–3 题 → 三维评估全 ✅ 才推进 → 错的地方讲透再往下。

[English](./README.en.md) | 简体中文

---

## 这是什么

一份 **Agent Skill**（[Agent Skills 开放标准](https://code.claude.com/docs/en/skills)）：
装进支持 skills 的 AI 工具后，它会让这个 AI **按教学协议陪你学**，而不是当问答题机器。

它不教任何特定学科 —— 它规定的是**怎么教**：

| 你现在的处境 | Steps2Great 怎么解决 |
|---|---|
| 问 AI「我该怎么学 Python」，它给你一份路线图，然后就没有然后了 | AI 出摸底测试 → 定你的真实起点 → 排路线 → **发第一课** |
| AI 一次丢 10 道题，第 1 题就错了，后面 9 道全跟着错 | **一轮只出 1–3 题**，第 1 题纠正后才出第 2 题 |
| 你说「错在哪」只回「已修正」 | 每条小问题给**三段式**：① 你的原答案 → ② 为什么错 → ③ 我改成了什么 |
| 学到哪、会不会，下次开新会话全忘光 | 进度落进 `我的学习/00-学习档案.md`，**换 AI 工具也能接上** |
| AI 讲得似是而非，你也不知道它是不是在编 | 硬规则 8：教学内容必须有依据（你的 `资料/` 或可核实的一手来源），**不确定就说不确定** |

它脱胎于 [StepsToGreat](https://github.com/wildcat430524/StepsToGreat) —— 那个项目用 `AGENTS.md` 把整个文件夹变成导师；
本仓库把它**封装成一个通用 skill**：换工具、换项目、换 AI 客户端都能装。

---

## 装它（三条路，任选）

# ① 装成个人 skill（最省事，所有项目都能用）

把本仓库放进你的 skill 目录，目录名用 `steps2great-skill`（= frontmatter 里的 `name`）：

```bash
# Claude Code / 兼容 Agent Skills 的客户端
git clone https://github.com/wildcat430524/Steps2Great-skill.git ~/.claude/skills/steps2great-skill
```

Windows PowerShell：

```powershell
git clone https://github.com/wildcat430524/Steps2Great-skill.git "$env:USERPROFILE\.claude\skills\steps2great-skill"
```

装完在会话里打 `/steps2great-skill`，或直接说「我想学 X」，AI 会自己判断要不要加载它。

### ② 装进某个项目（跟着仓库走，团队共用）

```bash
mkdir -p .claude/skills && git clone https://github.com/wildcat430524/Steps2Great-skill.git .claude/skills/steps2great-skill
```

### ③ 包进一个插件 / 分发给你自己的用户

`package.json` 已配好 `files` 白名单（`SKILL.md` + `references/` + `templates/` + `scripts/`），
直接当 npm 包或 git 依赖分发即可。别的 skill 也能通过 `skill steps2great-skill` 调用它。

> **不需要 Node 也能用**：脚本是给「初始化工作区 / 自检 / 更新」用的加分项。
> 你完全可以只说一句「我想学 XX，帮我起个头」，让 AI 手工建目录。

---

## 怎么用（第一次）

装好之后，跟 AI 说一句话就够了：

> **「我想学 Python，目标是能自己处理 Excel，每天 30 分钟。」**

AI 会：读协议 → 建工作区 → 需求收集 → 出摸底题（5–8 题，约 10 分钟）→ 排前 3–5 课 → 发第一课。

之后你的日常只有两个动作：

1. 在 `我的学习/学科/<学科>/NN-<课名>/01_学生回答.md` 里写答案
2. **跟 AI 说「完成了」**

AI 会自动：重新读文件 → 三维评估 → 小问题直接代改并讲透 → 落档 → 出下一轮 / 下一课。

### 想学一整本书 / 一份资料？

把资料丢进工作区的 `资料/`，然后说：

> **「资料我放在 `资料/` 里了，先只用第 1 章教我。」**

AI 会按资料里的**实际内容**教，并注明出自哪份文件的哪一节（允许查证，不允许编书单）。

---

## 它到底立了什么规矩

**一句话**：三维评估（① 概念理解 / ② 逻辑正确 / ③ 规范表达）**全部 ✅ 才算掌握**，才允许推进下一课。
部分掌握（任一 ⚠️）与未掌握（任一 ❌）都不算 —— **不通过就不发新课**。

几条最关键的：

| 规矩 | 内容 |
|---|---|
| **一轮 1–3 题** | 按题型成本折算：轻题型最多 3 题，完整算法题/论述题只 1–2 题。**绝不一次把一课的题全发出去** |
| **重读再评估** | 学生说「完成了」→ **必须重新读回答文档**，禁止凭对话记忆判定 |
| **小问题代改** | 笔误/单点语法/缺符号 → 直接改文件，不让学生白答一轮；但必须当场讲透三段式 |
| **大问题引导** | 概念错/逻辑不通 → 走 Socratic，先给最小提示，让学生自己推 |
| **同一个点问 3 次就直给** | 连续 3 次没讲通 → 停止引导，直接给答案 + 要求复述。不在一轮里死磕 |
| **费曼法是诊断工具** | 大模块收尾必做一次；一课最多一次；学生说不想讲就换普通题 |
| **状态只在三处** | 🚦 交接状态 / 📊 掌握表 / ⏳ 待办表。不许同一进度写五个地方 |
| **规则改覆盖层** | 学生要改规则 → 写 `我的学习/我的规则.md`（优先级最高），**不改框架** |

完整协议见 [`SKILL.md`](./SKILL.md) 与 [`references/协议/`](./references/协议/)。

---

## 仓库结构

```
Steps2Great-skill/
├── SKILL.md                    ← 契约与主循环（AI 真正读的那一份）
├── references/                 ← 按需读取的参考（协议 / 学科包 / 模板 / 示例 / 教程 / 术语表）
│   ├── 协议/                   ← 教学规则的唯一出处（含状态机与落档事件表）
│   ├── 学科包/                 ← 编程 / 语言 / 文科 / 理科 / 考试，各定自己的三维口径
│   ├── 模板/                   ← 学习档案、课程路线、教学引导、学生回答的空模板
│   ├── docs/simulations/       ← 8 学科仿真报告（这些规矩是实测出来的，不是拍脑袋）
│   ├── 教程/                   ← 人类看的安装与设计说明
│   └── en/                     ← 英文版镜像（英文用户走这里）
├── templates/workspace/        ← 初始化学生工作区时复制过去的脚手架
├── scripts/
│   ├── init-workspace.mjs      ← 在工作区里搭骨架（不覆盖已有文件）
│   ├── update.mjs              ← 自适应更新（永不碰你的学习记录）
│   ├── validate-state.mjs      ← 状态校验器：档案三处状态是否自洽（10 条不变式）
│   └── check.mjs               ← 本仓库自检（frontmatter / 坏链 / 编码 / 镜像一致性）
└── _build/sync-from-upstream.mjs  ← 从 StepsToGreat 镜像框架文件（含链接改写）
```

**为什么要 `_build/`**：本 skill 的协议内容**不手抄**，而是从 [StepsToGreat](https://github.com/wildcat430524/StepsToGreat) **镜像**。
上游改协议 → 跑一次同步脚本，`references/` 全部跟上，映射关系（含相对链接改写）写在脚本里。

---

## 语言策略：只用中文，还是只用英文？

这是装 skill 时绕不开的问题。本仓库的选择是**分层处理**，理由如下：

| 层 | 选择 | 为什么 |
|---|---|---|
| **frontmatter `description`** | **中英双语** | 它是**每一轮都在上下文里**的触发层，也是 AI 判断「要不要用这个 skill」的唯一依据。只用一种语言 = 直接砍掉一半用户能触发到的机会。所以这里中文触发词和英文触发词都写 |
| **`SKILL.md` 正文** | **只用中文** | 正文是**规则**，一份就够。双份正文 = 每次改规则要改两处 = 必然漂移。而且协议里大量概念（代改、三段式、落档、可豁免笔误）是有既定中文叫法的，硬翻会失真 |
| **`references/`** | 中文为主 + `references/en/` 英文镜像 | 英文用户需要完整可读的参考；这些英文版**上游本来就在维护**（StepsToGreat 是双语的），镜像过来不产生新的维护负担 |
| **`README`** | 双语两份 | 给人看的门面，成本低、收益高 |

**一句话**：**触发层双语，执行层单语。**
不这么做的话，常见翻车方式有两种 —— 要么正文双语导致规则漂移（改了一处忘了另一处），
要么正文单语言导致另一种语言的用户根本触发不到。

> 如果你要拿本仓库当模板做自己的 skill：**照着这张表抄**即可。

---

## 自适应更新

分两层，别混：

**① 框架自更新**（跨会话、跨学生共用一套规则）

```bash
# 检查工作区脚手架是否需要更新（只报告，不写）
node scripts/update.mjs --root <你的工作区> --check

# 真正更新（只动脚手架与版本锚，永不碰你的学习记录）
node scripts/update.mjs --root <你的工作区>

# 更新 skill 自身
node scripts/update.mjs --self        # git 检出 → git pull --ff-only
```

工作区根会有个 `.steps2great.json` 记账（初始化时的 `skillVersion`）。
AI 接手时比一下版本，低了就**提示一次**「框架有更新，要不要同步」，你同意再动手。

**② 教学自适应**（每个学生都不一样）

| 自适应什么 | 落在哪 |
|---|---|
| 你的偏好（题量、语气、要不要费曼） | `我的学习/我的规则.md` —— **覆盖层，优先级最高** |
| 学到哪、哪些真掌握、有什么挂起 | `我的学习/00-学习档案.md` 的 🚦 / 📊 / ⏳ |
| 一轮出几题、要不要出费曼、纠错走代改还是引导 | 按 SKILL.md 与学科包的口径**当场判断**，不写死 |

**两条铁律**：规则改覆盖层，不改框架；状态只在三处，不重复写。

---

## 开发

```bash
node scripts/check.mjs                                    # 仓库自检
node _build/sync-from-upstream.mjs                        # 从上游镜像框架（默认 E:/StepsToGreat）
node _build/sync-from-upstream.mjs --from <路径> --dry     # 只看差异
node scripts/validate-state.mjs --root <工作区>            # 校验某个工作区的状态是否自洽
```

---

## 许可

- **代码 / 脚本**：MIT —— 见 [`LICENSE`](./LICENSE)
- **文档 / 协议**：CC BY 4.0 —— 见 [`LICENSE-DOCS`](./LICENSE-DOCS)

署名建议：

```
基于 StepsToGreat（https://github.com/wildcat430524/StepsToGreat）
与 Steps2Great-skill（https://github.com/wildcat430524/Steps2Great-skill），
采用 CC BY 4.0 许可，原作者已授权。
```
