# v0.37.0 verification — 2026-09-05 UTC

Behavior candidate: `546df1f9799cec6ba3aa3ceb1d8bdb776654d42f`, based on
`3f19ae873ce6f3a36f0d2d41e6cba7df3d3c458a`. The user authorized all eight
[research follow-through items](research-improvements-2026-09-05.md). Four isolated
implementation worktrees and fresh-context reviews converged in the integration
branch. The public suite remains five skills and five commands.

## Implemented and reviewed

- Pro runs journal the irreversible send boundary and never automatically resend.
  Harvest-only recovery binds the exact request/answer and audited packed files.
- Local updater/root installation uses the selected checkout's actual payload;
  native publication stages files and restores interrupted/failed replacements.
- PDF/JSON-LD extraction reports bounded or failed coverage. Body/provenance
  JSON and JSONL preserve per-input ordering and mixed successes/failures.
- Explicit single-video public YouTube captions select language/manual-or-auto,
  preserve timed/overlapping WebVTT cues, and stop at access boundaries.
- Setup aggregates static findings. Public command/argument tests, pinned CI
  dependencies/actions, current provenance inventory, logs and coverage records
  are wired into verification.

Independent draft reviews returned REQUEST_CHANGES. All findings were accepted
and fixed before the behavior candidate:

| Finding | Fix |
|---|---|
| Missing source after preflight could publish nine files and discard recovery state | Missing list checked before publication; disappearance regression. `79e25da` |
| Exported CDPATH contaminated relative local paths | Canonicalization clears CDPATH; root/updater relative-path regression. `79e25da` |
| yt-dlp silently used an embedded client after an age gate, and suppressed private-video errors | Access evidence checked before fallback and alternate client/config/embed requests rejected; real-library offline fixtures. `46f5a0c` |
| Valid WebVTT blank-line runs rejected cues | Separator/parser regressions for line endings, identifiers, notes and overlap. `46f5a0c` |
| Multiline keyboard typing fallback could submit while journal was prepared | Submission-capable fallback removed; actual put_text path exercised. `0915ca2` |
| Added run marker bypassed the prompt-echo rejection threshold | Normal/harvest responses compared with the actual persisted request hash. `0915ca2` |
| Invalid profile expansion discarded the aggregate setup report | Resolution guarded; accumulated JSON survives malformed settings. `f1a475b` |
| Combined unittest counters hid skipped tests | Real skip + expectedFailure summary regression. `f1a475b` |
| CI identity omitted executed root inputs | Root install.sh and marketplace manifest hashes included; dirty-input regression. `f1a475b` |

The parent also corrected optimized-Python local validation, portable native
locking, overly broad review source hashing, and the live attachment text issue
below. [Installer evidence](installer-local-recovery-2026-09-05.md),
[caption review evidence](insane-search-caption-review-fixes-2026-09-05.md),
[CI design and scoped evidence](../../ops/verify/verification-2026-09-05.md).

## Final local verification

| Check | Result |
|---|---|
| Pinned offline CI | rc=0; CPython 3.12.12, Bun 1.4.0, hash-locked dependencies; **319 Bun tests**, **62 provenance/orchestration**, **17 sandbox fixtures**, **141 engine tests**; no unexpected skips |
| GitHub Actions | Workflow dispatch **33960613092**, candidate 546df1f, completed success; same test counts and no unexpected skips; artifact **9967831028** (`offline-ci-33960613092-1`) uploaded and downloaded for verification |
| Pinned actual GJC sandbox | rc=0; GJC 0.16.3, five explicit skill injections, **23 public command/argument cases**; isolated loopback stub, no paid calls |
| Actual blocked-network local installs | rc=0; 17 tests including fresh, changed same-version and upgraded payloads through GJC 0.16.0; private-network socket creation blocked in child processes |
| New isolated-HOME root installer | rc=0; v0.37.0 installed; gjc plugin list rc=0; all ten native files match source; binding 0600 |
| Complete installed payload attestation | rc=0; **111 tracked files**, exact bytes and directory shape match candidate and cache |
| Release-range secret scan | rc=0; `gitleaks git . --log-opts=v0.36.1..HEAD --redact --no-banner`, no leaks; final documentation followup rescanned before publication |
| JSON, shell, Python, skill checks | rc=0; both active manifests, root/all suite shell scripts, py_compile of 46 relevant Python files, three changed skills validated |
| Real PDF parser comparison | rc=0; nine cases across pypdf 5.0.0, pdfplumber 0.11.4 and combined fallback; 2/80 pages retained, 81-page input reports total=81, processed=80, page_limit, incomplete |
| Live body JSON and JSONL | Expected rc=1 for mixed batch; example.com strong_ok followed by a blocked loopback URL, indices 0/1 preserved; **zero network attempts** for the private URL |

