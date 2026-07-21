---
description: Confirm one research task, run exactly four isolated read-only harnesses through the trusted multi-harness runtime, then finalize only a bounded non-authoritative comparison.
argument-hint: "<confirmed research task>"
---

# /omg:multi-harness

This command is explicit-only. Never activate it from ordinary research, review, model-comparison,
or delegation language. An explicit argument is the canonical task. If absent, preview a
one-sentence goal, research questions, and expected output, then obtain confirmation before any
runner invocation.

Use the **direct** trusted `multi-harness-research` runner, not `gjc team`, a worktree, a child
GJC goal/session, a fifth model, or a fallback. The target stays read-only. The command never
installs, updates, migrates, sets up, or logs in to a CLI or provider.

Run the following one synchronous GJC Bash-tool script twice: first with `OMG_MULTI_HARNESS_MODE`
set to `run`, `OMG_MULTI_HARNESS_TASK` set through the Bash tool `env` field to the confirmed
canonical task, and `TARGET_CWD` set to the target's absolute path. The second time is only after
the phase-1 receipt and successful lane documents have been inspected: set
`OMG_MULTI_HARNESS_MODE=finalize` and pass a versioned JSON envelope containing the bounded
leader prose and the opaque `finalization_receipt_path` through
`OMG_MULTI_HARNESS_FINALIZE_ENVELOPE` in the Bash-tool `env` field. Do not interpolate task,
comparison, receipt path, credential, or token into shell source or argv. The shell writes each
env value to a private mode-`0600` stdin file, immediately unsets it, and never prints that file.

