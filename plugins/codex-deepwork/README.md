# codex-deepwork

gjc가 코딩 작업을 **Codex에 자율로 위임**해 Codex가 직접 파일을 수정/생성하게 하는 skill 중심 플러그인.
단발 응답(`codex-cli-control:ask`)과 달리 **여러 단계로 일하고 파일을 바꾼다.**

`~/.codex`에 **[LazyCodex](https://github.com/code-yeongyu/lazycodex)** 하니스가 설치돼 있으면,
이 codex 실행은 자동으로 deep-work 스킬(research/deepinit/…), 전문 에이전트(executor/code-reviewer/
qa-executor/gate-reviewer), 검증 루프의 이점을 받는다 — **추가 플래그 없이 codex 레벨에서.**

## 전제

- `codex` CLI 설치 + 로그인:
  ```sh
  codex --version      # 예: codex-cli 0.142.3
  codex login status
  ```
- (권장) LazyCodex 설치로 deep-work 품질↑:
  ```sh
  npx lazycodex-ai install
  ```
  미설치여도 `codex exec` 자체는 동작한다(deep-work 스킬만 빠짐).

## 설치

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install codex-deepwork@oh-my-gjc
```

## 사용

```
/codex-deepwork:run task="src/utils.ts에 입력 검증 헬퍼 추가하고 테스트 작성"
/codex-deepwork:run task="이 디렉터리에 README 초안 생성" cwd=./docs
/codex-deepwork:run task="린트 에러 수정" sandbox=workspace-write timeout_s=900
```

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `task` | ✅ | — | Codex에 위임할 작업 지시 |
| `cwd` | ❌ | 현재 디렉터리 | `-C` 작업 루트(존재하는 디렉터리) |
| `sandbox` | ❌ | `workspace-write` | `read-only` / `workspace-write` / `danger-full-access` |
| `model` | ❌ | codex 기본 | `-m` 모델 |
| `timeout_s` | ❌ | `600` | 전체 타임아웃(초). deep-work는 길 수 있음 |

내부적으로 다음을 실행하고 Codex 최종 메시지 + **변경 검토 안내**를 반환한다:

```sh
codex exec --sandbox <mode> --skip-git-repo-check -C <cwd> -o <file> -   # task는 stdin
```

## ⚠️ 안전 (이건 파일을 바꾼다)

- 기본 `workspace-write` → Codex가 **작업 디렉터리 파일을 수정/생성**하고 셸 명령을 실행한다.
- **git 리포에서 실행**하고 끝나면 `git diff` / `git status`로 변경을 검토하라. 이 플러그인은 자동 커밋/푸시하지 않는다.
- 신뢰할 수 없는 작업 지시를 위임하지 마라. Codex는 셸·파일·자격증명에 접근한다.
- `danger-full-access` / `--dangerously-bypass-approvals-and-sandbox`는 자동으로 켜지지 않는다. 명시 요청 + 위험 인지 시에만.
- 입력은 injection 방지: `task`는 stdin 전용, `sandbox` enum·`timeout_s` 정수(≤3600)·`cwd` 디렉터리·`model` 정규식 검증, 알 수 없는 인자 거부.

## codex-cli-control 과의 차이

| | `codex-cli-control:ask` | `codex-deepwork:run` |
|---|---|---|
| 목적 | 읽기 전용 질의/분석 | 자율 구현(파일 수정) |
| 기본 sandbox | `read-only` | `workspace-write` |
| 결과 | 최신 응답 1개 | 변경 + 최종 메시지 (검토 필요) |

## 범위

- **한다:** 자율 코딩 작업 위임(파일 수정/생성), write 샌드박스, lazycodex 하니스 자동 활용.
- **Non-Goal:** 읽기 전용 질의(→ `codex-cli-control`), App/CDP 제어(→ `codex-app-control`), lazycodex 자동 설치, 멀티 세션 오케스트레이션, 자동 커밋/푸시.

## 검증 상태

- **정적:** plugin/marketplace JSON, 컨벤션 경로, marketplace 등록 일치.
- **라이브 deep-work (이 환경에서 실증됨):** 임시 디렉터리에 "calc.py + test_calc.py 만들고 `python3 -m unittest -v` 통과시켜라"는 다단계 작업을 위임 → 다음이 로그로 확인됨:
  - LazyCodex 스킬 자동 라우팅(`omo:programming` 로드) + 훅(`SessionStart`/`UserPromptSubmit`/`PreToolUse`/`PostToolUse`/`Stop`) 발동
  - 계획·진행 추적(Inspect → Create → Run tests → Review 체크리스트)
  - 검증 게이트: `unittest` 3건 통과 → `py_compile` → `basedpyright`/`pyright` 타입체커 시도(미설치라 skip) → LOC 안전 리뷰
  - OmO `.codegraph`(`~/.omo/codegraph/...`) 생성. 토큰 ~70k(단발 대비 ~4.6배)
  - 산출물 독립 재실행 결과 **3 tests OK**.
- 간단 스모크: `codex exec ... -o <file> -`로 `hello.txt`=`HELLO` 생성(rc 0, ~19s)도 확인.

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `codex CLI not found` | Codex CLI 설치 + `codex login` |
| deep-work 스킬이 안 붙음 | `npx lazycodex-ai install` 후 재시도 |
| 파일이 안 바뀜 | `sandbox=workspace-write`인지 확인(기본값). read-only면 안 바뀜 |
| 너무 오래 걸림 | `timeout_s` 조정, 작업을 더 작게 쪼개기 |
| 긴 작업 지시 파싱 오류 | `task="..."` 따옴표로 감싸기 |
