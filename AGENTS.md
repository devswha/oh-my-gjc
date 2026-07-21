# AGENTS.md — working in oh-my-gjc

Agent-facing guide for `oh-my-gjc`, a **plugin marketplace** for Gajae Code (`gjc`).
Read this before adding or editing plugins. Human-facing intro lives in [README.md](./README.md).

## What this repo is

A single git repo that catalogs installable `gjc` plugins. One `marketplace.json`
lists every plugin; each plugin is one directory under `plugins/`. The format is
compatible with the Claude Code / Codex plugin spec.

Plugins install from the **shell CLI** — `gjc plugin install <name>@<marketplace> …`
(TARGETS is plural: install several in one command; `--scope user` is the default,
`--scope project` pins to a repo; `gjc plugin marketplace add <ref>` registers a
catalog; `gjc plugin list` shows installed). **Plugin management is shell-CLI only — gjc has NO `/plugin` slash command** (verified against the core slash registry + live new-user repro 2026-07-08: `gjc plugin marketplace add`/`install`/`list` all rc=0). A `/plugin …` line typed inside a `gjc` session is just a chat message, not a command, so all install/uninstall/marketplace steps must run in a terminal. The registry lives at `~/.gjc/plugins/installed_plugins.json`. (`/plugin` slash is Claude-Code syntax — do NOT put it in gjc install docs.)

## Setup / Environment

### gjc
- Install gjc, then sign in to model providers via OAuth (Claude / OpenAI Codex / Kimi — no API key needed). Model presets:
  - `gjc --mpreset claude-max` — highest quality
  - `gjc --mpreset kimi` — cheaper worker / parallel
- **API keys** (web search, Gemini, etc.) must live in a **trusted location**, NOT the project `cwd/.env` (gjc ignores cwd `.env` for credentials). Copy the template and symlink it into your gjc home:
  ```sh
  cp .env.example .env                 # then fill in keys
  ln -sf "$(pwd)/.env" ~/.gjc/.env     # run once from the repo root
  ```
  Credential precedence: live env → `~/.gjc/agent/.env` → `~/.gjc/.env` → `~/.env`.
- **Web search:** `gjc config set providers.webSearch exa` (fallback: duckduckgo). Full key list (Exa/Tavily/Gemini/…) is in [`.env.example`](./.env.example).

### Capability prerequisites (single `oh-my-gjc` suite)
- `insane-review`: ChatGPT subscription + a Chromium-family browser on CDP `:9222` logged into chatgpt.com.
- `adaptive-response`, `no-english`, `extragoal`, and the `example-plugin` template: no external prerequisites. `preset-pack` requires logged-in anthropic + openai-codex + kimi-code providers for its activation smoke. `multi-harness-research` requires Linux user namespaces, executable `bwrap`, its trusted private user-scope runtime binding, supported exact credential-file layouts, and existing GJC/Codex/Claude logins; it neither installs nor logs in to a provider.

## Layout

```
oh-my-gjc/
├── .claude-plugin/
│   └── marketplace.json          # catalog: every plugin is registered here
├── plugins/
│   └── <plugin>/
│       ├── .claude-plugin/plugin.json   # manifest
│       ├── commands/<file>.md           # slash commands → /<plugin>:<file>  (generic convention — see note)
│       ├── agents/<file>.md             # sub-agents
│       ├── skills/<name>/SKILL.md       # skills
│       ├── hooks/hooks.json             # hooks
│       ├── .mcp.json                    # MCP servers
├── README.md                     # simple human intro
└── AGENTS.md                     # this file
```

> ⚠ `commands/` is the *generic* Claude-Code convention. In THIS repo the `oh-my-gjc` suite keeps its
> command bodies in `templates/` (a non-convention dir) because GJC 0.11 marketplace commands are
> exposed under the wrong `oh-my-gjc:*` namespace; `bin/install-skill.sh` installs `/omg:*` natively.

Content is discovered by **convention directories** above; explicit paths in
`plugin.json` are optional overrides.

## Add a plugin (procedure)

