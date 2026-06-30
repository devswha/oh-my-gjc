---
name: lazycodex
description: LazyCodex(=OmO Codex Light) deep-work 하니스를 설치/업데이트/점검하거나, 그걸로 plan→work→verify(ultrawork) 코딩 작업을 Codex에 돌릴 때 사용한다. "lazycodex 설치 / lazycodex 셋업 / lazycodex 업데이트 / install lazycodex / lazycodex로 deep work / ultrawork 돌려" 같은 요청에 활성화. Codex CLI + Node/npx 필요.
---

# LazyCodex 셋업 & 사용

**LazyCodex**는 [code-yeongyu/lazycodex](https://github.com/code-yeongyu/lazycodex)의 OmO(Hephaestus) 하니스를
**Codex에 설치**하는 얇은 배포 레이어다. 설치하면 `~/.codex`에 deep-work 스킬(`ulw-plan`/`start-work`/
`ulw-loop`/`deepinit`/`research`/`programming` 등), 훅(SessionStart/UserPromptSubmit/PreToolUse/Stop),
전문 에이전트(executor/code-reviewer/qa-executor/gate-reviewer), 검증 게이트가 추가된다. 이후 모든
`codex`/`codex exec` 실행이 자동으로 이 역량을 받는다.

> 차이: `codex-cli-control`=읽기전용 단발 질의 · `codex-deepwork`=일반 자율 작업(lazycodex 있으면 묻어감) ·
> **이 스킬**=lazycodex 자체를 *설치/관리*하고 *ultrawork(plan→work→verify)*를 명시적으로 구동.

## 전제

- `codex` CLI 설치 + 로그인(`codex --version`, `codex login status`).
- `node`/`npx` 사용 가능(LazyCodex는 npx로 설치/실행).

## A. 셋업 (설치/업데이트/점검)

`/lazycodex:setup [doctor|install|update|uninstall]` — 기본 `doctor`.

1. **점검 우선**: `command -v lazycodex` 와 `lazycodex doctor`로 현재 상태 확인. 이미 설치돼 OK면 재설치하지 말 것.
2. **설치(미설치 시)**: `npx --yes lazycodex-ai install --codex-autonomous` (TUI 없이 자동). `~/.codex`에 스킬/훅/에이전트를 깐다.
3. **업데이트**: `lazycodex update` (또는 `npx --yes lazycodex-ai update`).
4. **제거**: `lazycodex uninstall` (사용자 확정 후에만).
5. 끝나면 `lazycodex doctor`로 `System OK` 확인.

> ⚠️ **안전**: 설치/업데이트는 `~/.codex`(스킬·훅·에이전트·config)를 **수정**하고 npm/네트워크를 쓴다.
> 이미 동작 중인 Codex 설정을 건드리므로, 사용자 요청 없이 재설치/제거하지 마라. 자동 로그인은 하지 않는다.

## B. 사용 (ultrawork deep-work)

`/lazycodex:work task="<작업>" [cwd] [sandbox] [timeout_s]` — Codex에 plan→work→verify를 위임한다.

설치돼 있으면 `codex exec`가 ulw/omo 스킬을 자동 활성화한다(예: 코드 작업 시 `omo:programming` 로드 →
계획 추적 → 구현 → unittest/타입체커/LOC 검증 게이트). 절차:

1. **입력 검증(injection 방지, codex-deepwork와 동일 계약)**: `task`는 env(`CODEX_TASK`)→**stdin 전용**(argv 금지);
   `sandbox` enum(기본 `workspace-write`); `timeout_s` 양의 정수≤3600; `cwd` 존재 디렉터리; `model` `^[A-Za-z0-9._/-]+$`;
   알 수 없는 인자 거부; `--dangerously-bypass-*`/`danger-full-access` 자동 파생 금지.
2. **codex 존재 확인** → 없으면 안내 후 종료(자동 설치 금지; 설치는 `/lazycodex:setup`).
3. **실행**: `printf '%s' "$CODEX_TASK" | timeout "$TIMEOUT_S" codex exec --sandbox "$SANDBOX" --skip-git-repo-check -C "$CWD" -o "$OUT" -` (검증된 argv 배열).
   - ultrawork를 명시적으로 끌어내려면 작업 지시를 "계획하고, 구현하고, 테스트로 검증하라"처럼 다단계로 준다.
4. **결과**: `"$OUT"`(최종 메시지) 반환 + **"변경 검토(`git diff`/`git status`)" 안내** 동반. 자동 커밋/푸시 금지.
5. **실패**: 타임아웃 시 부분 결과를 완료로 보고하지 말 것; codex 미설치/미인증은 원인별 안내.

## bash 의사코드

```sh
# setup (점검 우선, 미설치 시에만 설치)
if ! command -v lazycodex >/dev/null || ! lazycodex doctor >/dev/null 2>&1; then
  npx --yes lazycodex-ai install --codex-autonomous
fi
lazycodex doctor    # System OK 확인

# work (injection-safe; 위 codex-deepwork 계약)
command -v codex >/dev/null || { echo "codex CLI not found. /lazycodex:setup 또는 codex 설치+login 먼저."; exit 1; }
OUT="$(mktemp -t lazycodex-XXXX.txt)"
CODEX_TASK="<task 원문>"
printf '%s' "$CODEX_TASK" | timeout "${TIMEOUT_S:-600}" codex exec --sandbox "${SANDBOX:-workspace-write}" --skip-git-repo-check -C "${CWD:-$PWD}" -o "$OUT" -
```

## 범위

**한다:** LazyCodex 설치/업데이트/점검/제거, Codex 통한 ultrawork(plan→work→verify) 작업 위임(파일 수정).
**Non-Goal:** codex/lazycodex 자동 로그인, App/CDP GUI 제어(→ `codex-app-control`), 읽기전용 단발 질의(→ `codex-cli-control`), 자동 커밋/푸시, opencode(Ultimate) 에디션 관리.
