# Skills audit and automation changes — 2026-09-04 UTC

## Scope and status

- Baseline: `f97288e` on fetched `origin/main`; isolated branch `fix/skills-audit-astra-20260905`.
- Candidate manifest version: **0.36.0**, not tagged or released by this task.
- All five skills, all five command templates, native installer asset/root contracts, review/search/image runtimes, relevant tests and public usage documentation were inspected. Vendored reference manuals and archived retired capabilities were not audited line by line.
- Code verification is recorded below. Final independent candidate review: **APPROVE**; two non-blocking LOW findings addressed. **Live Astra/ChatGPT CDP verification is pending-environment**, not passed.
- User's browser/Pro report maps to `insane-review`: `insane-search` uses public HTTP fetches and has no ChatGPT login or model selection. The exact reported Astra UI has not been observed in this environment.

## Findings and changes

| Severity | Finding / trigger | Change and evidence |
|---|---|---|
| High | Native search/image resolvers silently skipped an invalid project binding and selected a user/check-out root; review resolver omitted file ownership/privacy validation. | All active resolver blocks now reject existing invalid higher-priority bindings, symlink components, malformed content and missing assets. Executable tests cover project/user ordering, legacy boundaries, permissions and redirects via symlinks. Replaced snippets are archived under `docs/removed/suite-resolvers/`. |
| High | Review templates forced Sol; model detection excluded a bare Astra name and substring matching could accept an incomplete/other variant label. | `--require-model current` freezes selected UI evidence; exact named requests preserve family/variant after GPT prefix normalization. Ambiguous selections and missing Pro evidence fail closed. Astra fixtures cover `6 Astra` and `Astra`, and mismatch cases. These are fixtures, not live Astra evidence. |
| Medium | Missing login UI was classified as logged out; a failed login probe could leave check-env with rc=0. | Visible login wall → `no`; absent/uncertain evidence → `unknown`; unknown readiness fails. Existing dedicated profile/browser choice stays reusable. Headless Linux launch reports the missing GUI immediately. `--inspect-session` reads current state without selecting a model or sending a prompt. |
| Medium | Review skill's trigger included ordinary review/fix/problem requests, which could unnecessarily lead into web-login onboarding. | Trigger now requires an explicit ChatGPT/Pro review request. Public search and ordinary code review do not activate the web review skill. |
| Medium | Search dependencies were absent; normal invocations lacked one useful preflight or a reusable isolated setup path. | Explicit `setup_insane_search.py --install` creates a private managed venv (Python + pip>=22.3, no sudo/ensurepip dependency). Normal launcher reuses it, reports missing core packages once, and never installs packages. No login/API key/browser/model prerequisite. |
| Medium | `/omg:setup` compared the canonical path to itself as the legacy path. | Corrected to the preserved `oh-my-gajae-code` binding. |
| Medium | Followup accepted a redirect to any syntactically valid conversation. | Compare the actual conversation ID to the requested ID, allowing the same ID through a project route; another chat is rejected. |
| Medium | Public-address guard accepted shared CGNAT space; redirected credential URLs were not rejected at this guard. | Reject non-global IPs including 100.64.0.0/10 and URL userinfo in the transport resolver. DNS pinning/manual redirect checks remain. |
| Medium | Actual-GJC skill harness omitted Responses message/content announcement events and failed with “Turn completed without assistant text.” | Stub now emits the complete message/content stream lifecycle. All five skills load through real isolated GJC without paid calls. |
| Low | Native-only skill copies pointed to references beside SKILL.md, and public extragoal docs implied its optional web lane was mandatory. | References now use the verified suite root; docs describe the existing native default and optional N-of-N AND gate. No extragoal execution policy changed. |

The independent original-source review confirmed the setup-path and model-label problems: [raw initial review](skills-audit-2026-09-04-initial-review.md). It did not prove live UI compatibility. The [final independent review](skills-audit-2026-09-04-final-review.md) returned APPROVE. LOW model-name wording was corrected. For the LOW temporary-directory portability finding, the test now resolves its temporary XDG base; product rejection of symlinked runtime paths is intentionally retained and documented. These followups alter docs/test fixtures only.

## Per-skill coverage

