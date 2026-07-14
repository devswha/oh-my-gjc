# Install oh-my-gajaecode (agent instructions)

**Human:** paste this one line into any coding agent (gjc, Claude Code, Codex, …):

> Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.

**Agent:** you are installing the **oh-my-gajaecode** single plugin suite for Gajae Code (`gjc`).
Do exactly the following in a terminal. Do not improvise other steps.

## Preconditions
- `gjc` must be on PATH (`command -v gjc`). If missing, stop and tell the human to install Gajae Code first.
- Plugin management is gjc's **shell CLI only** — there is no in-session slash command for it; run `gjc plugin …` in a terminal.

## Fastest path (one shot)
```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```
One install brings the whole v0.17.0 suite (10 skills + 15 commands: `/omg` + 14 `/omg:*`). There are no separate/optional plugins to add.

## Manual path (equivalent, if curl|bash is disallowed)
```sh
gjc plugin marketplace add devswha/oh-my-gjc
gjc plugin install oh-my-gjc@oh-my-gjc
# NATIVE install — gjc never loads plugin SKILLs into a session, and plugin commands would
# only auto-expose under a wrong namespace; copy both in natively as /omg:*.
# Plugin-scoped glob (cache is <marketplace>___<plugin>___<ver>; a bare *oh-my-gjc* glob hits every plugin), newest version:
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all
```
The native installer copies every bundled skill + command in one shot and fails loudly (with a missing list) if anything expected is absent — never a partial install.

## Gajae app migration
The self-hosted web UI now lives in [`devswha/claudecodeui`'s canonical SELF-HOST guide](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Upgrades remove native launchers only; they do not stop or modify a running app or service, its data, or its network state.

## Verify (report these)
```sh
gjc plugin list                                   # oh-my-gjc@oh-my-gjc listed
ls ~/.gjc/agent/skills/                            # 10 skills (easy-answer, gate-briefing, plain-layer, release-gate, lazycodex-gjc, …)
ls ~/.gjc/agent/commands/ | grep '^omg'            # 15 commands: omg.md + 14 omg:<name>.md
grep -A1 '^  sol:' ~/.gjc/agent/models.yml          # sol preset auto-merged at install (custom picker entry)
ls -l ~/.gjc/agent/runtimes/lazycodex-gjc/binding    # mode-0600 runtime binding (only when Codex CLI + systemd + Codex home were present at install; otherwise the bridge is skipped fail-closed)
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` to finish (model-preset merge + always-on toggles — all optional). Commands are `/omg:<name>`.

## Safety
Idempotent — re-running only re-copies. This installs a documented plugin suite; it does not send code anywhere or change model/provider credentials. Prerequisite-gated features install with the suite but only run when their tools are present: ChatGPT subscription + Chromium for insane-review; an already installed and logged-in Codex CLI + LazyCodex/OMO for lazycodex-gjc. The installer does not install or log in to those tools. The bridge defaults to read-only, requires explicit workspace-write authorization, runs external `codex exec --ephemeral`, and does not create a child GJC session or mutate GJC config/credentials. Its sensitive runner requires the private mode-0600 SHA-256 runtime binding produced by native user-scope install (skipped fail-closed when Codex is absent — re-run `install-skill.sh lazycodex-gjc user` after installing Codex); project-scope installs remain valid for the rest of the suite but cannot supply this bridge binding.
