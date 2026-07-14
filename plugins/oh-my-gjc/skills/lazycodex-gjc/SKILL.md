---
name: lazycodex-gjc
description: GJC에서 이미 설치된 Codex+LazyCodex를 격리된 외부 작업자로 실행한다. "lazycodex로 해줘", "GJC에서 LazyCodex 써줘", "Codex worker를 스폰/위임해줘", "delegate or spawn LazyCodex/Codex from GJC" 같은 요청에 활성화하며, GJC task/session/config를 만들거나 바꾸지 않고 동기 bash 한 번으로 결과만 회수한다.
---

# lazycodex-gjc

이미 설치되어 로그인된 **Codex CLI + LazyCodex**를 GJC 바깥의 일회성 작업자로 실행한다.
GJC 안에 LazyCodex를 설치하거나 주입하지 않으며, GJC 하위 세션·task·goal·team을 만들지 않는다.

## 실행 전 경계

- 기본 sandbox는 `read-only`다.
- `workspace-write`는 **현재 턴에서 사용자가 수정할 작업과 대상 저장소를 명시적으로 허가한 경우만** 선택한다. 허가된 절대 `cwd` 밖의 수정을 요청하지 않는다.
- `danger-full-access`와 승인 우회는 항상 금지한다.
- 이미 설치된 `node`, `codex`, LazyCodex만 사용한다. `npx`, 설치, 업데이트, doctor, migration, setup, login을 대신 실행하지 않는다.
- 자격증명·토큰을 task에 넣거나 GJC 환경에서 Codex로 복사하지 않는다. runner가 허용목록 환경만 전달한다.
- 이 민감 커맨드는 user-scope native install이 만든 mode `0600` SHA-256 receipt와 일치하는 canonical user cache runner만 실행한다. project-scope suite 설치만으로는 실행하지 않는다.
- runner는 호환 OMO 4.x `ultrawork`(최소 4.18.0)를 읽기 전용으로 검증·고정한다. custom Codex permission profile로 target `cwd`(모든 깊이의 `.gjc` 제외), 정확한 Codex runtime helper, private tmp만 노출한다. 실제 사용자 `~/.gjc`, `~/.codex`, `CODEX_HOME`은 명시적으로 차단하고 그 안을 target `cwd`로 지정하면 spawn 전에 거부하며, web/MCP/apps/hooks/browser egress와 child shell 환경 상속도 끈다.

## 단일 동기 호출

GJC의 **`bash` 도구를 정확히 한 번, 동기식으로만** 호출한다. `task`, `goal`, `team`, `move`,
`write`, `edit`, 비동기 job/monitor는 사용하지 않는다. bash 도구의 `env` 파라미터로 다음을 전달한다.

- `LAZYCODEX_GJC_TASK`: 사용자의 원문 작업. 셸 명령 문자열에 삽입하지 않는다.
- `TARGET_CWD`: 대상 저장소의 절대 경로. 기본은 현재 `$PWD`.
- `SANDBOX`: `read-only` 또는 승인된 `workspace-write`.
- 선택: `CODEX_MODEL`, `LAZYCODEX_TIMEOUT_SECONDS`.

아래 스크립트를 그대로 실행한다. task는 mode `0600` 임시 파일을 거쳐 runner stdin으로만 들어가며,
명령·stdout·stderr에 task나 자격증명을 echo하지 않는다.

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

## 결과

- exit 0이면 runner stdout을 외부 LazyCodex 작업자의 최종 결과로 그대로 전달한다.
- 실패하면 부분 결과를 성공처럼 사용하지 않는다. exit code와 runner의 한 줄 오류를 요약하고, 사용자가 직접 해결할 설치/PATH/로그인/timeout 조치만 안내한다.
- child stderr는 원문 task나 파일 비밀을 포함할 수 있으므로 그대로 전달하지 않는다.
- runner의 `--ephemeral`은 **외부 Codex 세션**을 저장하지 않는다는 뜻이다. 이 bash 호출과 결과는 현재 GJC 대화에 남지만, child GJC 세션은 생성되지 않는다.
- `GJC_NOTIFICATIONS=0`은 runner 내부의 외부 child에만 적용된다. 현재 GJC 알림 설정은 변경하지 않는다.

## 절대 금지

- GJC `task`/goal/team/session/config 호출 또는 GJC 파일·플러그인 변경
- LazyCodex/Codex 설치·업데이트·doctor·migration·setup·login 대행
- `danger-full-access`, 승인 우회, task 셸 보간, task/자격증명 echo
- background/async 실행, 외부 worker 결과가 끝나기 전 성공 보고
