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
/oh-my-gjc:setup
```

That's it. `setup` installs the native skills, offers the model presets, and detects
your environment to recommend the optional plugins below.

## Core plugin — `oh-my-gjc`

| Surface | What you get |
|---|---|
| `easy-answer` skill | Final answers in plain language (accuracy first — keeps the technical term when simplifying would distort) |
| `gate-briefing` skill | Domain-blind approval-gate briefings for pending-approval moments: layman translation → approval boundary → evidence-backed checklist → verdict |
| `multivendor-presets` skill | Evidence-based model presets merged into `~/.gjc/agent/models.yml`: `ideal` (daily default), `escalate-surgical` (Fable 5 relief pitcher), `monorepo` (every role ≥1M ctx) |
| Toggles | `/oh-my-gjc:easy`·`gate` (this session) / `easy-always`·`gate-always [on\|off\|status]` (every session — AGENTS.md marker-block semaphores) |
| `/oh-my-gjc:setup` | Idempotent setup + environment detection → recommends optional plugins |

Details: [`plugins/oh-my-gjc/README.md`](./plugins/oh-my-gjc/README.md)

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
