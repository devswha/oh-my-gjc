# Install oh-my-gjc (agent instructions)

**Human:** paste this one line into any coding agent (gjc, Claude Code, Codex, …):

> Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.

**Agent:** you are installing the **oh-my-gjc** single plugin suite for Gajae Code (`gjc`).
Do exactly the following in a terminal. Do not improvise other steps.

## Preconditions
- `gjc` must be on PATH (`command -v gjc`). If missing, stop and tell the human to install Gajae Code first.
- Plugin management is gjc's **shell CLI only** — there is no in-session `/plugin` slash command for it; run `gjc plugin …` in a terminal. A `/plugin …` line in a gjc chat is ordinary chat text, not an install/uninstall command.

## Fastest path (one shot)
```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```
One install brings the whole suite (5 skills + 5 commands: `/omg` + 4 `/omg:*`). There are no separate/optional plugins to add.

## Manual path (equivalent, if curl|bash is disallowed)
```sh
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git oh-my-gjc
bash oh-my-gjc/install.sh
```
This invokes the same hardened installer as the one-shot path: it refreshes the `oh-my-gjc` marketplace, binds native handoff to the plugin version reported by the current install operation, then writes the exact mode-0600 user-scope suite-root binding at `~/.gjc/agent/runtimes/oh-my-gjc/root`. Asset consumers resolve a project binding when one was installed separately, then this user binding, then the checkout fallback; missing or malformed bindings fail closed. The former newest-cache sequence is historical and non-executable; never reproduce it.

The native installer copies every bundled skill + command in one shot and fails loudly (with a missing list) if anything expected is absent — never a partial install.
## v0.28.0 identity cutover and migration

2026-08-31: the suite returns to `oh-my-gjc` — canonical repository, marketplace/plugin identity, `./plugins/oh-my-gjc` source, and local checkout name.

The canonical installer is `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`. Old `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/...` raw URLs do not redirect. Old GitHub repository pages and Git remotes redirect, but active instructions must use the new raw URL and checkout name.

New installs write only `oh-my-gjc` bindings. The former `~/.gjc/agent/runtimes/oh-my-gajae-code/root` binding is a read-only fallback for at least 30 days or two releases; it is not rewritten or removed by this cutover. Old XDG research data, credentials, and `models.yml` remain in place.

## Gajae app migration
The self-hosted web UI now lives in [`devswha/claudecodeui`'s canonical SELF-HOST guide](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Upgrades remove native launchers only; they do not stop or modify a running app or service, its data, or its network state.

## Verify (report these)
```sh
gjc plugin list  # must list oh-my-gjc@oh-my-gjc
root="$HOME/.gjc/agent"
for skill in no-english extragoal insane-review insane-search gpt-image; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:no-english.md omg:insane-review.md omg:gpt-image.md; do
  test -f "$root/commands/$command" || exit 1
done
for skill in workflow-eta easy-answer plain-layer branch-flow worktree gjc-bugwatch multivendor-presets preset-pack release-gate session-observer time-left lazycodex-gjc adaptive-response deep-onboarding multi-harness-research ouroboros; do
  test ! -e "$root/skills/$skill" && test ! -L "$root/skills/$skill" || exit 1
done
for retired in easy easy-always plain branchflow-always worktree bugwatch-scan presets preset-pack release session-observer time-left lazycodex-gjc fable gate gate-always deep-onboarding multi-harness ouroboros-setup; do
  test ! -e "$root/commands/omg:$retired.md" && test ! -L "$root/commands/omg:$retired.md" || exit 1
done
test -f "$root/runtimes/oh-my-gjc/root"
test "$(stat -c %a "$root/runtimes/oh-my-gjc/root" 2>/dev/null || stat -f %Lp "$root/runtimes/oh-my-gjc/root")" = 600
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` for optional prerequisite checks. Commands are `/omg:<name>`.

## Safety
Idempotent — re-running re-copies the 5 skills and 5 commands, removes explicitly retired suite-owned native surfaces, the retired private multi-harness runtime, and well-formed owned `gate-always` marker blocks after backup. It preserves marker-external bytes, malformed markers, unrelated user state, multi-harness research artifacts, external and user authentication/configuration, credentials, and models. `no-english` loads only through session-local `/omg:no-english`; `insane-review` needs ChatGPT+Chromium. `insane-search` reads public pages only, checks its Python dependencies without installing them, and does not bypass authentication, CAPTCHAs, paywalls, or its pinned transport with a browser fallback. `gpt-image` loads only through `/omg:gpt-image`, requires POSIX deadline enforcement and the dedicated logged-in ChatGPT CDP profile, and cannot run concurrently with `insane-review`.

### Auto-update (opt-in)
Auto-update is OFF by default; the installer never schedules it. To opt in, run `bin/omg-autoupdate.sh enable` (systemd `--user` timer, cron fallback; `--interval <OnCalendar>`, `--local <checkout>` for offline). Each run re-executes the trusted `install.sh` under a single-flight lock, never as root, logging to `${XDG_STATE_HOME:-~/.local/state}/oh-my-gjc/autoupdate.log`. `bin/omg-autoupdate.sh disable` removes it, and `install-skill.sh uninstall … user` disables it too.

### v0.26.0 tombstone

- Direct user removal: the current Fable audit and its Opus fallback both stalled without a report. Native cross-session review and `insane-review` remain.
- Upgrade cleanup removes only native `omg:fable.md`; `claude-fable-5` model preset references are unrelated and remain.

### v0.25 tombstones

- `time-left` was removed because ETA could not provide usable measurement; its SDK lab is retired with it.
- `lazycodex-gjc` was removed because usable Codex authentication/tokens were unavailable, while GJC native workflows cover delegation.
- Upgrade cleanup removes only the suite-owned native skill, command, runtime, and receipt. It never removes credentials, `~/.codex`, `models.yml`, user LazyCodex/OMO, or other runtimes.

### v0.32.0 tombstone

- **Direct user request (2026-08-18):** `adaptive-response`, `deep-onboarding`, and `multi-harness-research` and their associated commands were removed; the multi-harness private native runtime was retired.
- Upgrade cleanup removes only suite-owned native surfaces, that private runtime, and well-formed owned `gate-always` marker blocks after backup. It preserves marker-external bytes, malformed markers, multi-harness research artifacts, external and user authentication/configuration, credentials, models, and unrelated state.

### v0.33.0 tombstone

- **Direct user request (2026-08-18):** the OMG Ouroboros wrapper skill and `/omg:ouroboros-setup` command were removed.
- Cleanup removes only those former OMG-owned wrapper surfaces. The external upstream Ouroboros package 0.51.7, `~/.ouroboros`, its upstream marketplace/plugin, GJC bridge extension and MCP state, Seeds, runs, authentication, and configuration remain external and must not be removed.

When run inside a git repository, upgrade/uninstall also backs up that repository's `AGENTS.md` and removes only one well-formed retired `oh-my-gjc:branchflow` marker block. It never deletes `docs/WORKFLOW.md`. Run the installer once from each repository where `/omg:branchflow-always on` was previously enabled, then review the preserved workflow document manually.
