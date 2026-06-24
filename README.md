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

```
/plugin marketplace add devswha/oh-my-gjc      # GitHub shorthand
# or: /plugin marketplace add https://github.com/devswha/oh-my-gjc.git
# or (local checkout): /plugin marketplace add ./

/plugin install oh-my-gjc@oh-my-gjc         # the workflow-skills plugin
# or: /plugin install example-plugin@oh-my-gjc   # the template/reference plugin
```

After installing `oh-my-gjc`, the `easy-answer` skill loads (gjc rephrases its
final answer in plain language when relevant) and the toggle command is available:

```
/oh-my-gjc:easy        # force plain-language final answers ON for the session
/oh-my-gjc:easy off    # turn it back OFF
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
