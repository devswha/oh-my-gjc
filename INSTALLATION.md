# Install oh-my-gajae-code (agent instructions)

**Human:** paste this one line into any coding agent (gjc, Claude Code, Codex, …):

> Install oh-my-gajae-code by following https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/INSTALLATION.md — run the steps, verify, and report.

**Agent:** you are installing the **oh-my-gajae-code** single plugin suite for Gajae Code (`gjc`).
Do exactly the following in a terminal. Do not improvise other steps.

## Preconditions
- `gjc` must be on PATH (`command -v gjc`). If missing, stop and tell the human to install Gajae Code first.
- Plugin management is gjc's **shell CLI only** — there is no in-session `/plugin` slash command for it; run `gjc plugin …` in a terminal. A `/plugin …` line in a gjc chat is ordinary chat text, not an install/uninstall command.

## Fastest path (one shot)
```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh | bash
```
One install brings the whole suite (7 skills + 9 commands: `/omg` + 8 `/omg:*`). There are no separate/optional plugins to add.
`multi-harness-research` is present but runnable only through explicit `/omg:multi-harness`; it requires Linux user namespaces + `bwrap`, four supported existing CLI logins, and its private runtime binding. The installer never installs or logs in to those providers.

## Manual path (equivalent, if curl|bash is disallowed)
```sh
git clone --depth 1 https://github.com/devswha/oh-my-gajae-code.git oh-my-gajae-code
bash oh-my-gajae-code/install.sh
```
This invokes the same hardened installer as the one-shot path: it refreshes the `oh-my-gajae-code` marketplace, binds native handoff to the plugin version reported by the current install operation, then writes the exact mode-0600 user-scope suite-root binding at `~/.gjc/agent/runtimes/oh-my-gajae-code/root`. Asset consumers resolve a project binding when one was installed separately, then this user binding, then the checkout fallback; missing or malformed bindings fail closed. The former newest-cache sequence is historical and non-executable; never reproduce it.

The native installer copies every bundled skill + command in one shot and fails loudly (with a missing list) if anything expected is absent — never a partial install.
## v0.28.0 identity cutover and migration

v0.27.0 was the final old-identity bridge. `oh-my-gajae-code` is the canonical repository, marketplace/plugin identity, `./plugins/oh-my-gajae-code` source, and local checkout name.

The canonical installer is `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh`. Old `https://raw.githubusercontent.com/devswha/oh-my-gjc/...` raw URLs do not redirect. Old GitHub repository pages and Git remotes redirect, but active instructions must use the new raw URL and checkout name.

New installs write only `oh-my-gajae-code` bindings. The former `~/.gjc/agent/runtimes/oh-my-gjc/root` binding is a read-only fallback for at least 30 days or two releases; it is not rewritten or removed by this cutover. Old XDG research data, credentials, and `models.yml` remain in place, and the stable internal `oh-my-gjc:gate-always` marker is preserved.

