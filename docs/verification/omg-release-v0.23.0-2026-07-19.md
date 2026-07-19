# oh-my-gajaecode v0.23.0 release evidence — 2026-07-19

## Candidate

- Behavior candidate: `d60feb6` → 최종 발행 후보 `066cc58` (dev; 추가분은 증거 문서 커밋 `f0f2f9c` + 거버넌스 자율화 문서 커밋 `5c60ca8`·`066cc58` — 전부 docs/문자열 변경, 플러그인 페이로드 무접촉)
- Release scope (v0.22.0..dev): **`session-observer` capability 완전 제거** — 하코 직접 지시(2026-07-19, v0.22.0 출시 수 시간 뒤). 스킬·커맨드 템플릿·러너(`bin/session-observer.ts`)·전용 테스트 삭제, REMOVED_SKILLS/REMOVED_COMMANDS 묘비 등록(업그레이드 `cleanup_removed`가 네이티브 잔존물 청소), installer targeted 특례·provenance 마커 제거, AGENTS 묘비 절 추가. 최종 표면 = **8 skills / 11 commands**.
- 커밋 위치 정정 기록: 최초 커밋 `505cda5`가 로컬 main에 잘못 앉음(원격 미푸시) → dev로 cherry-pick(`8b3198c`) 후 로컬 main을 origin/main(`d0d1634`)으로 원복. 원격 main은 한 번도 오염되지 않음.

## Gate 1 — verification

- `bun test plugins/oh-my-gjc/test`: **196 pass, 0 fail**, 1162 expectations across 12 files (session-observer 전용 스위트 삭제로 226→196; 설치/러너 preflight 커버리지는 preset-pack·lazycodex-gjc로 재표적해 유지).
- `python3 -m unittest ops.verify.test_record_provenance`: 33 tests, `OK`.
- `bash -n` root `install.sh` + native `install-skill.sh`: pass. JSON parse(marketplace+plugin, 0.23.0 both): pass. `git diff --check v0.22.0..dev`: pass.
- **New-install reproduction (isolated HOME, `--candidate-ref`): rc=0** — plugin `0.23.0` 등록, 정확히 8 skills + 11 commands, `session-observer` 부재 확인, 옵션 런타임 fail-closed 정상.
- **Upgrade sweep 실측 (본 머신, v0.22.0 네이티브 설치본 위)**: 네이티브 installer 재실행 → `cleaned 2 removed-capability native file(s)` — `skills/session-observer/`·`omg:session-observer.md` 제거 확인, 다른 표면 무접촉.
- `gitleaks git --log-opts='v0.22.0..dev'`: 1 commit scanned, no leaks found.

## Gate 2 — external cross-family review

Fresh-context `openai-codex/gpt-5.5:xhigh`, tools read/search/find only, `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`, reviewing `/tmp/omg-v0.23.0-release.diff` (v0.22.0..dev) against the live repo.

- **Round 1 (`8b3198c`): REQUEST_CHANGES** — 블로커 1건: v0.22.0 태그(main)에만 있던 bugwatch tower gate 커밋 `94abcf7`이 dev에 없어 release diff에 게이트 "제거"로 표출(미선언 동작 변경). 그 외 매니페스트·카운트·묘비·시크릿은 전부 클린 판정.
- Fix-forward: `d60feb6` — main 역병합으로 `94abcf7` dev 반영, `git diff v0.22.0..dev -- ops/gjc-bugwatch` 공집합 확인. bugwatch 29/29 + 스위트 196/196 재확인.
- Gate 1 이월 근거: `8b3198c`와 `d60feb6`의 `plugins/oh-my-gjc` 트리 해시(`3575080c…`)·`install.sh`·`.claude-plugin` 전부 동일 — 역병합은 ops/gjc-bugwatch만 추가. 격리 설치 재현 결과가 그대로 유효.
- **Round 2 (`d60feb6`): VERDICT: APPROVE** — 라운드1 블로커 해소 확인(라이브 게이트 존재: trigger.ts·service·테스트, release diff에서 ops/gjc-bugwatch 무접촉), 재스캔 신규 블로커 없음: 8/11 정합, 묘비·양 네임스페이스 sweep 확인, 라이브 표면 부재 검증, 시크릿 없음.

- 추가 커밋(`f0f2f9c`·`5c60ca8`·`066cc58`)은 docs+provenance 문자열 한정 — bash -n·py_compile·unittest 33 OK·bun 196/196 재검증. 신규 교차리뷰는 자율 릴리스 규칙(docs-only 생략 허용)에 따라 생략하고 여기 기록한다.
## Gate 3 — human approval

- **폐지됨 (2026-07-19 하코 direct order, "승인해야 하는 것들 전부 제거").** 본 릴리스부터 하코 승인 게이트·빈도 캡 없이 AGENTS.md **Release rules**(검증 필수 + 교차리뷰 권장 + 발행 후 report 통보)에 따라 자율 발행한다. 큐 id=333(구 체제의 승인 요청)은 규칙 폐지로 소멸 — 발행 report로 대체.

## Publication contract

- Merge `dev` to `main`; tag `v0.23.0`; publish the GitHub Release (v0.22.0 release body에 "session-observer removed in v0.23.0" 주석 추가); post-publication control-tower report.

## Published (사후 기록)

- 실제 출하 dev tip: `19fc093` (066cc58 + 본 증거 문서 docs-only 갱신 1커밋) → main 병합 `0d93f12`, annotated tag `v0.23.0`(객체 `184641f`) peel == origin/main == `0d93f12` 확인.
- GitHub Release: https://github.com/devswha/oh-my-gjc/releases/tag/v0.23.0 — draft=false, prerelease=false, target=main. v0.22.0 본문에 removal 주석 부착 확인.
- 발행 후 검증: architect 발행 정합 감사(잔여 3건 리더 종결로 CLEAR 충족) + 공개 마켓플레이스 e2e(격리 HOME 신규 설치 0.23.0·8/11·observer 부재, red-team 잔존물 심기→업그레이드 sweep `cleaned 2` + 정상 파일 SHA-256 20개 불변). 관제탑 report id=334. 로컬 실머신 캐시 0.23.0 재바인딩 완료.
