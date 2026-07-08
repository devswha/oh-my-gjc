---
name: codex-cli-ask
description: 로컬에 설치된 Codex CLI(codex exec)로 gjc가 Codex에게 프롬프트 1개를 비대화형으로 보내고 최종 답변을 받아올 때 사용한다. "codex한테 물어봐 / codex로 시켜 / codex cli ask / ask codex / codex exec / Codex를 gjc로 부려" 같은 요청에 활성화. 데스크톱 App/CDP 없이 동작하며, 기본 sandbox는 read-only(안전)다.
---

# Codex CLI Control (codex exec, v1)

로컬에 설치된 **Codex CLI**를 gjc가 호출해 Codex에게 프롬프트 1개를 비대화형으로 보내고
**최종 메시지 1개**를 받아온다. 데스크톱 App이나 CDP가 필요 없다 — Codex App과 **동일한
app-server 엔진**을 쓰므로 모델/에이전트 성능은 같다.

핵심 명령:

```sh
printf '%s' "$CODEX_PROMPT" | codex exec --sandbox <mode> --skip-git-repo-check -o <last_message_file> -
```

`-o`(`--output-last-message`)가 Codex의 **최종 메시지만** 파일로 떨궈주므로 깔끔하게 추출된다.

## ⚠️ 안전 (sandbox가 핵심)

`codex exec`는 Codex가 **로컬에서 셸 명령/파일 작업을 실행**할 수 있게 한다. sandbox 정책으로 권한을 통제한다:

| sandbox | 의미 | 권장 |
|---------|------|------|
| `read-only` (기본) | 파일 읽기만, 쓰기·네트워크 side-effect 없음 | ✅ 단순 질의/분석 |
| `workspace-write` | 작업 디렉터리 쓰기 허용 | 코드 수정을 **명시적으로** 원할 때만 |
| `danger-full-access` | 전체 접근 | 피할 것 (불가피할 때만, 사용자 확인) |

- 기본은 **`read-only`**. 사용자가 명시하지 않으면 절대 더 넓은 권한으로 올리지 마라.
- `--dangerously-bypass-approvals-and-sandbox`는 **사용하지 마라** (사용자가 명시 요구 + 위험 인지 시에만).
- 프롬프트에 신뢰할 수 없는 지시/비밀값을 넣지 마라. Codex는 자격증명·리포·셸에 접근할 수 있다.

## 입력 계약

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `prompt` | ✅ | 없음 | Codex에 보낼 프롬프트 1개 |
| `sandbox` | ❌ | `read-only` | `read-only` / `workspace-write` / `danger-full-access` |
| `model` | ❌ | (codex 기본) | `-m` 모델 지정 |
| `cwd` | ❌ | 현재 디렉터리 | `-C` Codex 작업 루트 |
| `timeout_s` | ❌ | `180` | 전체 실행 타임아웃(초) |

`prompt`가 없으면 실행하지 말고 사용법을 안내하고 끝낸다.

### 입력 검증 규칙 (보안 — shell/option injection 방지)

사용자 인자를 **절대 셸 명령 문자열에 직접 보간하지 마라.** 다음을 강제한다:

- **`prompt`**: 항상 bash env(`CODEX_PROMPT`)에 담아 **stdin으로만** 전달한다(아래 의사코드). 명령줄 위치 인자로 넣지 않는다 — `-`로 시작하는 프롬프트가 codex 옵션으로 해석되는 것을 막는다.
- **`sandbox`**: 정확히 `read-only` | `workspace-write` | `danger-full-access` 중 하나만. 그 외 값은 거부. 미지정 시 `read-only`.
- **`timeout_s`**: 양의 정수만(`^[0-9]+$`), 상한 600. 위반 시 거부.
- **`model`**: `^[A-Za-z0-9._/-]+$`만 허용하고 별도 argv(`-m "$MODEL"`)로 전달. 위반 시 거부.
- **`cwd`**: 존재하는 디렉터리여야 하며 별도 argv(`-C "$CWD"`)로 전달. 아니면 거부.
- **모든 확장은 따옴표**(`"$VAR"`)로 감싸고, argv는 배열로 구성한다. 값을 명령 템플릿에 문자열 연결하지 않는다.
- **알 수 없는 인자는 거부**한다(unknown key → 사용법 안내 후 종료).
- **`--dangerously-bypass-approvals-and-sandbox` / `danger-full-access`** 는 `prompt`나 다른 값에서 **자동 파생 금지**. 사용자가 그 플래그를 명시 요청하고 위험을 인지한 경우에만 별도 확인·경고 후 사용.

## 전제

