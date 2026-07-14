---
description: GJC 안을 건드리지 않고 이미 설치된 Codex+LazyCodex를 격리된 외부 작업자로 동기 실행해 결과만 회수한다. 기본 read-only; 명시 승인된 저장소 수정만 workspace-write.
argument-hint: "<작업> [대상 cwd와 수정 허용을 명시]"
---

# /omg:lazycodex-gjc

`$ARGUMENTS` 또는 바로 앞 사용자 요청을 **원문 task**로 삼아, 이미 설치된 Codex+LazyCodex를
외부 일회성 작업자로 실행한다. task가 없으면 한 번만 물어보고 실행하지 않는다.

## 권한 결정

- 기본은 `read-only`.
- 현재 턴에서 사용자가 수정할 작업과 대상 저장소를 명시적으로 허가했을 때만 그 절대 `cwd`에 `workspace-write`를 쓴다.
- `danger-full-access`와 승인 우회는 항상 금지한다.
- user-scope native install이 만든 SHA-256 receipt와 canonical user cache runner가 일치해야 한다. project-scope 설치만 있으면 안전하게 중단한다.
- runner는 호환 OMO `ultrawork`를 먼저 검증하고 target `cwd`(모든 깊이의 `.gjc` 제외)+정확한 Codex runtime helper+private tmp만 허용하는 custom permission profile을 쓴다. 실제 사용자 `~/.gjc`, `~/.codex`, `CODEX_HOME`은 명시적으로 차단하고 그 안을 target `cwd`로 지정하면 spawn 전에 거부하며, web/MCP/apps/hooks/browser egress와 child shell 환경 상속도 비활성화한다.

GJC `bash` 도구의 `env` 파라미터에 task를 `LAZYCODEX_GJC_TASK`로, 대상 절대 경로를
`TARGET_CWD`로 전달한다. task를 아래 셸 문자열에 붙여 넣지 않는다. 필요할 때만
`SANDBOX=workspace-write`, `CODEX_MODEL`, `LAZYCODEX_TIMEOUT_SECONDS`를 env로 추가한다.

```bash
command -v node >/dev/null 2>&1 || { echo "node is required by the installed LazyCodex runtime" >&2; exit 127; }
[ -n "${LAZYCODEX_GJC_TASK:-}" ] || { echo "lazycodex-gjc task is empty" >&2; exit 2; }
: "${TARGET_CWD:=$PWD}"
: "${SANDBOX:=read-only}"
case "$SANDBOX" in
  read-only|workspace-write) ;;
  *) echo "sandbox must be read-only or workspace-write" >&2; exit 2 ;;
esac
umask 077
TASK_FILE="$(mktemp "${TMPDIR:-/tmp}/lazycodex-gjc-task.XXXXXX")" || { echo "cannot create private task file" >&2; exit 1; }
cleanup() { rm -f -- "$TASK_FILE"; }
trap cleanup EXIT HUP INT TERM
printf '%s' "$LAZYCODEX_GJC_TASK" > "$TASK_FILE"
unset LAZYCODEX_GJC_TASK
CACHE_ROOT="$HOME/.gjc/plugins/cache/plugins"
RUNNER="$(ls -d "$CACHE_ROOT"/oh-my-gjc___oh-my-gjc___*/bin/lazycodex-gjc.mjs 2>/dev/null | sort -V | tail -1)"
RECEIPT="$HOME/.gjc/agent/receipts/lazycodex-gjc-runner.sha256"
[ -n "$RUNNER" ] && [ -f "$RECEIPT" ] || { echo "trusted lazycodex-gjc user-scope runner receipt not found; rerun native user install" >&2; exit 1; }
VERIFIED_RUNNER="$(node - "$RUNNER" "$RECEIPT" "$CACHE_ROOT" 2>/dev/null <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, realpathSync, statSync } = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");
const [candidate, receiptPath, cacheInput] = process.argv.slice(2);
const cache = realpathSync(cacheInput);
const canonical = realpathSync(candidate);
const relativePath = relative(cache, canonical);
const parts = relativePath.split(sep);
if (canonical !== resolve(candidate) || parts.length !== 3 ||
    !/^oh-my-gjc___oh-my-gjc___[^/\\]+$/.test(parts[0]) ||
    parts[1] !== "bin" || parts[2] !== "lazycodex-gjc.mjs") process.exit(1);
const uid = process.getuid?.();
for (const path of [cache, join(cache, parts[0]), join(cache, parts[0], "bin"), canonical, receiptPath]) {
  const stats = statSync(path);
  if (uid !== undefined && stats.uid !== uid) process.exit(1);
}
const receiptStats = statSync(receiptPath);
if (!receiptStats.isFile() || (receiptStats.mode & 0o077) !== 0) process.exit(1);
const match = /^([a-f0-9]{64})  (\/[^\n]+)\n?$/.exec(readFileSync(receiptPath, "utf8"));
const digest = createHash("sha256").update(readFileSync(canonical)).digest("hex");
if (match === null || match[1] !== digest || match[2] !== canonical) process.exit(1);
process.stdout.write(canonical);
NODE
)" || { echo "lazycodex-gjc runner trust verification failed; rerun native user install" >&2; exit 1; }
RUNNER_ARGS=(--cwd "$TARGET_CWD" --sandbox "$SANDBOX")
[ -z "${CODEX_MODEL:-}" ] || RUNNER_ARGS+=(--model "$CODEX_MODEL")
[ -z "${LAZYCODEX_TIMEOUT_SECONDS:-}" ] || RUNNER_ARGS+=(--timeout-seconds "$LAZYCODEX_TIMEOUT_SECONDS")
node "$VERIFIED_RUNNER" "${RUNNER_ARGS[@]}" < "$TASK_FILE"
```

이 호출은 **GJC bash 한 번을 동기 실행**한다. GJC `task`, goal, team, move, write/edit,
background job을 사용하지 않으며 install/update/doctor/setup/login도 실행하지 않는다.
성공하면 stdout을 그대로 반환하고, 실패하면 부분 결과 없이 오류와 수동 해결책만 짧게 알린다.
child stderr는 task나 파일 비밀을 포함할 수 있으므로 그대로 전달하지 않는다.

runner의 `--ephemeral`은 외부 Codex 세션에만 적용된다. 현재 GJC 대화에는 이 명령과 결과가
남지만 child GJC 세션은 생기지 않는다. child의 `GJC_NOTIFICATIONS=0`도 현재 GJC 설정을 바꾸지 않는다.
