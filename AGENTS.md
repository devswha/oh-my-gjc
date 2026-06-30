# AGENTS.md — working in oh-my-gjc

Agent-facing guide for `oh-my-gjc`, a **plugin marketplace** for Gajae Code (`gjc`).
Read this before adding or editing plugins. Human-facing intro lives in [README.md](./README.md).

## What this repo is

A single git repo that catalogs installable `gjc` plugins. One `marketplace.json`
lists every plugin; each plugin is one directory under `plugins/`. The format is
compatible with the Claude Code / Codex plugin spec.

Plugins are installed **only from inside a `gjc` session** via the `/plugin` slash
command. A shell `gjc plugin install …` does NOT install marketplace plugins (gjc
treats it as a chat message). Do not document or rely on a shell install path.

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
  existing `my-workflows` / `example-plugin` structure (same `plugin.json` fields,
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
- **Don't invent a shell install command** for marketplace plugins.

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

### `codex-app-control` (built; live verification env-gated)
- Skill `codex-app-cdp` + command `/codex-app-control:ask`. gjc attaches its
  `browser` tool to a running Codex desktop App via an explicit `cdp_url`, sends one
  prompt, and reads the latest completed response (hybrid turn-completion detection).
- v1 is **attach-only**: requires an already-running, CDP-enabled Codex App and an
  explicit `cdp_url` (no launch/build, no port auto-discovery). DOM selectors /
  completion signals are **provisional** until confirmed by a live attach spike.
- Same privileged-action safety stance as above.

### `my-workflows`
- `easy-answer` skill (rephrase final answers in plain language) + `/my-workflows:easy [on|off]` toggle.

### `example-plugin`
- Reference template: one command + one skill. Copy to bootstrap a new plugin.

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