- `codex`가 PATH에 있고 로그인되어 있어야 한다. 확인:
  ```sh
  codex --version    # 예: codex-cli 0.142.3
  codex login status # 미인증이면 codex login 안내(자동 로그인 시도 금지)
  ```
- `codex`가 없으면 설치/PATH 안내 후 종료. 자동 설치 시도 금지.

## 절차 (gjc `bash` 도구로 실행)

1. **입력 검증**: 위 "입력 검증 규칙"을 먼저 적용. `prompt` 필수, `sandbox` 기본 `read-only`. 잘못된 값/알 수 없는 인자는 실행 없이 거부.
2. **codex 존재 확인**: `command -v codex` 실패 시 명확한 에러로 종료(자동 설치 금지).
3. **임시 출력 파일** 준비: `OUT="$(mktemp -t codex-last-XXXX.txt)"`.
4. **실행** (검증된 값만, prompt는 stdin):
   - argv를 배열로 구성: `--sandbox "$SANDBOX"`(enum 검증), `--skip-git-repo-check`, `--ephemeral`, `-o "$OUT"`, 선택 `-m "$MODEL"`, `-C "$CWD"`, 마지막 위치 인자 `-`(=stdin).
   - prompt는 `printf '%s' "$CODEX_PROMPT" | codex "${args[@]}"`로 **stdin** 전달(절대 argv에 넣지 않음).
   - 전체를 `timeout "$TIMEOUT_S"`로 감싼다.
5. **결과 추출**: exit code 0이고 `"$OUT"`가 비어있지 않으면 그 파일 내용을 최종 응답으로 반환(stdout 이벤트 로그가 아니라 `-o` 파일 신뢰).
6. **실패 처리**: codex 미설치/미인증 → 원인별 안내(자동 로그인·설치 금지); 타임아웃 → 부분 출력 반환 금지, 타임아웃 에러+명령/대기시간; exit≠0 → stderr 요약+파일 상태 진단.

## bash 의사코드 (injection-safe)

```sh
command -v codex >/dev/null || { echo "codex CLI not found on PATH. Install Codex CLI and log in (codex login)."; exit 1; }

# 1) 검증된 인자 (값은 절대 명령 문자열에 직접 보간하지 않음)
SANDBOX="read-only"   # 입력 시 enum만 허용
case "$SANDBOX" in read-only|workspace-write|danger-full-access) ;; *) echo "invalid sandbox"; exit 2;; esac
TIMEOUT_S="180"; case "$TIMEOUT_S" in ''|*[!0-9]*) echo "invalid timeout_s"; exit 2;; esac
[ "$TIMEOUT_S" -lt 1 ] || [ "$TIMEOUT_S" -gt 600 ] && { echo "timeout_s out of range (1-600)"; exit 2; }
# MODEL 입력 시: printf %s "$MODEL" | grep -qE '^[A-Za-z0-9._/-]+$' || { echo "invalid model"; exit 2; }
# CWD 입력 시: [ -d "$CWD" ] || { echo "invalid cwd"; exit 2; }
CODEX_PROMPT="<사용자 prompt 원문>"   # env로만; 셸 보간 금지

OUT="$(mktemp -t codex-last-XXXX.txt)"

# 2) argv 배열로 안전 구성 (옵션 주입 불가)
args=(exec --sandbox "$SANDBOX" --skip-git-repo-check --ephemeral -o "$OUT")
[ -n "${MODEL:-}" ] && args+=( -m "$MODEL" )
[ -n "${CWD:-}" ]   && args+=( -C "$CWD" )
args+=( - )   # prompt는 stdin('-')에서 읽음

# 3) prompt는 stdin으로만 → '-'로 시작해도 옵션으로 오인되지 않음
printf '%s' "$CODEX_PROMPT" | timeout "$TIMEOUT_S" codex "${args[@]}"
rc=$?
[ $rc -ne 0 ] && { echo "codex exec failed (rc=$rc). See stderr/diagnostics."; exit $rc; }
# 최종 응답 = "$OUT" 내용 (비어있으면 실패로 처리)
```

> `--dangerously-bypass-approvals-and-sandbox` / `danger-full-access`는 이 흐름에서 자동으로 켜지지 않는다. 사용자가 명시 요청 + 위험 인지 시에만 별도 경고 후 추가한다.

## 범위

**한다 (v1):** 설치된 Codex CLI로 `codex exec` 단일 프롬프트 → 최종 메시지 1개 반환, sandbox 정책 통제(기본 read-only).
**안 한다 (Non-Goal):** 데스크톱 App/CDP GUI 제어(→ `codex-app-control` 플러그인), 다중 턴 대화 세션 관리/resume, MCP 서버, Codex 자동 로그인/설치, `app-server` JSON-RPC 직접 구현. (후속.)