| Skill | Verified locally | Live boundary |
|---|---|---|
| no-english | Explicit-command trigger, session-only scope, preservation of code/logs/evidence; actual native loading | No external runtime |
| extragoal | Leaf reviewer/secret-scan/verdict contracts and actual native loading; independent GJC audit exercised | Optional ChatGPT web lane not exercised |
| insane-review | Exact model/current selection fixtures; login classification; scoped turn/clipboard/lease tests; followup identity; native loading | CDP browser unavailable; no code sent through ChatGPT web |
| insane-search | Managed setup/reuse; preflight; public URL/SSRF/prompt-boundary tests; actual public-page fetch | Auth/CAPTCHA/paywall bypass excluded; optional media/PDF packages not installed for the live canary |
| gpt-image | Strict root resolution, PNG/output/provenance/deadline/shared lease tests; explicit trigger and native loading | No live image generation; dedicated browser unavailable |

## Verification evidence

- Baseline full Bun run: **177 passed, 1 failed** (real-GJC sandbox stream issue).
- Candidate full run: `bun test plugins/oh-my-gjc/test` → **245 passed, 0 failed**, 17 files, 1061 assertions.
- After the LOW documentation/test-fixture followups: readiness + no-english + frontmatter checks → **27 passed, 0 failed**, rc=0. Production runtime bytes remain those reviewed at `9a30dec`.
- Manifest JSON parse + name/source/version parity, `bash -n install.sh` and all active bin shell scripts, Python compile of active bin helpers and changed safety module: passed.
- Skill-creator validator: all **5** active skills passed.
- `git diff --check`: passed.
- Vendored offline engine scripts: all **12** selected suites passed (`test_t1_retry` through `test_t7_browser_gate`, `test_u1`, `test_u5`, `test_u7`, `test_u8`, `test_u9`). `test_smoke` and `test_u4` contain online cases and were not included in that offline batch. Optional dependency tests may use mocks/fallbacks.
- Actual new install, isolated HOME and GJC/XDG roots: hardened root `install.sh --candidate-ref <worktree>` **rc=0**; `gjc plugin list` **rc=0**; exactly 5 skills / 5 commands; v0.36.0 cache root binding mode **0600**; no SDK receipts.
- Explicit search setup in a new isolated HOME: **rc=0**. Subsequent launch through system `python3 insane_search.py --check-env` auto-reused managed Python with **rc=0**, `missing=[]`, `authentication=not_required`, `browser=not_used`, `model=not_used`.
- Live public canary: `insane_search.py https://example.com/ --json --trace --timeout 5 --no-retry` → **rc=0**, HTTP 200, **weak_ok**, one curl attempt, 167 extracted characters, `content_trust=untrusted_public_web`, `must_invoke_browser=false`. This proves public fetch/extraction, not every blocked platform.
- Observed managed package versions: curl_cffi 0.16.3, beautifulsoup4 4.15.0, PyYAML 6.0.3, markdownify 1.2.3, pip 26.2.1. Future setup resolves the declared package constraints; this is not a lockfile.
- Initial and final-review snapshot secret scans: rc=0 after redacting two confirmed synthetic tokens in existing collect redaction tests. Whole-history/archive scans are not represented as passing. `gitleaks git . --log-opts=f97288e..9a30dec --redact --no-banner`: rc=0, no leaks.

## Pending environment and delivery

- Updated `pack_and_ask.py --ensure-env`: **rc=1**; `DISPLAY` and `WAYLAND_DISPLAY` absent; CDP 9222 down. Existing dedicated profile is present and was not reset; no login was automated.
- Updated `--inspect-session`: **rc=1**, `browser=down`, `login=unknown`, model/effort null. No upload, generation, model-selection click or review prompt was made by these checks.
- A standard `--headless=new` diagnostic launch using the same dedicated profile did bind CDP successfully, but ChatGPT returned **HTTP 403**, a waiting/challenge title, no composer, and `login=unknown`. No challenge interaction, login, or alternate fetch was attempted. Only the process started for that diagnostic was terminated after verifying its captured PID, owner, normalized exact headless/profile/port arguments and Chromium executable; the profile was preserved. Headless operation is not claimed as a working substitute.
- Required remaining proof: run inspection and a relevant review using the operator's existing dedicated logged-in browser with the actual Astra Pro UI, then inspect the saved response/provenance. Fixture acceptance alone is insufficient.
- Control-tower report: direct local root probe returned HTTP 200 with title Tower; `/health` returned HTTP 404 (curl rc=0 alone was not service-health proof). A `kind=report` will use the repository-documented `/queue/add` endpoint after pushing; delivery is not claimed yet.
- Implementation/removal commit: `9a30dec` (candidate v0.36.0). Final review verdict: APPROVE. Documentation/test-fixture followups are recorded in the subsequent commit on the same work branch; the final pushed head is reported to the control tower after pushing.
