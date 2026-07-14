# sol v0.9 ralplan 좌석 벤치마크 — 2026-07-14

presets v0.9(커밋 `3010592`)의 sol 기획 좌석 하향(planner sol:xhigh→high,
architect opus:high→medium, critic opus:xhigh→high)이 ralplan 벽시계 시간에
주는 효과의 통제 실측. gjc 0.10.2, 동일 머신, 순차 실행(레이트리밋 간섭 배제).

## 방법

- 비교 대상: 신형 `sol`(v0.9) vs 임시 프로파일 `sol-old-bench`(= 신형과
  default/executor 동일, 기획 좌석만 v0.8 시절 xhigh — 변인은 기획 좌석뿐).
- 실행: `GJC_NOTIFICATIONS=0 gjc --mpreset <p> --tools read,bash,edit,write,find,search,task,todo_write,skill,goal,resolve ralplan "<태스크>"` (도구 화이트리스트로 `ask` 원천 차단 — 아래 부수 발견 참조).
- 측정: 세션 JSONL 첫 이벤트 ts → 마지막 이벤트 ts. 종점 감지는 `pending-approval.md` 존재 + 90초+ 유휴. 장난감 2런과 실전 신형 런은 합의 완료 후 종점, 실전 구형 런은 합의 미완 상태의 관측 중단(아래 결과 표·주의 참조).

## 결과

| 태스크 | 신형 sol (v0.9) | 구형 xhigh 좌석 (v0.8) | 판정 |
|---|---|---|---|
| 장난감: wc CLI에 --json + 테스트 (3파일 신규 레포) | 4:49 (289.2s) 합의 완료 | 4:55 (294.6s) 합의 완료 | 동등 (1.02×) |
| 실전: oh-my-gjc 사본에 신규 capability 추가 계획 (매니페스트·표면 동기화·거버넌스 포함) | **8:24 (503.9s)에 합의 완료 + 플랜 산출** (stage 2에서 완료 — 수정 1회) | **17:18 (1038.0s) 관측 중단 시점에도 합의 미완** (stage 4 진행 중 — 수정 3회 후에도 Revision 4 Critic OKAY 대기) | **신형이 2배 이상 빠름** |

⚠ 종점 정의 주의(교차리뷰 r1 지적 반영): 두 런의 종점은 동등 이벤트가 아니다.
신형 종점 = 합의 완료·최종 플랜 산출(이후 승인 대기 유휴), 구형 종점 = 90초+
유휴 감지로 관측 중단한 시각이며 그 시점까지 **합의가 끝나지 않았다**
(pending-approval.md는 16:09에 생성됐으나 이후 stage-02~04 리비전이 계속됨).
따라서 "2.06×"라는 정밀 배율은 성립하지 않고, 성립하는 주장은
"신형은 8:24에 완주했고, 구형은 그 2배 시간에도 미완" — 즉 **≥2×**다.

## 해석

- 쉬운 문제에서는 적응형 리즈닝이 예산을 안 태워 effort 상한 차이가 안 보인다(1.02×).
- 실전 조건에서 구형 xhigh 좌석은 라운드당 더 느릴 뿐 아니라 **리비전 횟수
  자체가 더 늘었다**(신형 수정 1회로 stage 2 완주 vs 구형 수정 3회에도 stage 4 미완).
  엄격한 xhigh critic이 재수정을 더 유발했을 가능성이 있으나 n=1이라
  좌석 기질 때문인지 우연인지 단정 불가.
- n=1/조건이므로 정밀 배율이 아니라 방향·크기 오더의 증거로 취급할 것.
  `--deliberate`면 격차는 더 벌어질 것으로 추정.

## 부수 발견 (upstream 후보, 추정)

헤드리스 `gjc ralplan "<task>"`에서 본체가 `ask` 도구를 호출하면 입력 없이
**영구 블록**(2회 재현, gjc 0.10.2). dev 소스에는 헤드리스 가드
(`Ask tool requires interactive mode`, tools/ask.ts)가 있으나 0.10.2 동작과
불일치 — 가드 미포함 릴리스이거나 workflow-gate 경로 잔존 문제로 추정.
gjc-bugwatch 트리아지 후보.

## 뒷정리

임시 `sol-old-bench` 프로파일은 실험 종료 후 `~/.gjc/agent/models.yml`에서
제거·YAML 재검증 완료(활성 5종 무손상). 벤치 산출물은 `/tmp/ralplan-bench/`.
