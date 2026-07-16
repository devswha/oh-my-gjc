# oh-my-gajaecode v0.20.0 release evidence — 2026-07-16

## Candidate

- Final behavior candidate: `415f65a`
- Release scope: make `adaptive-response`, `no-english`, and `time-left` explicit-command-only surfaces; add `/omg:no-english` and `/omg:time-left`.
- The user explicitly ordered publication in this session. This direct order overrides the one-release-per-day frequency cap; Gates 1 and 2 still ran in full.

## Gate 1 — verification

- `bun test plugins/oh-my-gjc/test`: 154 pass, 0 fail, 977 expectations across 10 files.
- `python3 -m unittest ops.verify.test_record_provenance`: 33 pass; expected fail-closed diagnostics from negative cases; final result `OK`.
- `bash -n` on root and native installers: pass.
- Python compile for provenance and review engine: pass.
- Marketplace and plugin manifest JSON parse: pass.
- `git diff --check v0.19.1..HEAD`: pass.
- Candidate installer reproduction: plugin 0.20.0, 6 skills, 9 commands; `/omg:no-english` and `/omg:time-left` installed; optional runtimes disabled/fail-closed for the reproduction.
- `gitleaks git --log-opts='v0.19.1..HEAD'`: 4 commits scanned, no leaks found.

## Gate 2 — external cross-family review

Fresh-context `openai-codex/gpt-5.5:xhigh` reviewer with read/search/find only and `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`.

The first two rounds returned `REQUEST_CHANGES`. Findings were fixed forward: stale natural-language ETA guidance, risky negated trigger phrases, stale installer activation text, adaptive-response auto-activation wording, missing provenance markers, stale uninstall inventory, and stale SDK surface counts. Regression coverage was added for the command-only contract.

Final review of behavior candidate `415f65a`:

```text
No release-safety blocker found.
VERDICT: APPROVE
```

## Gate 3 — human approval

The user's direct instruction, “릴리즈까지 진행해”, explicitly approves v0.20.0 publication after Gates 1 and 2. No self-approval is used.

## Publication contract

- Merge `dev` to `main` without rewriting reviewed source history.
- Tag the resulting `main` merge commit as `v0.20.0`.
- Publish the GitHub Release and verify the public release metadata.
- Send the required post-publication control-tower report with version, candidate hash, published commit, and this evidence path.
