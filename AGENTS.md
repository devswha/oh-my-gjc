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

### Plugin prerequisites
- `codex-cli-control` / `codex-deepwork`: Codex CLI installed + signed in (`codex --version`, `codex login status`). Plugins never auto-install or auto-login.
- `codex-deepwork` (recommended): LazyCodex harness — `npx lazycodex-ai install` — adds deep-work skills/agents/verification to Codex runs. Works without it (plain `codex exec`).
- `codex-app-control`: a running, CDP-enabled Codex desktop App + an explicit `cdp_url`. v1 does not launch/build the app.
- `oh-my-gjc` (core) / `example-plugin`: no external prerequisites.

## Layout

```
oh-my-gjc/
├── .claude-plugin/
│   └── marketplace.json          # catalog: every plugin is registered here
├── plugins/
│   └── <plugin>/
│       ├── .claude-plugin/plugin.json   # manifest
│       ├── commands/<file>.md           # slash commands → /<plugin>:<file>
│       ├── agents/<file>.md             # sub-agents
│       ├── skills/<name>/SKILL.md       # skills
│       ├── hooks/hooks.json             # hooks
│       └── .mcp.json                    # MCP servers
├── tools/                        # repo tooling (e.g. discord-notify-bridge.ts)
├── README.md                     # simple human intro
└── AGENTS.md                     # this file
```

Content is discovered by **convention directories** above; explicit paths in
`plugin.json` are optional overrides.

## Add a plugin (procedure)

1. Create `plugins/<plugin>/.claude-plugin/plugin.json`.
2. Add content in convention dirs (`commands/`, `skills/<name>/SKILL.md`, `agents/`, `hooks/`, `.mcp.json`).
3. Register it in `.claude-plugin/marketplace.json` under `plugins`:
   ```json
   { "name": "<plugin>", "source": "./plugins/<plugin>", "version": "0.1.0", "description": "…", "category": "…" }
   ```
4. Add `plugins/<plugin>/README.md` with usage, prerequisites, and safety notes.

`source` may also point off-repo: `{ "repo": "owner/repo" }`, `{ "url": "https://…" }`, or `{ "package": "npm-pkg" }`.

## Conventions agents MUST follow

- **Match the existing shape.** New manifests/commands/skills must mirror the
  existing `oh-my-gjc` / `example-plugin` structure (same `plugin.json` fields,
  YAML frontmatter on `commands/*.md` and `SKILL.md`). No parallel conventions.
- **Name parity.** `marketplace.json` entry `name` == `plugin.json` `name` == the
  `plugins/<name>/` directory. `source` must be `./plugins/<name>`.
- **Lowercase-hyphen names** for plugins and skills.
- **Register every new plugin** in `marketplace.json`, and keep the entry list
  formatting consistent with siblings.
- **Skill `description`** is the activation trigger — make it specific and include
  the phrases that should load the skill.
- **Never commit secrets.** `.env`/`.env.*` are gitignored (`!.env.example` is the
  only tracked one and MUST contain placeholders, never real keys). Runtime state
  under `.gjc/` is gitignored.
- **Document the real install paths** (verified): plugin management is the **shell CLI only** — `gjc plugin marketplace add <ref>` then `gjc plugin install <name>@<marketplace> …` (batch-capable), `gjc plugin list`. gjc has **no `/plugin` slash command** (Claude-Code syntax; a `/plugin …` line in a gjc session is just a chat message). Never write `/plugin …` in gjc install docs.

## Per-plugin notes

### `codex-cli-control` (working)
- Skill `codex-cli-ask` + command `/codex-cli-control:ask`. gjc runs
  `codex exec --sandbox <mode> --skip-git-repo-check --ephemeral -o <file> -` and
  returns the `-o` last-message.
- **Security contract (do not weaken):** `prompt` is passed via env → **stdin only**
  (never in argv); `sandbox` validated against the exact enum (default `read-only`);
  `timeout_s` positive int ≤ 600; `model` matches `^[A-Za-z0-9._/-]+$`; `cwd` must be
  an existing dir; unknown args rejected; `--dangerously-bypass-*` / `danger-full-access`
  never auto-derived. Prompting Codex is a privileged action (it can touch files/shell/creds).
- Non-Goals: App/CDP GUI control, multi-turn sessions, MCP, codex auto-login/install.
- Read-only Q&A only; for autonomous file-writing work see `codex-deepwork`.

