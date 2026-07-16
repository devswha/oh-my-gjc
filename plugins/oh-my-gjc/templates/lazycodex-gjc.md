---
description: GJC 안을 건드리지 않고 이미 설치된 Codex+LazyCodex를 격리된 읽기 전용 외부 작업자로 동기 실행해 결과만 회수한다. workspace-write는 안전상 비활성화.
argument-hint: "<읽기 전용 조사·리뷰 작업> [대상 cwd]"
---

# /omg:lazycodex-gjc

`$ARGUMENTS` 또는 바로 앞 사용자 요청을 **원문 task**로 삼아, 이미 설치된 Codex+LazyCodex를
외부 일회성 작업자로 실행한다. task가 없으면 한 번만 물어보고 실행하지 않는다.

## 권한 결정

- `read-only`만 허용한다.
- `workspace-write`는 동시 편집 안전성이 보장될 때까지 fail-closed로 비활성화한다. 수정 작업은 이 커맨드에 위임하지 않는다.
- `danger-full-access`와 승인 우회는 항상 금지한다.
- user-scope native install이 만든 mode-0600 SHA-256 runtime binding(`~/.gjc/agent/runtimes/lazycodex-gjc/binding`)과 일치하는 private runner snapshot만 실행한다. project-scope 설치만 있으면 안전하게 중단한다.
- runner는 호환 OMO `ultrawork`를 먼저 검증하고 target `cwd`(시작 시 존재하는 모든 깊이의 `.gjc`와 root `.gjc` 예약 경로 제외)+정확한 Codex runtime helper+private tmp만 허용하는 custom permission profile을 쓴다. workspace 안을 가리키는 directory symlink는 canonical target까지 검사하고, sandbox에 노출되지 않는 외부 directory symlink는 건너뛴다. 실제 사용자 `~/.gjc`, `~/.codex`, `CODEX_HOME`은 명시적으로 차단하고 그 안을 target `cwd`로 지정하면 spawn 전에 거부하며, web/MCP/apps/hooks/browser egress와 child shell 환경 상속도 비활성화한다. Codex native profile은 profile 생성 뒤 처음 만들어진 부모 아래의 미래 `.gjc`까지 경로 이름으로 미리 차단하지는 못한다. 따라서 worker에게 어떤 `.gjc`도 만들거나 바꾸지 말라는 금지 규칙을 별도로 적용한다.

GJC `bash` 도구의 `env` 파라미터에 task를 `LAZYCODEX_GJC_TASK`로, 대상 절대 경로를
`TARGET_CWD`로 전달한다. task를 아래 셸 문자열에 붙여 넣지 않는다. 선택적으로
`CODEX_MODEL`, `LAZYCODEX_TIMEOUT_SECONDS`, `LAZYCODEX_OBSERVE_LOG`(관찰 로그로 쓸
**새 파일**의 절대 경로)만 env에 추가한다.

```bash
[ -n "${LAZYCODEX_GJC_TASK:-}" ] || { echo "lazycodex-gjc task is empty" >&2; exit 2; }
: "${TARGET_CWD:=$PWD}"
: "${SANDBOX:=read-only}"
case "$SANDBOX" in
  read-only) ;;
  *) echo "sandbox must be read-only; workspace-write is disabled" >&2; exit 2 ;;
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
  uid="$(/usr/bin/id -u)"
  mode="$(/usr/bin/stat -c %a "$path")"; owner="$(/usr/bin/stat -c %u "$path")"
  { [ "$owner" = "$uid" ] || [ "$owner" = 0 ]; } && [ $((8#$mode & 8#22)) -eq 0 ] || return 1
  current="$(/usr/bin/dirname "$path")"
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
[ -z "${LAZYCODEX_OBSERVE_LOG:-}" ] || RUNNER_ARGS+=(--observe-log "$LAZYCODEX_OBSERVE_LOG")
"${BINDING_LINES[5]}" "$RUNNER" "${RUNNER_ARGS[@]}" --binding "$BINDING" < "$TASK_FILE"
```

이 호출은 **GJC bash 한 번을 동기 실행**한다. GJC `task`, goal, team, move, write/edit,
background job을 사용하지 않으며 install/update/doctor/setup/login도 실행하지 않는다.
성공하면 stdout을 그대로 반환하고, 실패하면 부분 결과 없이 오류와 수동 해결책만 짧게 알린다.
worker가 완수했는데 최종 출력만 1 MiB relay 한도를 넘긴 경우 runner가 고정 bounded summary를
exit 0으로 대신 반환한다 — 완료 작업을 실패로 폐기하지 않는다(#202 원자성 계약).
child stderr는 task나 파일 비밀을 포함할 수 있으므로 그대로 전달하지 않는다.

runner의 `--ephemeral`은 외부 Codex 세션에만 적용된다. 현재 GJC 대화에는 이 명령과 결과가
남지만 child GJC 세션은 생기지 않는다. child와 그 shell의 `GJC_NOTIFICATIONS=0
GJC_SDK_DISABLE=1`도 현재 GJC 설정을 바꾸지 않는다.

## 관찰과 오케스트레이션

- `LAZYCODEX_OBSERVE_LOG`를 주면 runner 부모 프로세스가 레닥션된 codex exec 이벤트 스트림을
  그 새 로그 파일(mode 0600)에 tee한다. 리더는 동기 bash 호출 **전에** GJC monitor 도구로
  로그를 tail하고, 이상 시 로그 첫 `[observe]` 줄의 유닛명으로 `systemctl --user stop <unit>`을
  실행한다. 관찰은 read-only이며 로그 실패는 worker에 영향이 없다.
- 통짜 대신 **조각 발주**가 표준이다(실측 조각당 약 6분). 시각 검수는 리더 browser 몫이며
  정지 스크린샷 검수는 불충분하다(애니메이션 레이스 실측 — running 카운트는 가시성 증거가 아님).
  interactive 변종은 보류한다.
