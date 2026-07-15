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
One install brings the whole suite (3 skills + 6 commands: `/omg` + 5 `/omg:*`). There are no separate/optional plugins to add.

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
for skill in gate-briefing extragoal insane-review; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:gate.md omg:gate-always.md omg:fable.md omg:insane-review.md; do
  test -f "$root/commands/$command" || exit 1
done
for skill in easy-answer plain-layer branch-flow worktree gjc-bugwatch lazycodex-gjc multivendor-presets release-gate; do
  test ! -e "$root/skills/$skill" && test ! -L "$root/skills/$skill" || exit 1
done
for retired in easy easy-always plain branchflow-always worktree bugwatch-scan lazycodex-gjc presets release; do
  test ! -e "$root/commands/omg:$retired.md" && test ! -L "$root/commands/omg:$retired.md" || exit 1
done
test -f "$root/runtimes/oh-my-gjc/root"
test "$(stat -c %a "$root/runtimes/oh-my-gjc/root" 2>/dev/null || stat -f %Lp "$root/runtimes/oh-my-gjc/root")" = 600
test ! -e "$root/runtimes/lazycodex-gjc" && test ! -L "$root/runtimes/lazycodex-gjc"
test ! -e "$root/receipts/lazycodex-gjc-runner.sha256" && test ! -L "$root/receipts/lazycodex-gjc-runner.sha256"
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` for optional prerequisite checks and always-on toggles. Commands are `/omg:<name>`.

## Safety
Idempotent — re-running re-copies the 3 skills and 6 commands, then removes only explicitly retired omj native surfaces and the retired LazyCodex runtime binding/receipt. It does not send code anywhere, change model/provider credentials, or modify `models.yml`. `insane-review` needs a ChatGPT subscription and Chromium only when invoked. During user-scope upgrade, the installer also removes only well-formed retired `easy-always` blocks from `~/.gjc/agent/SYSTEM.md` and `AGENTS.md`: it validates marker structure, creates a unique mode-preserving backup, preserves unrelated content and `gate-always`, and leaves malformed files untouched with a warning.