1. Create `plugins/<plugin>/.claude-plugin/plugin.json`.
2. Add content in convention dirs (`skills/<name>/SKILL.md`, `agents/`, `hooks/`, `.mcp.json`). Command bodies for the `oh-my-gjc` suite go in `templates/<name>.md` (NOT `commands/` — see the Layout note); a standalone plugin may use `commands/` but then gets the `<plugin>:<name>` namespace.
3. Register it in `.claude-plugin/marketplace.json` under `plugins`:
   ```json
   { "name": "<plugin>", "source": "./plugins/<plugin>", "version": "0.1.0", "description": "…", "category": "…" }
   ```
4. Add `plugins/<plugin>/README.md` with usage, prerequisites, and safety notes.

`source` may also point off-repo: `{ "repo": "owner/repo" }`, `{ "url": "https://…" }`, or `{ "package": "npm-pkg" }`.

## Conventions agents MUST follow

- **Match the existing shape.** New manifests/commands/skills must mirror the
  existing `oh-my-gjc` / `example-plugin` structure (same `plugin.json` fields,
  YAML frontmatter on command bodies — `templates/*.md` in the suite — and `SKILL.md`). No parallel conventions.
- **Name parity.** `marketplace.json` entry `name` == `plugin.json` `name` == the
  `plugins/<name>/` directory. `source` must be `./plugins/<name>`.
- **Lowercase-hyphen names** for plugins and skills.
- **Register every new plugin** in `marketplace.json`, and keep the entry list
  formatting consistent with siblings.
  **Exception (single-suite policy, 0.8.0+):** new gjc-facing capabilities merge into
  `plugins/oh-my-gjc` (the one exposed marketplace entry) instead of adding a new entry;
  `example-plugin` stays intentionally unregistered as a copy-me template (Gate A decision).
- **Skill `description`** is the activation trigger — make it specific and include
  the phrases that should load the skill.
- **Never commit secrets.** `.env`/`.env.*` are gitignored (`!.env.example` is the
  only tracked one and MUST contain placeholders, never real keys). Runtime state
  under `.gjc/` is gitignored.
- **Document the real install paths** (verified): plugin management is the **shell CLI only** — `gjc plugin marketplace add <ref>` then `gjc plugin install <name>@<marketplace> …` (batch-capable), `gjc plugin list`. gjc has **no `/plugin` slash command** (Claude-Code syntax; a `/plugin …` line in a gjc session is just a chat message). Never write `/plugin …` in gjc install docs.

## Per-plugin notes

> **Note (0.8.0 단일 스위트):** marketplace에 노출되는 plugin은 `oh-my-gjc` 하나뿐이다. 아래 절들은
> 통합 전 plugin 이름을 유지한 **capability 단위 노트**다. 제거된 capability는 `(REMOVED …)` 묘비 절로만 남는다.
> 파일은 전부 `plugins/oh-my-gjc/` 안에 있다.

### `codex-cli-control` (REMOVED in 0.12.0)
- 관제탑 발주·하코 승인(2026-07-13)으로 제거: skill `codex-cli-ask` + command `/omg:codex-ask` 명시 호출 0회 — 로컬 Codex 트래픽은 전량 제품 파이프라인(patina·flask)의 `codex exec` 직결로 스킬을 경유하지 않음. 업그레이드 시 `install-skill.sh`의 `cleanup_removed`가 네이티브 잔존물(`omg:codex-ask.md`, skill dir)을 청소한다. 과거 상세·보안계약은 git 히스토리(≤0.11.0)의 skills/codex-cli-ask/SKILL.md 참조.

### `codex-deepwork` (REMOVED in 0.11.0)
- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 실사용 0회(자기시험 제외 전 세션 로그 집계) + `lazycodex`와 기능 중복. 파일-쓰기 자율 위임은 당시 `/omg:lazycodex-work` 소관이었으나 lazycodex도 0.12.0에서 제거됨 — 현재는 gjc 네이티브 워크플로(team/ultragoal) 소관. 업그레이드 시 `install-skill.sh`의 `cleanup_removed`가 네이티브 잔존물(`omg:codex-run.md`, skill dir)을 청소한다.

