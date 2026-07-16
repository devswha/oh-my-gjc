---
description: 현재 ralplan 또는 ultragoal의 남은 기계 작업 시간 범위를 읽기 전용 GJC SDK 상태로 명시 조회한다.
argument-hint: "[ralplan|ultragoal]"
---

# /omg:time-left

이 명령이 명시적으로 호출된 경우에만 설치된 `time-left` 스킬을 불러와 그 절차를 정확히 따른다.
`$ARGUMENTS`가 `ralplan` 또는 `ultragoal`이면 기대 workflow 이름으로 전달하되, 스킬의 동시 활성 검사와
canonical state 선택을 생략하지 않는다. 인자가 없으면 스킬이 현재 활성 workflow를 판별하게 한다.

일반 자연어로 남은 시간이나 ETA를 물은 것만으로 `time-left`를 실행하지 않는다. 그 경우 SDK를 조회하지 말고
`/omg:time-left`가 명시 조회 명령이라고 짧게 안내한다.
