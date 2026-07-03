# oh-my-gjc

A plugin marketplace for [Gajae Code (`gjc`)](https://github.com/devswha) — bundle
slash commands, skills, sub-agents, hooks, and MCP servers as installable plugins.

Compatible with the Claude Code / Codex plugin spec, so the same repo works for
`gjc`, Claude Code, and Codex.

> **개인용 레포입니다 — 스타 찍지 마세요.** 내가 나 쓰려고 만든 마켓플레이스라
> 공개 배포/홍보용이 아니에요. Please **don't star** — this is a personal-use
> marketplace, not meant for public distribution.

## Install

Plugins install from the **shell CLI** (`gjc plugin …`) or, inside a running `gjc`
chat, the **`/plugin`** slash command. Installs are **user-scoped by default →
available in every project on this machine** (`--scope project` pins to one repo).

Add the marketplace once, then install — several plugins in **one command**:

```sh
gjc plugin marketplace add devswha/oh-my-gjc    # or a local checkout: gjc plugin marketplace add ./
gjc plugin install codex-cli-control@oh-my-gjc codex-deepwork@oh-my-gjc codex-app-control@oh-my-gjc lazycodex@oh-my-gjc my-workflows@oh-my-gjc
gjc plugin list                                 # verify
```

Inside a gjc **chat session**, use the slash-command equivalent (typing a shell
command in chat is just a message — use `/plugin` there):

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install <plugin>@oh-my-gjc
```

**Setup** (gjc keys, model presets, plugin prerequisites): see [AGENTS.md → Setup / Environment](./AGENTS.md#setup--environment) and [`.env.example`](./.env.example).

## Plugins

| Plugin | What it does |
|--------|--------------|
| `my-workflows` | Plain-language answers — `easy-answer` skill (accuracy first: keeps the technical term when simplifying would distort). `/my-workflows:easy` = this-session toggle; `/my-workflows:easy-always [on\|off]` = always-on across every session (injects a rule block into `~/.gjc/agent/AGENTS.md`) |
| `codex-cli-control` | gjc drives the local **Codex CLI** (`codex exec`): one prompt → final answer. No App/CDP needed. Sandbox defaults to `read-only`. |
| `codex-deepwork` | gjc delegates an **autonomous, file-writing** task to Codex (`codex exec`, write sandbox). Auto-uses the **LazyCodex** harness when installed. |
| `lazycodex` | Install/manage the **LazyCodex** deep-work harness in Codex (`npx lazycodex-ai`) + run `ultrawork` (plan→work→verify) tasks through it |
| `codex-app-control` | gjc controls the **Codex desktop App GUI** over CDP — `launch` starts the headless app (xvfb) with remote debugging, then `ask` attaches and drives it (one prompt → latest response) |
| `insane-review` | Get a **GPT-5.5 Pro** (web-only, no API) review from inside gjc — gjc scopes the files, repomix-packs them (full code, line numbers, secretlint), drives your logged-in ChatGPT session over CDP, verifies the model fail-closed, and saves the review to `.insane-review/`. Zero API cost. Also a web-only agent-council member. |
| `multivendor-presets` | Install multi-vendor **model-profile presets** into `~/.gjc/agent/models.yml` — `ultimate` (cost-no-object, best model per role) + `ultimate-f5` (escalation: router on Opus, executor escalates to Fable 5). `/multivendor-presets:install`, then `gjc --mpreset <name>`. |
| `gjc-bugwatch` | Dogfooding **bug collector** — a batch scanner reads `~/.gjc/logs` (+ optional sessions), extracts/dedupes/redacts gjc's own runtime errors & crashes, then `/gjc-bugwatch:scan` triages them, reproduces against a gajae-code clone, and collects upstream issue/PR **drafts** in `.gjc/bugwatch/drafts/`. Drafts only (no auto-PR). |
| `example-plugin` | Starter template — copy it to build your own |

Quick start after installing:

```
/my-workflows:easy
/codex-cli-control:ask prompt="reply with PONG"
```

The `codex-*` plugins include detailed docs at `plugins/<name>/README.md`.

## What's in here

Beyond the plugins above, this repo also carries:

| Path | What it is |
|------|------------|
| `.claude-plugin/marketplace.json` | The catalog — every plugin is registered here (`gjc plugin marketplace add ./`) |
| `plugins/<name>/` | One directory per plugin (manifest + commands/skills/agents/hooks). Each has its own `README.md` |
| `tools/discord-notify-bridge.ts` | Forwards a live gjc session's notifications (action-needed / idle / resolved) to a Discord channel via webhook. Notify-only. Tests in `tools/test/` (`bun test tools/test/e2e-bridge.test.ts`) |
| `guide/` | Personal Korean how-to page (`가재코드 실전 가이드`) — static `index.html` + `serve_www.py` (`python3 serve_www.py` → `http://0.0.0.0:8090/`) |
| `AGENTS.md` | Agent-facing spec: plugin format, schema, conventions, and detailed per-plugin notes |
| `.env.example` | Placeholder template for API keys (web search / Gemini / …). Copy → `.env`, then symlink into `~/.gjc/.env`. Never commit real keys |

## Build your own / contribute

See **[AGENTS.md](./AGENTS.md)** for the plugin format, schema, conventions, and
per-plugin notes (also used by AI agents working in this repo).

## License

MIT — see [LICENSE](./LICENSE).