### `lazycodex` (REMOVED in 0.12.0)
- 관제탑 발주·하코 승인(2026-07-13)으로 제거: `/omg:lazycodex-setup`·`/omg:lazycodex-work` 하니스 발원 세션 7월 0건. 파일-쓰기 자율 위임 수요는 gjc 네이티브 워크플로(team/ultragoal)로 충족. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`omg:lazycodex-setup.md`·`omg:lazycodex-work.md`, skill dir)을 청소한다. 과거 상세는 git 히스토리(≤0.11.0)의 skills/lazycodex/SKILL.md 참조.

### `time-left` and `lazycodex-gjc` (REMOVED in 0.25.0)
- **User rationale:** ETA could not provide usable measurement; `lazycodex-gjc` had no usable Codex authentication/tokens, while GJC native workflows and multi-harness cover delegation. The associated `tools/sdk-lab` source is retired with `time-left`.
- **Upgrade boundary:** cleanup removes only the suite-owned native skill, command, runtime, and receipt. It never removes credentials, `~/.codex`, `models.yml`, user LazyCodex/OMO, or other runtimes.

### `codex-app-control` (REMOVED in 0.11.0)
- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 대상 Codex 데스크톱 앱 빌드 트랙이 07-03 아카이브(codex-wrapper-build)로 폐기됐고, GPT Pro 리뷰 용도는 `insane-review`(자체 엔진, codex-app 의존성 없음)가 전담. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물을 청소한다. 과거 라이브 검증 레시피는 git 히스토리(≤0.10.0)의 skills/codex-app-*/SKILL.md 참조.

