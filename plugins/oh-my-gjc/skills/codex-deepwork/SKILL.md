---
name: codex-deepwork
description: 코딩 작업을 Codex에 자율로 위임해 실제로 파일을 고치게 할 때 사용한다. "codex로 구현시켜 / codex deep work / 자율로 작업시켜 / lazycodex로 시켜 / codex가 직접 고치게" 같은 요청에 활성화. codex exec를 write 샌드박스로 돌려 계획→실행→검증을 맡긴다. 단순 질의/읽기 전용은 /omg:codex-ask, 데스크톱 App/CDP 제어는 /omg:codex-app-* 를 쓴다.
---

# Codex Deep Work (codex exec, write 샌드박스)

코딩 작업을 **Codex에 자율로 위임**해 Codex가 직접 파일을 수정/생성하게 한다.
단발 응답(`/omg:codex-ask`)과 달리 **여러 단계로 일하고 파일을 바꾼다.**

`~/.codex`에 **LazyCodex 하니스**가 설치돼 있으면(`npx lazycodex-ai install`), 이 codex 실행은
자동으로 deep-work 스킬(research/deepinit/…), 전문 에이전트(executor/code-reviewer/qa-executor/
gate-reviewer), 검증 루프의 이점을 받는다. **추가 플래그 없이** codex 레벨에서 적용된다.

## ⚠️ 안전 (이건 파일을 바꾼다)

- 기본 `sandbox=workspace-write` → Codex가 **작업 디렉터리의 파일을 수정/생성**하고 셸 명령을 실행한다.
- **git 리포에서 실행**하고, 끝나면 반드시 `git diff` / `git status`로 변경을 검토하라.
- 신뢰할 수 없는 작업 지시를 위임하지 마라. Codex는 셸·파일·자격증명에 접근한다.
- `danger-full-access` / `--dangerously-bypass-approvals-and-sandbox`는 **자동으로 켜지 않는다.** 사용자가 명시 요청 + 위험 인지 시에만.

## 입력 계약

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `task` | ✅ | 없음 | Codex에 위임할 작업 지시 1개 |
| `cwd` | ❌ | 현재 디렉터리 | `-C` 작업 루트 (존재하는 디렉터리) |
| `sandbox` | ❌ | `workspace-write` | `read-only` / `workspace-write` / `danger-full-access` |
| `model` | ❌ | (codex 기본) | `-m` 모델 |
| `timeout_s` | ❌ | `600` | 전체 타임아웃(초). deep-work는 길 수 있다 |

`task`가 없으면 실행하지 말고 사용법을 안내하고 끝낸다.

### 입력 검증 규칙 (보안 — shell/option injection 방지)

`/omg:codex-ask`(codex-cli-ask 스킬)과 동일 계약을 강제한다. 사용자 인자를 **셸 명령 문자열에 직접 보간하지 마라.**

- **`task`**: env(`CODEX_TASK`)에 담아 **stdin으로만** 전달(argv에 넣지 않음; `-`로 시작해도 옵션 오인 방지).
- **`sandbox`**: 정확히 `read-only` | `workspace-write` | `danger-full-access` 중 하나만(그 외 거부, 기본 `workspace-write`).
- **`timeout_s`**: 양의 정수만(`^[0-9]+$`), 상한 3600. 위반 시 거부.
- **`model`**: `^[A-Za-z0-9._/-]+$`만, 별도 argv(`-m "$MODEL"`). 위반 시 거부.
- **`cwd`**: 존재하는 디렉터리만, 별도 argv(`-C "$CWD"`). 아니면 거부.
- 모든 확장은 따옴표, argv는 배열로 구성. **알 수 없는 인자 거부.**
- `--dangerously-bypass-*` / `danger-full-access`는 인자에서 **자동 파생 금지.**

## 전제

