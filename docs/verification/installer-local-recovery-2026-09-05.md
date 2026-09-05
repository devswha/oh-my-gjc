# Local payload installation and native restoration — 2026-09-05

Scope: `work/improvements-20260905-installer`, based on `3f19ae8`.
Root `AGENTS.md`, versions, root `INSTALLATION.md`, and plugin README are unchanged.
No live installation, browser, model invocation, scheduling, push, or release was performed.

## Implemented behavior

- Root `install.sh --local <checkout>` validates the canonical local catalog and
  suite manifest before registration changes, rebinds an existing same-name
  marketplace, and forces installation from that checkout. It never updates a
  remote catalog or retries without `--force`. `--candidate-ref` remains the
  separate fresh-HOME provenance mode. Default canonical remote behavior remains.
- Local validation uses isolated Python, explicit conditions, duplicate-key
  rejection, and canonical non-symlink catalog/asset checks. `PYTHONOPTIMIZE` and
  an explicitly optimized interpreter cannot bypass these checks.
- Updater `--local` canonicalizes the checkout path and forwards it to root
  `install.sh --local`; opt-in scheduling, root rejection, locking, and result
  logging remain in place.
- Native installation stages the selected files and snapshots only their owned
  destinations before publication. A private scope journal records pending
  replacements; the root binding is last. Catchable failures restore the previous
  files/binding. The next native invocation recovers an interrupted installation
  before checking its new source. Recovery conflicts preserve user edits and the
  journal; interrupted/failed recovery can be retried.
- Scope locking uses the `flock` command where present, otherwise Python 3's
  standard-library `fcntl.flock` on the inherited descriptor. No util-linux or
  Python packages are installed. Concurrent installers cannot recover each
  other's active journal; the kernel releases the lock on process exit.

## Verification

Executed in the assigned worktree on Linux:

```sh
bash -n install.sh
bash -n plugins/oh-my-gjc/bin/install-skill.sh
bash -n plugins/oh-my-gjc/bin/omg-autoupdate.sh
OMG_REAL_GJC=/home/devswha/.local/bin/gjc bun test \
  plugins/oh-my-gjc/test/one-shot-installer.test.ts \
  plugins/oh-my-gjc/test/local-installer.test.ts \
  plugins/oh-my-gjc/test/omg-autoupdate.test.ts \
  plugins/oh-my-gjc/test/native-install-transaction.test.ts \
  plugins/oh-my-gjc/test/suite-root-binding.test.ts \
  plugins/oh-my-gjc/test/gajae-app-removal.test.ts
```

All commands rc=0; **115 tests passed, 0 failed, 1436 assertions**. The actual GJC
case was enabled, not skipped. Its three install/update subprocesses each returned
rc=0 in an isolated HOME. The Linux seccomp fixture denies IPv4/IPv6 socket
creation in every child and verifies the block before execution. The selected
local command contains distinct first-install, same-version-update, and upgrade
bytes, checked against both the selected cache and installed native command.
Changing the fixture version to `98.7.6` verifies a different cache-root binding;
no repository version was changed. A separate fixture verifies switching to a
different checkout after registration already exists.

Fault coverage includes partial staging/backup/publication copies, failed rename,
failed binding publication, SIGTERM, SIGKILL before/after binding publication,
retry after failed restoration, metadata restoration with identical bytes,
symlinked destinations, and post-interruption user edits. User/project scopes and
single-capability installs are covered. With `flock` absent from PATH, the real
Python stdlib fallback excludes a concurrent installer and recovers after SIGKILL.
Existing retired cleanup, custom files, credentials/model sentinels, and old
identity bindings/data remain covered.

Additional checks: JSON parse and name/source parity, exactly 5 skills + 5 command
templates, and `py_compile` of the seccomp test helper all rc=0. `git diff --check`
rc=0. The focused staged patch scan
`git diff --cached --binary | gitleaks stdin --redact --no-banner` returned rc=0,
no leaks found; release-range
verification remains the integrating parent's responsibility.

## Limits and documentation handoff

Coverage is this change and its installation/updater documentation claims, not a
whole-repository docs audit. The parent owns the following exact minimal updates:

1. `INSTALLATION.md:27`: replace “never a partial install” with: selected native
   files are staged, catchable publication failures restore their snapshots, and
   the next native invocation recovers interrupted publication. Readers can see
   intermediate replacements. There is no marketplace/cache-wide transaction and
   no power-loss/fsync durability guarantee.
2. `INSTALLATION.md:63`: explain that `all` selects all five skills/five commands;
   a named capability updates only that target and the shared suite binding, so
   untouched capabilities may still contain older native text. Retired cleanup
   runs after native commit using its existing ownership checks, outside the
   restoration journal. An error in that later cleanup does not roll back the
   committed native set. Re-running retries cleanup.
3. `INSTALLATION.md:66` and plugin `README.md:85-95`: document root
   `bash /path/to/checkout/install.sh --local /path/to/checkout` and updater
   `--local` as selecting both installer and payload, including existing-HOME
   reruns/upgrades. This requires a GJC CLI supporting `--force`; there is no
   remote/unforced fallback. Local catalog validation requires Python 3.
4. Installation prerequisites: native scope locking uses either the `flock`
   command or Python 3's stdlib `fcntl` (no package installation). Recovery uses
   `<native-root>/runtimes/oh-my-gjc/.native-install`; leave a conflict journal
   intact and resolve the reported destination conflict before re-running.

macOS execution is **pending-environment**; the no-flock stdlib path was exercised
on Linux, not represented as a live macOS run. SIGKILL before journal publication
or during discarded-journal disposal can leave private staging/discard directories;
these are never interpreted as active native state. Directory creation itself is
not rolled back, so empty created parent directories may remain. Marketplace and
cache changes already made by GJC cannot be restored by this native journal.

Parent draft review identified portability and optimized-Python validation issues;
both were fixed and received regression coverage. A further subagent review could
not start because the parallel-agent thread limit was reached; parent integration
review remains outstanding.
