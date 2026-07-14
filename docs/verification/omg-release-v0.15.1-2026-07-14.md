# omg release v0.15.1 — 2026-07-14 게이트 증거

패치 릴리스: presets v0.9 — `sol` 프리셋 전 구간 저지연 정합화(기획 좌석 하향:
planner sol:xhigh→high, architect opus:high→medium, critic opus:xhigh→high) +
ralplan 좌석 벤치 실측 근거(`sol-v09-ralplan-bench-2026-07-14.md`) + README×2·
INSTALLATION·AGENTS 표면 갱신. grok/codex/fable-codex 및 병합 안전 계약 불변.

## 1. 검증 게이트

| 항목 | 결과 |
|---|---|
| JSON parse (marketplace.json metadata/plugins[0] + plugin.json — 3필드 0.15.1 일치) | OK |
| YAML parse (references/presets.yml — profiles: grok·sol·codex·fable-codex) | OK |
| `bash -n` (install.sh, install-skill.sh) | OK |
| `bun test` | 103 pass / 0 fail (bun 1.3.14) |
| 신규 설치 repro (격리 HOME `/tmp/omg-repro-0151`, `install.sh --candidate-ref` 로컬 체크아웃) | rc=0 — 9 skills + 14 commands, 캐시 0.15.1, lazycodex-gjc fail-closed 스킵 정상 |
| 설치본 프리셋 실효 확인 | 캐시 presets.yml sol 좌석 = v0.9 값 일치 |
| 신규 셀렉터 실호출 | `opus-4-8:medium`·`sol:high` "OK" rc=0 (2026-07-14) |
| 라이브 e2e | `gjc --mpreset sol -p "Reply OK"` rc=0 |

## 2. 외부 교차리뷰 게이트 (extragoal dogfood)

리뷰어: `GJC_NOTIFICATIONS=0 gjc -p --no-session --model openai-codex/gpt-5.6-sol:xhigh
--tools read,search,find`, 입력 = `git diff v0.15.0..HEAD` (이그레스 전 시크릿 스캔 0건).

- **Round 1 (ef1f736): REQUEST_CHANGES** — 블로커 3건: marketplace `metadata.version`
  미동기(0.15.0 잔존), README×2·INSTALLATION의 현재버전 v0.15.0 문구 잔존,
  벤치 종점 비대칭(신형=합의완료 vs 구형=합의미완 관측중단인데 "2.06×" 정밀 배율 주장).
- **Round 2 (c6c103b): REQUEST_CHANGES** — 잔여 3건: 플러그인 README 표의 비대칭
  종점 누락, stage 수 부정확(신형 stage 2 완료·구형 stage 4 미완인데 "1라운드/4라운드"
  표기), AGENTS.md:129 "v0.15.0 single-suite" 잔존.
- **Round 3 (cee62f0): APPROVE** — "전체 릴리스 diff에서 추가 신규 블로커는 발견되지
  않았다. 버전과 프리셋 정의·테스트·문서도 서로 일치한다."

리뷰어가 벤치 산출물(stage 파일)까지 대조해 과장 표현("2.06× 단축")을 잡아냈고,
최종 주장은 "신형 8:24 합의완료(수정 1회) vs 구형 17:18에도 합의 미완(수정 3회) = ≥2×"로
정직화됨.

## 3. 승인 게이트

하코가 세션에서 직접 릴리스를 지시("README도 수정해서 배포하자", 2026-07-14) —
게이트 1·2 통과 증거와 함께 본 문서에 기록. 빈도 규칙(문서·패치 번들 1일 1릴리스)
내: 금일 릴리스는 v0.15.0(스위트) 이후 본 패치가 유일한 후속이며 동일 날짜 내
추가 릴리스 없음 전제로 발행.

## 4. 판정

3게이트 통과 — `dev`→`main` 머지, `v0.15.1` 태그, GitHub Release 발행.
