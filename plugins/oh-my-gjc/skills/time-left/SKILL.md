---
name: time-left
description: "`/omg:time-left` 명령이 명시적으로 요청했을 때만 GJC v0.11 SDK의 현재 세션 텔레메트리로 실행 중인 ralplan 또는 ultragoal의 남은 시간을 추정한다. 다른 입력에서는 자동 활성화하지 않는다. 읽기 전용 SDK 상태와 현재 워크플로 상태만 사용하며 완료 시각을 보장하거나 제어 명령을 보내지 않는다."
---

# Workflow ETA

목적: 현재 top-level GJC 세션의 **실시간 SDK 상태**와 같은 세션의 canonical workflow phase를 결합해
`ralplan` 또는 `ultragoal`의 남은 **기계 작업 시간 범위**를 설명한다. 이는 약속된 완료 시각이 아니라
현재 스냅샷 기반의 보수적 추정이다.

## 절대 경계

- SDK v3에는 고정된 읽기 전용 query만 보낸다: `session.metadata`, `goal.list/get`, `todo.list`,
  `workflow.gates.list`, `runtime.jobs.list`.
- `user_message`, `reply`, control, config, broker, 임의 query를 보내지 않는다.
- ralplan/ultragoal을 시작·재개·승인·중단하거나 gate에 답하지 않는다.
- transcript, private memory, 다른 세션, 브라우저 기록을 ETA 근거로 읽지 않는다.
- 관측값이나 추정치를 파일에 저장해 사용자별 속도 프로필을 만들지 않는다.
- SDK endpoint/token은 출력하지 않는다. token을 포함한 오류도 그대로 중계하지 않는다.
- 완료 **시각**을 단정하지 않는다. `예상 약 N~M분`처럼 휴리스틱 범위와 신뢰도만 말한다.

## 1. Canonical workflow 선택

사용자 지정 여부와 무관하게 아래 두 workflow를 항상 **read**로 확인한다. 사용자가 하나를 명시했다면
그 이름은 유일한 활성 workflow여야 한다는 기대값으로만 사용하며, 다른 workflow의 동시 활성 검사를 생략하지 않는다.

```bash
gjc state ralplan read --json
gjc state ultragoal read --json
```

- `active:true`이고 terminal phase가 아닌 workflow가 정확히 하나일 때만 `$WORKFLOW`으로 선택한다.
- 둘 다 활성, 둘 다 비활성, malformed/corrupt state이면 숫자 ETA를 만들지 말고 상태 선택이 불가능하다고 보고한다.
- `skill.list/state`(Q11)는 사용 가능한 스킬 목록이지 활성 workflow 증거가 아니다. ETA 판별에 사용하지 않는다.
- `write`, `handoff`, `approve`, `ultragoal status`는 ETA 조회에 사용하지 않는다
  (`ultragoal status`는 derived repair를 수행할 수 있다).

## 2. SDK 스냅샷 수집

native installer가 준비한 **user-scope 전용** runtime만 사용한다. Project runtime은 실행 권한이 없다.
1단계 state의 exact `session_id`가 없으면 SDK 후보를 추측하지 말고 산정을 중단한다.

```bash
set -euo pipefail
WORKFLOW="<1단계에서 선택한 ralplan 또는 ultragoal>"
SESSION_ID="<선택한 state의 exact session_id>"
RUNTIME_PARENT="$HOME/.gjc/agent/runtimes/oh-my-gjc"
SDK_RUNTIME="$RUNTIME_PARENT/sdk-lab"
LOCK="$RUNTIME_PARENT/.sdk-lab.lock"

command -v bun >/dev/null 2>&1 && command -v flock >/dev/null 2>&1 || {
  printf '%s\n' 'time-left requires Bun >=1.3.14 and flock' >&2
  exit 78
}
case "$SESSION_ID" in
  ''|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*)
    printf '%s\n' 'time-left requires the exact canonical workflow session_id' >&2
    exit 78 ;;
esac
[ -d "$RUNTIME_PARENT" ] && [ ! -L "$RUNTIME_PARENT" ] &&
[ "$(realpath -e "$RUNTIME_PARENT")" = "$RUNTIME_PARENT" ] &&
[ "$(stat -c %u "$RUNTIME_PARENT")" = "$(id -u)" ] &&
[ -z "$(find "$RUNTIME_PARENT" -maxdepth 0 -perm /077)" ] || {
  printf '%s\n' 'time-left runtime parent is not private and canonical' >&2
  exit 78
}
[ -f "$LOCK" ] && [ ! -L "$LOCK" ] &&
[ "$(stat -c %u "$LOCK")" = "$(id -u)" ] &&
[ "$(stat -c %a "$LOCK")" = 600 ] || {
  printf '%s\n' 'time-left runtime lock is unavailable or untrusted' >&2
  exit 78
}
exec 9<>"$LOCK"
flock -s -w 5 9 || {
  printf '%s\n' 'time-left SDK runtime is being refreshed; retry shortly' >&2
  exit 75
}
[ -d "$SDK_RUNTIME" ] && [ ! -L "$SDK_RUNTIME" ] &&
[ "$(realpath -e "$SDK_RUNTIME")" = "$SDK_RUNTIME" ] &&
[ "$(stat -c %u "$SDK_RUNTIME")" = "$(id -u)" ] &&
[ "$(stat -c %a "$SDK_RUNTIME")" = 700 ] &&
[ -f "$SDK_RUNTIME/src/eta.ts" ] && [ ! -L "$SDK_RUNTIME/src/eta.ts" ] &&
[ "$(stat -c %u "$SDK_RUNTIME/src/eta.ts")" = "$(id -u)" ] &&
[ "$(stat -c %a "$SDK_RUNTIME/src/eta.ts")" = 600 ] || {
  printf '%s\n' 'time-left SDK runtime unavailable or untrusted; rerun the hardened installer' >&2
  exit 78
}
bun run "$SDK_RUNTIME/src/eta.ts" --workflow "$WORKFLOW" --session-id "$SESSION_ID"
```

