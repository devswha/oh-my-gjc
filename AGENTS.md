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
- `codex-cli-ask` / `lazycodex`: Codex CLI installed + signed in (`codex --version`, `codex login status`). Never auto-installed or auto-logged-in. lazycodex harness install is `npx lazycodex-ai install` (`/omg:lazycodex-setup`).
- `insane-review`: ChatGPT subscription + a Chromium-family browser on CDP `:9222` logged into chatgpt.com.
- `gajae-app`: Node 22 + git (installs/updates the self-hosted web app from devswha/claudecodeui).
- Everything else (easy-answer, gate-briefing, presets, branch-flow, worktree, extragoal, fable, gjc-bugwatch, tower) + the `example-plugin` template: no external prerequisites (tower needs tmux; worktree needs a git repo; fable needs Fable 5 model access).

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
> 통합 전 plugin 이름을 유지한 **capability 단위 노트**다 — `codex-cli-control` = skill `codex-cli-ask`.
> 파일은 전부 `plugins/oh-my-gjc/` 안에 있다.

### `codex-cli-control` (working)
- Skill `codex-cli-ask` + command `/omg:codex-ask`. gjc runs
  `codex exec --sandbox <mode> --skip-git-repo-check --ephemeral -o <file> -` and
  returns the `-o` last-message.
- **Security contract (do not weaken):** `prompt` is passed via env → **stdin only**
  (never in argv); `sandbox` validated against the exact enum (default `read-only`);
  `timeout_s` positive int ≤ 600; `model` matches `^[A-Za-z0-9._/-]+$`; `cwd` must be
  an existing dir; unknown args rejected; `--dangerously-bypass-*` / `danger-full-access`
  never auto-derived. Prompting Codex is a privileged action (it can touch files/shell/creds).
- Non-Goals: multi-turn sessions, MCP, codex auto-login/install.
- Read-only Q&A only; for autonomous file-writing work see `lazycodex` (`/omg:lazycodex-work`).

### `codex-deepwork` (REMOVED in 0.11.0)
- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 실사용 0회(자기시험 제외 전 세션 로그 집계) + `lazycodex`와 기능 중복. 파일-쓰기 자율 위임은 `/omg:lazycodex-work`가 전담. 업그레이드 시 `install-skill.sh`의 `cleanup_removed`가 네이티브 잔존물(`omg:codex-run.md`, skill dir)을 청소한다.

### `lazycodex` (working)
- Commands: `/omg:lazycodex-setup [doctor|install|update|uninstall]` (manage the OmO Codex Light harness in `~/.codex` via `npx lazycodex-ai`) + `/omg:lazycodex-work` (run a plan→work→verify *ultrawork* task via `codex exec`).
- **Setup mutates `~/.codex`** (skills/hooks/agents/config) + uses npm/network. Check `lazycodex doctor` first; never reinstall a healthy install or uninstall without explicit user request; no auto-login.
- `:work` writes files (default `workspace-write`); injection-safe contract: task via stdin, enum sandbox, `timeout_s` ≤ 3600, cwd dir, unknown-arg reject, no bypass derivation.
- Verified here: `lazycodex doctor` = System OK (omo 4.11.0); `codex exec` auto-engages `omo:programming` + verification gates.
- Non-Goals: codex/lazycodex auto-login, read-only Q&A (→ `codex-cli-control`), opencode (Ultimate) edition.

### `codex-app-control` (REMOVED in 0.11.0)
- 관제탑 발주·하코 승인(2026-07-12)으로 제거: 대상 Codex 데스크톱 앱 빌드 트랙이 07-03 아카이브(codex-wrapper-build)로 폐기됐고, GPT Pro 리뷰 용도는 `insane-review`(자체 엔진, codex-app 의존성 없음)가 전담. 업그레이드 시 `cleanup_removed`가 네이티브 잔존물을 청소한다. 과거 라이브 검증 레시피는 git 히스토리(≤0.10.0)의 skills/codex-app-*/SKILL.md 참조.

