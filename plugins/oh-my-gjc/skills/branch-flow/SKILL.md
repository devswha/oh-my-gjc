---
name: branch-flow
description: 이 레포의 git 브랜치·머지·릴리즈를 dev 통합 / main 릴리즈 모델로 진행하고, 병렬 세션은 git worktree로 분리한다. "새 작업 브랜치 만들어줘 / 브랜치 파줘 / dev에 머지해줘 / PR 열어줘 / 릴리즈하자 / 버전 올려서 배포 / 병렬로 작업 / 워크트리 파줘 / worktree 만들어 / 워크트리 목록 / 워크트리 정리 / 브랜치 정리" 같은 git 흐름 요청에 활성화한다. 전체 가이드는 레포의 docs/WORKFLOW.md. main 직접 커밋 금지, dev는 항상 main 이상, 릴리즈는 명시 지시 있을 때만. worktree 규약: 폴더 ../<repo>-<slug>-wt, 분기점 origin/dev, 정리는 머지 완료+클린만·에이전트 임의 --force/-D 금지.
---

# Branch Flow (dev 통합 / main 릴리즈)

이 레포의 브랜치·머지·릴리즈를 **dev 통합 / main 릴리즈** 모델로 수행한다.
정본 가이드는 레포의 **`docs/WORKFLOW.md`** — 있으면 먼저 읽고 그 "Repo specifics"
박스(기본 브랜치·통합 브랜치·버전 파일)를 따른다. 없으면 아래 기본값으로 진행하되
`/omg:branchflow-always on`으로 문서를 심을 것을 권한다.

## 브랜치 모델

```
feat|fix|chore|docs/<slug>  ──PR──▶  dev  ──release PR──▶  main
        (작업)                     (통합/검증)            (릴리즈)
```

- **main** — 릴리즈된 히스토리. **직접 커밋 금지.**
- **dev** — 통합/스테이징. 모든 작업이 여기서 먼저 합쳐지고 함께 검증된다.
- **`<type>/<slug>`** — 작업 1건 = 브랜치 1개, **dev에서 분기.** 접두사는 의도로 고른다:
  `feat/`(기능) · `fix/`(버그) · `chore/`(도구·의존성·리팩터) · `docs/`(문서).

**불변식:** dev는 항상 main과 같거나 앞선다. main에 핫픽스가 직접 들어갔으면
즉시 `main`→`dev` 머지로 되돌려 맞춘다. dev가 없으면 main에서 만들어 시작한다.

## 절대 규칙 (repo-safety와 정합)

- **명시 없이 commit·push·merge하지 않는다.** 이 스킬은 "커밋을 하라"가 아니라
  커밋/머지/릴리즈를 **할 때 어느 브랜치로 어떻게** 하는지를 규정한다.
- **main 직접 커밋·push 금지.** 항상 작업 브랜치 → dev, 릴리즈만 dev → main.
- **릴리즈(dev→main)는 사용자의 명시적 지시가 있을 때만.** 에이전트 자동 릴리즈 금지.
- **공유 브랜치(dev/main) push 전** `git fetch` 후 fast-forward만 확인. 히스토리
  재작성·force-push 금지. 남이 만든 변경은 revert/stash/reset 하지 않는다.

## 새 작업 시작

```bash
git switch dev && git pull
git switch -c feat/<slug>        # 의도에 따라 feat|fix|chore|docs
```
- 커밋은 작고 자족적으로, 메시지 명확히. 브랜치는 한 가지 일에 집중(커지면 쪼갠다).
- 이미 작업 브랜치 위에 있고 같은 일의 연속이면 새로 파지 말고 이어간다.

## dev에 통합 (머지)

작업 완료 + 로컬 테스트/린트 통과 후:
```bash
git push -u origin <type>/<slug>
gh pr create --base dev
```
- 원격+`gh` 있으면 **PR 기반**(CI/리뷰). 원격 없으면 로컬 `git merge --no-ff <branch>`로 dev에 합친다.
- 머지 방식: **merge 기준**. 작은 단일 기능 PR은 squash 허용.
- 머지되면 작업 브랜치 삭제(로컬+원격).

## 병렬 작업 — git worktree (동시 세션)

같은 폴더·같은 브랜치에서 두 세션이 일하면 서로를 밟는다. **세션당 worktree 1개 +
브랜치 1개**가 규율이다. 명령은 `/omg:worktree [new <slug> [type] | list | clean]`.
브랜치 모델 자체는 위(및 레포 `docs/WORKFLOW.md`)를 따른다.