### `insane-review` (CLI pack pipeline verified; CDP path deferred)
- Command `/omg:insane-review` + a native-installable skill (`skills/insane-review/SKILL.md`). Faithful port of `fivetaku/insane-review`. gjc scopes the complete relevant file set → repomix packs it (full code, line numbers, secretlint, packed-file audit) → drives the **logged-in ChatGPT web session over CDP** → selects+**verifies** GPT-5.6 Sol Pro (fail-closed) → harvests the review to the current project's `.insane-review/response_*.md`. Zero API cost (runs on the user's ChatGPT subscription). Also a web-only `agent-council` member via `--council` (see `references/council-setup.md`).
- **Native install required — WHY (history + current):** on gjc 0.8.2 (`main` & `dev`, verified then) gjc surfaced NEITHER plugin skills NOR plugin commands as first-class: (1) the skill registry dropped non-native skills (`skills.ts`: `if (provider !== "native") return false`); (2) the marketplace slash-command provider (`discovery/claude-plugins.ts`) was never registered because `discovery/index.ts` omitted `import "./claude-plugins"`, so a plugin's `commands/*.md` were not advertised as `/<plugin>:<command>` in ANY session (proven via ACP `available_commands_update`: zero marketplace-plugin commands, only builtins + native `skill:*`). **Current state (gjc 0.9.x): plugin `commands/*.md` ARE auto-exposed — but under the wrong `<plugin>:<name>` namespace — while plugin skills still don't surface** (see the `oh-my-gjc` core section below); native install stays REQUIRED either way. `bin/install-skill.sh` copies SKILL.md into `~/.gjc/agent/skills/insane-review/` (user) or `<cwd>/.gjc/skills/` (project) and installs canonical commands from `templates/` as `~/.gjc/agent/commands/omg:<name>.md` (the filename IS the native command name; the 0.8.0-era deprecation tombstones were dropped in 0.8.1). Applies to every marketplace plugin, not just this one.
- **Engine kept byte-for-byte** (`bin/pack_and_ask.py`, Playwright-based, cross-platform). The gjc port only rewrote the shell: skill/command adapted to gjc terms + the `ask` tool onboarding, and the Claude-Code `setup/` (GitHub-star prompt + `~/.claude/settings.json` SessionStart update hook) was **dropped**. Do not reimplement the engine flow with gjc's `browser` tool — the hardened engine is more robust.
- **Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in gjc command/skill bodies. Each native install writes one exact private mode-`0600` suite-root binding: project `<cwd>/.gjc/runtimes/oh-my-gjc/root`, then user `~/.gjc/agent/runtimes/oh-my-gjc/root`. Asset consumers validate its single absolute canonical root and required non-symlink asset, resolve project first then user, and use the direct `plugins/oh-my-gjc/` checkout fallback only when neither binding exists. Missing or malformed binding fails closed; bootstrap, upgrade, and repair rerun hardened root `install.sh`, never a cache selection.
- **Security contract (do not weaken):** repomix secretlint forced on (a local repomix config disabling it aborts the run); fail-closed on unverified model / unattached pack / truncated prompt / timeout / empty response (no partial save); `--require-model` must accompany `--model`; output files `chmod 600`. Prompting Pro ships relevant code to an external web service — personal subscription use only (not OpenAI-endorsed).
- **Prerequisites (manual):** Python `playwright`+`pyperclip` (`--check-env --install`), Node/`npx` (repomix auto via `npx -y`), and a Chromium-family browser on CDP `:9222` with a **dedicated profile** logged into chatgpt.com + GPT-5.6 Sol Pro selected. Login can't be automated.
- **Verified here (2026-07):** engine AST/`--help`/`--list-browsers`/`--check-env` on Linux; `--pack-only` end-to-end via `npx repomix@1.15.0` (packed-file audit + token count). The former cache-glob simulated-install check is historical, non-executable evidence only; current installs bind the exact suite root. CDP→ChatGPT harvest needs a logged-in Pro session and is deferred-environment.
- Non-Goals: GPT-5.6 Sol Pro API (doesn't exist), auto-login, engine reimplementation on gjc `browser`. (읽기 전용 로컬 CLI Q&A capability는 0.12.0에서 제거됨.)

### `multivendor-presets` (REMOVED after v0.17.1) → superseded by `preset-pack` (v0.22.0)
- 하코 direct order (2026-07-15): 커스텀 프리셋보다 GJC 기본/내장 프리셋을 사용한다. 스킬, `/omg:presets`, `references/presets.yml`, 설치 시 `sol` 자동 병합을 제거했다.
- 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`skills/multivendor-presets/`, `omg:presets.md`)만 청소한다. 기존 사용자 `models.yml`과 과거 병합된 `sol` 프로필은 사용자 설정이므로 자동 삭제·수정하지 않는다.
- **하코 direct order (2026-07-19) 부분 번복:** 검증된 최종 좌석표에 한해 커스텀 프리셋 배포를 재도입한다 — `preset-pack` 스킬 + `/omg:preset-pack`. 구 multivendor-presets와의 결정적 차이: **설치 스크립트는 여전히 models.yml을 절대 건드리지 않고**, 병합은 명시적 커맨드 호출 시에만, 백업 후, 이름 단위로만 일어난다. 정본은 `references/preset-pack.yml` 하나다. 같은 브랜치에 함께 있던 측정 전용 `preset-fit` 스킬은 릴리스 전 드롭됨(하코 2026-07-19 "어차피 daily면 된다" — 미출시라 묘비·cleanup 불요, 이력은 git `586e181`). **v2(2026-07-20 하코 확정): 프리셋은 `daily`(사람)+`agent`(무인) 2개로 수렴** — v1의 `deep`(daily effort 변형, 실사용 0)·`sec`(클램프 복구 전용)는 폐지, 복구 경로는 `--mpreset agent` resume이 대체.

### `release-gate` (REMOVED after v0.17.1)
- 하코 direct order (2026-07-15): 공개 플러그인 기능이 아니라 이 저장소의 릴리스 운영 규칙에 가깝고, 검증은 일반 테스트 절차·외부 리뷰는 `extragoal`과 중복되어 제거했다.
- 스킬과 `/omg:release`는 제거하지만 아래 **Release rules**는 이 저장소의 강제 규칙으로 유지한다(2026-07-19 자율화 개편 반영). 업그레이드는 네이티브 잔존물만 청소한다.

### Public capability prune (REMOVED after v0.17.1)
- `easy-answer`, `plain-layer`, and `branch-flow` were removed as redundant UX/policy layers; use concise direct answers and GJC native deep-interview/ralplan/team plus each repository's own `AGENTS.md`.
- The public `gjc-bugwatch` skill and `/omg:bugwatch-scan` were removed; the repository-owned collector and `ops/gjc-bugwatch/` automation remain internal operations tooling.
- Upgrade cleanup removes retired native skills/commands and retired `easy-always` marker blocks after backing up affected user files. It never modifies `models.yml`.

