# Reproducible CI

The default workflow runs on Ubuntu 24.04 with CPython 3.12.12 and Bun 1.4.0.
It runs manifest/shell/Python syntax checks, the complete-tree provenance tests,
orchestration tests, deterministic sandbox fixtures, Bun tests except the real
GJC sandbox file, and the explicitly reviewed engine suites below.

From the repository root, with those runtime versions available:

```sh
python3 -m venv ops/verify/.local-ci/venv
ops/verify/.local-ci/venv/bin/python ops/verify/run_ci.py \
  --install-deps --out ops/verify/artifacts/offline
```

Use a **new** output directory for every run. `--install-deps` is explicit and
requires a venv. Without it, the runner only checks already installed dependencies.
The Linux x86_64/CPython 3.12 wheel lock pins pip, all eight directly exercised
packages, and their transitive dependencies. Imports and installed versions must
match; missing/broken packages, unexpected skips, zero-test summaries, nonzero RCs,
and timeouts fail the run. No browser, model SDK, or pytest is installed. yt-dlp is
pinned for offline tests of the real extractor's public-access boundaries; it is
not installed by production fetches.

`summary.json` records actual versions, dependency checks, source/log hashes,
commands, RCs, counts, failures, and exclusions. Each command has a log. The
workflow uploads evidence with `always()` and fails if no artifact files exist.
A workflow action/setup failure before the runner starts cannot produce a runner
summary; the job and missing-artifact step fail explicitly. A passing default job
still has the exclusions listed below. It is not complete integration coverage.

The plugin working-tree digest reuses `record_provenance.py`'s full-tree traversal
and aggregate digest. It is **not** an installed-cache attestation. The provenance
gate still verifies HEAD, the complete tracked payload, cache identity, and repeated
snapshots. Its current marker inventory is also tested against `git ls-files`;
synthetic retired files cannot make that regression test pass.

| Engine suites | Reviewed offline behavior |
| --- | --- |
| t1 | Retry/backoff with fake responses and recorded sleeps |
| t2–t5 | Fixture HTML/JSON-LD/PDF/Markdown/main-content extraction; real parser imports |
| t6 | Differential classification from synthetic traces |
| t7 | Browser routing with patched collaborators; no browser launched |
| u1 | Validator and scheduler fixtures |
| u5 | Learning module with temporary explicit paths; no runtime persistence claim |
| u7 | URL/redirect guards with literals and fake redirects |
| u8 | Untrusted-content boundary fixtures |
| u9 | Mocked yt-dlp resolution/subprocess; no yt-dlp installation |
| search completeness / outputs / public captions | Bounded extraction metadata, batch framing, WebVTT and real-library access-policy fixtures |

The actual root-installer reproduction is a separate lane: set `OMG_REAL_GJC` to
the intended GJC binary and run `bun test plugins/oh-my-gjc/test/local-installer.test.ts`.
Its Linux seccomp fixture blocks networking. Without that explicit binary, the test
file emits a machine-readable coverage notice and runs the installer fixtures;
the offline summary lists the real-GJC reproduction as excluded.

`test_smoke.py` and `test_u4.py` are excluded because they contain real endpoint
requests. The allowlist is deliberately not unittest discovery: these scripts
have custom main functions (u5 runs at module scope). Their internal dependency
skip messages are treated as failures. The reviewed suites use local fixtures;
this runner is not a network isolation boundary for arbitrary future tests.

## Optional pinned GJC integration

Use workflow dispatch with `run_sandbox=true`, or run on Linux x86_64 with the
pinned Python and `dpkg-deb` available:

```sh
python3 ops/verify/run_sandbox_ci.py --out ops/verify/artifacts/sandbox
```

This downloads the hash-pinned GJC 0.16.3 standalone binary and Ubuntu bubblewrap
0.9.0-1ubuntu0.1 package into the new output directory, verifies both hashes, and
extracts bubblewrap privately. An existing bubblewrap is reused only if its bytes
match that package exactly, preserving Ubuntu's path-bound AppArmor profile.
It does not run apt/sudo, modify live installations,
or change host namespace policy. Downloaded executables are removed after the run;
their hashes and observed versions remain in evidence.

The lane first calls `skill_sandbox.py --probe-prerequisites`. Missing shared
libraries or unavailable kernel/AppArmor namespace support fail the requested job
and record unavailable coverage; there is no unsandboxed fallback. It then calls
`--json` and requires five explicit skill injections, all 23 command variants,
verified expansion/arguments, matching coverage counters, and isolation evidence.
The outer runner uses pinned Python 3.12.12; the harness stub uses the sandbox's
`/usr/bin/python3`, whose actual version is separate runtime evidence, not a
promise of identical interpreter bytes. GJC notifications and SDK hosting are disabled. The default lane separately runs
`skill_sandbox_test.py` without GJC, so deterministic rejection tests are always covered.
Hosted-runner namespace compatibility still requires an actual dispatch; local
success is not evidence that GitHub ran the job.

## Activation casebank

[skill-activation-casebank.json](skill-activation-casebank.json) is a separate
manual/optional model evaluation dataset. CI validates its structure and source
paths only. Neither those checks nor deterministic sandbox stub loading prove
natural-language activation, command behavior, or model quality.

For a manual or separately authorized model evaluation, use a fresh session with
the stated context for each case. Record the source commit/content hashes, GJC and
model version, case ID, observed skill-loading trace, expected/actual decision,
and pass/fail/unavailable result. Do not score missing traces as passes. Evaluate
routing without executing browser, credential, install, or merge side effects.
`expected_load` means loading the named skill, not merely parsing a command: fresh
no-english `status`, `off`, and invalid arguments do not load it; empty/on do.

## Updating pins

[pins.json](pins.json) records official action tag-to-commit URLs and tool hashes;
[dependency-wheels.json](dependency-wheels.json) records the selected official PyPI
wheel URLs/hashes and required dependency metadata. Verification sources and local
results are in [verification-2026-09-05.md](verification-2026-09-05.md).

To refresh Python dependencies intentionally, edit `requirements-ci.in`, then use
the pinned Python/pip in a disposable venv:

```sh
python -m pip --isolated install --dry-run --ignore-installed --only-binary=:all: \
  --index-url https://pypi.org/simple --report ops/verify/.local-ci/resolve.json \
  -r ops/verify/requirements-ci.in pip==26.2.1
```

Review the resolution; update **every** exact version/hash in `requirements-ci.lock`
and its wheel record using the report plus official PyPI release JSON. Install with
`--require-hashes --only-binary=:all:` and rerun both orchestration and engine suites.
Update workflow action SHAs and `pins.json` together after verifying official refs.
The OS image and kernel are recorded, not bit-for-bit frozen; the lock targets the
stated platform rather than claiming universal reproducibility.
