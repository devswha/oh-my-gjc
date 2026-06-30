---
description: LazyCodex가 설치된 Codex로 plan→work→verify(ultrawork) 코딩 작업을 자율 위임한다(codex exec, 기본 workspace-write — 파일 수정). 읽기전용 질의는 codex-cli-control 사용.
argument-hint: "task=<작업 지시> [cwd=<dir>] [sandbox=workspace-write|read-only] [model=<name>] [timeout_s=600]"
---

사용자가 LazyCodex(ultrawork)로 코딩 작업을 Codex에 자율 위임하려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- `task`(필수)와 선택 인자(`cwd`,`sandbox`,`model`,`timeout_s`)를 파싱. 공백/특수문자 섞인 긴 작업은 `task="..."`로.
- `task`가 없으면 사용법 한 줄만 안내하고 끝낸다.
- **입력 검증(injection 방지, 실행 전 강제):**
  - `task`는 셸에 보간하지 말고 env(`CODEX_TASK`)→**stdin**으로만 전달.
  - `sandbox`는 `read-only`|`workspace-write`|`danger-full-access` 중 하나만(기본 `workspace-write`).
  - `timeout_s`는 양의 정수만(상한 3600), `model`은 `^[A-Za-z0-9._/-]+$`만, `cwd`는 존재 디렉터리만. 위반 시 거부.
  - 알 수 없는 인자 거부. `--dangerously-bypass-*`/`danger-full-access` 자동 파생 금지.
- 검증 통과 시 **`lazycodex` 스킬을 활성화**해 "B. 사용" 절차를 따른다: codex 존재 확인 → 검증된 argv로 `codex exec --sandbox <mode> --skip-git-repo-check -C <cwd> -o <file> -`에 task를 stdin 전달. LazyCodex가 설치돼 있으면 ulw/omo 스킬(계획→구현→검증)이 자동 엔게이지된다. 미설치면 `/lazycodex:setup install` 먼저 안내.
- ultrawork를 끌어내려면 작업 지시를 "계획→구현→테스트 검증"처럼 다단계로 준다.
- **⚠️ 안전**: 파일을 실제로 바꾼다(기본 workspace-write). git 리포에서 실행하고 끝나면 `git diff`/`git status`로 검토. 자동 커밋/푸시 안 함. 신뢰할 수 있는 작업 지시만 위임.
- 결과는 Codex 최종 메시지 + **변경 검토 안내**를 함께 낸다.