## Gajae app migration
The self-hosted web UI now lives in [`devswha/claudecodeui`'s canonical SELF-HOST guide](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md). Upgrades remove native launchers only; they do not stop or modify a running app or service, its data, or its network state.

## Verify (report these)
```sh
gjc plugin list  # must list oh-my-gajae-code@oh-my-gajae-code
root="$HOME/.gjc/agent"
for skill in adaptive-response no-english extragoal insane-review deep-onboarding preset-pack multi-harness-research; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:gate.md omg:gate-always.md omg:no-english.md omg:insane-review.md omg:deep-onboarding.md omg:preset-pack.md omg:multi-harness.md; do
  test -f "$root/commands/$command" || exit 1
done
for skill in workflow-eta easy-answer plain-layer branch-flow worktree gjc-bugwatch multivendor-presets release-gate session-observer time-left lazycodex-gjc; do
  test ! -e "$root/skills/$skill" && test ! -L "$root/skills/$skill" || exit 1
done
for retired in easy easy-always plain branchflow-always worktree bugwatch-scan presets release session-observer time-left lazycodex-gjc fable; do
  test ! -e "$root/commands/omg:$retired.md" && test ! -L "$root/commands/omg:$retired.md" || exit 1
done
test -f "$root/runtimes/oh-my-gajae-code/root"
test "$(stat -c %a "$root/runtimes/oh-my-gajae-code/root" 2>/dev/null || stat -f %Lp "$root/runtimes/oh-my-gajae-code/root")" = 600
```

## Finish
Tell the human: open a **new** gjc session (or `/move .`) so the command palette rebuilds, then run `/omg` for the catalog and `/omg:setup` for optional prerequisite checks and always-on toggles. Commands are `/omg:<name>`.

## Safety
Idempotent — re-running re-copies the 7 skills and 9 commands, removes explicitly retired suite-owned native surfaces, and preserves unrelated user state. `adaptive-response` loads only through `/omg:gate` or `/omg:gate-always`; `no-english` loads only through session-local `/omg:no-english`; `deep-onboarding` analyzes and interviews before writing, and writes its three documents only after the user explicitly confirms one output directory. `insane-review` needs ChatGPT+Chromium. `preset-pack` merges the curated daily/agent profiles into user `models.yml` only on explicit `/omg:preset-pack install`, after backup, name-scoped; the installer itself never touches `models.yml`. During user-scope upgrade, the installer also removes only well-formed retired `easy-always` blocks from `~/.gjc/agent/SYSTEM.md` and `AGENTS.md`, preserving unrelated content and the stable `oh-my-gjc:gate-always` marker.

### v0.26.0 tombstone

- Direct user removal: the current Fable audit and its Opus fallback both stalled without a report. Native cross-session review and `insane-review` remain.
- Upgrade cleanup removes only native `omg:fable.md`; `claude-fable-5` model preset references are unrelated and remain.

### v0.25 tombstones

- `time-left` was removed because ETA could not provide usable measurement; its SDK lab is retired with it.
- `lazycodex-gjc` was removed because usable Codex authentication/tokens were unavailable, while GJC native workflows and multi-harness cover delegation.
- Upgrade cleanup removes only the suite-owned native skill, command, runtime, and receipt. It never removes credentials, `~/.codex`, `models.yml`, user LazyCodex/OMO, or other runtimes.

### `multi-harness-research` boundary

`/omg:multi-harness` is explicit-only: a missing task needs the current GJC leader to preview and obtain confirmation; ordinary language does not activate it. The dedicated orchestrator, not `gjc team`, sends the same normalized task bytes plus identical safety/output suffix to exactly these ordered lanes: `gjc-opus` (GJC 0.11.x `anthropic/claude-opus-4-8`, max thinking), `gjc-sol` (GJC 0.11.x `openai-codex/gpt-5.6-sol`, xhigh thinking), `codex-sol` (`gpt-5.6-sol`, xhigh, ephemeral), and `claude-ultracode` (Claude `-p --no-session-persistence --effort ultracode`). It never substitutes a provider/model/effort, invokes a fifth synthesis model, uses a winner/vote/consensus/ranking/final verdict, or installs, updates, migrates, or logs in to a provider.

Execution requires Linux user namespaces, executable `bwrap`, the private user-scope runtime binding, exact supported credential-file layouts, and pre-existing login for all four CLIs. The canonical target is read-only; target `.gjc` and mutable Git state are not exposed. GJC and Claude lanes have only read/search/find and provider-native public-web tools: no built-in Bash, write/edit/notebook, browser automation, MCP, hooks, extensions, skills, or rules. Codex has a strict read-only profile with shell networking disabled and provider-native web only. The runner binds only these verified read-only credential leaves into separate private sandboxes: `${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json`, `${CODEX_HOME:-$HOME/.codex}/auth.json`, and `$HOME/.claude/.credentials.json`; it never binds broad HOME/auth directories or passes credential tokens in the environment.

Only the orchestrator/finalizer write external artifacts at `${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gajae-code/multi-harness/<repo-id>/<run-id>/` (`0700` directories, `0600` files, no-follow atomic publication). After every lane terminates, phase 1 seals immutable factual lane results and a pending comparison: four valid results exit `COMPLETE`/`0`, mixed valid results exit `INCOMPLETE`/`10`, and no valid result or run fatal exits `1`; valid peer documents survive failures. The current GJC leader—not a worker or fifth model—then supplies bounded, non-authoritative commonalities/differences and uncertainty to a no-model phase-2 finalizer. Finalization rechecks its receipt and sealed facts before replacing only the comparison placeholder. `FINALIZATION_FAILED`/`20` preserves the sealed lane outcome, artifacts, and phase-1 exit. Current Codex OAuth live evidence is **pending-environment (401)**; the installer neither repairs it nor claims a fixture as live success.

The bundled uninstall removes only owned native surfaces/runtime. It never deletes multi-harness XDG research artifacts, provider auth/configuration, or unrelated user files. For disposable GJC smoke/audit harnesses, prefix the actual GJC command with `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`; user working sessions keep both services enabled.

When run inside a git repository, upgrade/uninstall also backs up that repository's `AGENTS.md` and removes only one well-formed retired `oh-my-gjc:branchflow` marker block. It never deletes `docs/WORKFLOW.md`. Run the installer once from each repository where `/omg:branchflow-always on` was previously enabled, then review the preserved workflow document manually.
