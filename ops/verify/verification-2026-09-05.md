# CI slice verification — 2026-09-05

Scope: `.github/workflows/test.yml` and `ops/verify/`. No commit, release, push,
version bump, live installation, browser operation, or credential use by this slice.
Other agents own setup and sandbox implementation. The parent verifies the final
real candidate/cache with the complete-tree gate after its focused commit.

## Official pin evidence

The full action SHAs below were checked against each official repository's Git
ref API (exact source URLs in `pins.json`). Checkout/upload action manifests use
Node 24. The chosen pins are exact releases, not claims about the latest release.

| Action | Release | Verified commit |
| --- | --- | --- |
| actions/checkout | v6.0.2 | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| actions/setup-python | v6.0.0 | `e797f83bcb11b83ae66e0230d6156d7c80228e7c` |
| oven-sh/setup-bun | v2.2.0 | `0c5077e51419868618aeaa5fe8019c62421857d6` |
| actions/upload-artifact | v6.0.0 | `b7c566a772e6b6bfb58ed0dc250532a479d7789f` |

Primary guidance checked:

- [GitHub action pinning/security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions): full commit SHA pinning and verification against the originating repository.
- [setup-python at the selected commit](https://github.com/actions/setup-python/blob/e797f83bcb11b83ae66e0230d6156d7c80228e7c/README.md) and [Python 3.12.12 release](https://www.python.org/downloads/release/python-31212/).
- [setup-bun at the selected commit](https://github.com/oven-sh/setup-bun/blob/0c5077e51419868618aeaa5fe8019c62421857d6/README.md).
- [pip 26.2.1 secure installs](https://github.com/pypa/pip/blob/26.2.1/docs/html/topics/secure-installs.md): exact versions, hashes for every dependency, and wheel-only installation. The rendered pip documentation returned HTTP 403; the official tagged source was read successfully.

All 23 selected wheel URLs/SHA256 values were independently compared with their
official PyPI version JSON, rc=0; these sources are in `dependency-wheels.json`.
Only seven direct parser/transport roots plus their required transitive packages
and pip are installed. PDF/main-content packages prevent t2/t4/t5's existing
successful-return dependency skips from reducing coverage.

The local Bun 1.4.0 archive matched the official release asset SHA256
`2d03fb5fb83ac8b567aca0a281b2ce1a1a19d488f56c2968d88c3f25e92fe452`.
The GJC 0.16.3 binary matched the official release asset SHA256
`6a62e0d268d84ab75af4a58513e849b03c30c17f487b7b524dd4783dca8cf5af`.
Bubblewrap's package matched Ubuntu noble-security's official Packages index:
`1b506492bd9c7fd0cdb4f02ac822f1d3e336b0aead5113c1239baf8db5db562a`.
The sources and exact download URLs for the optional lane are in `pins.json`.

## Local execution evidence

Command (with the private Bun 1.4.0 directory prepended to PATH):

```sh
PYTHONDONTWRITEBYTECODE=1 ops/verify/.local-ci/venv/bin/python ops/verify/run_ci.py \
  --install-deps --out ops/verify/.local-ci/offline-accepted
```

Result: rc=0; Python 3.12.12, Bun 1.4.0, pip 26.2.1; all 23 installed package
versions match the lock. 60 provenance/orchestration tests, 17 deterministic sandbox
fixtures, 266 Bun tests, and 106 tests across the 12 engine scripts passed.
No unexpected skips. Five explicit exclusions remain: the real sandbox Bun file,
online smoke, u4, activation evaluation, and browser canaries. Full logs, commands,
input/log digests, actual versions, and RCs are retained in
`ops/verify/.local-ci/offline-accepted/summary.json` and sibling logs (ignored).

The provenance implementation change is limited to `MARKERS`; full-tree inventory,
byte comparisons, descriptor handling, repeated revalidation, and atomic output
logic remain unchanged. An AST comparison against HEAD, excluding only the marker
assignment, passed with rc=0. Tests now mutate the current search launcher, reject the
real former identity, and compare markers with the actual tracked plugin inventory.

Initial failing runs exposed stale test paths and orchestration scratch-path
issues. Both were corrected: current launcher mutation tests retain their original
security assertions, and disposable test scratch lives outside the checkout so
non-Git fixtures do not inherit its Git root and Unix socket paths remain short.

Final optional lane command:

```sh
PYTHONDONTWRITEBYTECODE=1 ops/verify/.local-ci/venv/bin/python ops/verify/run_sandbox_ci.py \
  --out ops/verify/.local-ci/sandbox-accepted
```

Result: **rc=0**. Official downloads and exact versions (GJC 0.16.3, bubblewrap
0.9.0-1ubuntu0.1 package / 0.9.0 executable), real namespace probe, five skill
injections, and all 23 native command cases passed. The integration command took
89.196 seconds. Evidence is `ops/verify/.local-ci/sandbox-accepted/summary.json`
and sibling logs (ignored). The final consolidated `report.python` contains
host CPython 3.12.12, sandbox CPython 3.12.3 at `/usr/bin/python3.12`,
`version_match=false`, and 28 `actual-stub-process` observations. The outer
Python pin does not pin the sandbox image interpreter; the receipts state what ran.

The final offline and pinned runs captured the same plugin working-tree digest:
`sha256:710b9b5849ee7e2d9a1bd23873b4bc31d7be64085ea91842bd93b34f8498469a`
with repository HEAD `7b45e2afc052a400e9c9ebfe77b0edd1c94a5492` plus the recorded
working changes. That is execution identity, not a clean-HEAD/cache attestation.

Earlier optional runs correctly failed on namespace restrictions or the custom-HOME
canary. The coordinator corrected the canary to accept absent or provably empty
HOME while rejecting nonempty/unreadable directories. The final runner retains
disposable HOME. Ubuntu's path-bound AppArmor behavior is handled by reusing an
existing bubblewrap only after byte equality with the pinned package is established;
a private executable remains subject to the mandatory namespace probe.

GitHub-hosted execution/artifact publication and optional model activation
evaluation have not been run in this session. The workflow was not dispatched.

Final workflow YAML/JSON parsing, local Markdown link checks, and `git diff --check`
passed with rc=0. The read-only docs review covered this ops README, its CLI/source
claims, the sandbox metadata qualification, and the casebank boundaries; it does
not claim a whole-repository documentation audit. Implementation files are frozen
for the parent's focused commit.
