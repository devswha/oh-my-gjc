# oh-my-gajae-code v0.28.0 identity-cutover verification — 2026-07-21

## Scope

First release under the canonical `oh-my-gajae-code` identity. The dev→main candidate renames the repository/marketplace/plugin identity and the `./plugins/oh-my-gajae-code` source, bumps marketplace + plugin manifests to `0.28.0`, and rewrites the installer default marketplace to `devswha/oh-my-gajae-code` with the canonical raw installer URL. `/omg:*` command names, native install layout, and the stable internal `oh-my-gjc:gate-always` marker are unchanged. The former `oh-my-gjc` suite-root binding, historical XDG artifact paths, legacy cleanup markers, and `.gitleaksignore` history fingerprints are intentionally retained as read-only compatibility fallbacks.

Candidate: `21eec67` (rename `1efc37e` + round-1 fix `21eec67`)
Release range: `v0.27.0..21eec67`

## Static and test verification

- `python3 -c json.load` on `.claude-plugin/marketplace.json`, `plugins/oh-my-gajae-code/.claude-plugin/plugin.json`, `plugins/example-plugin/.claude-plugin/plugin.json` — all rc 0; marketplace + plugin versions both `0.28.0`.
- `bash -n` on every tracked `*.sh` (`install.sh`, `plugins/oh-my-gajae-code/bin/install-skill.sh`, all `ops/gjc-bugwatch/*.sh`) — rc 0.
- `python3 -m py_compile` on every tracked `*.py` (`ops/verify/record_provenance.py`, `ops/verify/test_record_provenance.py`, `plugins/oh-my-gajae-code/bin/pack_and_ask.py`) — rc 0.
- `bun test` (plugins/oh-my-gajae-code/test) — 146 pass, 0 fail, 1281 assertions across 11 files (includes the two install.sh rebinding fail-closed tests added for the round-1 fix).
- `bun test` (ops/gjc-bugwatch/test) — 29 pass, 0 fail, 61 assertions.
- `python3 -m unittest test_record_provenance` — 39 tests, OK. The printed `PROVENANCE FAIL` lines are expected negative-case fixtures.
- Clean tracked worktree confirmed after the candidate commit; no tracked `oh-my-gjc` paths remain (`git ls-files | grep oh-my-gjc` empty). Remaining `oh-my-gjc` string references are the intentional read-only compatibility fallback binding, historical XDG artifact roots, legacy cleanup markers, tombstone aliases, and gitleaks history fingerprints.

## New-install reproduction

Ran the hardened root installer in an isolated temporary HOME with disposable GJC surfaces disabled:

```sh
HOME="$sandbox/home" GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 \
  bash install.sh --candidate-ref "$PWD"
```

Observed rc 0 with:
- marketplace add of the local candidate checkout, then `Installed oh-my-gajae-code from oh-my-gajae-code (0.28.0)`.
- all 7 skills (adaptive-response, no-english, extragoal, insane-review, deep-onboarding, preset-pack, multi-harness-research) and all 9 native commands (`/omg` + 8 `/omg:*`) installed under the isolated HOME.
- suite-root binding at `.gjc/agent/runtimes/oh-my-gajae-code/root`, mode `0600` (`-rw-------`), pointing at cache root `…/oh-my-gajae-code___oh-my-gajae-code___0.28.0`.
- registry `installed_plugins.json` records `oh-my-gajae-code@oh-my-gajae-code` version `0.28.0`.
- the deterministic `v0.28.0 cutover` banner printed the canonical installer URL and the old-`oh-my-gjc`-raw-URL failure notice.
- multi-harness stayed disabled fail-closed because the isolated HOME lacked provider credentials; no login or provider installation was attempted.

Sandbox removed after inspection.

## Secret scan

`gitleaks git --log-opts='main..HEAD' -v --redact` — rc 0, 2 commits scanned (~53.71 KB), no leaks found. Historical redaction-test canaries are allowlisted only by exact commit/path/rule/line fingerprints in `.gitleaksignore`; no broad suppression exists.

## Independent review

- House dogfood cross-family review lane (`openai-codex/gpt-5.5:xhigh`, read-only tools) on the `main..dev` diff.
  - Round 1: **REQUEST_CHANGES**, one blocker — `install.sh` no longer fail-closed/rebound an already-existing same-name `oh-my-gajae-code` marketplace; it left the prior registration intact and only ran `marketplace update`, so a stale/wrong same-name source could pass through to native handoff. Regression vs the v0.27.0 behavior.
  - Fix (this release, applied before publish): restored the v0.27.0 rebinding — on `Marketplace "oh-my-gajae-code" already exists`, `remove` then re-`add` the canonical `$MARKET` (`devswha/oh-my-gajae-code`), each fail-closed with `die`, before the mandatory `marketplace update`. The candidate/provenance branch is unchanged. Added `one-shot-installer.test.ts` coverage: a rebinding call-order test and a `remove`-failure fail-closed test (`bun test` now 146 pass).
  - Round 2 (focused re-review of the fix): **APPROVE**, zero blockers — remove → canonical add → mandatory update before install, remove/add failures abort before stale source/cache use, candidate path unchanged.

## Deferred environment surfaces

- `insane-review` CDP-to-ChatGPT harvest requires a logged-in GPT-5.6 Sol Pro browser session and was not exercised.
- Multi-harness live four-provider success remains pending environment because Codex OAuth is unavailable; fixtures and fail-closed isolated behavior passed.

## Verdict

PASS for publication as the first canonical `oh-my-gajae-code` identity release.