- `codex` CLI가 PATH에 있고 로그인됨(`codex --version`, `codex login status`). 없으면 안내 후 종료(자동 설치/로그인 금지).
- (권장) LazyCodex 설치 시 deep-work 품질↑: `npx lazycodex-ai install`. 미설치여도 codex exec 자체는 동작한다.

## 절차 (gjc `bash` 도구로 실행)

1. **입력 검증**: 위 규칙 적용. `task` 필수, `sandbox` 기본 `workspace-write`. 잘못된 값/알 수 없는 인자 거부.
2. **codex 존재 확인**: `command -v codex` 실패 시 명확한 에러로 종료.
3. **출력 파일**: `OUT="$(mktemp -t codex-deepwork-XXXX.txt)"`.
4. **실행** (검증된 값, task는 stdin, `timeout_s` 적용):
   - argv 배열: `exec --sandbox "$SANDBOX" --skip-git-repo-check -C "$CWD" -o "$OUT"` [+`-m "$MODEL"`] + 마지막 `-`(stdin).
   - `printf '%s' "$CODEX_TASK" | timeout "$TIMEOUT_S" codex "${args[@]}"`.
5. **결과 반환**: exit 0이면 `"$OUT"`(Codex 최종 메시지)을 요약으로 반환하고, **"파일이 변경됐을 수 있음 → `git diff`/`git status`로 검토" 안내를 함께** 낸다.
6. **실패 처리**: codex 미설치/미인증 → 원인별 안내; 타임아웃 → 부분 결과를 완료로 보고하지 말고 타임아웃 에러 + 변경 검토 안내; exit≠0 → stderr 요약 + 작업 디렉터리 상태(`git status`) 진단.

## bash 의사코드 (injection-safe)

```sh
command -v codex >/dev/null || { echo "codex CLI not found on PATH. Install Codex CLI and log in (codex login)."; exit 1; }

SANDBOX="workspace-write"
case "$SANDBOX" in read-only|workspace-write|danger-full-access) ;; *) echo "invalid sandbox"; exit 2;; esac
TIMEOUT_S="600"; case "$TIMEOUT_S" in ''|*[!0-9]*) echo "invalid timeout_s"; exit 2;; esac
[ "$TIMEOUT_S" -lt 1 ] || [ "$TIMEOUT_S" -gt 3600 ] && { echo "timeout_s out of range (1-3600)"; exit 2; }
CWD="${CWD:-$PWD}"; [ -d "$CWD" ] || { echo "invalid cwd"; exit 2; }
# MODEL 입력 시: printf %s "$MODEL" | grep -qE '^[A-Za-z0-9._/-]+$' || { echo "invalid model"; exit 2; }
CODEX_TASK="<사용자 task 원문>"   # env로만; 셸 보간 금지

OUT="$(mktemp -t codex-deepwork-XXXX.txt)"
args=(exec --sandbox "$SANDBOX" --skip-git-repo-check -C "$CWD" -o "$OUT")
[ -n "${MODEL:-}" ] && args+=( -m "$MODEL" )
args+=( - )   # task는 stdin

printf '%s' "$CODEX_TASK" | timeout "$TIMEOUT_S" codex "${args[@]}"
rc=$?
[ $rc -ne 0 ] && { echo "codex deepwork failed (rc=$rc). Review with: git -C \"$CWD\" status"; exit $rc; }
# 최종 메시지 = "$OUT"; 사용자에게 "git diff/status로 변경 검토" 안내 동반
```

## 범위

**한다:** Codex에 자율 코딩 작업 위임(파일 수정/생성), write 샌드박스, lazycodex 하니스 자동 활용, 최종 메시지 + 변경 검토 안내.
**안 한다 (Non-Goal):** 읽기 전용 단발 질의(→ `/omg:codex-ask`), 데스크톱 App/CDP 제어(→ `/omg:codex-app-launch`·`/omg:codex-app-ask`), lazycodex 자동 설치, 멀티 세션/스레드 오케스트레이션, 자동 커밋/푸시(변경 검토·커밋은 사용자 몫).
