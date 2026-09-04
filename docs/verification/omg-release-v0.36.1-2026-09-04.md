# v0.36.1 GUI and Astra verification — 2026-09-04 UTC

## Resolved live failures

The earlier v0.36.0 environment limitation is resolved. DISPLAY was unset, but an X0 Unix socket owned by the current user existed. Normal Chrome on that display reused the existing dedicated profile and was already logged in; the earlier headless HTTP 403 was not evidence that another login was required.

Live GUI inspection exposed two additional defects: `--inspect-session` read the page before hydration completed, and the direct model picker could list Astra but could not switch from Sol without the older Advanced/Model rows. The fixes wait for a definite login state and select exactly one visible model option, then verify its checked state. Linux launch can use one owned, non-symlink X11 socket when no explicit display is set; multiple/unowned candidates remain rejected. No X access controls, cookies, authentication or browser profiles are altered by discovery.

## Independent review and disposition

- The attempted Anthropic review hit HTTP 429 and produced no verdict. It was not counted as approval; raw quota/account details remain local.
- Fresh-context, read-only native GJC reviewer `kimi-code/k3`, notifications/SDK/MCP disabled: first verdict REQUEST_CHANGES.
- HIGH accepted: initial/current-model Pro snapshots could still contain a different model's stale pill. Raw pills are now captured before opening the menu and evaluated only after resolving the required model. Inspection uses the same model-bound snapshot.
- LOW accepted: slider driving, final verification and emitted effort label were unscoped. The required model is now threaded through all of them.
- The reviewer rechecked the changes and returned **APPROVE**, with both findings closed. [Round 1](v0.36.1-review-round1.md), [round 2](v0.36.1-review-round2.md).
- Its non-blocking observation about the pre-existing raw CLI mode that omits `--require-model` is recorded in round 2. Canonical GJC skill/command/council paths always specify `current` or a concrete model.

## Verification

| Check | Evidence |
|---|---|
| Full Bun suite | rc=0; **254 passed, 0 failed**, 1070 assertions, 18 files |
| JSON / shell syntax / Python compile | rc=0 |
| Fresh isolated-HOME root installer | rc=0; v0.36.1; 5 skills and 5 commands; binding 0600 |
| Fresh `gjc plugin list` | rc=0 |
| Installed candidate engine / five native skill files | byte-identical to source |
| GUI session inspection | login=ok; model=GPT-6 Astra; effort=최대; rc=0 |
| Direct picker | Sol → GPT-6 Astra (최대) verified without sending a prompt |
| X11 discovery | selected :0 from the one current-user socket; preserved parent environment; ambiguity/unowned/symlink fixtures rejected |
| Gpt-image read-only prerequisites | playwright=ok, cdp=ok, profile=ok; no image generated |

The scoped live canary packed two complete self-contained files containing the actual effort-label matcher/dependencies and four assertions. Local assertions and gitleaks passed before egress; repomix 1.15.0 ran with forced secretlint, full code and line numbers. `--attach` forbade inline fallback. This canary proves the live review path; the wider suite has its separate independent audit.

- Actual UI model/effort verified: **GPT-6 Astra (최대)**.
- Attachment confirmed; **one send**, no retries or forced early answer.
- A fresh bound conversation produced an **APPROVE** response after **52 seconds**, harvested from the completed new assistant turn.
- Final candidate engine was unchanged during that run; SHA-256: `c3227fcc93f09c8b9dc09dbd63d3b63eae3fea8cea8aadbccf044a63f512d68e`.
- Response saved locally at `.insane-review/response_omg-astra-scoped-canary-u6wcxfb2_20260905_071250_1694962_ba69d1.md`, mode **0600**, SHA-256 `8c6aac4b253e4a548683321e71a88403416aea4ddbcf6fdc198e51722a682f18`. The private conversation URL and full artifact are not published here.
- An earlier matcher-only canary also returned APPROVE after 58 seconds. Neither required entering credentials again.

The search automation improvements and actual installed public fetch (`strong_ok`, no browser/login/model) were verified in [v0.36.0 evidence](omg-release-v0.36.0-2026-09-04.md). Search code is unchanged by this patch.

Behavior candidate: `8e50e37ed4d545d9113e5dfe60436a6edf1f87ed`. `gitleaks git . --log-opts=16cb311..8e50e37 --redact --no-banner` completed with rc=0 and no leaks. The release-preparation followup changes documentation only; the final range is scanned again before publication. Publication and the operator upgrade are recorded below. Existing GJC sessions should be reopened to load the refreshed native instructions.

## Published and installed

- v0.36.1 published at **2026-09-04T22:26:19Z**, tag commit `3899c37138f4e15ee6d3abe055335849cf0b4924`; main and dev advanced atomically. v0.36.0 was marked superseded by v0.36.1 without deleting or moving either tag.
- GitHub Actions test run **33925437882** completed **success** for the release commit.
- Final release-range scan (`16cb311..3899c37`) returned rc=0, no leaks; the final preparation commit contained documentation only.
- The canonical hardened installer updated the operator to **v0.36.1**, rc=0. Native files had no local customization before replacement. The installed engine matches the exact live-tested SHA-256 above; binding mode remains 0600.
- Installed `--inspect-session --require-model "GPT-6 Astra"`: **rc=0**, browser/login ok, model **GPT-6 Astra**, effort **최대**.
- Installed `--ensure-env`: **rc=0** using the existing browser/login, with no credential entry.
- Installed search public canary: **rc=0**, **strong_ok**, one pinned curl attempt, no browser/login/model dependency; the managed environment was reused.
- The normal dedicated browser remains available for reuse. No user browser, profile or login was reset. Full response artifacts remain private in the main checkout's ignored `.insane-review/` directory.

The final documentation followup does not change the tested runtime. All requested inspection, implementation, independent review, live Astra verification, release and operator installation steps are complete.
