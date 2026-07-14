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
- runner는 호환 OMO 4.x `ultrawork`(최소 4.18.0)를 읽기 전용으로 검증·고정한다. custom Codex permission profile로 target `cwd`(시작 시 존재하는 모든 깊이의 `.gjc`와 root `.gjc` 예약 경로 제외), 정확한 Codex runtime helper, private tmp만 노출한다. workspace 안을 가리키는 directory symlink는 canonical target까지 검사하고, sandbox에 노출되지 않는 외부 directory symlink는 건너뛴다. 실제 사용자 `~/.gjc`, `~/.codex`, `CODEX_HOME`은 명시적으로 차단하고 그 안을 target `cwd`로 지정하면 spawn 전에 거부하며, web/MCP/apps/hooks/browser egress와 child shell 환경 상속도 끈다. Codex native profile은 profile 생성 뒤 처음 만들어진 부모 아래의 미래 `.gjc`까지 경로 이름으로 미리 차단하지는 못한다. 따라서 worker에게 어떤 `.gjc`도 만들거나 바꾸지 말라는 금지 규칙을 별도로 적용한다.

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
[ -n "${LAZYCODEX_GJC_TASK:-}" ] || { echo "lazycodex-gjc task is empty" >&2; exit 2; }
: "${TARGET_CWD:=$PWD}"
: "${SANDBOX:=read-only}"
case "$SANDBOX" in
  read-only|workspace-write) ;;
  *) echo "sandbox must be read-only or workspace-write" >&2; exit 2 ;;
esac
umask 077
ACCOUNT_HOME="$(/usr/bin/getent passwd "$(/usr/bin/id -u)" | /usr/bin/cut -d: -f6)"
[ -n "$ACCOUNT_HOME" ] || { echo "canonical account home unavailable" >&2; exit 1; }
RUNTIME_ROOT="$ACCOUNT_HOME/.gjc/agent/runtimes/lazycodex-gjc"
SOURCE_BINDING="$RUNTIME_ROOT/binding"
SOURCE_RUNNER="$RUNTIME_ROOT/runner.mjs"
[ -f "$SOURCE_BINDING" ] && [ ! -L "$SOURCE_BINDING" ] && [ -f "$SOURCE_RUNNER" ] && [ ! -L "$SOURCE_RUNNER" ] || { echo "trusted lazycodex-gjc runtime binding not found; rerun native user install" >&2; exit 1; }
ACCOUNT_UID="$(/usr/bin/id -u)"
[ "$(/usr/bin/stat -c %u "$RUNTIME_ROOT")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$RUNTIME_ROOT")" = 700 ] && [ "$(/usr/bin/stat -c %u "$SOURCE_BINDING")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$SOURCE_BINDING")" = 600 ] && [ "$(/usr/bin/stat -c %u "$SOURCE_RUNNER")" = "$ACCOUNT_UID" ] && [ "$(/usr/bin/stat -c %a "$SOURCE_RUNNER")" = 700 ] || { echo "lazycodex-gjc runtime permissions are unsafe; rerun native user install" >&2; exit 1; }
PRIVATE_BASE="$ACCOUNT_HOME/.cache/oh-my-gjc/lazycodex-gjc"
/usr/bin/mkdir -p "$PRIVATE_BASE" && /usr/bin/chmod 700 "$PRIVATE_BASE" || { echo "cannot create private launch directory" >&2; exit 1; }
LAUNCH_ROOT="$(/usr/bin/mktemp -d "$PRIVATE_BASE/launch-XXXXXX")" || { echo "cannot create private launch directory" >&2; exit 1; }
TASK_FILE="$LAUNCH_ROOT/task"
BINDING="$LAUNCH_ROOT/binding"
RUNNER="$LAUNCH_ROOT/runner.mjs"
cleanup() { /usr/bin/rm -rf -- "$LAUNCH_ROOT"; }
trap cleanup EXIT HUP INT TERM
printf '%s' "$LAZYCODEX_GJC_TASK" > "$TASK_FILE"
unset LAZYCODEX_GJC_TASK
/bin/cp -- "$SOURCE_BINDING" "$BINDING" && /bin/cp -- "$SOURCE_RUNNER" "$RUNNER" || { echo "lazycodex-gjc runtime snapshot failed" >&2; exit 1; }
/usr/bin/chmod 600 "$TASK_FILE" "$BINDING" "$RUNNER"
mapfile -t BINDING_LINES < "$BINDING"
[ "${#BINDING_LINES[@]}" -eq 16 ] && [ "${BINDING_LINES[0]}" = lazycodex-gjc-binding-v1 ] && [ "${BINDING_LINES[1]}" = "$ACCOUNT_HOME" ] && [ "${BINDING_LINES[3]}" = "$SOURCE_RUNNER" ] || { echo "lazycodex-gjc runtime binding is invalid; rerun native user install" >&2; exit 1; }
sha256_file() { /usr/bin/sha256sum -- "$1" | { read -r digest _; printf '%s' "$digest"; }; }
secure_file() {
  local path="$1" expected="$2" current uid mode owner
  [ -f "$path" ] && [ ! -L "$path" ] && [ "$(/usr/bin/readlink -f "$path")" = "$path" ] && [ "$(sha256_file "$path")" = "$expected" ] || return 1
  uid="$(/usr/bin/id -u)"; current="$(/usr/bin/dirname "$path")"
  while [ "$current" != / ]; do
    [ ! -L "$current" ] || return 1
    mode="$(/usr/bin/stat -c %a "$current")"; owner="$(/usr/bin/stat -c %u "$current")"
    [ "$owner" = "$uid" ] || [ "$owner" = 0 ] || return 1
    [ $((8#$mode & 8#22)) -eq 0 ] || return 1
    if [ "$owner" = "$uid" ] && [ $((8#$mode & 8#77)) -eq 0 ]; then return 0; fi
    current="$(/usr/bin/dirname "$current")"
  done
}
secure_file "$RUNNER" "${BINDING_LINES[2]}" && secure_file "${BINDING_LINES[5]}" "${BINDING_LINES[4]}" || { echo "lazycodex-gjc runtime verification failed; rerun native user install" >&2; exit 1; }
RUNNER_ARGS=(--cwd "$TARGET_CWD" --sandbox "$SANDBOX")
[ -z "${CODEX_MODEL:-}" ] || RUNNER_ARGS+=(--model "$CODEX_MODEL")
[ -z "${LAZYCODEX_TIMEOUT_SECONDS:-}" ] || RUNNER_ARGS+=(--timeout-seconds "$LAZYCODEX_TIMEOUT_SECONDS")
"${BINDING_LINES[5]}" "$RUNNER" "${RUNNER_ARGS[@]}" --binding "$BINDING" < "$TASK_FILE"
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