### `codex-deepwork` (working)
- Skill `codex-deepwork` + command `/codex-deepwork:run`. gjc delegates an autonomous
  coding task: `codex exec --sandbox workspace-write --skip-git-repo-check -C <cwd> -o <file> -`
  (task via stdin), returns the final message **plus a "review changes (git diff)" reminder**.
- **Writes files.** Default `sandbox=workspace-write`. Run in a git repo; never auto-commit/push.
- Auto-leverages the **LazyCodex** harness in `~/.codex` (deep-work skills/agents/verification) when
  installed (`npx lazycodex-ai install`); no extra flags. Works without it (plain `codex exec`).
- **Security contract (do not weaken):** same as `codex-cli-control` but task via stdin and
  `timeout_s` ≤ 3600; `cwd` must be an existing dir; `--dangerously-bypass-*` / `danger-full-access`
  never auto-derived.
- Non-Goals: read-only Q&A (→ `codex-cli-control`), App/CDP (→ `codex-app-control`), lazycodex
  auto-install, multi-session orchestration, auto-commit/push.

### `lazycodex` (working)
- Commands: `/lazycodex:setup [doctor|install|update|uninstall]` (manage the OmO Codex Light harness in `~/.codex` via `npx lazycodex-ai`) + `/lazycodex:work` (run a plan→work→verify *ultrawork* task via `codex exec`).
- **Setup mutates `~/.codex`** (skills/hooks/agents/config) + uses npm/network. Check `lazycodex doctor` first; never reinstall a healthy install or uninstall without explicit user request; no auto-login.
- `:work` writes files (default `workspace-write`); same injection-safe contract as `codex-deepwork` (task via stdin, enum sandbox, `timeout_s` ≤ 3600, cwd dir, unknown-arg reject, no bypass derivation).
- Verified here: `lazycodex doctor` = System OK (omo 4.11.0); `codex exec` auto-engages `omo:programming` + verification gates.
- Non-Goals: codex/lazycodex auto-login, App/CDP (→ `codex-app-control`), read-only Q&A (→ `codex-cli-control`), opencode (Ultimate) edition.

### `codex-app-control` (live-verified)
- Two skills: `codex-app-launch` (command `/codex-app-control:launch`) and `codex-app-cdp` (command `/codex-app-control:ask`).
- `codex-app-launch`: starts an **already-built** Linux Codex App wrapper headlessly (xvfb) with `--remote-debugging-port` (CDP) enabled, idempotently reuses a live endpoint, polls `/json/version` until ready, returns `cdp_url`; also `status`/`stop`. Does **not** build the wrapper from the DMG.
- `codex-app-cdp`: attaches gjc's `browser` tool to a running Codex App via an explicit `cdp_url`, sends one prompt, reads the latest completed response (hybrid turn-completion detection). Attach-only; pair it with `launch` (or an app you started yourself).
- **Live-verified:** wrapper built from OpenAI DMG → headless launch (CDP `:9222`, webview `:5175`, Codex `26.623.70822`) → attach → `.ProseMirror` input → Enter → completion detect → read `[data-local-conversation-final-assistant]`. Confirmed selectors/recipe live in `skills/*/SKILL.md`.
- Injection-safe arg contract (launch): `action` enum, integer port range, `screen` regex, existing-file check, reject unknown args, no auto-derived Electron flags.
- Same privileged-action safety stance as above.

