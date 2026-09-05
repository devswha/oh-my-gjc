# AGENTS.md — working in oh-my-gjc

Agent-facing guide for `oh-my-gjc`, a **plugin marketplace** for Gajae Code (`gjc`).
Read this before adding or editing plugins. Human-facing intro lives in [README.md](./README.md).

## 2026-08-31 identity cutover: back to oh-my-gjc

`oh-my-gjc` is the canonical repository, marketplace/plugin identity, and `./plugins/oh-my-gjc` source. `/omg:*` commands remain unchanged.

v0.27.0 was the final old-identity bridge. The canonical installer is `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`; old `raw.githubusercontent.com/devswha/oh-my-gajae-code/...` URLs do not redirect. Old GitHub repository pages and Git remotes redirect, but active instructions and local checkout names use `oh-my-gjc`.

New installs write only `oh-my-gjc` bindings. The former `oh-my-gajae-code` suite-root binding is a read-only fallback for at least 30 days or two releases; it is never rewritten or cleaned up by this cutover. Existing old XDG research data, credentials, and `models.yml` remain in place.

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
- `gpt-image`: POSIX deadline enforcement, the same logged-in dedicated ChatGPT Chromium CDP profile, and Python Playwright. It shares the CDP single-flight lease with `insane-review`; never run both concurrently.
- `insane-search`: Python 3, `curl_cffi>=0.15.0`, Beautiful Soup, PyYAML, and markdownify; `yt-dlp` is optional for supported media metadata/captions. It never installs dependencies automatically.
- `no-english`, `extragoal`, and the `example-plugin` template: no external prerequisites.

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
- **Removed code is archived in `docs/removed/` (2026-07-21 user directive).** When you delete code or retire a capability, in the SAME change copy its removed source into `docs/removed/<name>/` and add an entry to `docs/removed/README.md` (original path(s), removal commit, release version). Git history is NOT a substitute — the archive is the browsable record. The archive is documentation only: never installed, executed, resolved by the suite-root binding, or referenced by `install.sh` / `install-skill.sh`. This complements (does not replace) the `AGENTS.md` tombstone that records rationale/boundary; when a tombstone outgrows one line of rationale/boundary, its full prose moves to `docs/removed/tombstones.md` in the same change.

## Per-plugin notes

> **Note (single suite):** marketplace exposes only `oh-my-gjc`. The sections below retain
> pre-integration plugin names as **capability notes**; removed capabilities live in the
> tombstone table below — full prose: `docs/removed/tombstones.md`.
> All current suite files are in `plugins/oh-my-gjc/`.

### Removed capabilities (tombstones)

> Full rationale/boundary/past-verification prose, verbatim: `docs/removed/tombstones.md`.
> "네이티브 잔존물만" rows mean `install-skill.sh` `cleanup_removed` removes exactly that
> skill directory + `omg:*.md` command and never touches user state.

