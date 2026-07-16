---
name: lazycodex-gjc
description: GJC에서 이미 설치된 Codex+LazyCodex를 격리된 외부 작업자로 실행한다. "lazycodex로 해줘", "GJC에서 LazyCodex 써줘", "Codex worker를 스폰/위임해줘", "delegate or spawn LazyCodex/Codex from GJC" 같은 요청에 활성화하며, GJC task/session/config를 만들거나 바꾸지 않고 동기 bash 한 번으로 결과만 회수한다.
---

# lazycodex-gjc

이미 설치되어 로그인된 **Codex CLI + LazyCodex**를 GJC 바깥의 일회성 작업자로 실행한다.
GJC 안에 LazyCodex를 설치하거나 주입하지 않으며, GJC 하위 세션·task·goal·team을 만들지 않는다.

## 실행 전 경계

- sandbox는 `read-only`만 허용한다.
- `workspace-write`는 동시 편집 안전성이 보장될 때까지 fail-closed로 비활성화한다. 수정 작업은 이 스킬에 위임하지 않는다.
- `danger-full-access`와 승인 우회는 항상 금지한다.
- 이미 설치된 `node`, `codex`, LazyCodex만 사용한다. `npx`, 설치, 업데이트, doctor, migration, setup, login을 대신 실행하지 않는다.
- 자격증명·토큰을 task에 넣거나 GJC 환경에서 Codex로 복사하지 않는다. runner가 허용목록 환경만 전달한다.
- 이 민감 커맨드는 user-scope native install이 만든 mode `0600` SHA-256 runtime binding(`~/.gjc/agent/runtimes/lazycodex-gjc/binding`)과 일치하는 private runner snapshot만 실행한다. project-scope suite 설치만으로는 실행하지 않는다.
- runner는 호환 OMO 4.x `ultrawork`(최소 4.18.0)를 읽기 전용으로 검증·고정한다. custom Codex permission profile로 target `cwd`(시작 시 존재하는 모든 깊이의 `.gjc`와 root `.gjc` 예약 경로 제외), 정확한 Codex runtime helper, private tmp만 노출한다. workspace 안을 가리키는 directory symlink는 canonical target까지 검사하고, sandbox에 노출되지 않는 외부 directory symlink는 건너뛴다. 실제 사용자 `~/.gjc`, `~/.codex`, `CODEX_HOME`은 명시적으로 차단하고 그 안을 target `cwd`로 지정하면 spawn 전에 거부하며, web/MCP/apps/hooks/browser egress와 child shell 환경 상속도 끈다. Codex native profile은 profile 생성 뒤 처음 만들어진 부모 아래의 미래 `.gjc`까지 경로 이름으로 미리 차단하지는 못한다. 따라서 worker에게 어떤 `.gjc`도 만들거나 바꾸지 말라는 금지 규칙을 별도로 적용한다.

## 단일 동기 호출

GJC의 **`bash` 도구를 정확히 한 번, 동기식으로만** 호출한다. `task`, `goal`, `team`, `move`,
`write`, `edit`, 비동기 job/monitor는 사용하지 않는다. bash 도구의 `env` 파라미터로 다음을 전달한다.

- `LAZYCODEX_GJC_TASK`: 사용자의 원문 작업. 셸 명령 문자열에 삽입하지 않는다.
- `TARGET_CWD`: 대상 저장소의 절대 경로. 기본은 현재 `$PWD`.
- `SANDBOX`: 항상 `read-only`.
- 선택: `CODEX_MODEL`, `LAZYCODEX_TIMEOUT_SECONDS`, `LAZYCODEX_OBSERVE_LOG`(관찰 로그로 쓸 **새 파일**의 절대 경로).

아래 스크립트를 그대로 실행한다. task는 mode `0600` 임시 파일을 거쳐 runner stdin으로만 들어가며,
명령·stdout·stderr에 task나 자격증명을 echo하지 않는다.

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

## 결과

