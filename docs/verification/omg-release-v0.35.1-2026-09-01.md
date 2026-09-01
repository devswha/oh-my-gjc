# v0.35.1 릴리스 검증 — 2026-09-01

작업 유형: 자율 릴리스(2026-07-19 규칙 — 승인 게이트 없음, 증거 기반 검증만).
범위 `v0.35.0..HEAD` 8커밋 — v0.35.0 태그 직후 커밋(`c04e2f3` 스킬 샌드박스 하네스,
별도 검증문서 `skill-sandbox-2026-09-01.md`로 이미 검증) + 워크플로 도입 6커밋
(배경·전목록: `workflow-adoption-2026-09-01.md`).

## 변경 요약

1. **install-skill.sh: gate-always 마커 정리 node→awk 포팅** (`c857f3c`) — 이번
   릴리스의 유일한 사용자 가치 변경. node 부재 기기에서 은퇴 마커 정리가
   "malformed markers"로 스킵되던 잠복 결함 수정. 바이트 정확 semantics 유지
   (CRLF 통과·파일 말미 개행 보존·마커별 seen-set·중첩/stray/미종결 거부).
2. **워크플로 도입** — CI test.yml, version-sync 게이트, retired-surfaces 게이트,
   Git 규칙 3종, 묘비 슬리밍(AGENTS.md 267→234줄, 전문 `docs/removed/tombstones.md`),
   브랜치 보호(main/dev force-push·삭제 차단).
3. **스킬 샌드박스 하네스** (`c04e2f3`) — 5스킬 전수를 실제 gjc+bwrap 격리에서
   로컬 스텁 프로바이더로 로드 증명.

## 검증 (fail-closed)

| 항목 | 결과 |
|---|---|
| `bun test plugins/oh-my-gjc/test` | **158 pass / 0 fail / 870 expect** (14 files) |
| 매니페스트 JSON 파스 · 버전 3필드 `0.35.1` 일치 | PASS (version-sync 게이트가 상시 검사) |
| `bash -n` install.sh + bin/*.sh | PASS |
| 격리 HOME 신규 설치 (`HOME=<tmp> GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 bash install.sh --candidate-ref "$PWD"`) | **rc=0** — 5스kill + 5커맨드, 배너 `oh-my-gjc (0.35.1)`, registry `0.35.1`, suite-root binding 1건 |
| nodeless 마커 정리 실설치 재현 (PATH에서 node 제거한 채 `install.sh --candidate-ref` 실행, 은퇴 gate-always 마커 시드) | **rc=0 + `✓ removed retired gate-always marker` + `SYSTEM.md → keep-before\nkeep-after` 바이트 정확 + 백업 생성** |
| gitleaks `v0.35.0..HEAD` | **8 commits, no leaks found** (rc 0) |
| CI (push 잔여 커밋분) | run `33428305124`·`33428487677` success |

## 교차리뷰 (도그푸드 레인)

- diff가 행동 표면(install-skill.sh)을 포함하므로 실행: `GJC_NOTIFICATIONS=0
  GJC_SDK_DISABLE=1 gjc -p --no-session --model openai-codex/gpt-5.5:xhigh
  --tools read,search,find` — awk 포팅 동등성·게이트 테스트 건전성·CI yml·묘비
  압축 무손실 검토 지시.
- 결과: **VERDICT: APPROVE** — 블로컈/high/medium 0건. awk 포팅이 기존 node semantics와 동등함을 독립 확인(CRLF 통과·말미 개행 보존·BEGIN 중복 거부·중첩/stray/미종결 fail-closed·regular-file/백업 경계). low 2건 기록: ① retired-surfaces의 `omg:<cmd>`/`skills/<name>` 토큰 매칭이 경계 없는 `includes`라 미래의 정당한 상위문자열(예: `omg:release-notes`)에 위양성 여지 — 현 표면 무영향, 후속 개선 시 경계 매칭 권장. ② `LEGACY_COMMANDS`만 스캔하고 `LEGACY_OH_MY_GJC_ALIASES`는 미스캔 — 해당 배열에 활성 이름(no-english 등)이 섞여 있어 의도적 제외이나, 은퇴 전용 목록 분리 시 게이트 편입 가능.

## 환경 제한(pending-environment)

- insane-review/gpt-image 라이브 CDP 카나리 — 이번 범위의 설치면·엔진 미변경으로
  비적용. skill-sandbox 하네스는 로컬에서 5/5 통과(별도 문서).