- `$WORKFLOW`은 SDK가 판별한 값이 아니라 1단계 canonical state에서 선택한 enum 라벨이다.
  SDK는 같은 현재 세션의 실시간 todo/job/gate 텔레메트리를 제공한다.
- 결과는 한 개의 bounded JSON object여야 한다. JSON이 아니거나 필수 필드가 잘못되면 추정하지 않는다.
- SDK `session.id`는 state의 `session_id`(존재할 때) 및 현재 `GJC_SESSION_ID`(존재할 때)와 같아야 한다.
  다르면 안전상 중단한다.
- SDK hosting이 꺼졌거나 endpoint가 없으면 `SDK 관측 불가`라고 말한다. discovery 파일을 직접 glob/read하거나
  WebSocket을 임의 구현해 우회하지 않는다.

### Ralplan phase 해석

- `planner` → `architect` → `critic` 순서가 기본이지만 critic은 `revision`을 요구할 수 있다.
- `revision`은 반복 횟수가 미정이므로 보수 범위를 넓힌다.
- `post-interview`와 pending approval/gate는 사람의 답을 기다리므로 wall-clock ETA를 숫자로 내지 않는다.
- `adr`, `final`, `handoff`는 거의 끝/종료 상태지만 아직 필요한 gate가 있으면 완료로 단정하지 않는다.

### Ultragoal phase 해석

- canonical `counts`, goal statuses, SDK todo/job 상태를 함께 본다.
- `blocked`, `failed`, paused goal, pending gate가 하나라도 있으면 wall-clock ETA를 숫자로 내지 않는다.
- 남은 goal 수만으로 시간을 정하지 않는다. SDK todo/job 단위나 같은 실행의 관측 가능한 진행 근거가 없으면
  `근거 부족`으로 표시한다.
- 병렬 job은 개수를 단순 합산하지 않는다. 가장 느린 활성 lane과 남은 직렬 todo가 완료 시간을 지배한다.

## 3. 추정 규칙

SDK JSON의 `estimate`가 숫자를 제공할 때만 이를 기본값으로 쓴다.

1. `likelyMinutes`는 **이 goal에서 이미 완료한 todo당 관측 경과시간**을 남은 todo에 외삽한 휴리스틱 중심값이다.
2. `conservativeMinutes`는 같은 중심값에 재시도·큐·리뷰 편차를 더한 상한 성격의 값이며 항상
   `likelyMinutes` 이상이어야 한다. 둘 다 확률 분위수는 아니다.
3. 완료 todo와 양의 경과시간이 모두 없으면 속도를 만들지 않고 `근거 부족`으로 둔다.
4. canonical phase가 revision/blocked/human gate 같은 추가 위험을 보여주면 숫자를 더 정밀하게 만들지 말고
   신뢰도를 낮추거나 ETA를 `대기/산정 불가`로 바꾼다.
5. SDK와 state가 충돌하면 숫자를 폐기하고 `상태 불일치`를 보고한다.
6. 최소 신뢰도는 `low`, 최대는 `medium`이다. 로컬 과거 실행을 저장·학습하지 않으므로 `high`를 사용하지 않는다.

다음 조건에서는 숫자 대신 원인을 낸다.

- pending human workflow gate → `사용자 응답 후 재산정`
- paused goal → `일시정지 — 재개 시점 미정`
- failed job / blocked·failed workflow / quarantined gate → `차단 해소 후 재산정`
- active workflow 또는 남은 작업 단위 미검출 → `근거 부족`
- SDK/state session identity 불일치 → `안전상 산정 중단`

## 4. 출력 형식

```text
워크플로: ralplan | ultragoal
현재 상태: <phase + streaming/jobs/todo 요약>
남은 시간: 예상 약 N~M분 | 사용자 응답 후 재산정 | 산정 불가
신뢰도: low | medium
근거: <SDK 관측 2~4개 + canonical phase>
변동 요인: <revision, 외부 리뷰, 실패 재시도, human gate 등 최대 3개>
관측 시점: <SDK observedAt>
```

- 사용자가 짧게 물으면 6줄 이내로 답한다.
- `adaptive-response`가 활성화돼 있으면 용어 밀도만 사용자 수준에 맞추되, 비확률적 휴리스틱이라는 의미와 불확실성은 생략하지 않는다.
