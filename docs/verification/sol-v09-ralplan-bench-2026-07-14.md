# sol v0.9 ralplan 좌석 벤치마크 — 2026-07-14

presets v0.9(커밋 `3010592`)의 sol 기획 좌석 하향(planner sol:xhigh→high,
architect opus:high→medium, critic opus:xhigh→high)이 ralplan 벽시계 시간에
주는 효과의 통제 실측. gjc 0.10.2, 동일 머신, 순차 실행(레이트리밋 간섭 배제).

## 방법

- 비교 대상: 신형 `sol`(v0.9) vs 임시 프로파일 `sol-old-bench`(= 신형과
  default/executor 동일, 기획 좌석만 v0.8 시절 xhigh — 변인은 기획 좌석뿐).
- 실행: `GJC_NOTIFICATIONS=0 gjc --mpreset <p> --tools read,bash,edit,write,find,search,task,todo_write,skill,goal,resolve ralplan "<태스크>"` (도구 화이트리스트로 `ask` 원천 차단 — 아래 부수 발견 참조).
- 측정: 세션 JSONL 첫 이벤트 ts → 마지막 이벤트 ts (합의 완료 + `pending-approval.md` 산출 확인 후 90초+ 유휴 시점 확정). 두 런 모두 유효한 승인 대기 플랜을 산출함.

## 결과

| 태스크 | 신형 sol (v0.9) | 구형 xhigh 좌석 (v0.8) | 배율 |
|---|---|---|---|
| 장난감: wc CLI에 --json + 테스트 (3파일 신규 레포) | 4:49 (289.2s) | 4:55 (294.6s) | 1.02× |
| 실전: oh-my-gjc 사본에 신규 capability 추가 계획 (매니페스트·표면 동기화·거버넌스 포함) | **8:24 (503.9s)** | **17:18 (1038.0s)** | **2.06×** |

## 해석

- 쉬운 문제에서는 적응형 리즈닝이 예산을 안 태워 effort 상한 차이가 안 보인다(1.02×).
- 실제 레포 컨텍스트 + 비자명 기획에서는 xhigh 기획 좌석이 합의 루프 전체를
  2배 이상 늘린다 — v0.9 하향의 근거였던 실사용 체감과 정합.
- n=1/조건이므로 정밀 배율이 아니라 방향·크기 오더의 증거로 취급할 것.
  라운드 수가 늘거나 `--deliberate`면 격차는 더 벌어질 것으로 추정.

## 부수 발견 (upstream 후보, 추정)

헤드리스 `gjc ralplan "<task>"`에서 본체가 `ask` 도구를 호출하면 입력 없이
**영구 블록**(2회 재현, gjc 0.10.2). dev 소스에는 헤드리스 가드
(`Ask tool requires interactive mode`, tools/ask.ts)가 있으나 0.10.2 동작과
불일치 — 가드 미포함 릴리스이거나 workflow-gate 경로 잔존 문제로 추정.
gjc-bugwatch 트리아지 후보.

## 뒷정리

임시 `sol-old-bench` 프로파일은 실험 종료 후 `~/.gjc/agent/models.yml`에서
제거·YAML 재검증 완료(활성 5종 무손상). 벤치 산출물은 `/tmp/ralplan-bench/`.
