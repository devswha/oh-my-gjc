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
One install brings the whole suite (9 skills + 12 commands: `/omg` + 11 `/omg:*`). There are no separate/optional plugins to add.

## Manual path (equivalent, if curl|bash is disallowed)
```sh
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh
```
This invokes the same hardened installer as the one-shot path: it refreshes the marketplace, binds native handoff to the plugin version reported by the current install operation, then writes the exact mode-0600 user-scope suite-root binding at `~/.gjc/agent/runtimes/oh-my-gjc/root`. Asset consumers resolve a project binding when one was installed separately, then this user binding, then the checkout fallback; missing or malformed bindings fail closed. The former newest-cache sequence is historical and non-executable; never reproduce it.

The native installer copies every bundled skill + command in one shot and fails loudly (with a missing list) if anything expected is absent — never a partial install.

## Gajae app migration
The self-hosted web UI now lives in [`devswha/claudecodeui`'s canonical SELF-HOST guide](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Upgrades remove native launchers only; they do not stop or modify a running app or service, its data, or its network state.

## Verify (report these)
```sh
gjc plugin list  # must list oh-my-gjc@oh-my-gjc
root="$HOME/.gjc/agent"
for skill in adaptive-response no-english time-left extragoal insane-review lazycodex-gjc deep-onboarding session-observer; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:gate.md omg:gate-always.md omg:no-english.md omg:time-left.md omg:fable.md omg:insane-review.md omg:lazycodex-gjc.md omg:deep-onboarding.md omg:session-observer.md; do
  test -f "$root/commands/$command" || exit 1
done
for skill in workflow-eta easy-answer plain-layer branch-flow worktree gjc-bugwatch multivendor-presets release-gate; do
  test ! -e "$root/skills/$skill" && test ! -L "$root/skills/$skill" || exit 1
done
for retired in easy easy-always plain branchflow-always worktree bugwatch-scan presets release; do
  test ! -e "$root/commands/omg:$retired.md" && test ! -L "$root/commands/omg:$retired.md" || exit 1
done
test -f "$root/runtimes/oh-my-gjc/root"
test "$(stat -c %a "$root/runtimes/oh-my-gjc/root" 2>/dev/null || stat -f %Lp "$root/runtimes/oh-my-gjc/root")" = 600
if test -e "$root/runtimes/lazycodex-gjc"; then
  test -f "$root/runtimes/lazycodex-gjc/binding"
  test -x "$root/runtimes/lazycodex-gjc/runner.mjs"
fi
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` for optional prerequisite checks and always-on toggles. Commands are `/omg:<name>`.

## Safety
Idempotent — re-running re-copies the 9 skills and 12 commands, removes the retired `gate-briefing` native directory and other explicitly retired omj surfaces, then serially refreshes the private user-scope time-left SDK runtime from the exact integrity lockfile when Bun >=1.3.14 and `flock` are available. That refresh runs `bun install --frozen-lockfile --production --ignore-scripts` for exact `@gajae-code/bridge-client@0.11.0`; Bun may contact the configured package registry, proxy, and network policy apply. Set `OMG_TIME_LEFT_RUNTIME=0` to skip/remove this executable runtime; the installed skill then fails closed. It does not otherwise send code, change model/provider credentials, or modify `models.yml`. `adaptive-response` loads only through `/omg:gate` or `/omg:gate-always`; `no-english` loads only through session-local `/omg:no-english`; `time-left` runs only through explicit `/omg:time-left`. `deep-onboarding` analyzes and interviews before writing, and writes its three documents only after the user explicitly confirms one output directory. `orchestrator` loads only through explicit `/omg:orchestrator`; its `on`/`status` are read-only, and `install`/`user` append only its marker section to `AGENTS.md` (after a timestamped backup) and write only its two rule files. `time-left` sends only fixed read-only SDK v3 queries and fails closed without its runtime or a live exact top-level endpoint. `insane-review` needs ChatGPT+Chromium; `lazycodex-gjc` needs an existing logged-in Codex+compatible OMO and is read-only. `session-observer` reads session JSONL directly with no SDK dependency; its Linux/Bun/tmux slash launcher opens a detached viewer and never returns observed text to GJC. It is read-only: no injection, control, writes, network, or upstream activity. When optional runtime prerequisites are absent, stale bindings are removed and the affected capability remains fail-closed. During user-scope upgrade, the installer also removes only well-formed retired `easy-always` blocks from `~/.gjc/agent/SYSTEM.md` and `AGENTS.md`, preserving unrelated content and `gate-always`.

When run inside a git repository, upgrade/uninstall also backs up that repository's `AGENTS.md` and removes only one well-formed retired `oh-my-gjc:branchflow` marker block. It never deletes `docs/WORKFLOW.md`. Run the installer once from each repository where `/omg:branchflow-always on` was previously enabled, then review the preserved workflow document manually.