### `session-observer` (REMOVED in 0.23.0)
- 하코 직접 지시(2026-07-19, v0.22.0 출시 당일): "session-observer 삭제해" — 토큰-프리 관찰 수요는 터미널에서 세션 JSONL 직접 tail/tmux로 충분해 전용 스킬을 유지하지 않는다.
- 스킬·커맨드·러너(`bin/session-observer.ts`)·테스트 제거. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`skills/session-observer/`, `omg:session-observer.md`)을 청소한다. 과거 상세·경계는 git 히스토리(v0.22.0)의 skills/session-observer/SKILL.md 참조.

### `fable` (REMOVED in v0.26.0)
- Direct user removal: the current Fable audit and its Opus fallback both stalled without a report. Native cross-session review and `insane-review` remain.
- Upgrade cleanup removes only the native `omg:fable.md`; `claude-fable-5` model preset references are unrelated and remain.

### `oh-my-gjc` (core — absorbed my-workflows v0.3)
- **The current focused suite has 7 skills and 9 commands.** Skills: `adaptive-response`, `no-english`, `extragoal`, `insane-review`, confirmation-gated `deep-onboarding`, explicit-install `preset-pack`, and explicit-only `multi-harness-research`. Commands: bare `/omg` plus `/omg:setup`, `/omg:gate`, `/omg:gate-always`, `/omg:no-english`, `/omg:insane-review`, `/omg:deep-onboarding`, `/omg:preset-pack`, and `/omg:multi-harness`. The two presentation skills and multi-harness research never auto-activate from ordinary natural language; only their explicit commands may load them.
- **Native install is REQUIRED:** canonical command bodies remain in `templates/`; the hardened one-shot installer copies all 7 skills and 9 commands, removes explicitly retired suite-owned native surfaces, stages the separate private multi-harness runtime/binding when its prerequisites are available, and emits the suite-root binding.
- **One-shot install:** root `install.sh` performs marketplace add/update → plugin install → native install. No optional plugin arguments.
- **GJC 0.11 plugin boundary:** `gajae-plugin.json` now routes a source through GJC's native bundle installer before marketplace/npm classification, but native bundles intentionally forbid top-level `skills`, `commands`, and `agents`; they may only extend the four built-in workflows/role agents with subskills, tools, hooks, MCPs, and appendices. OMG's independent trigger skills and `/omg:*` commands therefore still require `templates/` + `install-skill.sh`.
- **Deep onboarding boundary:** `/omg:deep-onboarding` first analyzes the target repository read-only, then interviews one material ambiguity at a time. It previews a project map, ADR proposals, and handoff, and writes those three Markdown outputs only after the user explicitly confirms one safe output directory. A command argument is only a proposal, never confirmation; it never silently writes into the analyzed repository or overwrites existing files.
- **Adaptive response semaphore:** `/omg:gate` explicitly applies `adaptive-response` as a session-local, domain-specific presentation layer plus gate briefing; `/omg:gate-always` persists only that reconstruction procedure in its marker block inside user-global `~/.gjc/agent/SYSTEM.md`. It never auto-activates from ordinary conversation or a pending gate. It MUST NOT persist inferred persona data, scan arbitrary home/other-repo/browser/private-memory sources, infer sensitive identity traits, transfer expertise across domains, or lower correctness/safety/warnings/approval boundaries. The command backs up before mutation and preserves all bytes outside its marker. Legacy gate blocks in `AGENTS.md` migrate on command use. Installer upgrades separately remove only retired `easy-always` blocks after backup. A project `.gjc/SYSTEM.md` overrides the user file for that repository.
- **Preset-pack boundary:** `/omg:preset-pack [install|status|remove]` merges only the curated `daily`/`agent` profiles from the single canonical `references/preset-pack.yml` (resolved via the suite-root binding, fail-closed when missing) into user `~/.gjc/agent/models.yml` — explicit invocation only, backup before mutation, name-scoped merge, all other profiles and top-level keys untouched, then YAML parse + per-preset activation smoke. Retired v1 `deep`/`sec` blocks are cleaned up only when parse-equal to the shipped `retired_v1_profiles` fixture in the canonical yml, never when user-modified; a canonical file without the fixture skips cleanup (fail-closed). It MUST NOT auto-activate from ordinary conversation, run from the installer, edit `config.yml`, or activate a preset itself. Seat maps: `daily`(human) = fable-5:medium default, k3:high planner (ralplan-contract verification pending — fall back to sol:high on misbehavior), terra:xhigh executor, opus medium/high review seats; `agent`(unattended) = sol:medium default + sol:high planner (Codex-quota main, clamp-free — production OpenAI ↔ review Anthropic), same executor/review seats. `agent` doubles as the fable-clamp recovery preset: resume a clamped-dead session under `--mpreset agent`. The builtin `opus-codex` profile is NOT a substitute for `agent` (its real mapping is opus-4-8:xhigh default + terra:low executor — conversational design that devours the Claude window unattended).
- **No-English presentation:** `/omg:no-english [on|off|status]` explicitly controls `no-english` for the current session only; ordinary Korean conversation and natural-language language requests do not activate it. It reduces unnecessary English mixing only in Korean responses and preserves code identifiers, commands, paths, API/protocol names, exact labels, logs, and quotations. It MUST NOT translate away evidence, uncertainty, warnings, or approval boundaries. `adaptive-response` owns depth/format while `no-english` owns language choice, so neither overrides the other's safety contract.
- **`extragoal` skill (v0.4, 2026-07-08):** ultragoal + external final review gate. Reviewer lanes are native cross-session gjc and `insane-review` under an AND-gate. Missing/malformed/timeout verdicts fail closed; secret scanning is mandatory on egress.
- **Multi-harness research boundary:** `/omg:multi-harness` / explicit `multi-harness-research` is the only activation path. With no argument, the current GJC leader previews one sentence of goal, questions, and expected output and receives confirmation. A dedicated direct orchestrator—not `gjc team`, a worker, or a fifth synthesis model—hashes one normalized task plus the identical safety/output suffix and sends it only in this order: `gjc-opus` (GJC 0.11.x `anthropic/claude-opus-4-8`, `--thinking max`), `gjc-sol` (GJC 0.11.x `openai-codex/gpt-5.6-sol`, `--thinking xhigh`), `codex-sol` (`gpt-5.6-sol`, `model_reasoning_effort="xhigh"`, `exec --ephemeral`), and `claude-ultracode` (`-p --no-session-persistence --effort ultracode`). There is no fallback, selector/effort substitution, winner/majority/vote/consensus/ranking/recommendation/final verdict, install/update/migrate/setup/login action, or OMO prompt.
- **Multi-harness enforced isolation:** Linux `bwrap` mounts the canonical target read-only, shields target `.gjc` and mutable Git state, and gives each lane private HOME/XDG/TMP. GJC/Claude receive only workspace read/search/find plus provider-native public web; built-in Bash, write/edit/notebook, browser automation, MCP, hooks, extensions, skills, and rules are unavailable. Codex has a strict read-only profile, provider-native web only, disabled shell networking, and no user rules/config. The exact credential table has only one verified read-only regular leaf per provider: `${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json` for both GJC lanes, `${CODEX_HOME:-$HOME/.codex}/auth.json` for Codex, and `$HOME/.claude/.credentials.json` for Claude. Never bind a parent auth directory, HOME, alternate file, token environment value, or mutable auth state; unsupported layouts/auth/selectors fail preflight.
- **Multi-harness artifacts and outcome:** only orchestrator/finalizer write `${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gjc/multi-harness/<repo-id>/<run-id>/`; all run directories are `0700`, files are `0600`, and publication is no-follow, exclusive, same-directory atomic. All lanes reach terminal state before phase 1 seals factual lane facts, ledger, and a `comparison_status: pending` base. `COMPLETE`/`0` means four valid documents; `INCOMPLETE`/`10` preserves successful peers amid lane failure; no valid document or run-fatal is `1`. The current GJC leader reads only successful documents and supplies bounded, non-authoritative commonalities/differences plus uncertainty. The no-model phase-2 finalizer rechecks its one-use receipt, nonce, digest, descriptor identity, and immutable facts before replacing only the comparison placeholder. `FINALIZATION_FAILED`/`20` is separate and never changes phase-1 lane facts, artifacts, or exit. Uninstall removes only owned surfaces/runtime; it MUST preserve XDG research artifacts and auth/config. The current live Codex OAuth result is `pending-environment (401)`, not a passed live lane; never automate login or replace it with fixture success.
- **⚠ Ephemeral gjc harness runs MUST disable both notifications and SDK hosting.** Every throwaway `gjc -p` verify/audit/test invocation (external review, preset smoke, multi-harness GJC lanes, or a `/tmp` clone) MUST be prefixed with `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`. In GJC 0.11 the canonical SDK v3 loopback bus publishes `.gjc/state/sdk/<id>.json` independently of managed notifications; disabling notifications alone does not suppress that endpoint. User working sessions keep both surfaces available — this rule applies only to disposable harness runs.
- Non-Goals: reimplementing gjc-native workflows (team/ultragoal/ralplan/deep-interview), vendor auto-login, or auto-merging preset copies at install time (curated presets ship only through explicit `/omg:preset-pack` — 하코 2026-07-19).

