# Steps2Great-skill

> **Turn any AI that supports Agent Skills into your one-on-one tutor.**
> Placement test → roadmap → 1–3 questions per round → advance only when all three dimensions are ✅ → errors explained properly before moving on.

English | [简体中文](./README.md)

---

## What this is

An **Agent Skill** following the [Agent Skills open standard](https://code.claude.com/docs/en/skills).
Install it and the AI stops being a Q&A machine and starts **tutoring you under a protocol**.

It teaches no particular subject — it defines **how to teach**:

| Where you are now | What Steps2Great does |
|---|---|
| You ask "how should I learn Python?" and get a roadmap, then nothing | Placement test → your real starting point → roadmap → **lesson 1 sent** |
| The AI dumps 10 questions at once; question 1 is wrong, so 2–10 are all wrong too | **1–3 questions per round**; question 2 comes only after question 1 is corrected |
| You ask what's wrong and get "fixed." | Every small problem gets a **three-part explanation**: ① your original answer → ② why it's wrong → ③ what it became |
| Where you got to and what you actually learned evaporate in a new session | Progress is filed into `我的学习/00-学习档案.md` — **switching AI tools still picks up where you left off** |
| The AI sounds plausible but you can't tell if it's making things up | Hard rule 8: teaching content must be grounded (your own `资料/`, or a verifiable primary source). **Uncertain means "I'm not sure"** |

It grew out of [StepsToGreat](https://github.com/wildcat430524/StepsToGreat), which turned a whole folder into a tutor via `AGENTS.md`.
This repo packages that into a **portable skill**: any tool, any project, any compatible client.

---

## Install (pick one)

### 1. Personal skill (easiest — available in every project)

Clone the repo into your skills directory as `steps2great-skill` (matching the frontmatter `name`):

```bash
# Claude Code / compatible Agent Skills clients
git clone https://github.com/wildcat430524/Steps2Great-skill.git ~/.claude/skills/steps2great-skill
```

Windows PowerShell:

```powershell
git clone https://github.com/wildcat430524/Steps2Great-skill.git "$env:USERPROFILE\.claude\skills\steps2great-skill"
```

Then type `/steps2great-skill`, or just say "I want to learn X" and let the model load it.

### 2. Project skill (travels with the repo)

```bash
mkdir -p .claude/skills && git clone https://github.com/wildcat430524/Steps2Great-skill.git .claude/skills/steps2great-skill
```

### 3. Bundle it into a plugin / distribute it

`package.json` ships a `files` allowlist (`SKILL.md` + `references/` + `templates/` + `scripts/`),
so it works as an npm package or a git dependency. Other skills can reach it via `skill steps2great-skill`.

> **Node is optional.** The scripts exist for workspace init, self-check, and updates.
> You can also just say "I want to learn X, set me up" and let the AI create the folders by hand.

---

## First run

One sentence is enough:

> **"I want to learn Python so I can process Excel files myself. 30 minutes a day."**

The AI will: read the protocol → create the workspace → collect requirements → run a placement test (5–8 questions, ~10 minutes) → lay out the first 3–5 lessons → send lesson 1.

From then on you only ever do two things:

1. Write your answers in `我的学习/学科/<subject>/NN-<lesson>/01_学生回答.md`
2. **Say "完成了" (done)**

The AI then re-reads the file → runs the three-dimension assessment → directly fixes and explains small problems → files the state → sends the next round or lesson.

### Learning a whole book or a long document?

Drop the material into the workspace `资料/` folder and say:

> **"My material is in `资料/` — teach me just chapter 1 for now."**

The AI teaches from the **actual content** and cites which file and which section, so you can verify it.

---

## The rules it enforces

**In one line**: all three dimensions (① conceptual understanding / ② logical correctness / ③ formal correctness) must be **✅** before anything counts as mastered — and nothing advances until then.
Partial mastery (any ⚠️) and non-mastery (any ❌) both fail.

The load-bearing rules:

| Rule | What it says |
|---|---|
| **1–3 questions per round** | Scaled by question cost: light items up to 3, a full algorithm or essay question only 1–2. **Never the whole lesson's questions at once** |
| **Re-read before assessing** | "Done" → **the answer file must be re-read**; judging from conversation memory is forbidden |
| **Direct fix for small problems** | Typos / single-point syntax / missing symbols are fixed in the file so the student doesn't waste a round — but always with the three-part explanation |
| **Socratic for big problems** | Conceptual or logical errors are guided: minimal hint first, the student derives it |
| **Three strikes, then give the answer** | Same sticking point missed three times → stop guiding, give the answer, ask for a paraphrase. No grinding inside one round |
| **Feynman as a diagnostic** | Mandatory once at the end of a big module, at most once per lesson, dropped entirely if the student says no |
| **State lives in three places** | 🚦 handoff status / 📊 mastery table / ⏳ to-do table. No writing one progress fact in five places |
| **Rules change in the overlay** | Student wants a rule changed → `我的学习/我的规则.md` (highest priority), **never the framework** |

The full protocol is in [`SKILL.md`](./SKILL.md) and [`references/协议/`](./references/协议/) (Chinese).

---

## Repository layout

```
Steps2Great-skill/
├── SKILL.md                    ← the contract and main loop (what the AI actually reads)
├── references/                 ← read on demand (protocol / subject packs / templates / examples / tutorials / glossary)
│   ├── 协议/                   ← the single source of truth for teaching rules
│   ├── 学科包/                 ← programming / language / humanities / sciences / exams — each defines its own dimension ③
│   ├── 模板/                   ← blank templates for the profile, roadmap, lesson guide, student answers
│   ├── docs/simulations/       ← 8-subject simulation reports (these rules are measured, not guessed)
│   ├── 教程/                   ← human-facing setup and design notes
│   └── en/                     ← English mirrors
├── templates/workspace/        ← scaffolding copied into the student's workspace
├── scripts/
│   ├── init-workspace.mjs      ← build the workspace skeleton (never overwrites)
│   ├── update.mjs              ← adaptive update (never touches your learning records)
│   ├── validate-state.mjs      ← state validator (10 invariants)
│   └── check.mjs               ← repo self-check (frontmatter / links / encoding / mirror drift)
└── _build/sync-from-upstream.mjs  ← mirrors framework files from StepsToGreat, rewriting links
```

**Why `_build/` exists**: the protocol content here is **mirrored**, not hand-copied.
Upstream changes the protocol → run the sync script → `references/` follows, with the
mapping (and link rewriting) documented in the script itself.

---

## Language strategy: one language only, or both?

Every skill has to answer this. This repo answers it **by layer**:

| Layer | Choice | Why |
|---|---|---|
| **Frontmatter `description`** | **Bilingual** | It sits in context **every single turn** and is the only thing the model routes on. One language means half your possible users never trigger it. Both sets of trigger words live here |
| **`SKILL.md` body** | **Chinese only** | The body is *rules*, and one copy is enough. Two copies means every rule change must land twice — guaranteed drift. The protocol also relies on established Chinese terms (代改, 三段式, 落档, 可豁免笔误) that lose precision when translated |
| **`references/`** | Chinese primary + `references/en/` mirrors | English readers need the full reference; those English versions are already maintained upstream, so mirroring costs nothing extra |
| **README** | Both languages | Front door, cheap, high value |

**In one line: bilingual at the trigger layer, single-language at the execution layer.**
Doing otherwise fails in one of two familiar ways — bilingual bodies drift
(one copy updated, the other forgotten), or a single-language body never triggers for
half the audience.

> Using this repo as a template for your own skill? Copy the table.

---

## Adaptive updates

Two layers, don't conflate them:

**① Framework self-update** (shared across sessions and students)

```bash
# report only, write nothing
node scripts/update.mjs --root <your-workspace> --check

# actual update (scaffolding + version anchor only; never your learning records)
node scripts/update.mjs --root <your-workspace>

# update the skill itself
node scripts/update.mjs --self        # git checkout → git pull --ff-only
```

The workspace root carries a `.steps2great.json` recording the `skillVersion` at init time.
On takeover the AI compares versions and mentions an update **once**; nothing happens without your consent.

**② Teaching adaptation** (different for every student)

| What adapts | Where it lives |
|---|---|
| Your preferences (question count, tone, Feynman or not) | `我的学习/我的规则.md` — the **overlay, highest priority** |
| Progress, mastered items, open threads | `我的学习/00-学习档案.md` — 🚦 / 📊 / ⏳ |
| Questions per round, Feynman timing, direct-fix vs. Socratic | Judged **in the moment** from `SKILL.md` and the subject pack — never hardcoded |

**Two iron rules**: rules change in the overlay, never the framework; state lives in three places, never duplicated.

---

## Development

```bash
node scripts/check.mjs                                    # repo self-check (frontmatter / links / encoding / mirror drift)
node _build/verify-skill-load.mjs                         # loader view: real YAML parser validates SKILL.md
node _build/sync-from-upstream.mjs                        # mirror from upstream (default E:/StepsToGreat)
node _build/sync-from-upstream.mjs --from <path> --dry     # dry-run diff
node scripts/validate-state.mjs --root <workspace>         # validate a workspace's state
```

> **A bug we already hit (hence `verify-skill-load`)**: if the frontmatter `description` is a
> bare scalar containing `: `, a strict YAML parser fails with `Nested mappings are not allowed`
> and **the skill silently fails to load** — while the plain text looks perfectly fine.
> Both checkers catch it; see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

- **Code / scripts**: MIT — see [`LICENSE`](./LICENSE)
- **Docs / protocol**: CC BY 4.0 — see [`LICENSE-DOCS`](./LICENSE-DOCS)

Suggested attribution:

```
Based on StepsToGreat (https://github.com/wildcat430524/StepsToGreat)
and Steps2Great-skill (https://github.com/wildcat430524/Steps2Great-skill),
licensed CC BY 4.0 with the original author's permission.
```
