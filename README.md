# oh-my-gjc

A plugin marketplace for [Gajae Code (`gjc`)](https://github.com/devswha) — bundle
slash commands, skills, sub-agents, hooks, and MCP servers as installable plugins.

Compatible with the Claude Code / Codex plugin spec, so the same repo works for
`gjc`, Claude Code, and Codex.

## Install

Manage plugins **inside a `gjc` session** with `/plugin` (a shell `gjc plugin install`
does not work for marketplace plugins):

```
/plugin marketplace add devswha/oh-my-gjc      # or local checkout: /plugin marketplace add ./
/plugin install <plugin>@oh-my-gjc
```

**Setup** (gjc keys, model presets, plugin prerequisites): see [AGENTS.md → Setup / Environment](./AGENTS.md#setup--environment) and [`.env.example`](./.env.example).

## Plugins

| Plugin | What it does |
|--------|--------------|
| `my-workflows` | Handy workflow skills — `easy-answer` (plain-language answers) + `/my-workflows:easy` toggle |
| `codex-cli-control` | gjc drives the local **Codex CLI** (`codex exec`): one prompt → final answer. No App/CDP needed. Sandbox defaults to `read-only`. |
| `codex-deepwork` | gjc delegates an **autonomous, file-writing** task to Codex (`codex exec`, write sandbox). Auto-uses the **LazyCodex** harness when installed. |
| `codex-app-control` | gjc controls the **Codex desktop App** over CDP (attaches to an already-running app) |
| `example-plugin` | Starter template — copy it to build your own |

Quick start after installing:

```
/my-workflows:easy
/codex-cli-control:ask prompt="reply with PONG"
```

The `codex-*` plugins include detailed docs at `plugins/<name>/README.md`.

## Build your own / contribute

See **[AGENTS.md](./AGENTS.md)** for the plugin format, schema, conventions, and
per-plugin notes (also used by AI agents working in this repo).

## License

MIT — see [LICENSE](./LICENSE).
