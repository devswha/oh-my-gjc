---
name: branch-flow
description: 이 레포의 git 브랜치·머지·릴리즈를 dev 통합 / main 릴리즈 모델로 진행한다. "새 작업 브랜치 만들어줘 / 브랜치 파줘 / dev에 머지해줘 / PR 열어줘 / 릴리즈하자 / 버전 올려서 배포 / 병렬로 작업 / worktree / 브랜치 정리" 같은 git 흐름 요청에 활성화한다. 전체 가이드는 레포의 docs/WORKFLOW.md. main 직접 커밋 금지, dev는 항상 main 이상, 릴리즈는 명시 지시 있을 때만.
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

## 병렬 작업 (동시 세션)

같은 폴더·같은 브랜치에서 두 세션 금지. **git worktree**로 분리:
```bash
git worktree add ../<repo>-x -b feat/x dev   # 별도 폴더+브랜치, dev에서 분기
git worktree remove ../<repo>-x              # 완료 후(커밋/푸시 먼저)
```
- 세션당 worktree 1개 + 브랜치 1개. 충돌은 dev 머지 지점에서 한 번에 해소.

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
