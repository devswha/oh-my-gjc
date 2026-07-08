# insane-review (gjc port)

> **GPT-5.5 Pro has no API. This plugin uses it from inside gjc anyway.**

GPT-5.5 Pro lives only in the ChatGPT web app (subscription) — there is no official API, so you can't
reach it from Codex CLI, an agent-council API provider, or gjc's model presets. `insane-review` drives
your **logged-in ChatGPT web session over CDP**: gjc scopes the complete relevant file set, packs it with
repomix (full code, no `--compress`), sends it to Pro, verifies the model **fail-closed**, and harvests the
review. **Zero API cost** — it runs on your existing ChatGPT plan.

This is a faithful port of [fivetaku/insane-review](https://github.com/fivetaku/insane-review) into the
`oh-my-gjc` marketplace. **The engine (`bin/pack_and_ask.py`) is kept byte-for-byte** so the hardened
behavior — turn-scoped completion detection, fail-closed model/attachment verification, repomix hermetic
config, folder-named ChatGPT project grouping — is preserved exactly. Only the plugin shell (skill,
command, onboarding) was rewritten for gjc conventions.

## Install

Shell CLI (batch-capable):
```sh
gjc plugin marketplace add https://github.com/devswha/oh-my-gjc   # once
gjc plugin install insane-review@oh-my-gjc                        # --scope user (default)
```
Or inside a running gjc chat session: `/plugin` → install `insane-review`.

## Run

```
/insane-review:review review the auth flow in src/auth
```
The command's Step 0 auto-onboards the environment (deps → browser → login) using gjc's `ask` tool; you
click through choices instead of typing CLI flags. First-run browser + ChatGPT login is manual (it can't
be automated); everything else is handled for you.

## Enable the skill (auto-activation) — one-time

> **gjc does not surface a marketplace plugin's `SKILL.md` as a skill.** By design, gjc's skill registry
> only loads *native* `.gjc` skills (`if (provider !== "native") return false`). So after
> `gjc plugin install`, the `/insane-review:review` **command** works, but natural-language triggers
> ("have Pro review this", "GPT한테 물어봐") and the `skill` tool / `/skill:insane-review` will **not** —
> the skill won't show up in a new session. This is true for every marketplace plugin, not just this one.

To get the auto-activating **skill** surface, install the SKILL.md as a native gjc skill:

```sh
IR="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___insane-review___*/bin/pack_and_ask.py 2>/dev/null | sort -V | tail -1)"
bash "$(dirname "$IR")/install-skill.sh"            # user scope → ~/.gjc/agent/skills/insane-review/
# or: bash "$(dirname "$IR")/install-skill.sh" project   # this repo only → <cwd>/.gjc/skills/
```

Open a new gjc session and `insane-review` now auto-activates and appears in the `skill` tool. Re-run after
a plugin upgrade to refresh the copy. Uninstall: `install-skill.sh uninstall [user|project]`.

## How it works

```
"have Pro review this"  /  /insane-review:review  /  council member call
  ↓
gjc selects the COMPLETE relevant file set (full code — no --compress for reviews)
  ↓
repomix pack  (line numbers · secretlint · packed-file-list audit · token count)
  ↓
CDP-attach the logged-in ChatGPT session (dedicated isolated profile on port 9222)
Select GPT-5.5 + Pro effort → re-open menu and VERIFY (mismatch = abort, fail-closed)
  ↓
Attach pack + prompt → confirm the prompt landed in the composer → send
  ↓
Wait for THIS turn to complete (new assistant node + new copy button); optional --force-answer-after
  ↓
Harvest the answer → ./.insane-review/response_*.md  (atomic write, verified-model header)
```

## Requirements

- **gjc** (Gajae Code)
- **Python 3.11+** with `playwright` and `pyperclip` (`python3 <engine> --check-env --install` installs them)
- **Node.js / `npx`** (repomix is pulled on demand via `npx -y repomix@<pinned>` — no manual install)
- **A subscription ChatGPT account with GPT-5.5 Pro**, logged in inside a Chromium-family browser launched
  on a debug port with a **dedicated profile** (Chrome 136+ ignores `--remote-debugging-port` on the main
  profile). The engine launches this for you cross-platform via `--launch-browser "<name>"`.

The engine resolves to `bin/pack_and_ask.py` inside the plugin's install dir, e.g.
`~/.gjc/plugins/cache/plugins/*insane-review*/bin/pack_and_ask.py`. `${CLAUDE_PLUGIN_ROOT}` is **not**
substituted in gjc command/skill bodies, so the skill/command resolve the path with a glob into `$IR`
(project-scope and repo-local fallbacks included).

## Key flags (engine)

| Flag | Purpose |
|------|---------|
| `--target <dir>` | Folder to pack (omit for a prompt-only opinion) |
| `--include <glob>` / `--ignore <glob>` | Narrow the packed set |
| `--model pro` | Select the reasoning effort |
| `--require-model "GPT-5.5"` | Verify the active model — abort send on mismatch (fail-closed) |
| `--prompt "..."` / `--prompt-file` | The question |
| `--force-answer-after <sec>` | Soft cut: click "Get answer now" so Pro answers from reasoning so far |
| `--max-wait <sec>` | Hard ceiling (default 1200 = 20 min); no partial save on timeout |
| `--project "<name>"` / `--no-project` | Folder-named ChatGPT project grouping (default on) |
| `--pack-only` | Just pack (inspect token count), don't send |
| `--council` | Council mode — response on stdout, logs on stderr |
| `--launch-browser <name>` / `--list-browsers` | Launch a dedicated-profile CDP browser / list installed ones |
| `--check-env` / `--ensure-env` / `--install` | Diagnose / auto-start saved browser / install pip deps |

Environment overrides: `INSANE_REVIEW_MAX_WAIT`, `INSANE_REVIEW_CDP_PORT` (9222), `INSANE_REVIEW_CHROME`,
`INSANE_REVIEW_REPOMIX_VERSION` (1.15.0), `INSANE_REVIEW_REPOMIX_TIMEOUT` (300), `INSANE_REVIEW_OUT`.

## Two roles

1. **Standalone reviewer** — you ask for a fix/review → gjc scopes the target → repomix pack → Pro
   analysis → applied back.
2. **agent-council member** — register Pro as a web-only council member (see
   [`references/council-setup.md`](references/council-setup.md)) so it debates with other models.

## Output

Lands in the **current project's** `.insane-review/` (never inside the plugin), `chmod 600`:
```
.insane-review/
├── pack_<target>_<ts>.md        # what was sent
├── response_<target>_<ts>.md    # Pro's answer + verified-model header
└── projects.json                # folder→ChatGPT-project URL cache
```

## Safety / notes

- **fail-closed by design** — wrong model, unverified login, truncated prompt, an empty pack, or a previous
  turn's answer are refused rather than silently sent or saved.
- **Secrets** — repomix's secretlint is forced on (a local repomix config that disables it aborts the run);
  suspicious files are excluded from the pack before anything leaves your machine.
- **Never use `--compress` for reviews** — it strips function bodies and produces false "looks fine" verdicts.
- Web-UI automation is not endorsed by OpenAI's ToS and selectors may need maintenance when the ChatGPT DOM
  changes. Intended for personal subscription use only.

## License

MIT — engine © fivetaku (upstream); gjc port packaged under `oh-my-gjc`.
