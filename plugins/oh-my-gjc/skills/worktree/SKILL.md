---
name: worktree
description: git worktree로 병렬 작업 폴더를 규율 있게 만들고·보고·정리한다. "워크트리 파줘 / worktree 만들어 / 병렬로 작업하게 폴더 분리 / 다른 세션이랑 동시에 작업 / 워크트리 목록 / 워크트리 정리해줘" 같은 요청에 활성화한다. branch-flow(dev 통합/main 릴리즈)와 한 몸 — 브랜치는 dev에서 분기, 이름은 <type>/<slug>, 폴더는 ../<repo>-<slug>-wt. 정리는 머지 완료 + 클린 트리만, --force 금지.
---

# Worktree (병렬 세션 작업 폴더)

같은 폴더·같은 브랜치에서 두 세션이 일하면 서로를 밟는다. **세션당 worktree 1개 +
브랜치 1개**가 규율이다. 이 스킬은 branch-flow(dev 통합 / main 릴리즈)의 병렬 작업
절을 실행 가능한 절차로 만든 것 — 브랜치 모델 자체는 branch-flow(레포의
`docs/WORKFLOW.md`)를 따른다.

## 이름 규약

```
폴더   ../<repo>-<slug>-wt          # 레포의 형제 디렉토리, -wt 접미사
브랜치 <type>/<slug>                # feat|fix|chore|docs — branch-flow와 동일
```

- `<slug>`는 짧은 kebab-case 한 단어 주제. tmux 세션에서 쓸 거면 **tmux 세션
  이름과 slug를 맞춰라** — 관제탑·웹 앱의 fleet 목록에서 어느 폴더가 누구 것인지
  바로 읽힌다.
- 레포 안(하위 경로)에 worktree를 만들지 않는다 — 빌드/검색/워처가 오염된다.

## 만들기 (new)

```bash
git fetch origin
git worktree add ../<repo>-<slug>-wt -b <type>/<slug> origin/dev
```

- 분기점은 **origin/dev**(원격이 진실) — 로컬 dev가 뒤처져 있어도 안전하고, 현재
  체크아웃을 전혀 건드리지 않는다. 원격이 없으면 로컬 `dev`, dev가 없으면 `main`.
- 만든 뒤 한 줄 보고: 폴더 경로 + 브랜치 + 분기점. 그 폴더에서 일할 세션에는
  `cd` 경로만 알려주면 된다(이 세션이 옮겨가지 않는다).
- 이미 같은 브랜치의 worktree가 있으면 새로 만들지 말고 그 경로를 알려준다.

## 목록 (list)

`git worktree list --porcelain`을 읽고 worktree마다 한 줄로:

```
<경로> · <브랜치> · clean|dirty(N개) · dev 대비 +ahead/-behind [· locked]
```

- dirty 판정: 그 worktree 경로에서 `git -C <path> status --porcelain`.
- ahead/behind: `git rev-list --left-right --count dev...<브랜치>`.
- 메인 체크아웃(첫 항목)도 함께 보여주되 "(main checkout)"으로 표시한다.

## 정리 (clean)

**세 조건을 전부 만족하는 worktree만** 제거한다:

1. 브랜치가 dev에 **머지 완료** (`git branch --merged dev`에 등장)
2. 트리가 **clean** (uncommitted/untracked 변경 없음)
3. locked 아님 + 메인 체크아웃 아님

```bash
git worktree remove ../<repo>-<slug>-wt
git branch -d <type>/<slug>          # -d: 미머지면 git이 거부(안전망)
git worktree prune
```

- 조건 미달 항목은 지우지 말고 **사유와 함께 남긴다**(dirty 3개 / 미머지 등).
- 어떤 경우에도 `git worktree remove --force`·`git branch -D`를 스스로 쓰지
  않는다 — 사용자가 그 worktree를 지목해 명시적으로 강제 삭제를 지시했을 때만.
- 폴더가 이미 손으로 지워진 stale 항목은 `git worktree prune`으로만 정리한다.

## 절대 규칙 (repo-safety와 정합)

- worktree 생성·제거는 **다른 세션의 작업물을 건드릴 수 있는 조작**이다 — dirty
  worktree는 그 세션의 진행 중 작업으로 간주하고 절대 지우지 않는다.
- 이 스킬은 커밋/푸시/머지를 하지 않는다 — 그건 각 worktree의 세션이 branch-flow
  대로 직접 한다.
- worktree 안에서 또 worktree를 파지 않는다(메인 체크아웃에서만 생성).
