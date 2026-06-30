---
description: 로컬 Codex CLI(codex exec)로 프롬프트 1개를 비대화형으로 보내고 Codex의 최종 답변을 반환한다. 기본 sandbox=read-only(안전). 데스크톱 App/CDP 불필요.
argument-hint: "prompt=<text> [sandbox=read-only|workspace-write] [model=<name>] [cwd=<dir>] [timeout_s=180]"
---

사용자가 로컬에 설치된 Codex CLI로 Codex에게 프롬프트 1개를 보내고 응답을 받으려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- `$ARGUMENTS`에서 `prompt`(필수)와 선택 인자(`sandbox`, `model`, `cwd`, `timeout_s`)를 파싱한다. 공백/특수문자가 섞인 긴 프롬프트는 `prompt="..."`(따옴표)로 받는다.
- `prompt`가 없으면 실행하지 말고 사용법 한 줄만 안내하고 끝낸다.
- **입력 검증(보안, injection 방지) — 실행 전 강제:**
  - `prompt`는 셸 명령에 직접 보간하지 말고 env(`CODEX_PROMPT`)에 담아 **stdin**으로만 넘긴다(argv에 넣지 않음).
  - `sandbox`는 정확히 `read-only`|`workspace-write`|`danger-full-access` 중 하나만(그 외 거부, 기본 `read-only`).
  - `timeout_s`는 양의 정수만(상한 600), `model`은 `^[A-Za-z0-9._/-]+$`만, `cwd`는 존재하는 디렉터리만. 위반 시 거부.
  - **알 수 없는 인자는 거부**한다(위 5개 키 외).
  - `--dangerously-bypass-approvals-and-sandbox`/`danger-full-access`는 인자에서 자동 파생하지 않는다.
- 검증 통과 시 **`codex-cli-ask` 스킬을 활성화**해 그 절차(codex 존재 확인 → 검증된 argv로 `codex exec ... -o <file> -`에 prompt를 stdin 전달 → `-o` 파일에서 최종 메시지 추출·반환)를 따른다. 검증 세부와 의사코드는 스킬의 "입력 검증 규칙"을 따르고, 이 커맨드는 파싱·검증·위임만 한다.
- **sandbox 기본값은 `read-only`.** 사용자가 명시하지 않으면 더 넓은 권한으로 올리지 않는다.
- **안전 경고**: `codex exec`는 Codex가 로컬에서 셸/파일 작업을 실행하게 한다. `workspace-write`/`danger-full-access`는 파일을 바꿀 수 있으니 명시적으로 원할 때만 쓰고, 신뢰할 수 있는 프롬프트만 보낸다.