### 이름 규약

```
폴더   ../<repo>-<slug>-wt          # 레포의 형제 디렉토리, -wt 접미사
브랜치 <type>/<slug>                # feat|fix|chore|docs — 위 브랜치 모델과 동일
```

- `<slug>`는 짧은 kebab-case 주제. tmux 세션에서 쓸 거면 **세션 이름과 slug를 맞춰라**
  — 관제탑·웹 앱 fleet 목록에서 어느 폴더가 누구 것인지 바로 읽힌다.
- 레포 안(하위 경로)에 worktree를 만들지 않는다 — 빌드/검색/워처가 오염된다.

### 만들기 (new)

```bash
git fetch origin
git worktree add ../<repo>-<slug>-wt -b <type>/<slug> origin/dev
```

- 분기점은 **origin/dev**(원격이 진실) — 로컬 dev가 뒤처져도 안전하고 현재 체크아웃을
  건드리지 않는다. 원격 dev가 없으면 로컬 `dev`, dev 자체가 없으면 `main`에서 분기하되
  **그 사실을 보고에 명시**한다(멈추는 경우는 git 저장소가 아닐 때뿐; dev가 없으면
  list/clean의 비교·머지 판정 기준도 main으로 대체).
- 만든 뒤 한 줄 보고: 경로 + 브랜치 + 분기점. 그 폴더에서 일할 세션엔 `cd` 경로만
  알려준다(이 세션은 옮겨가지 않는다). 같은 브랜치 worktree가 이미 있으면 새로 만들지
  말고 그 경로를 알려준다.

### 목록 (list)

`git worktree list --porcelain`을 읽고 worktree마다 한 줄:

```
<경로> · <브랜치> · clean|dirty(N개) · dev 대비 +ahead/-behind [· locked]
```

- dirty 판정: `git -C <path> status --porcelain`. ahead/behind:
  `git rev-list --left-right --count dev...<브랜치>`. 메인 체크아웃(첫 항목)은
  "(main checkout)"으로 표시.

### 정리 (clean) — 세 조건 전부 만족만 제거

1. 브랜치가 dev에 **머지 완료**(`git branch --merged dev`에 등장)
2. 트리가 **clean**(uncommitted/untracked 변경 없음)
3. locked 아님 + 메인 체크아웃 아님

```bash
git worktree remove ../<repo>-<slug>-wt
git branch -d <type>/<slug>          # -d: 미머지면 git이 거부(안전망)
git worktree prune
```

- 조건 미달 항목은 지우지 말고 **사유와 함께 남긴다**(dirty 3개 / 미머지 등).
- 어떤 경우에도 `git worktree remove --force`·`git branch -D`를 **스스로 쓰지 않는다**
  — 사용자가 그 worktree를 지목해 명시적으로 강제 삭제를 지시했을 때만 예외.
- 폴더가 이미 손으로 지워진 stale 항목은 `git worktree prune`으로만 정리한다.
- worktree 생성·제거는 **다른 세션의 작업물을 건드릴 수 있는 조작**이다 — dirty
  worktree는 그 세션의 진행 중 작업으로 간주하고 절대 지우지 않는다. worktree 안에서
  또 worktree를 파지 않는다(메인 체크아웃에서만 생성). 커밋/푸시/머지는 각 worktree의
  세션이 위 브랜치 모델대로 직접 한다.

## 릴리즈 (dev → main) — 명시 지시 있을 때만

```bash
git switch dev && git pull
# 1) 버전 파일 전부 bump(Repo specifics 참고) + 커밋
# 2) 전체 테스트·린트·릴리즈 게이트 로컬 실행
gh pr create --base main --head dev          # 릴리즈 PR (풀 CI)
# 3) green이면 MERGE(squash 아님) — 기능별 히스토리 보존
# 4) main에 태그, 배포/퍼블리시
git switch dev && git merge main             # 릴리즈 후 dev 재동기화
```

## 브랜치 정리

```bash
git branch -d <type>/<slug>                  # 머지 안 됐으면 거부(안전)
git push origin --delete <type>/<slug>
git fetch --prune
```
영구 브랜치는 `main`·`dev`와 실제 진행 중인 작업 브랜치만 남긴다.

## (선택) GitHub 브랜치 보호

사용자가 "강제로 막아줘"라고 하면, `gh`로 서버측 보호를 건다(동의·권한 확인 후):
main(및 dev)에 직접 push 차단 / PR 필수. 로컬 git 훅은 쓰지 않는다(클론에 안 따라감).
