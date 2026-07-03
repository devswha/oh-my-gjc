# gjc-bugwatch

gjc를 dogfooding하면서 **네가 모르고 지나친 gjc 자체 버그**를 모아 upstream
(gajae-code) 이슈/PR **초안**으로 만들어주는 플러그인. gjc 세션이 디스크에 남긴
흔적을 **배치로** 훑어 후보를 뽑고, 진짜인 것만 `.gjc/bugwatch/drafts/`에 모아둔다.
**초안만 만든다 — 자동 제출(PR/push) 없음.** 제출은 사람이 검토 후 직접.

## 왜 "배치 스캐너"인가

실시간 감시(라이브 tail)가 아니라, **가끔 한 번씩 그동안 쌓인 로그를 통째로 읽는**
방식이다. 에러는 어차피 `~/.gjc/logs`에 다 남으므로 실시간일 필요가 없고, 몰아서
읽어야 같은 버그를 중복 묶고 심각도순으로 정렬해 깔끔한 초안이 나온다. (상시
"뜨는 즉시 알림"이 필요하면 `bin/follow.ts`를 tail에 물려 라이브로 쓸 수 있다 — 상시 관리형 데몬은 로드맵.)

## 구성

| 파일 | 역할 |
|------|------|
| `bin/collect.ts` | **배치 스캐너.** `~/.gjc/logs`(+선택 세션)를 읽어 런타임 에러/크래시를 분류·중복제거·레닥션하고 후보를 뽑는다. 단독 실행 가능(테스트됨) |
| `bin/follow.ts` | **라이브 follow.** 로그 tail을 stdin으로 받아 `collect.ts`와 동일 분류/노이즈필터/레닥션으로 실시간 신호만 방출. `tail -n0 -F ~/.gjc/logs/gjc.$(date +%F).log \| bun run follow.ts` |
| `commands/scan.md` | `/gjc-bugwatch:scan` — 수집→트리아지→gajae-code clone에서 재현·근거 확인→초안 저장 |
| `skills/gjc-bugwatch/SKILL.md` | "버그 스캔 돌려줘" 등 자연어 트리거용(네이티브 설치 필요) |
| `bin/install-skill.sh` | 스킬을 native `.gjc` 스킬로 1회 설치 |

## collector 단독 사용

```sh
bun run plugins/gjc-bugwatch/bin/collect.ts                      # 로그만(고정밀)
bun run plugins/gjc-bugwatch/bin/collect.ts --days 3             # 최근 3일치
bun run plugins/gjc-bugwatch/bin/collect.ts --include-sessions   # 세션도(노이즈↑, 현재 세션 제외)
bun run plugins/gjc-bugwatch/bin/collect.ts --all                # 환경/자격증명 노이즈까지 포함
bun run plugins/gjc-bugwatch/bin/collect.ts --json               # 기계용 JSON을 stdout으로
```

무엇을 후보로 잡나:
- **`gjc-internal` (HIGH)** — 스택이 gjc 바이너리(`/$bunfs/root/gjc-*`)/소스를 가리키는 `error`/`warn`, 또는 세션의 `[Uncaught Exception]` → 진짜 코드 버그.
- **`error` (MEDIUM)** — 그 외 `level:error` 로그 프레임.
- **`warn` (LOW)** — 노이즈가 아닌 경고.
- **노이즈(기본 숨김)** — 프로바이더 모델 디스커버리 실패, 로컬 모델서버 연결 거부, 자격증명/토큰 갱신·만료. `--all`로 표시.

정밀도 노트:
- **로그 = 고정밀** (gjc의 구조화 로그, 오탐 사실상 0).
- **세션 = 옵트인·노이즈** — 세션 JSONL은 읽은 소스코드·붙여넣은 로그·분석문을 그대로 담아 자기오염이 있어 `--include-sessions`일 때만 스캔하고 현재 세션은 제외한다. 세션에서 신뢰하는 신호는 `[Uncaught Exception]`뿐.

## 설치 / 사용

```sh
gjc plugin marketplace add devswha/oh-my-gjc      # 최초 1회
gjc plugin install gjc-bugwatch@oh-my-gjc
```
gjc 세션에서:
```
/gjc-bugwatch:scan               # 로그만 스캔 → 초안 수집
/gjc-bugwatch:scan --include-sessions --days 3
```
자연어 트리거(스킬)까지 원하면 1회:
```sh
bash ~/.gjc/plugins/cache/plugins/*gjc-bugwatch*/bin/install-skill.sh
```

## 산출물

- `.gjc/bugwatch/candidates.jsonl` — collector가 뽑은 원시 후보(레닥션됨).
- `.gjc/bugwatch/drafts/<severity>-<slug>-<fp8>.md` — 이슈/PR 초안(중복은 fingerprint로 스킵).
- `.gjc/bugwatch/drafts/INDEX.md` — 초안 목록.

전부 `.gjc/`(gitignore) 아래라 레포에 커밋되지 않는다.

## 안전 계약 (약화 금지)

- **초안만.** `gh issue/pr create`·`git push`·커밋·외부 제출 금지.
- **read-only.** gjc 로그/세션/소스는 읽기만; `~/.gjc` 원본 수정 금지.
- **레닥션.** 이메일/UUID/토큰/creds-in-URL을 출력·스풀 전에 스크럽(공개 이슈에 붙여넣기 안전).
- **중복 금지 / 추정·사실 구분.** 같은 fingerprint 초안 재생성 금지; 소스로 확인 못 한 원인/수정은 "추정" 표기, 날조 금지.

## Non-Goals

- 자동 이슈/PR 생성·푸시(초안만). 상시 관리형 감시 데몬(로드맵 — 지금은 `bin/follow.ts`를 tail/`monitor`에 물리는 세션 단위 라이브만). gjc 로그/세션 포맷 미변경(읽기만).