### `gjc-bugwatch` public surface (REMOVED after v0.17.1)
- The trigger skill and `/omg:bugwatch-scan` command are retired. `bin/collect.ts`, `bin/follow.ts`, their tests, and `ops/gjc-bugwatch/` remain repository-owned operations tooling, not installed public capability.
- Internal automation remains drafts-only/read-only with redaction and no automatic issue/PR creation. Human-directed upstream PRs target `Yeachan-Heo/gajae-code` base `dev`. **의도적 유지(2026-07-19):** 상류 PR의 human 승인 게이트는 제3자 저장소에 하코 명의로 기여하는 외부 신원 경계라, 본 저장소 릴리스 자율화(승인 게이트 폐지)와 별개로 유지한다.


### `gajae-app` (REMOVED in 0.14.0)
- Native upgrade cleanup removes only `~/.gjc/agent/skills/gajae-app/` and `~/.gjc/agent/commands/omg:gajae-app.md`; it does not delete or modify any claudecodeui checkout, build output, data, or user service.
- Target repository and self-host documentation: [devswha/claudecodeui SELF-HOST](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Historical release evidence: the `feat/gjc-provider` v0.2.0 release passed verification, extragoal cross-review, and 하코 approval.

### `tower` (REMOVED in 0.12.0)
- 관제탑 발주·하코 승인(2026-07-13)으로 제거: skill `tower` + command `/omg:tower-setup` 미사용 — 실관제탑(horcrux)은 자체 스크립트 구현으로 돌아 이 번들 tower를 경유하지 않음. skill/command와 함께 전용 orphan 파일(`bin/session_watch.py`·`bin/tower-notify.sh`·`bin/queue_store.py`·`bin/tower` CLI·`references/tower.config.example.json`)도 제거. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`omg:tower-setup.md`, skill dir)을 청소한다. 과거 상세·검증 레시피는 git 히스토리(≤0.11.0)의 skills/tower/SKILL.md + bin/tower-notify.sh 참조. (gjc-bugwatch가 쓰는 `TOWER_URL` HTTP 큐는 외부 horcrux 관제탑 서버로 본 번들과 무관.)

