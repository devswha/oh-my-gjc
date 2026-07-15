# oh-my-gajaecode v0.17.1 release evidence — 2026-07-15

## Candidate

- Approved dev candidate: `8f5d54b08115a1d6fe96f499d2280dc0f79cf86a`
- Release PR: #19 (`dev` → `main`)
- Published main/tag commit: `4e64c589cbb96bd6374015881e57fc756181d16d`
- Tree identity: `git diff 8f5d54b..origin/main --stat` was empty before tagging.
- Release: https://github.com/devswha/oh-my-gjc/releases/tag/v0.17.1

## Gate 1 — verification

Final candidate verification:

- `git diff --check v0.17.0..HEAD`: pass
- `bash -n install.sh plugins/oh-my-gjc/bin/install-skill.sh`: pass
- Python compile for provenance gate/tests: pass
- Bun suites: 168 pass, 0 fail, 772 expectations across 12 files
- Provenance unittest: 33 pass, 0 fail
- Isolated HOME candidate install: rc=0, version 0.17.1
- Exact suite-root binding: mode 0600, bound to the current installed cache root
- Complete plugin-tree provenance: rc=0; tracked candidate/cache file inventories and aggregate payload digests matched; root `install.sh` HEAD evidence recorded
- Secret scan over the release diff: no credential/private-key matches

The release is a security/install-breakage patch and was explicitly ordered in-session, so the one-release-per-day frequency cap is overridden under the documented exemption. Gates 1 and 2 were still run in full.

## Gate 2 — external cross-family review

Fresh-context OpenAI Codex reviewer, notifications disabled, read/search/find only.

Earlier review rounds found concrete blockers involving theme-dependent install output, inherited-PATH Git trust, stale manual/bootstrap paths, existing marketplace source confusion, runtime newest-cache globs, marker-only provenance, and council engine resolution. Each blocker was fixed forward on `dev`, Gate 1 was rerun, and the corrected HEAD was re-signed.

Final verdict for candidate `8f5d54b08115a1d6fe96f499d2280dc0f79cf86a`:

```text
Release review result: no blockers found.

VERDICT: APPROVE
```

## Gate 3 — human approval

하코 explicitly approved publication in this session and then directly ordered removal of the numeric re-sign cap: real blockers remain fail-closed, but review attempt counts cannot halt a corrected release. That standing order satisfies Gate 3 for the final clean candidate.

## Publication and report

- PR #19 merged to `main` with tree identity preserved.
- Annotated tag `v0.17.1` points to `4e64c589cbb96bd6374015881e57fc756181d16d`.
- GitHub Release published at the URL above.
- A one-line post-publication control-tower report records version, approved candidate, published commit, and this evidence path.
