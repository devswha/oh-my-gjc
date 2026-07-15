# oh-my-gajaecode v0.18.0 release evidence — 2026-07-15

## Candidate

- Final behavior candidate: `330579889763e92085bec9c08e91bd80af1c9b1f`
- Release PR: #23 (`dev` → `main`)
- Release scope: focused 4-skill / 7-command suite, read-only LazyCodex bridge, and GJC 0.11 SDK compatibility.
- 하코 explicitly ordered publication in this session. This direct order overrides the one-release-per-day frequency cap; Gates 1 and 2 still ran in full.

## Gate 1 — verification

Final candidate verification:

- `git diff --check v0.17.1..HEAD`: pass
- JSON parse for marketplace and plugin manifests: pass
- `bash -n` for root/native installers and operations scripts: pass
- Python compile for provenance and review engine: pass
- Bun suites: 136 pass, 0 fail, 751 expectations across 7 files
- Provenance unittest: 33 pass, 0 fail
- Isolated HOME candidate install: rc=0, version 0.18.0, 4 skills, 7 commands
- Exact suite-root binding: mode 0600
- Complete plugin-tree provenance: pass; candidate HEAD and installed cache inventory/bytes matched
- Release-diff secret scan: 0 credential/private-key findings

The Python test suite intentionally prints fail-closed diagnostic lines from negative test cases; the unittest result is `OK`.

## Gate 2 — external cross-family review

Fresh-context `openai-codex/gpt-5.5:xhigh` reviewer with read/search/find only and both `GJC_NOTIFICATIONS=0` and `GJC_SDK_DISABLE=1`.

Initial review returned `REQUEST_CHANGES` for:

1. missing `GJC_SDK_DISABLE=1` propagation into LazyCodex child/shell environments;
2. a stale two-round extragoal re-sign cap contradicting uncapped fix-forward governance;
3. marketplace wording that overstated runtime-binding prerequisites.

An independent architect review additionally found:

4. retired `/omg:branchflow-always` repository markers had no migration path;
5. extragoal still referred to the removed reviewer preset.

All findings were fixed forward. Branchflow cleanup is bounded to the current git repository, backs up `AGENTS.md`, preserves malformed markers, never deletes `docs/WORKFLOW.md`, and has valid/malformed/absent regression coverage.

Final re-sign of `330579889763e92085bec9c08e91bd80af1c9b1f`:

```text
Findings: none.

VERDICT: APPROVE
```

## Gate 3 — human approval

하코's direct instruction, “릴리즈까지하자”, explicitly approves this v0.18.0 publication after Gates 1 and 2. No self-approval is used.

## Publication contract

- Merge PR #23 to `main` without rewriting reviewed source history.
- Tag the resulting `main` merge commit as `v0.18.0`.
- Publish the GitHub Release, run the public one-shot installer, and verify the installed 0.18.0 surface.
- Send a post-publication control-tower report with version, behavior candidate, published commit, and this evidence path.