### `example-plugin`
- Reference template: one command + one skill. Copy to bootstrap a new plugin.

## Git autonomy (effective 2026-07-15, 하코 mandate; 확장 2026-07-19)

- After completion criteria, focused verification, and any required independent review pass, the agent **MUST commit its own completed work to the current work branch and push it to that branch's remote without waiting for per-change approval**.
- Stage only the intended task diff. Never absorb, revert, stash, or rewrite unrelated user work. Never force-push.
- **2026-07-19 하코 direct order ("승인해야 하는 것들 전부 제거"): 발행도 자율이다.** Merging to `main`, tagging, and publishing GitHub Releases require no human approval — only the release verification below.
- Report the pushed commit and verification evidence to the control tower as `kind=report` (통보 목적, 승인 요청 아님).

## Release rules (자율 릴리스 — 2026-07-19 하코 지시로 승인 게이트 전면 폐지)

> 2026-07-19 하코 direct order: "쓸데없는 규칙이랑 내가 승인해야 하는 것들 전부 제거."
> 구 3-게이트 체제(하코 승인 게이트·관제탑 승인 큐·1일 1릴리스 빈도 캡·재서명 규정)는 폐지됐다.
> 남는 것은 증거 기반 검증뿐이다. 과거 체제의 전문은 git 히스토리(≤v0.23.0 시점 AGENTS.md) 참조.

