# Research follow-through — 2026-09-05

The user authorized implementation of all findings from the parallel research. The baseline is `3f19ae873ce6f3a36f0d2d41e6cba7df3d3c458a` (v0.36.1 installed); the baseline Bun suite returned rc=0, 254 passed, 0 failed, 1070 assertions across 18 files. Four separate worktrees own the implementation; the integration worktree owns release metadata, public documentation, and final verification.

## Scope and acceptance

| Work | Required evidence |
|---|---|
| Pro send recovery | An attempted send is never automatically repeated; durable harvest sends nothing and rejects ambiguous conversation/turn/source identity. Timeout, DOM failure, restart and private journal tests. |
| Local updates | The selected checkout supplies the actual payload on fresh, repeated and upgraded installs with network unavailable; no remote fallback. |
| Native install recovery | Complete staging, binding published last, restoration of prior owned files after copy/activation failure, recoverable interrupted state, unrelated files preserved. |
| Partial extraction | PDF page/text and JSON-LD caps remain bounded and are reported explicitly, including failures and incomplete coverage. |
| Structured batch results | Body and provenance in one versioned JSON/JSONL result per input, stable input order, mixed failures, existing untrusted-content and URL guards. |
| Public captions | Explicit language/source selection, timed cues and source metadata; public transport only, no login or browser fallback. Fixtures and any reachable public canary reported separately. |
| Setup and usage | Aggregate static diagnostics with scope/shadowing information; browser/login/model runtime state remains unverified. Accurate first-use examples and explicit activation boundaries. |
| Verification and CI | Actual public command expansion/arguments, reviewed offline Python suites, current complete-tree provenance inventory, pinned tooling, retained logs and machine-readable outcomes. |

No new marketplace entry or public command is planned. The five skills and five commands remain the public suite. Removed workflows, model presets, user credentials, old research state and external browser profiles are outside this change.

## Additional verified finding

The existing `record_provenance.py` correctly compares the full tracked plugin tree, but its separate mandatory marker list still references retired onboarding and multi-harness files. Its unit fixtures reproduce those retired files, hiding the mismatch with the real suite. Update the inventory and exercise the actual tracked candidate/cache pair before release; do not replace the complete-tree verifier.

The PDF finding was reproduced with real parsers before integration. Synthetic reportlab documents of 2, 80 and 81 pages were passed to the existing extraction helpers using pypdf 5.0.0 and pdfplumber 0.11.4 in a temporary environment. Both returned all page markers for 2 and 80 pages, but only 80 markers for the 81-page input. The pypdf error field remained empty; neither helper returned coverage metadata. These fixtures contain no user data. The parser environment is separate from the operator's managed search environment.

## Status

Implementation and final evidence are in progress. A passing local fixture does not establish live ChatGPT recovery, public caption availability, model-driven natural-language selection, or a published installation. Final outcomes and limitations will be recorded in the release verification document.
