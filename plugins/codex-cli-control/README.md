# codex-cli-control

gjc가 **로컬에 설치된 Codex CLI**(`codex exec`)를 호출해 Codex에게 프롬프트 1개를 비대화형으로
보내고 **최종 답변 1개**를 받아오는 skill 중심 플러그인 (v1).

데스크톱 App이나 CDP가 필요 없다. Codex 데스크톱 App과 **동일한 `app-server` 엔진**을 쓰므로
모델/에이전트 성능은 같다. (App GUI 고유 기능—inbox/cron/워크트리 UI—이 꼭 필요하면 별도
`codex-app-control` 플러그인을 쓴다.)

## 전제

- `codex` CLI가 설치되어 PATH에 있고 로그인되어 있어야 한다.
  ```sh
  codex --version      # 예: codex-cli 0.142.3
  codex login status   # 미인증이면 codex login
  ```

## 설치

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install codex-cli-control@oh-my-gjc
```

## 사용

```
/codex-cli-control:ask prompt="reply with PONG"
/codex-cli-control:ask prompt="이 레포 구조 요약해줘" sandbox=read-only
/codex-cli-control:ask prompt="src/foo.ts의 버그 고쳐줘" sandbox=workspace-write
```

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `prompt` | ✅ | — | 보낼 프롬프트 1개 |
| `sandbox` | ❌ | `read-only` | `read-only` / `workspace-write` / `danger-full-access` |
| `model` | ❌ | codex 기본 | `-m` 모델 |
| `cwd` | ❌ | 현재 디렉터리 | `-C` 작업 루트 |
| `timeout_s` | ❌ | `180` | 전체 타임아웃(초) |

내부적으로 다음을 실행하고, `-o` 파일의 **최종 메시지**만 반환한다:

```sh
codex exec --sandbox <mode> --skip-git-repo-check --ephemeral -o <file> "<prompt>"
```

## ⚠️ 안전 (sandbox)

`codex exec`는 Codex가 로컬에서 **셸 명령/파일 작업을 실행**하게 한다.

- **기본 `read-only`** — 읽기만, side-effect 없음. 단순 질의/분석에 안전.
- `workspace-write` — 작업 디렉터리 수정 허용. **코드 변경을 명시적으로 원할 때만.**
- `danger-full-access` / `--dangerously-bypass-approvals-and-sandbox` — 피하라. 불가피할 때만, 위험 인지 후.
- 신뢰할 수 없는 지시/비밀값을 프롬프트에 넣지 마라.

## 범위

- **v1:** `codex exec` 단일 프롬프트 → 최종 메시지 1개, sandbox 통제(기본 read-only).
- **Non-Goal(후속):** 데스크톱 App/CDP GUI 제어(→ `codex-app-control`), 다중 턴 세션 관리/resume,
  MCP 서버, codex 자동 로그인/설치, `app-server` JSON-RPC 직접 구현.

## 검증 상태

- **정적:** plugin/marketplace JSON, 컨벤션 경로, marketplace 등록 일치, frontmatter/안전 문서.
- **라이브(이 환경에서 실증됨):** `codex exec --sandbox read-only --skip-git-repo-check --ephemeral -o <file> "reply with PONG"` →
  `-o` 파일에 `PONG` 기록 확인 (codex-cli 0.142.3).

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `codex CLI not found` | Codex CLI 설치 + PATH 등록, `codex login` |
| 미인증 에러 | `codex login` 후 재시도 (플러그인은 자동 로그인하지 않음) |
| Codex가 파일을 못 고침 | `sandbox=workspace-write` 명시 (기본은 read-only) |
| 타임아웃 | `timeout_s` 상향 |
| 긴 프롬프트 파싱 오류 | `prompt="..."` 따옴표로 감싸기 |