| capability | removed | why | cleanup boundary |
|---|---|---|---|
| `codex-cli-control` | 0.12.0 | 관제탑 발주·하코 승인(2026-07-13)·명시 호출 0회 — patina·flask 파이프라인이 `codex exec` 직결 | 네이티브 잔존물만 |
| `codex-deepwork` | 0.11.0 | 실사용 0회 + `lazycodex`와 중복 — 파일-쓰기 위임은 gjc team/ultragoal 소관 | 네이티브 잔존물만 |
| `lazycodex` | 0.12.0 | 하니스 발원 세션 0건 — gjc 네이티브 워크플로로 충족 | 네이티브 잔존물만 |
| `time-left` + `lazycodex-gjc` | 0.25.0 | ETA 측정 불가·유효한 Codex 토큰 없음 (`tools/sdk-lab` 동반 은퇴) | suite 소유 스킬·커맨드·런타임·영수증만; credentials·`~/.codex`·`models.yml`·사용자 LazyCodex/OMO 불가침 |
| `codex-app-control` | 0.11.0 | 대상 앱 빌드 트랙 폐기 — GPT Pro 리뷰는 `insane-review`가 전담 | 네이티브 잔존물만 |
| `multivendor-presets` | >v0.17.1 | 내장 프리셋 사용(하코 direct order); v0.22.0 재도입분도 v0.29.0 철회 | 네이티브 잔존물만; 사용자 `models.yml`·`sol` 프로필 불가침 |
| `preset-pack` | 0.29.0 | 커스텀 프리셋 배포 폐지 — GJC 내장 프리셋만 사용(사용자 직접 지시) | 네이티브 잔존물만; `models.yml`·병합 `daily`/`agent` 프로파일 절대 불가침; 죽은 세션 복구는 `gjc -r <세션ID> --mpreset <내장 프리셋>` |
| `release-gate` | >v0.17.1 | 저장소 운영 규칙이라 공개 기능 아님 — 검증·외부 리뷰는 일반 절차와 `extragoal`이 커버 | 네이티브 잔존물만 — **Release rules는 유지** |
| `easy-answer`·`plain-layer`·`branch-flow` | >v0.17.1 | 중복 UX/정책 레이어 — 간결 직답 + gjc 네이티브 워크플로 + 각 리포 `AGENTS.md`로 대체 | 퇴역 스킬·커맨드·`easy-always` 마커만(백업 후); `models.yml` 불가침 |
| `gjc-bugwatch` 공개면 | >v0.17.1 | `ops/gjc-bugwatch/`를 내부 운영 도구로만 유지 | 트리거 스킬·`/omg:bugwatch-scan`만 |
| `session-observer` | 0.23.0 | 하코 직접 지시 — 터미널 세션 JSONL tail/tmux로 충족 | 네이티브 잔존물만 |
| `fable` | 0.26.0 | Fable 감사·Opus 폴백 모두 무보고 스톨 | `omg:fable.md`만; `claude-fable-5` 프리셋 참조는 무관·유지 |
| `adaptive-response`·`deep-onboarding`·`multi-harness-research` | 0.32.0 | 사용자 직접 제거(2026-08-18) — private 런타임 동반 은퇴 | suite 소유 스킬·커맨드·private 런타임·well-formed `gate-always` 마커만(백업 후); 마커 외 바이트·malformed 마커·외부/사용자 인증·설정 불가침 |
| `ouroboros` | 0.33.0 | OMG 래퍼 스킬·커맨드만 제거 대상 — 외부 업스트림 패키지가 아님 | 래퍼만; 외부 Ouroboros 패키지·`~/.ouroboros`·브리지·MCP·Seeds·인증 전부 불가침 |
| `gajae-app` | 0.14.0 | — (전문 참조) | 네이티브 스킬·커맨드만; claudecodeui 체크아웃·빌드·데이터·서비스 불가침 |
| `tower` | 0.12.0 | 미사용 — 실관제탑(horcrux)은 자체 스크립트 | 네이티브 잔존물 + orphan 파일 일체; `TOWER_URL` 큐는 외부 서버 소관·무관 |

### `insane-review` (CLI pack + GUI CDP/Astra harvest verified)
- Command `/omg:insane-review` + a native-installable skill (`skills/insane-review/SKILL.md`). Faithful port of `fivetaku/insane-review`. gjc scopes the complete relevant file set → repomix packs it (full code, line numbers, secretlint, packed-file audit) → drives the **logged-in ChatGPT web session over CDP** → selects+**verifies** the requested model and Pro effort (fail-closed) → harvests the review to the current project's `.insane-review/response_*.md`. Zero API cost (runs on the user's ChatGPT subscription). Also a web-only `agent-council` member via `--council` (see `references/council-setup.md`).
- **Native install required — WHY (history + current):** on gjc 0.8.2 (`main` & `dev`, verified then) gjc surfaced NEITHER plugin skills NOR plugin commands as first-class: (1) the skill registry dropped non-native skills (`skills.ts`: `if (provider !== "native") return false`); (2) the marketplace slash-command provider (`discovery/claude-plugins.ts`) was never registered because `discovery/index.ts` omitted `import "./claude-plugins"`, so a plugin's `commands/*.md` were not advertised as `/<plugin>:<command>` in ANY session (proven via ACP `available_commands_update`: zero marketplace-plugin commands, only builtins + native `skill:*`). **Current state (gjc 0.9.x): plugin `commands/*.md` ARE auto-exposed — but under the wrong `<plugin>:<name>` namespace — while plugin skills still don't surface** (see the `oh-my-gjc` core section below); native install stays REQUIRED either way. `bin/install-skill.sh` copies SKILL.md into `~/.gjc/agent/skills/insane-review/` (user) or `<cwd>/.gjc/skills/` (project) and installs canonical commands from `templates/` as `~/.gjc/agent/commands/omg:<name>.md` (the filename IS the native command name; the 0.8.0-era deprecation tombstones were dropped in 0.8.1). Applies to every marketplace plugin, not just this one.
- **Turn identification, quota, and selector resilience (backported from sol-lane 0.6.1/0.6.5).**
  The answered turn is the `data-message-id` set difference, AND-ed with a strict count baseline;
  completion requires that turn's own copy button (or a restored send button), never a global
  copy-button count delta — user turns also carry copy buttons, so the old delta reported
  "complete" while the fresh node was still empty and saved the PREVIOUS answer as the result.
  Clipboard harvest is validated against that turn's DOM text (short answers require full
  equality). Quota blocks are detected from `role=dialog`/`role=alert` surfaces only — never from
  answer prose — and exit immediately instead of burning the full wait. Copy/stop/user/assistant
  selectors are fallback lists, so one `data-testid` rename no longer kills the run.
