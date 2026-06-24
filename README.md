# oh-my-gjc

A community **plugin marketplace** for [Gajae Code (`gjc`)](https://github.com/devswha).
Bundle slash commands, skills, sub-agents, hooks, and MCP servers as installable
plugins and distribute them from a single git repository.

The format is compatible with the Claude Code / Codex plugin spec, so the same
repo works as a marketplace for `gjc`, Claude Code, and Codex.

## Layout

```
oh-my-gjc/
├── .claude-plugin/
│   └── marketplace.json          # the catalog: lists every plugin in this repo
└── plugins/
    └── example-plugin/           # one plugin = one directory
        ├── .claude-plugin/
        │   └── plugin.json        # plugin manifest
        ├── commands/              # slash commands → /<plugin>:<file>
        │   └── changelog.md
        └── skills/                # skills, one directory each
            └── example-skill/
                └── SKILL.md
```

## Install (for users)

Inside a `gjc` interactive session:

> **Plugins are managed only from inside an interactive `gjc` session, via the
> `/plugin` slash command.** A shell command like `gjc plugin install …` does
> **not** work for marketplace plugins — it is treated as a chat message and
> starts a session instead. (The gjc binary still prints a `gjc plugin install
> <package>` hint, but that CLI is not wired up; it refers to a separate native
> `gjc/pi` plugin concept, not this marketplace.) This is a gjc-side limitation,
> not a problem with this repo.

```
/plugin marketplace add devswha/oh-my-gjc      # GitHub shorthand
# or: /plugin marketplace add https://github.com/devswha/oh-my-gjc.git
# or (local checkout): /plugin marketplace add ./

/plugin install my-workflows@oh-my-gjc      # the workflow-skills plugin
# or: /plugin install example-plugin@oh-my-gjc   # the template/reference plugin
```

After installing `my-workflows`, the `easy-answer` skill loads (gjc rephrases its
final answer in plain language when relevant) and the toggle command is available:

```
/my-workflows:easy        # force plain-language final answers ON for the session
/my-workflows:easy off    # turn it back OFF
```

Manage installs with `/plugin` (list / enable / disable / uninstall) and refresh
the catalog with `/plugin marketplace update oh-my-gjc`.

## Add a new plugin

1. Create `plugins/<your-plugin>/`.
2. Add `plugins/<your-plugin>/.claude-plugin/plugin.json`.
3. Drop content into convention directories:
   - `commands/*.md`     → slash commands `/<your-plugin>:<file>`
   - `agents/*.md`       → sub-agents
   - `skills/<name>/SKILL.md` → skills
   - `hooks/hooks.json`  → hooks
   - `.mcp.json`         → MCP servers
4. Register it in `.claude-plugin/marketplace.json` under `plugins`:
   ```json
   { "name": "your-plugin", "source": "./plugins/your-plugin", "version": "0.1.0", "description": "…" }
   ```

`source` may also point off-repo: `{ "source": { "repo": "owner/repo" } }`,
`{ "source": { "url": "https://…" } }`, or `{ "source": { "package": "npm-pkg" } }`.

## Schema reference

### `.claude-plugin/marketplace.json`

| field | required | notes |
|-------|----------|-------|
| `name` | yes | lowercase letters, digits, hyphens; must match the registered marketplace name |
| `owner` | yes | object; `owner.name` is required |
| `metadata` | no | free-form `{ description, version, … }` |
| `plugins` | yes | array of plugin entries |
| `plugins[].name` | yes | lowercase letters, digits, hyphens |
| `plugins[].source` | yes | string starting with `./` **or** an object with `path` / `repo` / `url` / `package` |
| `plugins[].version` / `.description` / `.category` | no | catalog display + pinning |

### `plugins/<name>/.claude-plugin/plugin.json`

| field | required | notes |
|-------|----------|-------|
| `name` | yes | lowercase letters, digits, hyphens |
| `version` | recommended | semver |
| `description` | recommended | shown in `/plugin` listings |
| `author` | no | `{ name, email, url }` |
| `homepage` / `repository` / `license` / `keywords` / `category` | no | metadata |
| `commands` / `agents` / `skills` / `hooks` / `mcpServers` | no | explicit paths; omit to use convention directories |

## License

MIT — see [LICENSE](./LICENSE).

## Tools: Discord notification bridge

`tools/discord-notify-bridge.ts` forwards a running gjc session's
**action-needed / idle / resolved** notifications to a Discord channel via an
incoming webhook. It is a client of gjc's Notifications SDK (it connects to the
per-session loopback WebSocket at `.gjc/state/notifications/<sessionId>.json`),
so it works regardless of whether the bundled Discord *adapter* (added in gjc
0.7.2) is wired into a delivery daemon.

```sh
# 1. put your webhook URL where the bridge can read it (gitignored under .gjc/)
mkdir -p .gjc/secrets && printf '%s' 'https://discord.com/api/webhooks/…' > .gjc/secrets/discord-webhook
#    …or export DISCORD_WEBHOOK_URL=…

# 2. run it next to a live gjc session that has notifications enabled
bun tools/discord-notify-bridge.ts
```

- **Notify-only.** A Discord *webhook* is push-only; the bridge cannot send
  replies back into the session. Interactive replies need a Discord *bot*
  (gateway), not a webhook.
- **Secrets.** The webhook URL is read from `$DISCORD_WEBHOOK_URL` or
  `.gjc/secrets/discord-webhook` and is never logged; the WS token is redacted.
- **Tests.** `bun test tools/test/e2e-bridge.test.ts` proves the full pipeline
  (mock gjc endpoint → bridge → Discord webhook receiver) with no real secret.
  `bun tools/test/mock-notify-endpoint.ts` stands up a mock endpoint for a manual
  run against a real webhook.
