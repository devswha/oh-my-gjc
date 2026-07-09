---
description: 코딩 작업을 Codex에 자율로 위임해 파일을 직접 수정/생성하게 한다(codex exec, 기본 workspace-write). LazyCodex가 설치돼 있으면 deep-work 스킬·검증을 자동 활용. 읽기전용 질의는 /omg:codex-ask 사용.
argument-hint: "task=<작업 지시> [cwd=<dir>] [sandbox=workspace-write|read-only] [model=<name>] [timeout_s=600]"
---

사용자가 코딩 작업을 Codex에 자율로 위임해 파일을 직접 고치게 하려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- `$ARGUMENTS`에서 `task`(필수)와 선택 인자(`cwd`, `sandbox`, `model`, `timeout_s`)를 파싱한다. 공백/특수문자가 섞인 긴 작업 지시는 `task="..."`(따옴표)로 받는다.
- `task`가 없으면 실행하지 말고 사용법 한 줄만 안내하고 끝낸다.
- **입력 검증(보안, injection 방지) — 실행 전 강제:**
  - `task`는 셸 명령에 직접 보간하지 말고 env(`CODEX_TASK`)에 담아 **stdin**으로만 넘긴다(argv에 넣지 않음).
  - `sandbox`는 정확히 `read-only`|`workspace-write`|`danger-full-access` 중 하나만(그 외 거부, 기본 `workspace-write`).
  - `timeout_s`는 양의 정수만(상한 3600), `model`은 `^[A-Za-z0-9._/-]+$`만, `cwd`는 존재하는 디렉터리만. 위반 시 거부.
  - **알 수 없는 인자는 거부**한다(위 5개 키 외).
  - `--dangerously-bypass-approvals-and-sandbox`/`danger-full-access`는 인자에서 자동 파생하지 않는다.
- 검증 통과 시 **`codex-deepwork` 스킬을 활성화**해 그 절차(codex 존재 확인 → 검증된 argv로 `codex exec --sandbox <mode> --skip-git-repo-check -C <cwd> -o <file> -`에 task를 stdin 전달 → 최종 메시지 반환 + 변경 검토 안내)를 따른다. 검증 세부는 스킬의 "입력 검증 규칙"을 따르고, 이 커맨드는 파싱·검증·위임만 한다.
- **⚠️ 안전**: 이 작업은 **파일을 실제로 바꾼다**. git 리포에서 실행하고 끝나면 `git diff`/`git status`로 변경을 검토하라. 신뢰할 수 있는 작업 지시만 위임하고, `workspace-write`보다 넓은 권한은 명시적으로 원할 때만 쓴다.
- 작업이 끝나면 Codex의 최종 메시지와 함께 **"변경된 파일을 검토하라"**는 안내를 반드시 낸다. 자동 커밋/푸시는 하지 않는다.