- **Bound conversation and stall recovery (sol-lane 0.6.0/0.6.5).** The send path captures the
  SPA conversation URL (`/c/<id>`) and the wait loop reloads it when the assistant turn stays
  empty with no streaming indicator for `INSANE_REVIEW_STALL_RELOAD` seconds (default 45, max 3
  reloads). Reproduced live 2026-09-01: the client stream died while the answer existed
  server-side, and without a bound URL the completed answer was unrecoverable. Recovery is a
  reload, never a resend — a resend burns another Pro message and forks the chat. Live SPA
  location is read via `location.href`; Playwright's cached `page.url` does not reflect
  pushState and is no longer used anywhere in the engine.
- **Followup on a bound conversation (`--followup`).** A response artifact records its
  conversation URL, and passing that artifact (or the URL) back re-enters the same chat to ask
  again without re-packing, without project grouping, and without re-driving the model menu —
  the conversation already holds the attachment and the verified model, so re-selection can only
  break it. Landing anywhere other than a `/c/<id>` conversation aborts rather than leaking the
  question into the wrong chat. Changed code is a new run, never a followup: that conversation's
  attachment is the old code.
- **Sibling fork — `sol-lane` (`github.com/devswha/sol-lane`).** Both engines fork
  `fivetaku/insane-review` v0.5.3 (`2b3c926`, 2026-06-28) and have since diverged: the OMG copy
  carries the CDP-listener profile proof, `rejection_reason`, `write_response_artifact`, and the
  `--include` pack audit; the lane copy carries the upstream 0.6.x recovery lineage
  (`capture_conv_url`, `msg_id_set`, `write_run_manifest`, `detect_quota_block`, `login_state`).
  Fixes flow lane → OMG by backport, each annotated in `pack_and_ask.py` with the lane commit
  (e.g. `e8c1a3f`, `0002` menu work). `lane engine export <path>` is lane's byte-exact publication
  path with a `*.provenance.json` sidecar; **OMG does not consume it today** — importing it would
  drop the OMG-only hardening above, so engine sync is a deliberate decision, never automatic.
  `/omg:insane-review` prefers `lane review --root` when a `lane` binary resolves (PATH, then
  `$SOL_LANE_ROOT`, then `~/workspace/sol-lane`), and falls back to the `$IR` engine path
  otherwise. Distributed skill/command bodies MUST NOT hardcode a personal checkout path.
