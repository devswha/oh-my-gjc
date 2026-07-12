---
description: git worktree 병렬 작업 폴더를 만들고·보고·정리한다. new <slug>는 origin/dev에서 <type>/<slug> 브랜치+../<repo>-<slug>-wt 폴더 생성, list는 상태 요약, clean은 머지 완료+클린 트리만 제거(--force 금지).
argument-hint: "[new <slug> [feat|fix|chore|docs] | list | clean]"
---

사용자가 worktree 작업을 요청했다. **worktree 스킬의 규약을 그대로 따른다**
(폴더 `../<repo>-<slug>-wt`, 브랜치 `<type>/<slug>`, 분기점 `origin/dev`,
정리는 머지 완료+클린+비잠금만, `--force` 금지).

입력 인자: $ARGUMENTS

처리 규칙:

- `new <slug> [type]` → 만들기. `type` 생략 시 `feat`. 실행 전에 같은 브랜치의
  worktree가 이미 있는지 `git worktree list`로 확인하고, 있으면 만들지 말고 그
  경로를 알려준다. 생성 후 한 줄 보고: 경로 + 브랜치 + 분기점. slug가 없으면
  사용법만 안내하고 멈춘다.
- `list` (또는 인자 없음) → 목록. worktree마다 `경로 · 브랜치 · clean|dirty(N) ·
  dev 대비 +ahead/-behind [· locked]` 한 줄씩. 메인 체크아웃은 "(main checkout)"
  표시.
- `clean` → 정리. 머지 완료(`git branch --merged dev`) + 클린 트리 + 비잠금인
  worktree만 `git worktree remove` + `git branch -d` + `git worktree prune`.
  제거한 것과 남긴 것(사유 포함)을 나눠 보고한다. dirty·미머지 항목은 절대
  지우지 않는다.
- 그 외 인자 → 사용법 한 줄: `/omg:worktree [new <slug> [type] | list | clean]`.

git 저장소가 아니거나 dev 브랜치가 없으면(원격 포함) 상황을 설명하고 안전하게
멈춘다 — dev가 없을 때 new는 main에서 분기하되 그 사실을 보고에 명시한다.
