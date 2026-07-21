# oh-my-gjc v0.27.0 bridge verification — 2026-07-21

## Scope

Final release under the `oh-my-gjc` marketplace/plugin identity before the repository rename to `oh-my-gajae-code`. The bridge keeps `/omg:*`, runtime/cache identity, and user state unchanged while advertising the future canonical installer and warning that old `raw.githubusercontent.com/devswha/oh-my-gjc/...` URLs will not redirect after the rename.

Candidate: `da84353`
Release range: `v0.24.0..da84353`

## Static and test verification

- `bash -n install.sh` — rc 0.
- `bash -n plugins/oh-my-gjc/bin/install-skill.sh` — rc 0.
- `python3 -m json.tool .claude-plugin/marketplace.json` — rc 0.
- `python3 -m json.tool plugins/oh-my-gjc/.claude-plugin/plugin.json` — rc 0.
- `bun test plugins/oh-my-gjc/test` — 142 pass, 0 fail, 1244 assertions.
- `python3 -m unittest ops.verify.test_record_provenance` — 37 tests, OK. The printed `PROVENANCE FAIL` lines are expected negative-case fixtures.
- `git diff --check` — rc 0.
- clean tracked worktree confirmed after candidate commit.

## New-install reproduction

Executed the hardened root installer in an isolated temporary HOME with disposable GJC surfaces disabled:

```sh
HOME="$sandbox/home" GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 \
  bash install.sh --candidate-ref "$PWD"
```

Observed rc 0, marketplace/plugin `oh-my-gjc@oh-my-gjc` version `0.27.0`, all 7 skills and 9 native commands, and mode-restricted old suite-root binding under `.gjc/agent/runtimes/oh-my-gjc/root`. The deterministic bridge banner printed the future installer URL, old-raw failure boundary, and redirected repository/clone recovery path. Multi-harness stayed disabled fail-closed because the isolated HOME intentionally lacked provider credentials; no login or provider installation was attempted.

## Secret scan

`gitleaks git --log-opts='v0.24.0..HEAD' --no-banner --redact` — rc 0, 9 commits scanned, no leaks found. Two historical multi-harness credential-isolation canaries are allowlisted only by exact commit/path/rule/line fingerprints; no broad suppression exists.

## Independent review

- AI slop cleaner: commit `da84353`, zero blocking findings; one accepted P3 cosmetic clone target-directory spelling advisory.
- Architect core lane: architecture CLEAR, product CLEAR, recommendation APPROVE, zero blockers.
- Architect docs/metadata lane: architecture CLEAR, product CLEAR, recommendation APPROVE, zero blockers.
- Executor QA/red-team lane: PASS, no blockers. It reviewed leader-run CLI evidence without claiming independent execution and adversarially checked identity drift, version split, redirect wording, cache selection, command namespace, and state preservation.

## Deferred environment surfaces

- `insane-review` CDP-to-ChatGPT harvest requires a logged-in GPT-5.6 Sol Pro browser session and was not exercised.
- Multi-harness live four-provider success remains pending environment because current Codex OAuth is unavailable; fixtures and fail-closed isolated behavior passed.

## Verdict

PASS for publication as the final old-identity bridge release. GitHub repository rename must occur only after this release is merged, tagged, published, and its old raw installer is confirmed to display the future URL warning.