- **Hardened local engine** (`bin/pack_and_ask.py`, Playwright-based, cross-platform): it is no longer byte-for-byte upstream and carries audited local DOM/security patches. The gjc port also rewrote the shell: skill/command adapted to gjc terms + the `ask` tool onboarding, and the Claude-Code `setup/` (GitHub-star prompt + `~/.claude/settings.json` SessionStart update hook) was **dropped**. Do not reimplement the engine flow with gjc's `browser` tool — the hardened engine is more robust.
- **Path resolution:** `${CLAUDE_PLUGIN_ROOT}` is NOT substituted in gjc command/skill bodies. Each native install writes one exact private mode-`0600` suite-root binding: project `<cwd>/.gjc/runtimes/oh-my-gjc/root`, then user `~/.gjc/agent/runtimes/oh-my-gjc/root`. Asset consumers validate its single absolute canonical root and required non-symlink asset, resolve the new project binding then new user binding, then the former `oh-my-gajae-code` binding as a read-only fallback for at least 30 days or two releases, and finally the direct `plugins/oh-my-gjc/` checkout fallback. Missing or malformed bindings fail closed; bootstrap, upgrade, and repair rerun hardened root `install.sh`, never a cache selection.
- **Security contract (do not weaken):** repomix secretlint forced on (a local repomix config disabling it aborts the run); fail-closed on unverified model / unattached pack / truncated prompt / timeout / empty response (no partial save); `--require-model` must accompany `--model`; output files `chmod 600`. Prompting Pro ships relevant code to an external web service — personal subscription use only (not OpenAI-endorsed).
- **Prerequisites (manual):** Python `playwright`+`pyperclip` (`--check-env --install`), Node/`npx` (repomix auto via `npx -y`), and a Chromium-family browser on CDP `:9222` with a **dedicated profile** logged into chatgpt.com + the requested Pro model selected. Login can't be automated.
- **CDP↔profile binding (v0.34.1):** Chrome 136+/145+ no longer writes the `DevToolsActivePort` receipt into the user-data-dir (measured 2026-08-19 on Chrome 145.0.7632.45 — fresh headless and GUI launches leave no file), which made the receipt-only binding fail-closed on every run. The engine now proves the binding with the **127.0.0.1 listener process itself** (exact connect-address match; Chromium-family executable via `/proc/pid/exe`/`ps comm`/CIM; last `--user-data-dir=<absolute path>` + `--remote-debugging-port=<port>` parsed exactly like Chromium — `=`-form values only, bare switches rejected, parsing stops at `--`) and keeps the receipt as a secondary proof for older Chromium; the shared proof also enforces the hardened profile dir (owner/0700/no symlinks) and never substitutes requested strings for observed menu-row evidence. `gpt_image_web.py` delegates to the shared `cdp_binds_dedicated_profile`. Model-menu driving is alias-based (`--model pro` ⇒ pro/최대/울트라/max/ultra candidates, verified via row text/aria-checked/pill, fail-closed without evidence) because ChatGPT rotated the switcher labels 3+ times on 2026-08-19 alone; radios only respond to `dispatch_event('click')`, and an already-correct model+effort pair skips manipulation entirely. Cross-reviewed over three rounds (all REQUEST_CHANGES findings fixed forward).
- **Composer & menu robustness (v0.34.2):** `clear_composer` must read back an empty composer before `put_text` inserts (unverified clear aborts the run), `composer_has_prompt` requires exact normalized equality (the old 1.5x slack could transmit a leftover draft), radio selections verify via the checked radio OR the reopened top-level reasoning row (UIs where a successful selection closes the submenu), and the legacy receipt is read through `O_NOFOLLOW`+`fstat`. These implement the remaining first-review findings (#5, #6, #2-residual).
- **Verified here (2026-07):** engine AST/`--help`/`--list-browsers`/`--check-env` on Linux; `--pack-only` end-to-end via `npx repomix@1.15.0` (packed-file audit + token count). The former cache-glob simulated-install check is historical, non-executable evidence only; current installs bind the exact suite root. CDP→ChatGPT harvest needs a logged-in Pro session and is deferred-environment.
- Non-Goals: API-backed review, auto-login, engine reimplementation on gjc `browser`. (읽기 전용 로컬 CLI Q&A capability는 0.12.0에서 제거됨.)

### `oh-my-gjc` (core — absorbed my-workflows v0.3)
- **The current focused suite has 5 skills and 5 commands.** Skills: `no-english`, `extragoal`, `insane-review`, `insane-search`, and `gpt-image`. Commands: bare `/omg` plus `/omg:setup`, `/omg:no-english`, `/omg:insane-review`, and `/omg:gpt-image`. `no-english` and `gpt-image` never auto-activate from ordinary natural language; only their explicit commands may load them. `insane-search` activates only after ordinary public-URL access is blocked/incomplete or for an explicit high-friction public-platform request, never for a normal web search.
- **Native install is REQUIRED:** canonical command bodies remain in `templates/`; the hardened one-shot installer copies all 5 skills and 5 commands, removes explicitly retired suite-owned native surfaces and the retired private multi-harness runtime, and emits the suite-root binding.
- **One-shot install:** root `install.sh` performs marketplace add/update → plugin install → native install. No optional plugin arguments.
- **Auto-update is opt-in (`bin/omg-autoupdate.sh`).** The one-shot installer NEVER schedules updates. A user opts in explicitly with `omg-autoupdate.sh enable` (systemd `--user` timer, cron fallback; `--interval`, `--local <checkout>` for offline). Each `run` re-executes the trusted canonical `install.sh` (or the `--local` checkout) under a single-flight `flock`, refuses to run as root, and appends timestamped OK/FAILED records to `${XDG_STATE_HOME:-$HOME/.local/state}/oh-my-gjc/autoupdate.log`. `enable` copies the script to a stable state-dir path so a version-bumped plugin cache path can never break the scheduled unit. `disable` removes the timer/cron; `install-skill.sh uninstall … user` also best-effort disables it. It MUST NOT auto-enable, run as root, or bypass the lock/log.
- **GJC 0.11 plugin boundary:** `gajae-plugin.json` now routes a source through GJC's native bundle installer before marketplace/npm classification, but native bundles intentionally forbid top-level `skills`, `commands`, and `agents`; they may only extend the four built-in workflows/role agents with subskills, tools, hooks, MCPs, and appendices. OMG's independent trigger skills and `/omg:*` commands therefore still require `templates/` + `install-skill.sh`.
- **No-English presentation:** `/omg:no-english [on|off|status]` explicitly controls `no-english` for the current session only; ordinary Korean conversation and natural-language language requests do not activate it. It reduces unnecessary English mixing only in Korean responses and preserves code identifiers, commands, paths, API/protocol names, exact labels, logs, and quotations. It MUST NOT translate away evidence, uncertainty, warnings, or approval boundaries.
- **`extragoal` skill (v0.4, 2026-07-08):** ultragoal + external final review gate. The default reviewer is native cross-session gjc; optional N-of-N adds `insane-review` under an AND-gate across the selected lanes. Missing/malformed/timeout verdicts fail closed; secret scanning is mandatory on egress.
- **`insane-search` skill (fivetaku 0.14.0 port):** suite-root-bound CLI for blocked public pages. It prefers official public endpoints, then an SSRF-pinned TLS-impersonation grid, and exposes only boundary-wrapped untrusted web content to the agent. The OMG port removes the upstream Claude star/setup flow, disables runtime package installation, learning/observation persistence, cross-request cookies, private-network access, local browser subprocess fallback, and generic browser escalation after the pinned grid fails. Authentication, CAPTCHA, and paywall bypass are out of scope. Vendored MIT provenance is pinned in `skills/insane-search/references/upstream.md`.
- **`gpt-image` skill:** explicit-only `/omg:gpt-image <prompt>` drives the logged-in ChatGPT Images `/images/` web surface over the verified local dedicated CDP profile. It must associate exactly one new asset with the new assistant turn, wait for completion, and use the fullscreen UI **Save/Download** action; screenshots, thumbnails, signed-asset fetches, APIs, and backend fallbacks are forbidden. The current share-labeled viewer control may be opened only to reach that download action; Copy link and social publication controls are never clicked. It validates PNG magic/size/dimensions, atomically writes the image plus provenance under `.gpt-image/` with directory `0700` and files `0600`, and fails closed on login, quota, timeout, UI drift, ambiguous assets, or download mismatch. It shares a per-port single-flight lease with `insane-review`; concurrent CDP automation is rejected. The prompt crosses the external ChatGPT privacy boundary; auto-login and dependency installation are out of scope.
- **⚠ Ephemeral gjc harness runs MUST disable both notifications and SDK hosting.** Every throwaway `gjc -p` verify/audit/test invocation (external review or a `/tmp` clone) MUST be prefixed with `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`. In GJC 0.11 the canonical SDK v3 loopback bus publishes `.gjc/state/sdk/<id>.json` independently of managed notifications; disabling notifications alone does not suppress that endpoint. User working sessions keep both surfaces available — this rule applies only to disposable harness runs.
- Non-Goals: reimplementing gjc-native workflows (team/ultragoal/ralplan/deep-interview), vendor auto-login, or shipping/auto-merging custom model presets (the suite no longer distributes presets — `preset-pack` removed in v0.29.0; use GJC built-in presets).

### `gjc-bugwatch` (internal operations only)
- `bin/collect.ts`, `bin/follow.ts`, their tests, and `ops/gjc-bugwatch/` remain repository-owned operations tooling — never installed public capability. Internal automation stays drafts-only/read-only with redaction; no automatic issue/PR creation. Human-directed upstream PRs target `Yeachan-Heo/gajae-code` base `dev`.
- **의도적 유지(2026-07-19):** 상류 PR의 human 승인 게이트는 제3자 저장소에 하코 명의로 기여하는 외부 신원 경계라, 본 저장소 릴리스 자율화(승인 게이트 폐지)와 별개로 유지한다.

### `example-plugin`
- Reference template: one command + one skill. Copy to bootstrap a new plugin.

## Git autonomy (effective 2026-07-15, 하코 mandate; 확장 2026-07-19)

- After completion criteria, focused verification, and any required independent review pass, the agent **MUST commit its own completed work to the current work branch and push it to that branch's remote without waiting for per-change approval**.
- Stage only the intended task diff. Never absorb, revert, stash, or rewrite unrelated user work. Never force-push.
- **`dev` must never drift behind `main`** (2026-09-01, adopted from patina's `docs/WORKFLOW.md`): after any commit lands on `main` — release, hotfix, or otherwise — immediately fast-forward `dev` to `main` and push both. A stale `dev` is the #1 way this workflow rots.
- **Parallel sessions use git worktrees** (2026-09-01, adopted from patina's `docs/WORKFLOW.md`): one worktree + one branch per session, branched from the latest `main`, converging back at `main`. Never run two sessions in the same working directory on the same branch.
- **Pre-push safety on shared branches:** `git fetch` first and confirm the push only *adds* commits — `git merge-base --is-ancestor origin/<branch> HEAD` — never a history rewrite.
- **Delete merged branches** (local + remote, `git branch -d` + `git push origin --delete`) and `git fetch --prune` in the same change. Keep only `main`, `dev`, and genuinely in-flight branches.
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

## Skills audit update (2026-09-04 UTC)

- `insane-review` activates on explicit ChatGPT/Pro review requests, not ordinary code review or public search. The bundled engine accepts `--require-model current` (read and freeze selected UI evidence) or an exact model name such as an operator-requested Astra label; no silent Sol fallback. `--inspect-session` is read-only and sends nothing. Unknown login evidence fails readiness without demanding another login.
- `insane-search` has no browser, login, or model prerequisite. `bin/setup_insane_search.py --install` is an explicit one-time setup into a private managed venv; the launcher reuses it but never installs dependencies during a fetch. Root/native installers and `/omg:setup` must not invoke setup.
- Installed resolver blocks reject an existing invalid higher-priority binding rather than falling through. Review/search keep the read-only old-identity fallback; gpt-image keeps its current-identity-only boundary.
- Live Astra UI compatibility and CDP response harvest require an available dedicated logged-in browser; fixture checks alone do not establish that evidence.

### v0.36.1 live follow-through (2026-09-04 UTC)

Normal GUI Chrome reused the existing dedicated login; a missing DISPLAY variable did not mean no GUI existed. The engine now discovers one current-user X11 socket, waits for login hydration, and handles the direct Astra model picker. Model-bound Pro proof is required in initial/current snapshots, post-switch snapshots and sliders. Live full-code attachment → GPT-6 Astra (최대) → completed response harvest passed without another login; evidence: `docs/verification/omg-release-v0.36.1-2026-09-04.md`.

### v0.37.0 research follow-through contracts

- Root `install.sh --local <checkout>` and updater `--local` select the actual local payload on fresh/repeated/upgraded installs. No remote or unforced fallback. Native files are staged with recoverable snapshots and the binding is last; the journal does not roll back GJC marketplace/cache changes or later retired cleanup.
- A review run records its send attempt before irreversible input and never automatically resends after that boundary. `--harvest-only`/`--resume` sends nothing and requires the recorded conversation, exact request hash/run marker/baseline, verified model and audited packed-file identity. A missing turn ID may be bound only after all that evidence matches. `keyboard.type()` is not a safe multiline composer fallback: its newlines can submit. Attachment labels are excluded from the exact prompt-body hash. `--followup` remains a new request.
- Search supports sequential multi-URL `--body-json`/`--jsonl`, retaining untrusted-content boundaries and per-URL guards. PDF/JSON-LD limits and failures have explicit coverage metadata; fetch success never implies complete extraction. Explicit public captions currently cover single YouTube videos and WebVTT, with exact language/manual-or-auto selection. Authentication/age gates stop before yt-dlp can switch client or use an embed fallback.
- `/omg:setup` remains aggregate static inspection only. Public command expansion/argument fixtures, real GJC sandbox checks, offline engine tests and optional natural-language activation evaluation have separate evidence. CI dependencies are explicitly hash-pinned for testing; production fetches never install them.
