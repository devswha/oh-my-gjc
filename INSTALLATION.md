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
One install brings the whole suite (9 skills + /omg:* commands). There are no separate/optional plugins to add.

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

## Verify (report these)
```sh
gjc plugin list                                   # oh-my-gjc@oh-my-gjc listed
ls ~/.gjc/agent/skills/                            # 9 skills (easy-answer, gate-briefing, …, gajae-app, worktree)
ls ~/.gjc/agent/commands/ | grep '^omg'            # omg.md + omg:<name>.md present
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` to finish (model-preset merge + always-on toggles — all optional). Commands are `/omg:<name>`.

## Safety
Idempotent — re-running only re-copies. This installs a documented plugin suite; it does not send code anywhere or change model/provider credentials. Prerequisite-gated features (ChatGPT subscription + Chromium for insane-review) install with the suite but only run when their tool is present — otherwise they self-diagnose and stop cleanly.