A release to `main` (dev→main merge + tag + GitHub Release) requires only:

1. **Verification (mandatory, fail-closed).** JSON parse, `bash -n`/`py_compile` where relevant, relevant `bun test`/unittest suites, **new-install reproduction with rc evidence** (isolated HOME), and a `gitleaks` scan of the release range. Record the evidence in `docs/verification/`.
2. **Cross-review (recommended, not blocking).** A fresh-context cross-family review of the release diff (`GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc -p --no-session --model openai-codex/gpt-5.5:xhigh --tools read,search,find …`) is the house dogfood lane — run it when the diff touches behavior or safety contracts; a REQUEST_CHANGES verdict is fixed forward before publish, but skipping the lane for trivial docs-only diffs is allowed and noted in evidence.
3. **Publish + report.** Merge, tag, publish, then send one control-tower `report` line (version, candidate hash, evidence path). Reports inform; they never gate.

No approval boundaries, no frequency caps, no sign-off counters. Never fake evidence — a verification step that cannot run in the current environment is recorded as pending-environment, not skipped silently.

**Rollback (fix-forward, unchanged):** a bad release is rolled back **fix-forward on git**, never by deleting history: `git revert` on `dev` (or revert the release merge on `main` for a broken-install emergency), re-verify, publish `vX.Y.Z+1`. Tags/Releases are never deleted or force-moved — a superseded release gets a "superseded by vX.Y.Z+1" note in its GitHub Release body. Installed users recover by re-running the one-shot installer.

## Verification expectations

Before considering a plugin change done:
- **Static (always):** `marketplace.json` and `plugin.json` parse as JSON; convention
  files exist at expected paths; `marketplace` entry name/source match the manifest.
- **Behavioral (when the surface is reachable):** exercise the actual surface. The
  hardened root `install.sh` path (in an isolated HOME) and relevant `bun test` suites
  run anywhere; insane-review's CDP→ChatGPT harvest needs a logged-in Pro browser
  session and is otherwise deferred-environment.
- Never fake live evidence. If a surface cannot be exercised in the current
  environment, mark it pending-environment and say so explicitly.


## Schema reference

### `.claude-plugin/marketplace.json`
| field | required | notes |
|-------|----------|-------|
| `name` | yes | lowercase letters, digits, hyphens; matches the registered marketplace name |
| `owner` | yes | object; `owner.name` required |
| `metadata` | no | free-form `{ description, version, … }` |
| `plugins` | yes | array of plugin entries |
| `plugins[].name` | yes | lowercase letters, digits, hyphens |
| `plugins[].source` | yes | string starting with `./` **or** object with `path` / `repo` / `url` / `package` |
| `plugins[].version` / `.description` / `.category` | no | catalog display + pinning |

### `plugins/<name>/.claude-plugin/plugin.json`
| field | required | notes |
|-------|----------|-------|
| `name` | yes | lowercase letters, digits, hyphens |
| `version` | recommended | semver |
| `description` | recommended | shown in `/plugin` listings |
| `author` | no | `{ name, email, url }` |
| `homepage` / `repository` / `license` / `keywords` / `category` | no | metadata |
| `commands` / `agents` / `skills` / `hooks` / `mcpServers` | no | explicit paths; omit to use convention dirs |

## G1 컨텍스트 (자산 목표 — 작업 우선순위 기준)

> 정본: `~/workspace/horcrux/agent/G1-CONTEXT.md` — **작업 시작 전 한 번 읽을 것.**
> 목표: 자산 1억 / 2026-12-31. 이 레포의 역할: **도구 — 단기 수익화 대상 아님. G1 직결 작업(patina 출시·magi-stock) 대비 시간 배분 후순위.**
> 공통 규칙: 비슷한 가치면 매출/수익에 가까운 작업 먼저. 완성도 < 출시/과금 경로.
