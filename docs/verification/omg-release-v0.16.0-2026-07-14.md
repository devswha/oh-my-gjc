# omg release v0.16.0 — 2026-07-14 게이트 증거

presets v0.10: 커스텀 프리셋을 **`sol` 단일**로 축소(하코 직접 지시). `grok`/`codex`/
`fable-codex` 은퇴(닫힌 목록 13종), grok-build 의존 제거. 품질/비상/안전 레인은
gjc **빌트인** 위임: `opus-codex` · `codex-medium`/`codex-pro` · `fable-opus-codex`
(4종 gjc 0.10.2 실활성 검증). 근거: 로컬 커스텀 사본은 상류 갱신을 못 따라가 썩는다
(구 daily 사례 — 캐시 0.8.1 스냅샷 박제 사고와 동일 계열). `/omg:presets [sol|all]`로
커맨드 표면 축소. 표면 전체 동기화(정본·커맨드·setup·omg·스킬·테스트·README×2·
INSTALLATION·AGENTS·매니페스트 3필드 0.16.0).

## 1. 검증 게이트

| 항목 | 결과 |
|---|---|
| JSON parse (marketplace metadata/plugins[0] + plugin.json — 3필드 0.16.0 일치) | OK |
| YAML parse (references/presets.yml — profiles: sol 단일) | OK |
| `bash -n` (install.sh, install-skill.sh) | OK |
| `bun test` | 105 pass / 0 fail (bun 1.3.14) |
| 신규 설치 repro (격리 HOME `/tmp/omg-repro-0160`, `--candidate-ref` 로컬 체크아웃) | rc=0 — 9 skills + 14 commands, 캐시 0.16.0, 캐시 presets.yml profiles=sol |
| 빌트인 4종 실활성 (`opus-codex`/`codex-medium`/`codex-pro`/`fable-opus-codex`) | 전건 "OK" rc=0 (gjc 0.10.2, 2026-07-14) |

## 2. 외부 교차리뷰 게이트 (extragoal dogfood)

리뷰어: `GJC_NOTIFICATIONS=0 gjc -p --no-session --model openai-codex/gpt-5.6-sol:xhigh
--tools read,search,find`, 입력 = `git diff v0.15.1..HEAD` (707줄, 이그레스 전 시크릿 스캔 0건).

- **Round 1 (ba44155): REQUEST_CHANGES** — `codex-medium`이 사용자 표면 절반
  (커맨드/setup/omg/매니페스트)에서 누락, 테스트도 미고정.
- **Round 2 (fd0fbd5): REQUEST_CHANGES** — 신규 블로커: 은퇴 정리가 persisted
  `modelProfile.default`를 확인·이전하지 않아, 직전 권장값 `grok --default` 사용자가
  정리에 동의하면 다음 시작이 Unknown model profile로 깨짐.
- **Round 3 (0b7d251): APPROVE** — "세 경로 모두 삭제 전 modelProfile.default 확인 요구,
  이전 선행·무이전 삭제 금지, 테스트 회귀 고정. 추가 신규 블로커 없음."

r2가 잡은 기본값 풋건은 실제 사용자 파손 시나리오였음(직전 릴리스 권장이 grok --default).
커맨드/스킬/setup 3표면에 마이그레이션 가드(`grok`→`opus-codex` 등 매핑 포함) 신설 + 회귀 테스트.

## 3. 승인 게이트 + 빈도 규칙 예외

하코가 세션에서 직접 지시("릴리즈까지 하자", 2026-07-14). **빈도 규칙(패치·문서 번들
1일 1릴리스) 예외**: 금일 v0.15.1이 이미 발행됐으나, 규칙 제정자인 하코 본인의 명시적
릴리스 지시이므로 예외 적용 — 본 문서에 근거 기록.

## 4. 판정

3게이트 통과 — `dev`→`main` 머지, `v0.16.0` 태그, GitHub Release 발행.
