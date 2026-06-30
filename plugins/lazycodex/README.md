# lazycodex

[LazyCodex](https://github.com/code-yeongyu/lazycodex)(= OmO Codex Light) deep-work 하니스를
**Codex에 설치/관리**하고, 그걸로 **plan→work→verify(ultrawork)** 코딩 작업을 돌리는 skill 중심 플러그인.

LazyCodex를 설치하면 `~/.codex`에 deep-work 스킬(`ulw-plan`/`start-work`/`ulw-loop`/`deepinit`/
`research`/`programming` …), 훅, 전문 에이전트(executor/code-reviewer/qa-executor/gate-reviewer),
검증 게이트가 추가된다. 이후 모든 `codex exec` 실행이 자동으로 이 역량을 받는다.

## 전제

- `codex` CLI 설치 + 로그인 (`codex --version`, `codex login status`).
- `node` / `npx` 사용 가능.

## 설치(플러그인) & 사용

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install lazycodex@oh-my-gjc
```

### 1) LazyCodex 셋업
```
/lazycodex:setup            # doctor (점검; 미설치면 설치법 안내)
/lazycodex:setup install    # npx lazycodex-ai install --codex-autonomous (미설치 시에만)
/lazycodex:setup update     # lazycodex update
/lazycodex:setup uninstall  # 확정 시에만
```

### 2) ultrawork deep-work 실행
```
/lazycodex:work task="calc.py와 test_calc.py 만들고 unittest 통과시켜라"
/lazycodex:work task="src/foo.ts 리팩터링하고 테스트 추가" cwd=. sandbox=workspace-write
```
| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `task` | ✅ | — | 위임할 작업 지시 |
| `cwd` | ❌ | 현재 | `-C` 작업 루트(존재 디렉터리) |
| `sandbox` | ❌ | `workspace-write` | `read-only`/`workspace-write`/`danger-full-access` |
| `model` | ❌ | codex 기본 | `-m` 모델 |
| `timeout_s` | ❌ | `600` | 타임아웃(초) |

## ⚠️ 안전

- **셋업**(install/update/uninstall)은 `~/.codex`의 스킬·훅·에이전트·config를 **수정**하고 npm/네트워크를 쓴다. 이미 동작 중인 Codex 설정을 사용자 요청 없이 건드리지 않는다. 자동 로그인 안 함.
- **work**는 기본 `workspace-write`로 **파일을 바꾼다**. git 리포에서 실행 + 끝나면 `git diff`/`git status` 검토. 자동 커밋/푸시 안 함.
- 입력은 injection 방지: `task` stdin 전용, `sandbox` enum·`timeout_s` 정수(≤3600)·`cwd` 디렉터리·`model` 정규식 검증, 알 수 없는 인자 거부, bypass 자동파생 금지.

## 다른 codex 플러그인과의 관계

| 플러그인 | 용도 |
|---|---|
| `codex-cli-control` | 읽기전용 단발 질의 (codex exec, read-only) |
| `codex-deepwork` | 일반 자율 작업 (codex exec, lazycodex 있으면 묻어감) |
| **`lazycodex`** | **lazycodex 자체 설치/관리 + ultrawork(plan→work→verify) 명시 구동** |
| `codex-app-control` | 데스크톱 App GUI를 CDP로 제어 |

## 검증 상태

- **정적:** plugin/marketplace JSON, 컨벤션 경로, marketplace 등록 일치.
- **셋업(이 환경 실측):** `lazycodex version` = `lazycodex-ai 4.10.0`, `lazycodex doctor` = `System OK (opencode 1.17.11 · oh-my-openagent 4.11.0)` (rc 0).
- **ultrawork(이 환경 실측):** `codex exec --sandbox workspace-write`로 "calc.py+test_calc.py 만들고 unittest 통과" 위임 → `omo:programming` 스킬 자동 로드 + 계획 추적 + 검증 게이트(unittest 3통과/py_compile/basedpyright 시도) 확인, 산출물 독립 재실행 3 tests OK.

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `codex CLI not found` | Codex CLI 설치 + `codex login` |
| `lazycodex` 명령 없음 | `/lazycodex:setup install` (= `npx lazycodex-ai install`) |
| deep-work 스킬이 안 붙음 | `lazycodex doctor`로 상태 확인, 필요시 `/lazycodex:setup update` |
| 파일이 안 바뀜 | `sandbox=workspace-write` 확인(기본값) |
| 너무 오래 걸림 | `timeout_s` 상향, 작업을 더 작게 |
