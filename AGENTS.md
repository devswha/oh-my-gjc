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
- `lazycodex-gjc`: already installed and logged-in Codex CLI + LazyCodex/OMO; the suite never installs or logs in to them. Codex is NOT required to install the suite: `install-skill.sh all user` skips only the runtime binding when Codex/systemd/Codex-home are absent (bridge stays fail-closed disabled); after installing Codex, re-run `install-skill.sh lazycodex-gjc user`.
- Everything else (easy-answer, gate-briefing, plain-layer, presets, branch-flow, extragoal, fable, gjc-bugwatch) + the `example-plugin` template: no external prerequisites (branch-flow/worktree need a git repo; fable needs Fable 5 model access; plain-layer needs GJC ≥0.10.1 with deep-interview --write).

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
│       └── .mcp.json                    # MCP servers
├── tools/                        # repo tooling (e.g. discord-notify-bridge.ts)
├── README.md                     # simple human intro
└── AGENTS.md                     # this file
```

> ⚠ `commands/` is the *generic* Claude-Code convention. In THIS repo the `oh-my-gjc` suite keeps its
> command bodies in `templates/` (a non-convention dir) so gjc 0.9.x cannot auto-expose a duplicate
> wrongly-namespaced `oh-my-gjc:*` surface; `bin/install-skill.sh` installs them natively as `/omg:*`.

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

### `lazycodex-gjc` (v0.15.0 distinct isolated bridge)
- This does **not** restore the removed `lazycodex` setup/work surface. `/omg:lazycodex-gjc` synchronously launches the already installed Codex+LazyCodex/OMO as an external `codex exec --ephemeral` worker; it never installs, updates, migrates, sets up, or logs in to those tools.
- **Isolation/authority contract:** default `read-only`; use `workspace-write` only when the current user request explicitly authorizes mutation of the named target repository. Never create a child GJC session/task/goal/team, mutate GJC config or credentials, or copy GJC credentials into the worker.
- **Runner trust + permission contract:** only the canonical user-scope runtime binding may execute, after owner/canonical-path checks and verification against the mode-0600 SHA-256 runtime binding (`~/.gjc/agent/runtimes/lazycodex-gjc/binding`) generated by native user install. Project-scope suite installs remain supported, but cannot authorize this sensitive bridge. The runner verifies a compatible OMO 4.x ultrawork capability (minimum 4.18.0) before spawn, embeds the validated directive, then uses a custom Codex permission profile exposing only the authorized cwd, exact Codex runtime helpers, and private tmp. User config/rules, web search, MCP/apps/hooks/browser egress, inherited child shell environment, and raw child stderr relay stay disabled. The trust walk rejects group/other-writable components on every binding-pinned path (node interpreter included), so native user install normalizes self-owned pinned paths (`chmod g-w,o-w`; umask-002/UPG systems would otherwise fail closed at runtime with exit 78) and fails the install with the offending path when normalization is impossible — never weaken the runtime check itself. `all user` installs without Codex/systemd/Codex-home skip AND remove the runtime binding (bridge disabled fail-closed) instead of failing the suite.
- **Provenance contract:** `ops/verify/record_provenance.py` must hash all three independently mutable surfaces — `bin/lazycodex-gjc.mjs`, `skills/lazycodex-gjc/SKILL.md`, and `templates/lazycodex-gjc.md` — so release verification fails closed on runner/skill/template drift.

### `codex-app-control` (REMOVED in 0.11.0)
- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 대상 Codex 데스크톱 앱 빌드 트랙이 07-03 아카이브(codex-wrapper-build)로 폐기됐고, GPT Pro 리뷰 용도는 `insane-review`(자체 엔진, codex-app 의존성 없음)가 전담. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물을 청소한다. 과거 라이브 검증 레시피는 git 히스토리(≤0.10.0)의 skills/codex-app-*/SKILL.md 참조.

### `insane-review` (CLI pack pipeline verified; CDP path deferred)
- Command `/omg:insane-review` + a native-installable skill (`skills/insane-review/SKILL.md`). Faithful port of `fivetaku/insane-review`. gjc scopes the complete relevant file set → repomix packs it (full code, line numbers, secretlint, packed-file audit) → drives the **logged-in ChatGPT web session over CDP** → selects+**verifies** GPT-5.6 Sol Pro (fail-closed) → harvests the review to the current project's `.insane-review/response_*.md`. Zero API cost (runs on the user's ChatGPT subscription). Also a web-only `agent-council` member via `--council` (see `references/council-setup.md`).
- **Native install required — WHY (history + current):** on gjc 0.8.2 (`main` & `dev`, verified then) gjc surfaced NEITHER plugin skills NOR plugin commands as first-class: (1) the skill registry dropped non-native skills (`skills.ts`: `if (provider !== "native") return false`); (2) the marketplace slash-command provider (`discovery/claude-plugins.ts`) was never registered because `discovery/index.ts` omitted `import "./claude-plugins"`, so a plugin's `commands/*.md` were not advertised as `/<plugin>:<command>` in ANY session (proven via ACP `available_commands_update`: zero marketplace-plugin commands, only builtins + native `skill:*`). **Current state (gjc 0.9.x): plugin `commands/*.md` ARE auto-exposed — but under the wrong `<plugin>:<name>` namespace — while plugin skills still don't surface** (see the `oh-my-gjc` core section below); native install stays REQUIRED either way. `bin/install-skill.sh` copies SKILL.md into `~/.gjc/agent/skills/insane-review/` (user) or `<cwd>/.gjc/skills/` (project) and installs canonical commands from `templates/` as `~/.gjc/agent/commands/omg:<name>.md` (the filename IS the native command name; the 0.8.0-era deprecation tombstones were dropped in 0.8.1). Applies to every marketplace plugin, not just this one.
- **Engine kept byte-for-byte** (`bin/pack_and_ask.py`, Playwright-based, cross-platform). The gjc port only rewrote the shell: skill/command adapted to gjc terms + the `ask` tool onboarding, and the Claude-Code `setup/` (GitHub-star prompt + `~/.claude/settings.json` SessionStart update hook) was **dropped**. Do not reimplement the engine flow with gjc's `browser` tool — the hardened engine is more robust.
- **Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in gjc command/skill bodies, so both docs resolve the engine into `$IR` via a glob (`~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/pack_and_ask.py`, with project-scope + repo-local fallbacks). Never invoke via `${CLAUDE_PLUGIN_ROOT}` in a gjc plugin.
- **Security contract (do not weaken):** repomix secretlint forced on (a local repomix config disabling it aborts the run); fail-closed on unverified model / unattached pack / truncated prompt / timeout / empty response (no partial save); `--require-model` must accompany `--model`; output files `chmod 600`. Prompting Pro ships relevant code to an external web service — personal subscription use only (not OpenAI-endorsed).
- **Prerequisites (manual):** Python `playwright`+`pyperclip` (`--check-env --install`), Node/`npx` (repomix auto via `npx -y`), and a Chromium-family browser on CDP `:9222` with a **dedicated profile** logged into chatgpt.com + GPT-5.6 Sol Pro selected. Login can't be automated.
- **Verified here (2026-07):** engine AST/`--help`/`--list-browsers`/`--check-env` on Linux; `$IR` glob resolution against a simulated install dir; `--pack-only` end-to-end via `npx repomix@1.15.0` (packed-file audit + token count). CDP→ChatGPT harvest needs a logged-in Pro session and is deferred-environment.
- Non-Goals: GPT-5.6 Sol Pro API (doesn't exist), auto-login, engine reimplementation on gjc `browser`. (읽기 전용 로컬 CLI Q&A capability는 0.12.0에서 제거됨.)

### `oh-my-gjc` (core — absorbed my-workflows v0.3 + multivendor-presets v0.2)
- **The v0.17.1 single-suite plugin (10 skills in one install).** Skills: `easy-answer` (plain-language final answers, accuracy-first), `gate-briefing` (domain-blind approval-gate briefing: layman translation → approval boundary → evidence-backed checklist → verdict; "명시 없음" rows ≥2 auto-forces 보류; never executes approve/reject on the user's behalf), `plain-layer` (session-scoped UX layer: choice translation + post-interview conversational spec polish + gate-briefing delegation via `/omg:plain`; does not reimplement native deep-interview/ralplan/ultragoal; no plain-always), `multivendor-presets` (name-scoped preset merge), `branch-flow` (per-repo dev-integration/main-release git discipline + git-worktree 병렬 세션 `/omg:worktree` new/list/clean: 폴더 `../<repo>-<slug>-wt`·브랜치 `<type>/<slug>` off `origin/dev`, clean은 머지완료+클린만·`--force` 금지; see below), `extragoal` (fresh-context cross-family final review gate), `insane-review` (GPT-5.6 Sol Pro web review), `gjc-bugwatch` (dogfooding bug collector), `lazycodex-gjc` (isolated external Codex+LazyCodex/OMO bridge; default read-only), and `release-gate` (3-gate release ceremony — verify → fresh-context cross-review VERDICT fail-closed ≤2 re-signs → human approval, agent never self-approves; generalized from this repo's own governance, proven on v0.15.1/v0.16.0 where it caught real blockers 3 releases straight). Commands: `/omg:setup` (idempotent; native skill+command install via `bin/install-skill.sh all`, legacy cleanup offers, env detection → prerequisite-feature availability hints), `easy`/`gate`/`plain` (session toggles / plain entry), `easy-always`/`gate-always`/`branchflow-always` (marker-block semaphores), `presets`, `fable` (Fable 5 adversarial safety audit of money/data/security-critical code — read-only invariant-breaking, not architecture review; scopes 3–6 files → defender-framed audit prompt → `gjc -p --model anthropic/claude-fable-5:xhigh` in background → mandatory spot-check of top findings against real code → gate-briefing-style verdict; Opus-4-8 fallback on Fable refusal/clamp; proven to catch a CRITICAL that 8-stage 3-vendor consensus missed), `lazycodex-gjc` (external `codex exec --ephemeral`; no child GJC session), and `release` (drives the 3-gate ceremony for the current repo).
- **Merge considered & REJECTED (2026-07-14, 하코 동의): easy-answer + gate-briefing + plain-layer 통합 안 함.** 근거: 셋은 중복이 아니라 3층 레이어(easy=전 답변 문체 / gate=승인 이벤트 계약 / plain=기획 워크플로, 승인 시 gate에 **위임**); 활성화 의미론 충돌(easy·gate는 `-always` 보유, plain은 의도적 no-always); gate-briefing의 계약(≥2 보류 강제·대행 금지)은 희석 금지; 합쳐도 커맨드 표면 불감소; description 만물상화로 트리거 정밀도 하락. easy-answer는 gate/plain과 문구 중복 0(드리프트 테스트 불요 — plain↔gate heading 일치는 기존 테스트가 커버). 재검토 조건: worktree→branch-flow 전례처럼 **실사용 데이터**(트리거 충돌 실측 또는 어느 한쪽 사용 0)가 잡혔을 때만.
- **Native install is REQUIRED, not optional**: gjc 0.9.x auto-exposes plugin commands under the wrong `oh-my-gjc:*` namespace while plugin skills do not surface, so canonical command bodies remain in `templates/` and the hardened one-shot `install.sh` copies 10 skills and 15 commands natively as `/omg:*`. The native installer is manifest-driven and fail-closed, and user-scope installs safely merge only the `sol` preset with backup, validation, and rollback. **Bootstrap, upgrade, and repair MUST run `install.sh`** (one-shot URL or a cloned checkout); never select a cache with `sort -V | tail -1` or invoke a cached `bin/install-skill.sh` directly, because newest-cache selection is not bound to the current plugin install and can execute stale payloads. Open a new session or `/move .` after installation.
- **`omg` command surface (single suite, 2026-07):** the sole canonical surface is `/omg:<name>` (bare `/omg` = catalog). `bin/install-skill.sh` installs each `templates/<name>.md` as `omg:<name>.md`; command bodies live in `templates/` (NOT `commands/`) precisely so gjc's plugin auto-registration produces **no** parallel `oh-my-gjc:*` command surface. **Verified isolated on gjc 0.9.2 (ACP `available_commands`):** plugin-install-only → `oh-my-gjc:*`=0; after native install → `omg:*` 17 + bare `/omg` (=18; 0.9.x 검증 당시 — 현재 14 + `/omg` = 15), `oh-my-gjc:*`=0. The 0.8.0 one-release tombstone stubs were removed in 0.8.1, and `install-skill.sh all` now sweeps pre-0.8.1 native leftovers on install/uninstall (`cleanup_legacy_commands`: the 17 tombstone filenames + old `oh-my-gjc:<name>.md` aliases — verified: 18 planted leftovers cleaned, 0 remain). No feature-body duplication. Skills auto-activate by trigger words (no prefix).
- **One-shot install (single suite):** `install.sh` (repo root) = curl|bash — `gjc plugin marketplace add` → `gjc plugin install oh-my-gjc@oh-my-gjc` → native `install-skill.sh all`. **One plugin brings all 10 skills + 15 commands (`/omg` + 14 `/omg:*`) — no optional plugin args.** `--candidate-ref <path|ref>` overrides the marketplace source (local checkout / explicit dev ref) for release-candidate provenance, **fail-closed** (force reinstall; die if marketplace-add or install fails, so a stale cache is never accepted as evidence). `INSTALLATION.md` = agent paste-a-link pattern. Verified via isolated-HOME new-user repro (rc=0).
- **⚠ Upstream ideal (contribution CANDIDATE — doc only, needs separate approval):** the native-install dance exists because gjc has no first-class "gjc-native plugin distributed via the marketplace" surface. Historically gjc loaded neither plugin skills nor commands; as of **0.9.x it auto-exposes plugin COMMANDS** as `<plugin>:<name>` (claude-plugins provider, `discovery/index.ts` now imports `./claude-plugins`) — still the wrong namespace — while plugin **skills do not surface as slash commands**. There is a `gajae-plugin.json` "binding-only" marker that makes the claude-plugins provider skip a root, but routing marketplace installs through the gjc-native plugin loader is unverified. Until a clean native path exists, `templates/` + native `install-skill.sh` is the supported workaround. Candidate upstream PR to `Yeachan-Heo/gajae-code` base `dev`; **not started** — file only after explicit approval (like PR #1710/#1676).
- **branch-flow (per-repo git discipline, patina model):** the `branch-flow` skill + `/omg:branchflow-always [on|off|status]` command install a **dev-integration / main-release** branch policy. Model: work branches (`feat/`·`fix/`·`chore/`·`docs/`) off `dev` → PR into `dev` → release (explicit only) `dev`→`main` merge PR + version bump + tag; `main` never committed directly, `dev` always ≥ `main`; parallel sessions use git worktrees; shared-branch pushes fast-forward-only. **Scope is per-repo, committed** (not the user-global semaphore path the other `*-always` use): `branchflow-always on` writes a marker block into the **repo's own `AGENTS.md`** and copies the repo-agnostic guide to the repo's `docs/WORKFLOW.md` (Repo-specifics box auto-filled), so the policy ships with the repo. Enforcement is soft (agent-followed) by default; optional GitHub server-side branch protection on request (no local git hooks). Ported from `~/workspace/patina`'s `docs/WORKFLOW.md`.
- **Semaphore mechanism (v0.3.1, live-verified on gjc 0.8.2):** `*-always` commands own ONLY their marker block (`<!-- BEGIN/END oh-my-gjc:<name> -->`) in user-global **`~/.gjc/agent/SYSTEM.md`**; back up to `.bak-<ts>` first; never touch content outside markers; exactly one block. **Why SYSTEM.md, not AGENTS.md:** gjc *discovers* user-level `~/.gjc/agent/AGENTS.md` but **drops it at injection** (`system-prompt.ts loadProjectContextFiles` filters `level === "project"` only), and `rules/*.md` `alwaysApply: true` renders only in the custom-system-prompt template — so the ONLY user-global every-turn surface is SYSTEM.md (`<system-prompt-customization>` slot). Proven by headless probe: AGENTS.md block = not injected; SYSTEM.md block = injected + format followed (behavioral test passed). Caveat: a project `.gjc/SYSTEM.md` **wholesale overrides** the user file in that repo. **Legacy migration (two generations):** old `my-workflows:*` markers AND v0.3.0-era `oh-my-gjc:*` markers in `~/.gjc/agent/AGENTS.md` (dead surface) are removed/migrated by the new commands. **Upstream fix landed:** gajae-code **PR #1710** (`fix/user-global-agents-md-injection`, base `dev`, **MERGED 2026-07-07**) restored native user-global AGENTS.md injection — the SYSTEM.md block stays valid either way (project files keep precedence; identical content dedupes).
- **Presets (v0.10, 2026-07-14 — single custom preset, 하코 direct order):** the canonical source ships **only `sol`** (end-to-end low-latency codex+opus: default `openai-codex/gpt-5.6-sol:low`, planner `sol:high`, architect `anthropic/claude-opus-4-8:medium`, critic `opus-4-8:high`, executor `terra:xhigh` — v0.9 demoted the planning seats after real-usage data + controlled benchmark: realistic ralplan new 8:24 consensus-complete (1 revision, stage 2) vs old xhigh seats still unconverged at 17:18 (3 revisions, stage 4) = **≥2×**, evidence `docs/verification/sol-v09-ralplan-bench-2026-07-14.md`). All other lanes are **gjc built-ins, never re-shipped as custom copies** (local copies rot — the stale `daily` incident): quality ralplan `opus-codex`, openai-codex single-login emergency `codex-medium`/`codex-pro`, safety-critical `fable-opus-codex` (all four live-verified on gjc 0.10.2, 2026-07-14). `grok`/`codex`/`fable-codex` retired in v0.10 (closed retired list; grok-build dependency gone). Executor seat stays `terra:xhigh` per gajae-code `docs/gpt-5.6-codex-preset-benchmark.md` (terra:xhigh 9/12 selected + 8/8 broad vs terra:high 6/11; executor is the only benchmark-measured role). The native installer auto-merges `sol` at user-scope install (fresh machines see it in the CUSTOM picker immediately); `/omg:presets [sol|all]` re-merges and may offer consent-gated legacy cleanup. Source of truth: `plugins/oh-my-gjc/references/presets.yml`. Recommended session default: `gjc --mpreset sol --default`.
- **`extragoal` skill (v0.4, 2026-07-08; reviewer profile retired from presets v0.4):** ultragoal + external final review gate (fresh-context cross-family reviewer re-reviews the finished diff → machine-parsable `VERDICT: APPROVE|REQUEST_CHANGES` → leader triage → bounded ≤2 re-sign rounds → mechanical merge). Reviewer lanes wired to omj: native cross-session `gjc -p --no-session --model <cross-family> --tools read,search,find` (default; `goal` tool disable mandatory), `/omg:fable`, and `insane-review` (Pro web, operator-owned ToS lane) under an AND-gate. Fail-closed on missing/malformed/timeout verdict; secret scan mandatory on any egress lane. The former `reviewer` mpreset block is no longer shipped in `references/presets.yml` (git history ≤v0.3). Ported from gajae-code `docs/extragoal-skill-template.md` (kept a local/bundled skill — upstream keeps it out of the default workflow set by product decision).
- **Merge safety contract (do not weaken):** name-scoped only (replace the target profile block if present, else append under `profiles:`); never delete/modify other profiles or top-level keys (`default`, `modelBindings`, …) — the sole exception is **consent-gated removal of retired preset blocks** (the exact retired list in `templates/presets.md`: `ultimate`/`ultimate-f5`/`daily`/`fast`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`/`grok`/`codex`/`fable-codex`; never an active preset, always after explicit user consent); back up to `.bak-<ts>` first; result must be valid YAML with the target present or roll back (no partial save); preserve 2/6-space indentation + `required_providers`/`model_mapping` structure + original comments. The comment-preserving merge is agent-driven (via `read`/`edit`) rather than a PyYAML round-trip, which would drop the Korean rationale comments.
- **⚠ Selectors/prices are catalog- and time-sensitive (2026-07);** re-verify with `GJC_NOTIFICATIONS=0 gjc -p --no-session --no-tools --model <selector> "Reply OK"`. Activation hard-blocks when any required provider lacks credentials (verified at `--mpreset` time, not at merge time). (Former `escalate-surgical` Fable `:xhigh`-not-`:max` note lives in git history ≤v0.3 — that preset is no longer shipped.)
- **⚠ Ephemeral gjc harness runs MUST disable notifications.** Every throwaway `gjc -p` verify/audit/test invocation (preset `"Reply OK"` checks, `/omg:fable` audits, and any `gjc` run inside a `/tmp` clone) MUST be prefixed with `GJC_NOTIFICATIONS=0` — the authoritative hard opt-out in gajae-code `notifications/config.ts` (`isSessionNotificationsEnabled`/`shouldRegisterNotificationsExtension` both fail-closed on `"0"`, unit-tested). Without it, the global `notifications.enabled` config auto-ons the session, it publishes `.gjc/state/notifications/<id>.json`, and the managed Telegram daemon eagerly creates a provisional "GJC <id>" **ghost topic** for a session that dies seconds later. Live-verified: `GJC_NOTIFICATIONS=0 gjc -p … "Reply OK"` returns OK and writes **no** notifications endpoint. User *working* sessions (`gjc --mpreset …`) keep notifications on — this rule is only for ephemeral harness runs.
- Non-Goals: reimplementing gjc-native workflows (team/ultragoal/ralplan/deep-interview), vendor auto-login, manifest-level profile injection (unsupported by gjc — the installer performs an explicit safe merge instead, v0.17.0), selector/price freshness guarantees.

### `gjc-bugwatch` (collector verified on real logs; triage/PR is agent-driven)
- Dogfooding bug collector. `bin/collect.ts` (batch scanner) reads `~/.gjc/logs/*.log` **and rotated `*.log.gz`** (structured JSONL: `{level,message,stack,...}`) and optionally session transcripts (`~/.gjc/agent/sessions/--<cwd>--/*.jsonl`), classifies signals (`gjc-internal`/`error`/`warn`), filters env/credential noise, dedupes by normalized fingerprint, redacts email/UUID/token/creds-in-URL, and **marks candidates not seen within `--fresh-days` (default 2) as `⏳stale` (likely already fixed upstream) — sinking them below fresh ones (`--fresh-only` drops them)**. `/omg:bugwatch-scan` + skill drive triage → reproduce against a `/tmp` gajae-code clone → collect issue/PR **drafts** under `.gjc/bugwatch/drafts/`.
- **Precision split (important):** the **log** source is high-precision (real runtime stacks; ~0 false positives — verified: it surfaced `Cleanup invoked recursively` ×7 with a `/$bunfs/root/gjc-*` stack, `Subagent prompt failed`, `Claude usage fetch failed`, etc. from the author's real logs). **Session** scanning is opt-in (`--include-sessions`) and heuristic: session JSONL echoes source code the agent read, pasted logs, and analysis prose, so it self-contaminates — it trusts ONLY `[Uncaught Exception]` and always skips the current session (`GJC_SESSION_ID`). Default = logs only.
- **The mechanical part is a tool, the judgement part is the agent.** `collect.ts` (deterministic parse/dedupe/redact, unit-tested at `test/collect.test.ts`) vs the command/skill (LLM triage, clone-repro, draft authoring). Mirrors insane-review's split.
- **Resolved ledger (dead-bug suppression).** `.gjc/bugwatch/resolved.jsonl` records bugs **confirmed fixed upstream** keyed by the exact collector `fingerprint`; `collect.ts` loads it (`loadResolved`/`applyResolved`, unit-tested) and tags matching candidates `✅resolved`, sinking them below `⏳stale` (hide with `--hide-resolved`, also dropped by `--fresh-only`; override path with `--resolved FILE`). Purpose: a fresh-looking-but-already-fixed candidate (e.g. `Cleanup invoked recursively` ×73, fixed by #1462/PR #1465 but still logged by a pre-fix installed binary) stops re-surfacing as a live lead. Triage skips `✅resolved`; when Step-3 source verification finds a merged/closed fix, the agent records it in `resolved.jsonl` (+ human `RESOLVED.md`) via subprocess instead of drafting.
- **Contract (do not weaken):** drafts only — `gh issue/pr create`, `git push`, commit, and any external submission are forbidden (a human submits). Read-only over gjc logs/sessions/source (never mutate `~/.gjc`). Redaction stays on (candidates are meant to be pasteable into a public upstream issue). Dedupe by fingerprint (no duplicate drafts). Estimated cause/fix must be labeled "추정" unless confirmed in the clone — no fabrication. All output lives under `.gjc/` (gitignored) — and since `.gjc/**` is runtime-owned (agent `write`/`edit`/`ast_edit` are blocked there), drafts are written via a subprocess (`bun`/`fs`/`cp` from `/tmp`), exactly like the collector spools `candidates.jsonl`.
- **⛔ UPSTREAM PR TARGET = `dev`, NEVER `main` (HARD RULE).** When a human explicitly directs submission (which overrides the drafts-only default), every upstream `gajae-code` **PR MUST target the `dev` branch** (`gh pr create --base dev …`). `main` is the repo's *default* branch but upstream integrates through `dev` — a PR against `main` is wrong. There is **no direct push access** to `Yeachan-Heo/gajae-code`, so: push the fix branch to the fork `devswha/gajae-code`, then `gh pr create --repo Yeachan-Heo/gajae-code --base dev --head devswha:<branch>`. Base the branch on `origin/dev` (fetch it) — not on `main` — so the diff is clean. (Issues have no base branch; file normally.)
- **Automation lane (`ops/gjc-bugwatch/`, outside the plugin).** The manual lane is now promoted to an **automatic cadence** without weakening the plugin contract (drafts-only/read-only/redaction/no-fabrication all live in the plugin — the bugwatch capability is now merged into `plugins/oh-my-gjc` (skill `gjc-bugwatch`, `bin/collect.ts`/`follow.ts`); the glue lives in `ops/`). Pieces: a **systemd --user unit** (`gjc-bugwatch.service` → `daemon.sh` = `follow.ts | trigger.ts`) that on every **HIGH(`gjc-internal`)** signal injects a triage instruction into the operator's tmux session (env `GJC_BUGWATCH_SESSION`, 기본 `gjc-pr` — 하코 PR 전담 세션, 07-13 정정) via `tmux send-keys` (payloads are absolute-path only — `injectTmux` **refuses any `~`**); a **cron** daily batch (`daily-scan.sh` = `collect --fresh-only --hide-resolved --json | trigger.ts --daily`, ~08:20) that injects a digest **only when there are fresh medium+ candidates** (low `warn`s = env/auth noise are floored out, matching the daemon's `--min medium`); and a **submission loop** (`enqueue-pr.sh`) that enqueues a verified draft into the horcrux control-tower queue (`POST $TOWER_URL/queue/add`, source=gjc-bugwatch, kind=decision — CLI 직접 쓰기는 타워 load-save 경합으로 금지, 07-10 사고) — **never auto-submits**; a human approves, then pushes the fork branch + opens the upstream `--base dev` PR. Install idempotently via `ops/gjc-bugwatch/install.sh`; unit tests in `ops/gjc-bugwatch/test/trigger.test.ts` (bun test).
- Non-Goals: auto issue/PR creation or push (drafts only — the automation lane enqueues to the operator queue but never submits), changing gjc log/session formats (read-only). (The once-roadmap always-on daemon now ships as the `ops/` automation lane above.)


### `gajae-app` (REMOVED in 0.14.0)
- Native upgrade cleanup removes only `~/.gjc/agent/skills/gajae-app/` and `~/.gjc/agent/commands/omg:gajae-app.md`; it does not delete or modify any claudecodeui checkout, build output, data, or user service.
- Target repository and self-host documentation: [devswha/claudecodeui SELF-HOST](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Historical release evidence: the `feat/gjc-provider` v0.2.0 release passed verification, extragoal cross-review, and 하코 approval.

### `tower` (REMOVED in 0.12.0)
- 관제탑 발주·하코 승인(2026-07-13)으로 제거: skill `tower` + command `/omg:tower-setup` 미사용 — 실관제탑(horcrux)은 자체 스크립트 구현으로 돌아 이 번들 tower를 경유하지 않음. skill/command와 함께 전용 orphan 파일(`bin/session_watch.py`·`bin/tower-notify.sh`·`bin/queue_store.py`·`bin/tower` CLI·`references/tower.config.example.json`)도 제거. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물(`omg:tower-setup.md`, skill dir)을 청소한다. 과거 상세·검증 레시피는 git 히스토리(≤0.11.0)의 skills/tower/SKILL.md + bin/tower-notify.sh 참조. (gjc-bugwatch가 쓰는 `TOWER_URL` HTTP 큐는 외부 horcrux 관제탑 서버로 본 번들과 무관.)

### `example-plugin`
- Reference template: one command + one skill. Copy to bootstrap a new plugin.

## Release governance (effective 2026-07-08, 하코 mandate — survives session restart)

Corrects the 2026-07-08 incident where 4 releases self-merged to `main` + tagged without review. **Every release to `main` (dev→main + tag + GitHub Release) MUST pass all 3 gates before publish. No self-merge releases.**

1. **Verification gate.** Verification checklist done: JSON parse, `bash -n`/`py_compile` where relevant, **new-install reproduction with rc evidence** (isolated HOME, `gjc plugin marketplace add`→`install`→native), plus any relevant unit tests. Record the evidence.
2. **External cross-review gate (dogfood `extragoal`).** Run the bundled `extragoal` external review on the **release diff** (`git diff <last-tag>..HEAD`): a fresh-context, **cross-family** reviewer (default lane `gjc -p --no-session --model openai-codex/gpt-5.5:xhigh --tools read,search,find …`) issues `VERDICT: APPROVE|REQUEST_CHANGES`. Fail-closed: no verdict / REQUEST_CHANGES ⇒ fix-forward, do not publish. We dogfood our own gate on our own releases.
3. **Approval gate (control tower → 하코).** After gates 1–2 pass, **request release approval** by enqueuing to the control tower (`horcrux queue add omj "release approval: …"`) with the verdict + evidence. The control tower queues it for 하코; **publish only after 하코 approves.** The agent never self-approves a release.
4. **Escalation, never a dead end (2026-07-14 amendment, 하코 direct order — "게이트가 릴리스 자체를 막으면 안 된다").** No gate outcome permanently blocks a release; every hard stop **escalates to 하코** instead: (a) re-sign limit (initial review + ≤2 re-signs per cycle) exhausted ⇒ fix-forward on `dev`, report, and on 하코's direction start a **fresh review cycle** (counter resets — the limit prevents grinding one candidate past the same reviewer series, not releasing ever); (b) frequency-cap overflow ⇒ 하코's explicit direction overrides, recorded in the evidence doc; (c) when 하코 has already explicitly ordered the release in-session, gates 1–2 still run in full, and after they pass the agent may **publish while reporting** the final candidate hash + evidence (Gate 3 satisfied by the standing order), but MUST also enqueue a one-line post-publication `report` to the control tower with the released version, final candidate hash, and evidence path so the secondary ledger cannot lag the direct command — absent such an order, stop and wait for approval. The invariants that never bend: gates 1–2 always run, the agent never self-approves, and every direct-command release leaves the control-tower report receipt.

**Frequency:** docs/patch-level changes are **bundled** — **max 1 release/day**. Exempt: urgent **security** or **install-breakage** fixes, or 하코's explicit direction (recorded in the evidence doc; gates 1–2 still run either way). Between releases, keep merging to `dev`; `main` advances only at an approved release.

**Rollback (명문화 2026-07-12, 하코 승인 릴리스 0.10.0에 동봉):** a bad release is
rolled back **fix-forward on git**, never by deleting history: (1) `git revert` the
offending commit(s) on `dev` (or revert the release merge on `main` for a broken-install
emergency), (2) run gates 1–2 on the revert diff (fast lane: install repro + cross-review),
(3) publish a new patch release (`vX.Y.Z+1`) through gate 3 as usual. Tags/Releases are
never deleted or force-moved — a superseded release gets a "superseded by vX.Y.Z+1" note
in its GitHub Release body. Installed users recover by re-running the one-shot installer.

**In-flight:** work continues on `dev`/branches; a release stops at PR/`dev` state until the 3 gates + 하코 approval. (`v0.7.0` omg rebrand shipped ~minutes before this mandate under the old self-merge pattern; retro-review + approval request filed — no unilateral rollback without explicit instruction.)

## Verification expectations

Before considering a plugin change done:
- **Static (always):** `marketplace.json` and `plugin.json` parse as JSON; convention
  files exist at expected paths; `marketplace` entry name/source match the manifest.
- **Behavioral (when the surface is reachable):** exercise the actual surface. The
  installer path (`install-skill.sh` in an isolated HOME) and `bun test` (gjc-bugwatch
  collect/trigger, discord bridge) run anywhere; insane-review's CDP→ChatGPT harvest
  needs a logged-in Pro browser session and is otherwise deferred-environment.
- Never fake live evidence. If a surface cannot be exercised in the current
  environment, mark it pending-environment and say so explicitly.

## Tools

`tools/discord-notify-bridge.ts` — forwards a live gjc session's notifications
(action-needed / idle / resolved) to a Discord channel via an incoming webhook.
Client of gjc's Notifications SDK (loopback WS at
`.gjc/state/notifications/<sessionId>.json`). Notify-only (a webhook can't reply).
Secrets read from `$DISCORD_WEBHOOK_URL` or `.gjc/secrets/discord-webhook`, never
logged. Tests: `bun test tools/test/e2e-bridge.test.ts`.

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
