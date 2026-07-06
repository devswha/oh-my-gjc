# oh-my-gjc

**The oh-my suite for [Gajae Code (`gjc`)](https://github.com/Yeachan-Heo/gajae-code).**
One core plugin + optional power plugins — skills, slash commands, model presets,
and cross-CLI delegation, packaged as installable plugins.

> Sibling of [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) (Claude Code)
> and [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) (Codex CLI) — the same
> "install and go" experience, built for gjc. Compatible with the Claude Code / Codex
> plugin spec, so the same repo also works there.

gjc already ships OMC-style orchestration natively (`team`, `ultragoal`, `ralplan`,
`deep-interview`) — so oh-my-gjc doesn't reimplement it. Instead it adds what gjc
doesn't ship: **plain-language UX, approval-gate briefings, evidence-based multivendor
model presets, and a cross-CLI delegation suite** (gjc driving Codex & ChatGPT web).

## Quick Start

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install oh-my-gjc@oh-my-gjc

# gjc does not load marketplace-plugin commands/skills into a session, so do a
# one-time NATIVE install from the shell (the setup command itself isn't live yet):
bash ~/.gjc/plugins/cache/plugins/*oh-my-gjc*/bin/install-skill.sh all

# then open a new gjc session (or /move .) and run:
/oh-my-gjc:setup
```

The shell step natively installs the skills + `/oh-my-gjc:*` commands (required — gjc
won't surface plugin commands otherwise). `setup` then refreshes that install, offers the
model presets, and detects your environment to recommend the optional plugins below.

## Core plugin — `oh-my-gjc`

| Surface | What you get |
|---|---|
| `easy-answer` skill | Final answers in plain language (accuracy first — keeps the technical term when simplifying would distort) |
| `multivendor-presets` skill | Evidence-based model presets merged into `~/.gjc/agent/models.yml`: `ideal` (daily default), `escalate-surgical` (Fable 5 relief pitcher), `monorepo` (every role ≥1M ctx) |
| `branch-flow` skill | Per-repo git branch discipline (patina's dev-integration / main-release model): work branches off `dev` → PR into `dev` → explicit release `dev`→`main`; parallel via worktrees; ships as the repo's committed `AGENTS.md` block + `docs/WORKFLOW.md` |
| Toggles | `/oh-my-gjc:easy` (this session) / `easy-always [on\|off\|status]` (every session — user-global `~/.gjc/agent/SYSTEM.md` marker block, the only injected user-global surface on gjc 0.8.2) / `branchflow-always [on\|off\|status]` (per-repo — committed repo `AGENTS.md` block) |
| `/oh-my-gjc:fable` | **Fable 5 adversarial safety audit** of money/data-critical code — invariant-breaking, read-only, severity-rated findings with spot-check verification. Proven to catch CRITICALs a 3-vendor consensus plan missed |
| `/oh-my-gjc:setup` | Idempotent setup + environment detection → recommends optional plugins |

Details: [`plugins/oh-my-gjc/README.md`](./plugins/oh-my-gjc/README.md)

### 스킬 하나씩 보기

#### `easy-answer` — 쉬운 말로 답하기

마지막에 사용자에게 하는 답을 전문용어 없이 쉬운 말로 풀어줘요. 지금 이 글처럼요.
작업 내용이나 정확성은 그대로 두고 **말투만** 바꿔요. 쉽게 쓰다 뜻이 틀어질 것 같으면
원래 용어를 그대로 쓰고 괄호로 뜻을 달아요.

- 형식: ① 한 줄 결론 → ② 쉬운 설명 → ③ (필요할 때만) 자세히 — 명령어·경로 같은 건 여기로.
- 위험·주의는 절대 빼지 않아요. 쉬운 말로 꼭 알려줘요.
- 켜기: `/oh-my-gjc:easy` (이번만) / `/oh-my-gjc:easy-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/easy-answer/SKILL.md`](./plugins/oh-my-gjc/skills/easy-answer/SKILL.md)

#### `multivendor-presets` — 역할별 모델 묶음 프리셋

여러 회사의 AI 모델을 역할별로 섞어 쓰도록 미리 짜둔 묶음을 설정 파일에 넣어줘요.
(예: 한 모델이 코드 짜고, 다른 모델이 검토하고, 또 다른 모델이 최종 점검.)

- `ideal` — 평소 기본. 균형 잡힌 조합.
- `escalate-surgical` — 어려운 문제 하나 풀 때만 잠깐. 끝나면 `ideal`로 복귀.
- `monorepo` — 아주 큰 코드베이스용(모든 역할이 넓은 문맥 처리).
- 기존 설정은 안 건드리고 해당 프리셋만 넣어요(넣기 전 백업).
- 쓰기: `/oh-my-gjc:presets`로 넣고 → `gjc --mpreset ideal`로 켜요. 각 프리셋은 해당 회사 로그인이 필요해요.
- 원문: [`plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md`](./plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md)

#### `branch-flow` — 저장소 브랜치 규칙

작업은 `dev`에서 하고, 다 되면 릴리스할 때만 `main`으로 넘기는 규칙이에요.
`main`은 직접 건드리지 않아요. 이 규칙은 저장소 안에 저장돼서 같이 따라다녀요.

- 흐름: 작업 브랜치 → `dev`에 합치기 → (명시적 지시가 있을 때만) `dev`를 `main`으로 릴리스.
- 사용자 허락 없이 저장·합치기·릴리스 안 해요. 남의 작업은 안 건드려요.
- 켜기: `/oh-my-gjc:branchflow-always on` (`off` / `status`로 확인)
- 원문: [`plugins/oh-my-gjc/skills/branch-flow/SKILL.md`](./plugins/oh-my-gjc/skills/branch-flow/SKILL.md)

## Optional plugins

Install on demand — `/oh-my-gjc:setup` recommends the ones your environment supports.

| Plugin | What it does | Needs |
|--------|--------------|-------|
| `codex-cli-control` | gjc drives the local **Codex CLI** (`codex exec`): one prompt → final answer. Sandbox defaults to `read-only`. | Codex CLI |
| `codex-deepwork` | gjc delegates an **autonomous, file-writing** task to Codex (write sandbox). Auto-uses the **LazyCodex** harness when installed. | Codex CLI |
| `lazycodex` | Install/manage the **LazyCodex** deep-work harness (`npx lazycodex-ai`) + run `ultrawork` (plan→work→verify) tasks through it | Codex CLI |
| `codex-app-control` | gjc controls the **Codex desktop App GUI** over CDP — headless launch (xvfb) + attach + drive | Codex App |
| `insane-review` | **GPT-5.5 Pro** (web-only, no API) code review — repomix-packs your files, drives your logged-in ChatGPT session over CDP, saves to `.insane-review/`. Zero API cost. | Chrome + ChatGPT |
| `gjc-bugwatch` | Dogfooding **bug collector** — scans `~/.gjc/logs`, triages/reproduces against a gajae-code clone, collects issue/PR **drafts** (no auto-PR) | gjc dev interest |
| `example-plugin` | Starter template — copy it to build your own | — |

The `codex-*` plugins include detailed docs at `plugins/<name>/README.md`.

## What else is in here

| Path | What it is |
|------|------------|
| `.claude-plugin/marketplace.json` | The catalog — every plugin is registered here (`gjc plugin marketplace add ./`) |
| `plugins/<name>/` | One directory per plugin (manifest + commands/skills/agents/hooks) |
| `tools/discord-notify-bridge.ts` | Forwards a live gjc session's notifications (action-needed / idle / resolved) to a Discord channel via webhook. Notify-only. Tests in `tools/test/` |
| `guide/` | Korean how-to page (`가재코드 실전 가이드`) — static `index.html` + `serve_www.py` (→ `http://0.0.0.0:8090/`) |
| `AGENTS.md` | Agent-facing spec: plugin format, schema, conventions, and detailed per-plugin notes |
| `.env.example` | Placeholder template for API keys. Copy → `.env`, then symlink into `~/.gjc/.env`. Never commit real keys |

## Migrating from v0.1 (my-workflows / multivendor-presets)

Both plugins were absorbed into the core `oh-my-gjc` plugin. `/oh-my-gjc:setup`
detects leftovers and offers cleanup (`/plugin uninstall my-workflows@oh-my-gjc`,
`/plugin uninstall multivendor-presets@oh-my-gjc`). Legacy `AGENTS.md` marker blocks
(`my-workflows:easy-always` / `gate-always`) are migrated automatically by the new
`*-always` commands. Old `ultimate`/`ultimate-f5` presets in `models.yml` are detected
by `/oh-my-gjc:presets`, which offers to clean them up.

## Build your own / contribute

See **[AGENTS.md](./AGENTS.md)** for the plugin format, schema, conventions, and
per-plugin notes (also used by AI agents working in this repo).

## License

MIT — see [LICENSE](./LICENSE).