- exit 0이면 runner stdout을 외부 LazyCodex 작업자의 최종 결과로 그대로 전달한다.
- worker가 goal을 완수하고 exit 0인데 최종 출력이 1 MiB relay 한도를 넘으면, 완료된 작업을 실패로 폐기하지 않고 runner가 **고정 bounded summary**를 exit 0으로 대신 전달한다(이슈 #202 원자성 계약 — read-only 전용이라 workspace 부작용은 어느 경로에서도 존재하지 않는다). hard limit(8 MiB) 초과와 폭주 스트림은 조기 중단 후 실패 처리한다.
- 실패하면 부분 결과를 성공처럼 사용하지 않는다. exit code와 runner의 한 줄 오류를 요약하고, 사용자가 직접 해결할 설치/PATH/로그인/timeout 조치만 안내한다.
- child stderr는 원문 task나 파일 비밀을 포함할 수 있으므로 그대로 전달하지 않는다.
- runner의 `--ephemeral`은 **외부 Codex 세션**을 저장하지 않는다는 뜻이다. 이 bash 호출과 결과는 현재 GJC 대화에 남지만, child GJC 세션은 생성되지 않는다.
- `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`은 runner 내부의 외부 child와 그 shell에만 적용된다. 현재 GJC 알림·SDK 설정은 변경하지 않는다.

## 관찰 — 리더 실시간 모니터링 (선택)

- `LAZYCODEX_OBSERVE_LOG`에 새 파일의 절대 경로(예: `/tmp/lazycodex-observe-<타임스탬프>.log`)를 주면 runner **부모 프로세스**가 codex exec 이벤트 스트림을 **레닥션 후** 그 로그에 tee한다. child sandbox와 relay 계약은 그대로다 — raw child stdout/stderr는 여전히 launcher stdio로 중계되지 않는다.
- 레닥션은 토큰·자격증명 할당·긴 opaque blob을 과잉 마스킹한다(fail-closed). 로그 생성 실패는 spawn 전에 중단하고, 실행 중 로그 쓰기 실패나 로그 상한(8 MiB) 도달은 관찰만 멈추며 worker에는 영향이 없다.
- 리더는 동기 bash 호출을 시작하기 **전에** GJC monitor 도구로 로그 경로를 tail해 둔다. 관찰은 read-only다 — 로그로 판단만 하고 worker 프로세스·파일에 개입하지 않는다.
- 로그 첫 `[observe]` 줄이 systemd 유닛명과 중단 명령을 알려준다. 이상 징후 시 리더는 `systemctl --user stop <unit>`으로 유닛을 중단한다. 격리 계약의 RuntimeMaxSec 상한은 백스톱으로 그대로 남는다.
- 로그는 mode 0600 새 파일로 생성되며, 보호 상태 경로(`.gjc`, `~/.codex`, `CODEX_HOME`) 안을 지정하면 거부한다.

## 오케스트레이션 표준

- **조각 발주가 표준이다.** 통짜 태스크 대신 독립 검증 가능한 작은 조각으로 나눠 발주한다 — 실측 기준 조각당 약 6분. 조각 단위여야 실패 시 재발주 비용이 작고 oversized 출력·timeout 리스크가 줄어든다.
- **시각 검수는 위임하지 않는다.** 렌더링·애니메이션·레이아웃 검수는 리더가 자신의 browser로 직접 실측한다. 정지 스크린샷 검수는 불충분하다 — 첫 paint 전 visible 부여로 전이가 생략되는 애니메이션 레이스가 실측됐고, running 애니메이션 카운트는 가시성 증거가 아니다.
- **interactive 변종은 보류한다.** 이 스킬은 단발 동기 실행만 지원하며, 대화형/세션형 worker 변종은 도입하지 않는다.

## 절대 금지

- GJC `task`/goal/team/session/config 호출 또는 GJC 파일·플러그인 변경
- LazyCodex/Codex 설치·업데이트·doctor·migration·setup·login 대행
- `danger-full-access`, 승인 우회, task 셸 보간, task/자격증명 echo
- background/async 실행, 외부 worker 결과가 끝나기 전 성공 보고