```bash
set -u
umask 077

case "${OMG_MULTI_HARNESS_MODE:-}" in
  run)
    [ -n "${OMG_MULTI_HARNESS_TASK:-}" ] || { echo "multi-harness task is empty" >&2; exit 2; }
    PAYLOAD_ENV=OMG_MULTI_HARNESS_TASK
    RUNNER_MODE=run
    ;;
  finalize)
    [ -n "${OMG_MULTI_HARNESS_FINALIZE_ENVELOPE:-}" ] || { echo "multi-harness finalization envelope is empty" >&2; exit 2; }
    PAYLOAD_ENV=OMG_MULTI_HARNESS_FINALIZE_ENVELOPE
    RUNNER_MODE=finalize-comparison
    ;;
  *)
    echo "multi-harness mode must be run or finalize" >&2
    exit 2
    ;;
esac
: "${TARGET_CWD:=$PWD}"

ACCOUNT_HOME="$(/usr/bin/getent passwd "$(/usr/bin/id -u)" | /usr/bin/cut -d: -f6)"
[ -n "$ACCOUNT_HOME" ] || { echo "canonical account home unavailable" >&2; exit 1; }
ACCOUNT_UID="$(/usr/bin/id -u)"
RUNTIME_ROOT="$ACCOUNT_HOME/.gjc/agent/runtimes/multi-harness-research"
SOURCE_BINDING="$RUNTIME_ROOT/binding"
SOURCE_RUNNER="$RUNTIME_ROOT/runner.mjs"
[ -f "$SOURCE_BINDING" ] && [ ! -L "$SOURCE_BINDING" ] && [ -f "$SOURCE_RUNNER" ] && [ ! -L "$SOURCE_RUNNER" ] || {
  echo "trusted multi-harness runtime binding not found; rerun native user install" >&2
  exit 1
}
[ "$(/usr/bin/stat -c %u "$RUNTIME_ROOT")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$RUNTIME_ROOT")" = 700 ] && \
  [ "$(/usr/bin/stat -c %u "$SOURCE_BINDING")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$SOURCE_BINDING")" = 600 ] && \
  [ "$(/usr/bin/stat -c %u "$SOURCE_RUNNER")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$SOURCE_RUNNER")" = 700 ] || {
  echo "multi-harness runtime permissions are unsafe; rerun native user install" >&2
  exit 1
}

PRIVATE_BASE="$ACCOUNT_HOME/.cache/oh-my-gjc/multi-harness-research"
/usr/bin/mkdir -p "$PRIVATE_BASE" && /usr/bin/chmod 700 "$PRIVATE_BASE" || {
  echo "cannot create private multi-harness launch directory" >&2
  exit 1
}
LAUNCH_ROOT="$(/usr/bin/mktemp -d "$PRIVATE_BASE/launch-XXXXXX")" || {
  echo "cannot create private multi-harness launch directory" >&2
  exit 1
}
PAYLOAD_FILE="$LAUNCH_ROOT/payload"
BINDING="$LAUNCH_ROOT/binding"
RUNNER="$LAUNCH_ROOT/runner.mjs"
OUTPUT_FILE="$LAUNCH_ROOT/receipt"
STDERR_FILE="$LAUNCH_ROOT/runner.stderr"
cleanup() { /usr/bin/rm -rf -- "$LAUNCH_ROOT"; }
trap cleanup EXIT HUP INT TERM

case "$PAYLOAD_ENV" in
  OMG_MULTI_HARNESS_TASK)
    printf '%s' "$OMG_MULTI_HARNESS_TASK" > "$PAYLOAD_FILE"
    unset OMG_MULTI_HARNESS_TASK
    ;;
  OMG_MULTI_HARNESS_FINALIZE_ENVELOPE)
    printf '%s' "$OMG_MULTI_HARNESS_FINALIZE_ENVELOPE" > "$PAYLOAD_FILE"
    unset OMG_MULTI_HARNESS_FINALIZE_ENVELOPE
    ;;
esac
/bin/cp -- "$SOURCE_BINDING" "$BINDING" && /bin/cp -- "$SOURCE_RUNNER" "$RUNNER" || {
  echo "multi-harness runtime snapshot failed" >&2
  exit 1
}
: > "$OUTPUT_FILE"
: > "$STDERR_FILE"
/usr/bin/chmod 600 "$PAYLOAD_FILE" "$BINDING" "$RUNNER" "$OUTPUT_FILE" "$STDERR_FILE"
mapfile -t BINDING_LINES < "$BINDING"
[ "${#BINDING_LINES[@]}" -ge 6 ] && [ "${BINDING_LINES[0]}" = multi-harness-research-binding-v1 ] && \
  [ "${BINDING_LINES[1]}" = "$ACCOUNT_HOME" ] && [ "${BINDING_LINES[3]}" = "$SOURCE_RUNNER" ] || {
  echo "multi-harness runtime binding is invalid; rerun native user install" >&2
  exit 1
}
sha256_file() { /usr/bin/sha256sum -- "$1" | { read -r digest _; printf '%s' "$digest"; }; }
secure_runtime_file() {
  local path="$1" expected="$2" current uid mode owner
  [ -f "$path" ] && [ ! -L "$path" ] && [ "$(/usr/bin/readlink -f "$path")" = "$path" ] && [ "$(sha256_file "$path")" = "$expected" ] || return 1
  uid="$(/usr/bin/id -u)"
  mode="$(/usr/bin/stat -c %a "$path")"; owner="$(/usr/bin/stat -c %u "$path")"
  { [ "$owner" = "$uid" ] || [ "$owner" = 0 ]; } && [ $((8#$mode & 8#22)) -eq 0 ] || return 1
  current="$(/usr/bin/dirname "$path")"
  while [ "$current" != / ]; do
    [ ! -L "$current" ] || return 1
    mode="$(/usr/bin/stat -c %a "$current")"; owner="$(/usr/bin/stat -c %u "$current")"
    { [ "$owner" = "$uid" ] || [ "$owner" = 0 ]; } && [ $((8#$mode & 8#22)) -eq 0 ] || return 1
    if [ "$owner" = "$uid" ] && [ $((8#$mode & 8#77)) -eq 0 ]; then return 0; fi
    current="$(/usr/bin/dirname "$current")"
  done
}
secure_runtime_file "$RUNNER" "${BINDING_LINES[2]}" && secure_runtime_file "${BINDING_LINES[5]}" "${BINDING_LINES[4]}" || {
  echo "multi-harness runtime verification failed; rerun native user install" >&2
  exit 1
}

set +e
"${BINDING_LINES[5]}" "$RUNNER" "$RUNNER_MODE" --cwd "$TARGET_CWD" --binding "$BINDING" < "$PAYLOAD_FILE" > "$OUTPUT_FILE" 2> "$STDERR_FILE"
RUNNER_RC=$?
set -e
case "$RUNNER_MODE:$RUNNER_RC" in
  run:0|run:10|run:1|finalize-comparison:0|finalize-comparison:20) ;;
  *) echo "multi-harness runner returned an invalid outcome" >&2; exit 1 ;;
esac

# The runner emits a bounded JSON receipt, not child output. Render only the public fields;
# the protected receipt path is safe to retain, while its opaque contents and raw stderr stay hidden.
"${BINDING_LINES[5]}" -e '
const fs = require("node:fs");
const [mode, code, path] = process.argv.slice(1);
const value = JSON.parse(fs.readFileSync(path, "utf8"));
const isRun = mode === "run";
const allowed = isRun
  ? ["lane_status", "run_exit", "summary_path", "finalization_receipt_path", "successful_lane_paths", "lanes"]
  : ["finalization_status", "finalization_class", "lane_status", "run_exit", "summary_path", "comparison"];
const publicReceipt = { phase: isRun ? "phase-1" : "phase-2", runner_exit: Number(code) };
for (const key of allowed) if (Object.hasOwn(value, key)) publicReceipt[key] = value[key];
if (!Object.hasOwn(publicReceipt, "summary_path") || !Number.isInteger(publicReceipt.runner_exit)) process.exit(1);
const rendered = JSON.stringify(publicReceipt);
if (Buffer.byteLength(rendered, "utf8") > 16384) process.exit(1);
process.stdout.write(`${rendered}\n`);
' "$RUNNER_MODE" "$RUNNER_RC" "$OUTPUT_FILE" || {
  echo "multi-harness bounded receipt is invalid" >&2
  [ "$RUNNER_MODE" = run ] && exit 1 || exit 20
}
exit "$RUNNER_RC"
```

For phase 1, preserve runner exit `0` as `COMPLETE`, `10` as `INCOMPLETE`, and `1` as a
run-level fatal; parse the bounded receipt, not child streams. Read only successful lane documents
listed in that receipt, then write no more than 12 KiB of commonalities, differences, and
uncertainties. The prose is non-authoritative: it must not declare a winner, majority, vote,
consensus, ranking, recommendation, or final verdict.

For phase 2, pass that prose plus the phase-1 `finalization_receipt_path` in the JSON envelope
described above. The runner reads the mode-`0600` receipt itself; do not read, copy, show, or retain
its nonce in chat, argv, logs, or any file outside the runner's protected run directory. Finalizer
exit `0` means `FINALIZED`. Exit `20` means `FINALIZATION_FAILED`; show only its bounded class,
the unchanged phase-1 lane outcome/run exit, and the factual base summary path. Never turn exit
`20` into a lane failure.

In both phases, display only bounded overall lane/finalization state, per-lane status/error class,
absolute summary and successful-document paths, and the short final comparison. Never dump full
lane documents, task bytes, raw stdout/stderr, credentials, auth state, or finalization receipt.