### `insane-review` (CLI pack pipeline verified; CDP path deferred)
- Command `/insane-review:review` + a native-installable skill (`skills/insane-review/SKILL.md`). Faithful port of `fivetaku/insane-review`. gjc scopes the complete relevant file set → repomix packs it (full code, line numbers, secretlint, packed-file audit) → drives the **logged-in ChatGPT web session over CDP** → selects+**verifies** GPT-5.5 Pro (fail-closed) → harvests the review to the current project's `.insane-review/response_*.md`. Zero API cost (runs on the user's ChatGPT subscription). Also a web-only `agent-council` member via `--council` (see `references/council-setup.md`).
- **gjc surfaces NEITHER plugin skills NOR plugin commands as first-class** — two separate gaps, both verified on gjc 0.8.2 (`main` & `dev`): (1) the skill registry drops non-native skills (`skills.ts`: `if (provider !== "native") return false`); (2) the marketplace slash-command provider (`discovery/claude-plugins.ts`) is **never registered** because `discovery/index.ts` omits `import "./claude-plugins"` (only test files import it, and the provider self-registers only on import), so a plugin's `commands/*.md` are NOT advertised as `/<plugin>:<command>` in ANY session (proven via ACP `available_commands_update`: zero marketplace-plugin commands, only builtins + native `skill:*`). So after `gjc plugin install`, BOTH `/insane-review:review` AND its `SKILL.md` auto-activation are dead until **natively installed**. `bin/install-skill.sh` copies SKILL.md into `~/.gjc/agent/skills/insane-review/` (user) or `<cwd>/.gjc/skills/` (project); the command surface needs the same treatment for `commands/*.md` → `~/.gjc/agent/commands/<name>.md` (oh-my-gjc's `install-skill.sh` now installs both, naming commands `oh-my-gjc:<name>.md` to preserve the `/oh-my-gjc:<name>` UX — the filename IS the native command name). Applies to every marketplace plugin, not just this one.
- **Engine kept byte-for-byte** (`bin/pack_and_ask.py`, Playwright-based, cross-platform). The gjc port only rewrote the shell: skill/command adapted to gjc terms + the `ask` tool onboarding, and the Claude-Code `setup/` (GitHub-star prompt + `~/.claude/settings.json` SessionStart update hook) was **dropped**. Do not reimplement the engine flow with gjc's `browser` tool — the hardened engine is more robust.
- **Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in gjc command/skill bodies, so both docs resolve the engine into `$IR` via a glob (`~/.gjc/plugins/cache/plugins/*insane-review*/bin/pack_and_ask.py`, with project-scope + repo-local fallbacks). Never invoke via `${CLAUDE_PLUGIN_ROOT}` in a gjc plugin.
- **Security contract (do not weaken):** repomix secretlint forced on (a local repomix config disabling it aborts the run); fail-closed on unverified model / unattached pack / truncated prompt / timeout / empty response (no partial save); `--require-model` must accompany `--model`; output files `chmod 600`. Prompting Pro ships relevant code to an external web service — personal subscription use only (not OpenAI-endorsed).
- **Prerequisites (manual):** Python `playwright`+`pyperclip` (`--check-env --install`), Node/`npx` (repomix auto via `npx -y`), and a Chromium-family browser on CDP `:9222` with a **dedicated profile** logged into chatgpt.com + GPT-5.5 Pro selected. Login can't be automated.
- **Verified here (2026-07):** engine AST/`--help`/`--list-browsers`/`--check-env` on Linux; `$IR` glob resolution against a simulated install dir; `--pack-only` end-to-end via `npx repomix@1.15.0` (packed-file audit + token count). CDP→ChatGPT harvest needs a logged-in Pro session and is deferred-environment.
- Non-Goals: GPT-5.5 Pro API (doesn't exist), auto-login, engine reimplementation on gjc `browser`, read-only Q&A to a local CLI (→ `codex-cli-control`).

### `oh-my-gjc` (core — absorbed my-workflows v0.3 + multivendor-presets v0.2)
- **The install-first core plugin.** Skills: `easy-answer` (plain-language final answers, accuracy-first), `gate-briefing` (domain-blind approval-gate briefing: layman translation → approval boundary → evidence-backed checklist → verdict; "명시 없음" rows ≥2 auto-forces 보류; never executes approve/reject on the user's behalf), `multivendor-presets` (name-scoped preset merge), `branch-flow` (per-repo dev-integration/main-release git discipline; see below). Commands: `/oh-my-gjc:setup` (idempotent; native skill+command install via `bin/install-skill.sh all`, legacy cleanup offers, env detection → optional-plugin recommendations), `easy`/`gate` (session toggles), `easy-always`/`gate-always`/`branchflow-always` (marker-block semaphores), `presets`, `fable` (Fable 5 adversarial safety audit of money/data/security-critical code — read-only invariant-breaking, not architecture review; scopes 3–6 files → defender-framed audit prompt → `gjc -p --model anthropic/claude-fable-5:xhigh` in background → mandatory spot-check of top findings against real code → gate-briefing-style verdict; Opus-4-8 fallback on Fable refusal/clamp; proven to catch a CRITICAL that 8-stage 3-vendor consensus missed).
- **Native install is REQUIRED, not optional** (root cause in the insane-review note above): gjc loads neither plugin skills nor plugin `/oh-my-gjc:*` commands. `bin/install-skill.sh all` installs the 4 skills into `~/.gjc/agent/skills/<name>/SKILL.md` AND all 8 commands into `~/.gjc/agent/commands/oh-my-gjc:<name>.md` (ACP-verified: all `/oh-my-gjc:*` then advertised). **First-time bootstrap must run from the shell** — `bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all` — because `/oh-my-gjc:setup` is itself one of the dead-until-installed commands (chicken-and-egg). ⚠ **Cache folders are `<marketplace>___<plugin>___<ver>`, so a bare `*oh-my-gjc*` glob matches EVERY plugin of this marketplace** (marketplace name == core plugin name) — it would run the alphabetically-first plugin's `install-skill.sh` and pass the core one as an arg → install fails. Always anchor to `oh-my-gjc___oh-my-gjc___*` and pick newest via `sort -V | tail -1`; every `install-skill.sh` now hard-guards a path-like arg. Re-run after every plugin upgrade; open a NEW gjc session (or `/move .`) so the slash-command palette rebuilds.
- **`omg` command rebrand (v0.7, 2026-07-08, omz-style):** the core commands are now `/omg:<name>` (primary), with `/oh-my-gjc:<name>` kept as a **deprecated migration alias** — `bin/install-skill.sh` installs BOTH filenames per command (`omg:<name>.md` + `oh-my-gjc:<name>.md`) plus a bare **`/omg` catalog** command (`commands/omg.md` → `~/.gjc/agent/commands/omg.md`, read-only listing). Lead all new docs with `/omg:`; the alias exists so old muscle-memory/docs keep working during migration (announce removal before dropping it). Skills still auto-activate by trigger words (no prefix). Verified: isolated-HOME install shows `omg.md` + `omg:<name>.md` + `oh-my-gjc:<name>.md` all present.
- **One-shot install (v0.7):** `install.sh` (repo root) = curl|bash — `gjc plugin marketplace add` → `gjc plugin install oh-my-gjc@oh-my-gjc` → native `install-skill.sh all`, optional plugins as args (`… | bash -s -- tower insane-review`), idempotent, shell-CLI only. `INSTALLATION.md` = agent paste-a-link pattern (human pastes one sentence + the raw URL into any coding agent → it runs install.sh or the manual steps, verifies, reports). Both verified via isolated-HOME new-user repro (rc=0).
- **⚠ Upstream gap (contribution CANDIDATE — doc only, implementation needs separate approval):** the root cause of the whole native-install dance is that gjc **does not load marketplace-plugin skills/commands into a session** — the skill registry drops non-native skills (`skills.ts`: `if (provider !== "native") return false`) and the claude-plugins slash-command provider is never registered (`discovery/index.ts` omits `import "./claude-plugins"`). Fixing this upstream (register the provider + load plugin skills natively) would make `install-skill.sh` unnecessary. Candidate upstream PR to `Yeachan-Heo/gajae-code` base `dev`; **not started** — file only after explicit approval (like PR #1710/#1676). Until then the native-install path is the supported workaround.
- **branch-flow (per-repo git discipline, patina model):** the `branch-flow` skill + `/oh-my-gjc:branchflow-always [on|off|status]` command install a **dev-integration / main-release** branch policy. Model: work branches (`feat/`·`fix/`·`chore/`·`docs/`) off `dev` → PR into `dev` → release (explicit only) `dev`→`main` merge PR + version bump + tag; `main` never committed directly, `dev` always ≥ `main`; parallel sessions use git worktrees; shared-branch pushes fast-forward-only. **Scope is per-repo, committed** (not the user-global semaphore path the other `*-always` use): `branchflow-always on` writes a marker block into the **repo's own `AGENTS.md`** and copies the repo-agnostic guide to the repo's `docs/WORKFLOW.md` (Repo-specifics box auto-filled), so the policy ships with the repo. Enforcement is soft (agent-followed) by default; optional GitHub server-side branch protection on request (no local git hooks). Ported from `~/workspace/patina`'s `docs/WORKFLOW.md`.
- **Semaphore mechanism (v0.3.1, live-verified on gjc 0.8.2):** `*-always` commands own ONLY their marker block (`<!-- BEGIN/END oh-my-gjc:<name> -->`) in user-global **`~/.gjc/agent/SYSTEM.md`**; back up to `.bak-<ts>` first; never touch content outside markers; exactly one block. **Why SYSTEM.md, not AGENTS.md:** gjc *discovers* user-level `~/.gjc/agent/AGENTS.md` but **drops it at injection** (`system-prompt.ts loadProjectContextFiles` filters `level === "project"` only), and `rules/*.md` `alwaysApply: true` renders only in the custom-system-prompt template — so the ONLY user-global every-turn surface is SYSTEM.md (`<system-prompt-customization>` slot). Proven by headless probe: AGENTS.md block = not injected; SYSTEM.md block = injected + format followed (behavioral test passed). Caveat: a project `.gjc/SYSTEM.md` **wholesale overrides** the user file in that repo. **Legacy migration (two generations):** old `my-workflows:*` markers AND v0.3.0-era `oh-my-gjc:*` markers in `~/.gjc/agent/AGENTS.md` (dead surface) are removed/migrated by the new commands. **Upstream fix submitted:** gajae-code **PR #1710** (`fix/user-global-agents-md-injection`, base `dev`, open) restores native user-global AGENTS.md injection — the SYSTEM.md block stays valid either way (project files keep precedence; identical content dedupes).
- **Presets (v0.2, 2026-07 evidence research):** `ideal` (display ideal-v2 — default `anthropic/claude-opus-4-8:xhigh`, executor `…:max`, planner+architect `openai-codex/gpt-5.5:xhigh` [cross-vendor code review: opus authors, gpt reviews], critic `xai/grok-4.3:high` [third-vendor independent gate]), `escalate-surgical` (relief pitcher — executor `anthropic/claude-fable-5:xhigh` only; return to ideal when done), `monorepo` (every role ≥1M ctx; critic `opencode-go/glm-5.2` with distillation-correlation caveat). Deprecates `ultimate`/`ultimate-f5` (v0.1) — `/oh-my-gjc:presets` detects and offers cleanup with user consent. Source of truth mirrors the user's `~/.gjc/agent/models.yml`.
- **`reviewer` preset + `extragoal` skill (v0.4, 2026-07-08, from upstream gajae-code `docs/`):** absorbed the upstream `reviewer` profile (review/audit stance — inverts the authoring role split: `default`/`architect`=`anthropic/claude-opus-4-8:high` [aggregator restraint / primary judge], `executor`=`openai-codex/gpt-5.5:high` [support], `planner`=`google-antigravity/gemini-3.1-pro-low:high`, `critic`=`openai-codex/gpt-5.5:high` [cross-family merge gate vs Claude-authored code]; `required_providers: [anthropic, openai-codex, google-antigravity]`). All three reviewer selectors live-verified rc=0 (2026-07-08) before merge. Paired with a bundled **`extragoal`** skill (`skills/extragoal/SKILL.md`) — ultragoal + external final review gate (fresh-context cross-family reviewer re-reviews the finished diff → machine-parsable `VERDICT: APPROVE|REQUEST_CHANGES` → leader triage → bounded ≤2 re-sign rounds → mechanical merge). Reviewer lanes wired to omj: native cross-session `gjc -p --no-session --model <cross-family> --tools read,search,find` (default; `goal` tool disable mandatory), `/oh-my-gjc:fable`, and `insane-review` (Pro web, operator-owned ToS lane) under an AND-gate. Fail-closed on missing/malformed/timeout verdict; secret scan mandatory on any egress lane. Ported from gajae-code `docs/extragoal-skill-template.md` (kept a local/bundled skill — upstream keeps it out of the default workflow set by product decision).
- **Merge safety contract (do not weaken):** name-scoped only (replace the target profile block if present, else append under `profiles:`); never delete/modify other profiles or top-level keys (`default`, `modelBindings`, …) — legacy ultimate/ultimate-f5 removal is the sole exception and requires explicit user consent; back up to `.bak-<ts>` first; result must be valid YAML with the target present or roll back (no partial save); preserve 2/6-space indentation + `required_providers`/`model_mapping` structure + original comments. The comment-preserving merge is agent-driven (via `read`/`edit`) rather than a PyYAML round-trip, which would drop the Korean rationale comments.
- **⚠ `escalate-surgical` executor must be `:xhigh`, not `:max`** — Fable 5 silently clamps `:max` down to `xhigh`; Fable refusals arrive as HTTP 200 + stop_reason. Activation hard-blocks when any required provider lacks credentials (verified at `--mpreset` time, not at merge time). Selectors/prices are catalog- and time-sensitive (2026-07); re-verify with `GJC_NOTIFICATIONS=0 gjc -p --no-session --no-tools --model <selector> "Reply OK"`.
- **⚠ Ephemeral gjc harness runs MUST disable notifications.** Every throwaway `gjc -p` verify/audit/test invocation (preset `"Reply OK"` checks, `/oh-my-gjc:fable` audits, and any `gjc` run inside a `/tmp` clone) MUST be prefixed with `GJC_NOTIFICATIONS=0` — the authoritative hard opt-out in gajae-code `notifications/config.ts` (`isSessionNotificationsEnabled`/`shouldRegisterNotificationsExtension` both fail-closed on `"0"`, unit-tested). Without it, the global `notifications.enabled` config auto-ons the session, it publishes `.gjc/state/notifications/<id>.json`, and the managed Telegram daemon eagerly creates a provisional "GJC <id>" **ghost topic** for a session that dies seconds later. Live-verified: `GJC_NOTIFICATIONS=0 gjc -p … "Reply OK"` returns OK and writes **no** notifications endpoint. User *working* sessions (`gjc --mpreset …`) keep notifications on — this rule is only for ephemeral harness runs.
- Non-Goals: reimplementing gjc-native workflows (team/ultragoal/ralplan/deep-interview), vendor auto-login, profile auto-injection (manifest unsupported — merge is explicit-command only), selector/price freshness guarantees.

### `gjc-bugwatch` (collector verified on real logs; triage/PR is agent-driven)
- Dogfooding bug collector. `bin/collect.ts` (batch scanner) reads `~/.gjc/logs/*.log` **and rotated `*.log.gz`** (structured JSONL: `{level,message,stack,...}`) and optionally session transcripts (`~/.gjc/agent/sessions/--<cwd>--/*.jsonl`), classifies signals (`gjc-internal`/`error`/`warn`), filters env/credential noise, dedupes by normalized fingerprint, redacts email/UUID/token/creds-in-URL, and **marks candidates not seen within `--fresh-days` (default 2) as `⏳stale` (likely already fixed upstream) — sinking them below fresh ones (`--fresh-only` drops them)**. `/gjc-bugwatch:scan` + skill drive triage → reproduce against a `/tmp` gajae-code clone → collect issue/PR **drafts** under `.gjc/bugwatch/drafts/`.
- **Precision split (important):** the **log** source is high-precision (real runtime stacks; ~0 false positives — verified: it surfaced `Cleanup invoked recursively` ×7 with a `/$bunfs/root/gjc-*` stack, `Subagent prompt failed`, `Claude usage fetch failed`, etc. from the author's real logs). **Session** scanning is opt-in (`--include-sessions`) and heuristic: session JSONL echoes source code the agent read, pasted logs, and analysis prose, so it self-contaminates — it trusts ONLY `[Uncaught Exception]` and always skips the current session (`GJC_SESSION_ID`). Default = logs only.
- **The mechanical part is a tool, the judgement part is the agent.** `collect.ts` (deterministic parse/dedupe/redact, unit-tested at `test/collect.test.ts`) vs the command/skill (LLM triage, clone-repro, draft authoring). Mirrors insane-review's split.
- **Resolved ledger (dead-bug suppression).** `.gjc/bugwatch/resolved.jsonl` records bugs **confirmed fixed upstream** keyed by the exact collector `fingerprint`; `collect.ts` loads it (`loadResolved`/`applyResolved`, unit-tested) and tags matching candidates `✅resolved`, sinking them below `⏳stale` (hide with `--hide-resolved`, also dropped by `--fresh-only`; override path with `--resolved FILE`). Purpose: a fresh-looking-but-already-fixed candidate (e.g. `Cleanup invoked recursively` ×73, fixed by #1462/PR #1465 but still logged by a pre-fix installed binary) stops re-surfacing as a live lead. Triage skips `✅resolved`; when Step-3 source verification finds a merged/closed fix, the agent records it in `resolved.jsonl` (+ human `RESOLVED.md`) via subprocess instead of drafting.
- **Contract (do not weaken):** drafts only — `gh issue/pr create`, `git push`, commit, and any external submission are forbidden (a human submits). Read-only over gjc logs/sessions/source (never mutate `~/.gjc`). Redaction stays on (candidates are meant to be pasteable into a public upstream issue). Dedupe by fingerprint (no duplicate drafts). Estimated cause/fix must be labeled "추정" unless confirmed in the clone — no fabrication. All output lives under `.gjc/` (gitignored) — and since `.gjc/**` is runtime-owned (agent `write`/`edit`/`ast_edit` are blocked there), drafts are written via a subprocess (`bun`/`fs`/`cp` from `/tmp`), exactly like the collector spools `candidates.jsonl`.
- **⛔ UPSTREAM PR TARGET = `dev`, NEVER `main` (HARD RULE).** When a human explicitly directs submission (which overrides the drafts-only default), every upstream `gajae-code` **PR MUST target the `dev` branch** (`gh pr create --base dev …`). `main` is the repo's *default* branch but upstream integrates through `dev` — a PR against `main` is wrong. There is **no direct push access** to `Yeachan-Heo/gajae-code`, so: push the fix branch to the fork `devswha/gajae-code`, then `gh pr create --repo Yeachan-Heo/gajae-code --base dev --head devswha:<branch>`. Base the branch on `origin/dev` (fetch it) — not on `main` — so the diff is clean. (Issues have no base branch; file normally.)
- **Automation lane (`ops/gjc-bugwatch/`, outside the plugin).** The manual lane is now promoted to an **automatic cadence** without weakening the plugin contract (drafts-only/read-only/redaction/no-fabrication all stay inside `plugins/gjc-bugwatch`; the glue lives in `ops/`). Pieces: a **systemd --user unit** (`gjc-bugwatch.service` → `daemon.sh` = `follow.ts | trigger.ts`) that on every **HIGH(`gjc-internal`)** signal injects a triage instruction into the operator's tmux session (`gjc-pr`) via `tmux send-keys` (payloads are absolute-path only — `injectTmux` **refuses any `~`**); a **cron** daily batch (`daily-scan.sh` = `collect --fresh-only --hide-resolved --json | trigger.ts --daily`, ~08:20) that injects a digest **only when there are fresh medium+ candidates** (low `warn`s = env/auth noise are floored out, matching the daemon's `--min medium`); and a **submission loop** (`enqueue-pr.sh`) that enqueues a verified draft into the horcrux control-tower queue (`horcrux queue add gjc-pr …`) — **never auto-submits**; a human approves, then pushes the fork branch + opens the upstream `--base dev` PR. Install idempotently via `ops/gjc-bugwatch/install.sh`; unit tests in `ops/gjc-bugwatch/test/trigger.test.ts` (bun test).
- Non-Goals: auto issue/PR creation or push (drafts only — the automation lane enqueues to the operator queue but never submits), changing gjc log/session formats (read-only). (The once-roadmap always-on daemon now ships as the `ops/` automation lane above.)


### `tower` (control-tower orchestration; generalized from horcrux, verified locally)
- Generalizes the horcrux control-tower pattern into a plugin: one supervisor session runs a **standing fleet** of TUI-agent (gjc) sessions. Four generalized parts under `bin/` (no-dep stdlib/bash): `session_watch.py` (busy→idle watcher — config-driven window prefix/busy·idle marks/exclude/interval/confirm; emits `IDLE`/one-time `INIT` events; anti-flap confirm streak), `tower-notify.sh` (tmux `send-keys` injection + TUI-trap defenses), `queue_store.py` + `tower` CLI (idempotent operator decision queue), and `skills/tower/SKILL.md` (the operational loop). Command `/tower:setup`. Native-install required (same gjc gap as the others) — `bin/install-skill.sh all`.
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

**In-flight:** work continues on `dev`/branches; a release stops at PR/`dev` state until the 3 gates + 하코 approval. (`v0.7.0` omg rebrand shipped ~minutes before this mandate under the old self-merge pattern; retro-review + approval request filed — no unilateral rollback without explicit instruction.)

## Verification expectations

Before considering a plugin change done:
- **Static (always):** `marketplace.json` and `plugin.json` parse as JSON; convention
  files exist at expected paths; `marketplace` entry name/source match the manifest.
- **Behavioral (when the surface is reachable):** exercise the actual surface. The
  CLI path (`codex exec`) is testable wherever the Codex CLI is installed/logged in;
  the App/CDP path needs a running CDP-enabled Codex App and is otherwise deferred.
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