The complete payload aggregate is
`sha256:da5f0ff809d20d52bb2e6dc446147f7647d98febdcafee1ce81af1ffb9bd1e16`.
Local logs, full JSON summaries and attestation remain under
`/tmp/omg-improvements-release/`; private browser state and conversation URLs are
not published. Python inside the GJC sandbox was 3.12.3, separately reported from
the outer pinned interpreter.

## Real Pro recovery

The existing dedicated GUI Chrome was already logged in with **GPT-6 Astra
(최대)**. No profile reset, credential entry or model fallback occurred. A canary
packed the complete candidate digest/text-normalization helpers and their four
tests as two files. Local tests and gitleaks passed before egress; repomix 1.15.0
used forced secretlint, full code, line numbers and mandatory attachment.

The initial run clicked send **once** despite retries=2. It then stopped with
unknown delivery because user-turn innerText included the attachment filename
and the UI's “파일” label. This was not a timeout canary success. The real DOM
showed one separate prompt body; the matcher now uses that exact body and retains
hash/run-marker/baseline checks. A saved conversation and request evidence can
bind a previously unobserved user ID after reconnection; absent/ambiguous evidence
still aborts.

A new **harvest-only process sent zero messages**, recovered the same response,
returned rc=0 and marked the journal complete. Final-engine repeat harvest also
returned rc=0 and retained the identical response hash. The canary verdict was
APPROVE; it verifies transport/recovery, not the entire release's code review.

- Final engine SHA-256: `9ed72e1e2695f6fc9effdcd58abd05842699b3311e6dae43d1944a89c9cc0266`.
- Journal module SHA-256: `2e0b65398bc08899ecae8602e86e62604e3c1a210bcb74fc9ceb982a2087f8d4`.
- Response SHA-256: `1eeb3cee6a3891587337d2ce0595a800c6f334f4ab010b938c6b963321685bee`.
- Response and journal mode: 0600. Response preserved privately in the main
  checkout's ignored `.insane-review/` directory.

## Limits and remaining publication evidence

The default offline lane explicitly excludes real-GJC root installation and
sandbox integration; both were exercised separately above. Natural-language
activation evaluation is optional and was not represented as proved by the stub.
macOS execution is pending-environment. Native recovery covers selected files and
binding, not marketplace/cache-wide transactions or power-loss durability.

With actual yt-dlp 2026.8.19 in a temporary environment, the public YouTube canary
reported no manual track; the automatic track response was not WebVTT and was
rejected. This is not a successful live YouTube transcript claim. Real-library
offline fixtures verify successful public captions and access-gate failures;
no authentication, age-gate or browser workaround was attempted. Production
fetches and installers do not install optional dependencies.

The optional GitHub sandbox job was not requested in that dispatch; its local
pinned run is recorded separately above. No stable updater copy was present in
the operator's state directory. Existing scheduled users must explicitly refresh
their older stable copy with the new enable command and the same options.

## Final independent review

Fresh native GJC `kimi-code/k3`, restricted to read/search/find with notifications,
SDK hosting, MCP and session persistence disabled: **rc=0, VERDICT: APPROVE** after
818.07 seconds. The reviewer inspected the immutable 546df1f source snapshot and
found no material defects. [Full report](v0.37.0-review.md). The snapshot egress
scan returned rc=0. Publication and the operator upgrade follow this verification;
these records are documentation-only additions outside the tested plugin payload.