### `insane-review` (CLI pack pipeline verified; CDP path deferred)
- Command `/omg:insane-review` + a native-installable skill (`skills/insane-review/SKILL.md`). Faithful port of `fivetaku/insane-review`. gjc scopes the complete relevant file set → repomix packs it (full code, line numbers, secretlint, packed-file audit) → drives the **logged-in ChatGPT web session over CDP** → selects+**verifies** GPT-5.5 Pro (fail-closed) → harvests the review to the current project's `.insane-review/response_*.md`. Zero API cost (runs on the user's ChatGPT subscription). Also a web-only `agent-council` member via `--council` (see `references/council-setup.md`).
- **Native install required — WHY (history + current):** on gjc 0.8.2 (`main` & `dev`, verified then) gjc surfaced NEITHER plugin skills NOR plugin commands as first-class: (1) the skill registry dropped non-native skills (`skills.ts`: `if (provider !== "native") return false`); (2) the marketplace slash-command provider (`discovery/claude-plugins.ts`) was never registered because `discovery/index.ts` omitted `import "./claude-plugins"`, so a plugin's `commands/*.md` were not advertised as `/<plugin>:<command>` in ANY session (proven via ACP `available_commands_update`: zero marketplace-plugin commands, only builtins + native `skill:*`). **Current state (gjc 0.9.x): plugin `commands/*.md` ARE auto-exposed — but under the wrong `<plugin>:<name>` namespace — while plugin skills still don't surface** (see the `oh-my-gjc` core section below); native install stays REQUIRED either way. `bin/install-skill.sh` copies SKILL.md into `~/.gjc/agent/skills/insane-review/` (user) or `<cwd>/.gjc/skills/` (project) and installs canonical commands from `templates/` as `~/.gjc/agent/commands/omg:<name>.md` (the filename IS the native command name; the 0.8.0-era deprecation tombstones were dropped in 0.8.1). Applies to every marketplace plugin, not just this one.
- **Engine kept byte-for-byte** (`bin/pack_and_ask.py`, Playwright-based, cross-platform). The gjc port only rewrote the shell: skill/command adapted to gjc terms + the `ask` tool onboarding, and the Claude-Code `setup/` (GitHub-star prompt + `~/.claude/settings.json` SessionStart update hook) was **dropped**. Do not reimplement the engine flow with gjc's `browser` tool — the hardened engine is more robust.
- **Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in gjc command/skill bodies, so both docs resolve the engine into `$IR` via a glob (`~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/pack_and_ask.py`, with project-scope + repo-local fallbacks). Never invoke via `${CLAUDE_PLUGIN_ROOT}` in a gjc plugin.
- **Security contract (do not weaken):** repomix secretlint forced on (a local repomix config disabling it aborts the run); fail-closed on unverified model / unattached pack / truncated prompt / timeout / empty response (no partial save); `--require-model` must accompany `--model`; output files `chmod 600`. Prompting Pro ships relevant code to an external web service — personal subscription use only (not OpenAI-endorsed).
- **Prerequisites (manual):** Python `playwright`+`pyperclip` (`--check-env --install`), Node/`npx` (repomix auto via `npx -y`), and a Chromium-family browser on CDP `:9222` with a **dedicated profile** logged into chatgpt.com + GPT-5.5 Pro selected. Login can't be automated.
- **Verified here (2026-07):** engine AST/`--help`/`--list-browsers`/`--check-env` on Linux; `$IR` glob resolution against a simulated install dir; `--pack-only` end-to-end via `npx repomix@1.15.0` (packed-file audit + token count). CDP→ChatGPT harvest needs a logged-in Pro session and is deferred-environment.
- Non-Goals: GPT-5.5 Pro API (doesn't exist), auto-login, engine reimplementation on gjc `browser`, read-only Q&A to a local CLI (→ `codex-cli-control`).

### `oh-my-gjc` (core — absorbed my-workflows v0.3 + multivendor-presets v0.2)
- **The single-suite plugin (12 capabilities in one install).** Skills: `easy-answer` (plain-language final answers, accuracy-first), `gate-briefing` (domain-blind approval-gate briefing: layman translation → approval boundary → evidence-backed checklist → verdict; "명시 없음" rows ≥2 auto-forces 보류; never executes approve/reject on the user's behalf), `multivendor-presets` (name-scoped preset merge), `branch-flow` (per-repo dev-integration/main-release git discipline; see below), `worktree` (parallel-session git worktree new/list/clean — branch-flow 규약: `../<repo>-<slug>-wt` + `<type>/<slug>` off `origin/dev`; clean은 머지완료+클린 트리만, `--force` 금지; command `/omg:worktree`). Commands: `/omg:setup` (idempotent; native skill+command install via `bin/install-skill.sh all`, legacy cleanup offers, env detection → prerequisite-feature availability hints), `easy`/`gate` (session toggles), `easy-always`/`gate-always`/`branchflow-always` (marker-block semaphores), `presets`, `fable` (Fable 5 adversarial safety audit of money/data/security-critical code — read-only invariant-breaking, not architecture review; scopes 3–6 files → defender-framed audit prompt → `gjc -p --model anthropic/claude-fable-5:xhigh` in background → mandatory spot-check of top findings against real code → gate-briefing-style verdict; Opus-4-8 fallback on Fable refusal/clamp; proven to catch a CRITICAL that 8-stage 3-vendor consensus missed).
- **Native install is REQUIRED, not optional**: gjc 0.9.x *does* auto-expose a plugin's convention `commands/*.md` as `<plugin>:<name>` slash commands (claude-plugins provider) — but that yields the wrong `oh-my-gjc:*` namespace, not the canonical `/omg:*`. So the command bodies live in `templates/` (a NON-convention dir gjc never auto-registers) and `bin/install-skill.sh all` copies them natively as `omg:<name>`. The installer is **manifest-driven and fail-closed** — it preflights the full EXPECTED set and, if any file is missing, copies nothing and exits non-zero (never a partial install). It installs **12 skills** → `~/.gjc/agent/skills/<name>/SKILL.md` and **17 commands** → `~/.gjc/agent/commands/omg:<name>.md` (catalog `omg.md` → `/omg`). **First-time bootstrap from the shell** — `bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all` (`/omg:setup` is itself dead-until-installed). ⚠ Cache is `<marketplace>___<plugin>___<ver>`; always anchor to `oh-my-gjc___oh-my-gjc___*` + `sort -V | tail -1`. Re-run after every plugin upgrade; open a NEW gjc session (or `/move .`) so the palette rebuilds.
- **`omg` command surface (single suite, 2026-07):** the sole canonical surface is `/omg:<name>` (bare `/omg` = catalog). `bin/install-skill.sh` installs each `templates/<name>.md` as `omg:<name>.md`; command bodies live in `templates/` (NOT `commands/`) precisely so gjc's plugin auto-registration produces **no** parallel `oh-my-gjc:*` command surface. **Verified isolated on gjc 0.9.2 (ACP `available_commands`):** plugin-install-only → `oh-my-gjc:*`=0; after native install → `omg:*` 17 + bare `/omg` (=18; 0.9.x 검증 당시 — 현재 16 + `/omg` = 17), `oh-my-gjc:*`=0. The 0.8.0 one-release tombstone stubs were removed in 0.8.1, and `install-skill.sh all` now sweeps pre-0.8.1 native leftovers on install/uninstall (`cleanup_legacy_commands`: the 17 tombstone filenames + old `oh-my-gjc:<name>.md` aliases — verified: 18 planted leftovers cleaned, 0 remain). No feature-body duplication. Skills auto-activate by trigger words (no prefix).
- **One-shot install (single suite):** `install.sh` (repo root) = curl|bash — `gjc plugin marketplace add` → `gjc plugin install oh-my-gjc@oh-my-gjc` → native `install-skill.sh all`. **One plugin brings all 12 capabilities — no optional plugin args.** `--candidate-ref <path|ref>` overrides the marketplace source (local checkout / explicit dev ref) for release-candidate provenance, **fail-closed** (force reinstall; die if marketplace-add or install fails, so a stale cache is never accepted as evidence). `INSTALLATION.md` = agent paste-a-link pattern. Verified via isolated-HOME new-user repro (rc=0).
- **⚠ Upstream ideal (contribution CANDIDATE — doc only, needs separate approval):** the native-install dance exists because gjc has no first-class "gjc-native plugin distributed via the marketplace" surface. Historically gjc loaded neither plugin skills nor commands; as of **0.9.x it auto-exposes plugin COMMANDS** as `<plugin>:<name>` (claude-plugins provider, `discovery/index.ts` now imports `./claude-plugins`) — still the wrong namespace — while plugin **skills do not surface as slash commands**. There is a `gajae-plugin.json` "binding-only" marker that makes the claude-plugins provider skip a root, but routing marketplace installs through the gjc-native plugin loader is unverified. Until a clean native path exists, `templates/` + native `install-skill.sh` is the supported workaround. Candidate upstream PR to `Yeachan-Heo/gajae-code` base `dev`; **not started** — file only after explicit approval (like PR #1710/#1676).
- **branch-flow (per-repo git discipline, patina model):** the `branch-flow` skill + `/omg:branchflow-always [on|off|status]` command install a **dev-integration / main-release** branch policy. Model: work branches (`feat/`·`fix/`·`chore/`·`docs/`) off `dev` → PR into `dev` → release (explicit only) `dev`→`main` merge PR + version bump + tag; `main` never committed directly, `dev` always ≥ `main`; parallel sessions use git worktrees; shared-branch pushes fast-forward-only. **Scope is per-repo, committed** (not the user-global semaphore path the other `*-always` use): `branchflow-always on` writes a marker block into the **repo's own `AGENTS.md`** and copies the repo-agnostic guide to the repo's `docs/WORKFLOW.md` (Repo-specifics box auto-filled), so the policy ships with the repo. Enforcement is soft (agent-followed) by default; optional GitHub server-side branch protection on request (no local git hooks). Ported from `~/workspace/patina`'s `docs/WORKFLOW.md`.
- **Semaphore mechanism (v0.3.1, live-verified on gjc 0.8.2):** `*-always` commands own ONLY their marker block (`<!-- BEGIN/END oh-my-gjc:<name> -->`) in user-global **`~/.gjc/agent/SYSTEM.md`**; back up to `.bak-<ts>` first; never touch content outside markers; exactly one block. **Why SYSTEM.md, not AGENTS.md:** gjc *discovers* user-level `~/.gjc/agent/AGENTS.md` but **drops it at injection** (`system-prompt.ts loadProjectContextFiles` filters `level === "project"` only), and `rules/*.md` `alwaysApply: true` renders only in the custom-system-prompt template — so the ONLY user-global every-turn surface is SYSTEM.md (`<system-prompt-customization>` slot). Proven by headless probe: AGENTS.md block = not injected; SYSTEM.md block = injected + format followed (behavioral test passed). Caveat: a project `.gjc/SYSTEM.md` **wholesale overrides** the user file in that repo. **Legacy migration (two generations):** old `my-workflows:*` markers AND v0.3.0-era `oh-my-gjc:*` markers in `~/.gjc/agent/AGENTS.md` (dead surface) are removed/migrated by the new commands. **Upstream fix landed:** gajae-code **PR #1710** (`fix/user-global-agents-md-injection`, base `dev`, **MERGED 2026-07-07**) restored native user-global AGENTS.md injection — the SYSTEM.md block stays valid either way (project files keep precedence; identical content dedupes).
- **Presets (v0.2, 2026-07 evidence research):** `ideal` (display ideal-v2 — default `anthropic/claude-opus-4-8:xhigh`, executor `…:max`, planner+architect `openai-codex/gpt-5.5:xhigh` [cross-vendor code review: opus authors, gpt reviews], critic `xai/grok-4.3:high` [third-vendor independent gate]), `escalate-surgical` (relief pitcher — executor `anthropic/claude-fable-5:xhigh` only; return to ideal when done), `monorepo` (every role ≥1M ctx; critic `opencode-go/glm-5.2` with distillation-correlation caveat). Deprecates `ultimate`/`ultimate-f5` (v0.1) — `/omg:presets` detects and offers cleanup with user consent. Source of truth mirrors the user's `~/.gjc/agent/models.yml`.
- **`reviewer` preset + `extragoal` skill (v0.4, 2026-07-08, from upstream gajae-code `docs/`):** absorbed the upstream `reviewer` profile (review/audit stance — inverts the authoring role split: `default`/`architect`=`anthropic/claude-opus-4-8:high` [aggregator restraint / primary judge], `executor`=`openai-codex/gpt-5.5:high` [support], `planner`=`google-antigravity/gemini-3.1-pro-low:high`, `critic`=`openai-codex/gpt-5.5:high` [cross-family merge gate vs Claude-authored code]; `required_providers: [anthropic, openai-codex, google-antigravity]`). All three reviewer selectors live-verified rc=0 (2026-07-08) before merge. Paired with a bundled **`extragoal`** skill (`skills/extragoal/SKILL.md`) — ultragoal + external final review gate (fresh-context cross-family reviewer re-reviews the finished diff → machine-parsable `VERDICT: APPROVE|REQUEST_CHANGES` → leader triage → bounded ≤2 re-sign rounds → mechanical merge). Reviewer lanes wired to omj: native cross-session `gjc -p --no-session --model <cross-family> --tools read,search,find` (default; `goal` tool disable mandatory), `/omg:fable`, and `insane-review` (Pro web, operator-owned ToS lane) under an AND-gate. Fail-closed on missing/malformed/timeout verdict; secret scan mandatory on any egress lane. Ported from gajae-code `docs/extragoal-skill-template.md` (kept a local/bundled skill — upstream keeps it out of the default workflow set by product decision).
- **Merge safety contract (do not weaken):** name-scoped only (replace the target profile block if present, else append under `profiles:`); never delete/modify other profiles or top-level keys (`default`, `modelBindings`, …) — legacy ultimate/ultimate-f5 removal is the sole exception and requires explicit user consent; back up to `.bak-<ts>` first; result must be valid YAML with the target present or roll back (no partial save); preserve 2/6-space indentation + `required_providers`/`model_mapping` structure + original comments. The comment-preserving merge is agent-driven (via `read`/`edit`) rather than a PyYAML round-trip, which would drop the Korean rationale comments.
- **⚠ `escalate-surgical` executor must be `:xhigh`, not `:max`** — Fable 5 silently clamps `:max` down to `xhigh`; Fable refusals arrive as HTTP 200 + stop_reason. Activation hard-blocks when any required provider lacks credentials (verified at `--mpreset` time, not at merge time). Selectors/prices are catalog- and time-sensitive (2026-07); re-verify with `GJC_NOTIFICATIONS=0 gjc -p --no-session --no-tools --model <selector> "Reply OK"`.
- **⚠ Ephemeral gjc harness runs MUST disable notifications.** Every throwaway `gjc -p` verify/audit/test invocation (preset `"Reply OK"` checks, `/omg:fable` audits, and any `gjc` run inside a `/tmp` clone) MUST be prefixed with `GJC_NOTIFICATIONS=0` — the authoritative hard opt-out in gajae-code `notifications/config.ts` (`isSessionNotificationsEnabled`/`shouldRegisterNotificationsExtension` both fail-closed on `"0"`, unit-tested). Without it, the global `notifications.enabled` config auto-ons the session, it publishes `.gjc/state/notifications/<id>.json`, and the managed Telegram daemon eagerly creates a provisional "GJC <id>" **ghost topic** for a session that dies seconds later. Live-verified: `GJC_NOTIFICATIONS=0 gjc -p … "Reply OK"` returns OK and writes **no** notifications endpoint. User *working* sessions (`gjc --mpreset …`) keep notifications on — this rule is only for ephemeral harness runs.
- Non-Goals: reimplementing gjc-native workflows (team/ultragoal/ralplan/deep-interview), vendor auto-login, profile auto-injection (manifest unsupported — merge is explicit-command only), selector/price freshness guarantees.

### `gjc-bugwatch` (collector verified on real logs; triage/PR is agent-driven)
- Dogfooding bug collector. `bin/collect.ts` (batch scanner) reads `~/.gjc/logs/*.log` **and rotated `*.log.gz`** (structured JSONL: `{level,message,stack,...}`) and optionally session transcripts (`~/.gjc/agent/sessions/--<cwd>--/*.jsonl`), classifies signals (`gjc-internal`/`error`/`warn`), filters env/credential noise, dedupes by normalized fingerprint, redacts email/UUID/token/creds-in-URL, and **marks candidates not seen within `--fresh-days` (default 2) as `⏳stale` (likely already fixed upstream) — sinking them below fresh ones (`--fresh-only` drops them)**. `/omg:bugwatch-scan` + skill drive triage → reproduce against a `/tmp` gajae-code clone → collect issue/PR **drafts** under `.gjc/bugwatch/drafts/`.
- **Precision split (important):** the **log** source is high-precision (real runtime stacks; ~0 false positives — verified: it surfaced `Cleanup invoked recursively` ×7 with a `/$bunfs/root/gjc-*` stack, `Subagent prompt failed`, `Claude usage fetch failed`, etc. from the author's real logs). **Session** scanning is opt-in (`--include-sessions`) and heuristic: session JSONL echoes source code the agent read, pasted logs, and analysis prose, so it self-contaminates — it trusts ONLY `[Uncaught Exception]` and always skips the current session (`GJC_SESSION_ID`). Default = logs only.
- **The mechanical part is a tool, the judgement part is the agent.** `collect.ts` (deterministic parse/dedupe/redact, unit-tested at `test/collect.test.ts`) vs the command/skill (LLM triage, clone-repro, draft authoring). Mirrors insane-review's split.
- **Resolved ledger (dead-bug suppression).** `.gjc/bugwatch/resolved.jsonl` records bugs **confirmed fixed upstream** keyed by the exact collector `fingerprint`; `collect.ts` loads it (`loadResolved`/`applyResolved`, unit-tested) and tags matching candidates `✅resolved`, sinking them below `⏳stale` (hide with `--hide-resolved`, also dropped by `--fresh-only`; override path with `--resolved FILE`). Purpose: a fresh-looking-but-already-fixed candidate (e.g. `Cleanup invoked recursively` ×73, fixed by #1462/PR #1465 but still logged by a pre-fix installed binary) stops re-surfacing as a live lead. Triage skips `✅resolved`; when Step-3 source verification finds a merged/closed fix, the agent records it in `resolved.jsonl` (+ human `RESOLVED.md`) via subprocess instead of drafting.
- **Contract (do not weaken):** drafts only — `gh issue/pr create`, `git push`, commit, and any external submission are forbidden (a human submits). Read-only over gjc logs/sessions/source (never mutate `~/.gjc`). Redaction stays on (candidates are meant to be pasteable into a public upstream issue). Dedupe by fingerprint (no duplicate drafts). Estimated cause/fix must be labeled "추정" unless confirmed in the clone — no fabrication. All output lives under `.gjc/` (gitignored) — and since `.gjc/**` is runtime-owned (agent `write`/`edit`/`ast_edit` are blocked there), drafts are written via a subprocess (`bun`/`fs`/`cp` from `/tmp`), exactly like the collector spools `candidates.jsonl`.
- **⛔ UPSTREAM PR TARGET = `dev`, NEVER `main` (HARD RULE).** When a human explicitly directs submission (which overrides the drafts-only default), every upstream `gajae-code` **PR MUST target the `dev` branch** (`gh pr create --base dev …`). `main` is the repo's *default* branch but upstream integrates through `dev` — a PR against `main` is wrong. There is **no direct push access** to `Yeachan-Heo/gajae-code`, so: push the fix branch to the fork `devswha/gajae-code`, then `gh pr create --repo Yeachan-Heo/gajae-code --base dev --head devswha:<branch>`. Base the branch on `origin/dev` (fetch it) — not on `main` — so the diff is clean. (Issues have no base branch; file normally.)
- **Automation lane (`ops/gjc-bugwatch/`, outside the plugin).** The manual lane is now promoted to an **automatic cadence** without weakening the plugin contract (drafts-only/read-only/redaction/no-fabrication all live in the plugin — the bugwatch capability is now merged into `plugins/oh-my-gjc` (skill `gjc-bugwatch`, `bin/collect.ts`/`follow.ts`); the glue lives in `ops/`). Pieces: a **systemd --user unit** (`gjc-bugwatch.service` → `daemon.sh` = `follow.ts | trigger.ts`) that on every **HIGH(`gjc-internal`)** signal injects a triage instruction into the operator's tmux session (`gjc-pr`) via `tmux send-keys` (payloads are absolute-path only — `injectTmux` **refuses any `~`**); a **cron** daily batch (`daily-scan.sh` = `collect --fresh-only --hide-resolved --json | trigger.ts --daily`, ~08:20) that injects a digest **only when there are fresh medium+ candidates** (low `warn`s = env/auth noise are floored out, matching the daemon's `--min medium`); and a **submission loop** (`enqueue-pr.sh`) that enqueues a verified draft into the horcrux control-tower queue (`horcrux queue add gjc-pr …`) — **never auto-submits**; a human approves, then pushes the fork branch + opens the upstream `--base dev` PR. Install idempotently via `ops/gjc-bugwatch/install.sh`; unit tests in `ops/gjc-bugwatch/test/trigger.test.ts` (bun test).
- Non-Goals: auto issue/PR creation or push (drafts only — the automation lane enqueues to the operator queue but never submits), changing gjc log/session formats (read-only). (The once-roadmap always-on daemon now ships as the `ops/` automation lane above.)


### `gajae-app` (셀프호스트 웹 UI 관리 — 앱 소스는 별도 레포)
- Skill `gajae-app` + command `/omg:gajae-app [install|update|status]`. **가재코드 앱**(브라우저에서 gjc 세션 열람+관제탑 릴레이, 외부 CLI(claude/codex) tmux 터미널 attach, 고정 루트 파일 패널)을 git clone → build → systemd user 유닛(cloudcli.service)으로 셀프호스트 관리한다.
- **앱 소스는 이 레포에 없다(의도된 분리)**: `github.com/devswha/claudecodeui` (siteboon fork), 배포선 = `feat/gjc-provider`, 릴리스선 = package.json `desktopVersion` (v0.2.0 = 외부 CLI 레인 + 파일 패널 + lineage 안전 게이트). 앱 릴리스는 그 레포에서 3게이트(검증→extragoal 교차리뷰→하코 승인)로 — v0.2.0은 gpt-5.5:xhigh REQUEST_CHANGES 3건 수정 후 재서명 APPROVE로 통과.
- **보안 계약(약화 금지)**: 서버 loopback 기본 바인딩 유지(원격은 tailscale serve 경유만); tmux kill/send는 서버측 lineage 재검증(403 fail-closed — patina 실사고 재발 방지); dir-suggestions는 $HOME realpath 봉쇄(직계 자식 심링크만 허용 루트).
- Non-Goals: 앱 소스 번들, 업스트림(siteboon) PR, LAN 직노출, gjc 세션 포맷 변경.

### `tower` (control-tower orchestration; generalized from horcrux, verified locally)
- Generalizes the horcrux control-tower pattern into a plugin: one supervisor session runs a **standing fleet** of TUI-agent (gjc) sessions. Four generalized parts under `bin/` (no-dep stdlib/bash): `session_watch.py` (busy→idle watcher — config-driven window prefix/busy·idle marks/exclude/interval/confirm; emits `IDLE`/one-time `INIT` events; anti-flap confirm streak), `tower-notify.sh` (tmux `send-keys` injection + TUI-trap defenses), `queue_store.py` + `tower` CLI (idempotent operator decision queue), and `skills/tower/SKILL.md` (the operational loop). Command `/omg:tower-setup`. Native-install required (same gjc gap as the others) — `bin/install-skill.sh all`.
- **De-hardcoded from horcrux/G1**: window prefix (`TOWER_WINDOW_PREFIX`, default `GJC-`), busy/idle marks, exclude list, and queue path (`TOWER_QUEUE_FILE` > `TOWER_HOME/queue.json` > `~/.gjc/tower/queue.json`) are all config/env-driven; no `[profile→G1 전달]` default message, no horcrux repo paths. Config example: `references/tower.config.example.json`.
- **TUI injection traps (defense + docs)** in `tower-notify.sh`, verified: (1) `~` → path-autocomplete pollution → **reject** (exit 2); (2) `(X)` paren+ASCII-uppercase → TUI emoji substitution → **reject** (exit 2), use `①②③`; (3) real relative-path token in target cwd → autocomplete popup eats Enter (non-send + pollution) → **warn** + post-send input-lingering verify + one Enter retry + `FAIL` report. `--models` reads gjc session logs (gjc-specific, best-effort).
- **Ops loop (in SKILL, must be followed)**: ①boot re-registration (watcher via `monitor` + 30-min cron patrol are **session-bound** — re-register on tower-session restart) ②on-event classify(peek)→enqueue(idempotent)→one-line report→relay ③patrol = backup sweep, **empty patrol reports nothing** ④single notification channel ⑤safety boundary (tower injects/observes, never decides for the human; real trades/payments/go-live/account-ops always the human).
- **Differentiation from gjc `team` (documented)**: team = work-worker coordination on one task (shared state/mailbox/worktrees/verification lanes); tower = standing fleet of independent sessions + observe/inject/**human decision queue**. team divides work; tower observes state and brokers human decisions.
- Verified here (2026-07): JSON (marketplace/plugin/config) parse; py_compile + `bash -n` clean; queue add/dedupe(idempotent)/done/list roundtrip via `tower` CLI; `session_watch.py --once` exit 0; all three `tower-notify.sh` traps fire (reject/reject/warn) + clean message passes. tmux send/verify path needs live sessions (deferred-environment).
- Non-Goals: dividing/dispatching work to workers (→ gjc `team`), deciding on the human's behalf (queue collects; human resolves), bypassing a target session's own approval gates (only drives `send-keys`), non-gjc `--models` model detection.

### `example-plugin`
- Reference template: one command + one skill. Copy to bootstrap a new plugin.

## Release governance (effective 2026-07-08, 하코 mandate — survives session restart)

Corrects the 2026-07-08 incident where 4 releases self-merged to `main` + tagged without review. **Every release to `main` (dev→main + tag + GitHub Release) MUST pass all 3 gates before publish. No self-merge releases.**

1. **Verification gate.** Verification checklist done: JSON parse, `bash -n`/`py_compile` where relevant, **new-install reproduction with rc evidence** (isolated HOME, `gjc plugin marketplace add`→`install`→native), plus any relevant unit tests. Record the evidence.
2. **External cross-review gate (dogfood `extragoal`).** Run the bundled `extragoal` external review on the **release diff** (`git diff <last-tag>..HEAD`): a fresh-context, **cross-family** reviewer (default lane `gjc -p --no-session --model openai-codex/gpt-5.5:xhigh --tools read,search,find …`) issues `VERDICT: APPROVE|REQUEST_CHANGES`. Fail-closed: no verdict / REQUEST_CHANGES ⇒ fix-forward, do not publish. We dogfood our own gate on our own releases.
3. **Approval gate (control tower → 하코).** After gates 1–2 pass, **request release approval** by enqueuing to the control tower (`horcrux queue add omj "release approval: …"`) with the verdict + evidence. The control tower queues it for 하코; **publish only after 하코 approves.** The agent never self-approves a release.

**Frequency:** docs/patch-level changes are **bundled** — **max 1 release/day**. Only urgent **security** or **install-breakage** fixes are exempt (and even then, gates 1–2 still run; gate 3 is a fast notify). Between releases, keep merging to `dev`; `main` advances only at an approved release.

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
  CLI path (`codex exec`) is testable wherever the Codex CLI is installed/logged in;
  insane-review's CDP→ChatGPT harvest needs a logged-in Pro browser session and is
  otherwise deferred-environment.
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
