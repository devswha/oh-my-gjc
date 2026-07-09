---
description: branch-flow(dev 통합 / main 릴리즈 브랜치 규율)를 이 레포에 상시 적용/해제한다. 레포의 커밋되는 AGENTS.md에 규칙 마커 블록을 넣고 docs/WORKFLOW.md를 복사한다. 인자 없거나 on이면 켜고, off면 끄고, status면 상태만 본다.
argument-hint: "[on|off|status]  (기본: on)"
---

# /omg:branchflow-always

이 레포에 **dev 통합 / main 릴리즈** 브랜치 규율을 상시 적용한다. gjc가 매 턴
컨텍스트로 읽는 **이 레포의 `AGENTS.md`**(커밋되는 파일)에 규칙 마커 블록을 심고,
전체 가이드 **`docs/WORKFLOW.md`**를 레포에 복사한다. 마커 블록의 존재가 on/off
세마포어다. 스코프는 **레포별(project)** — 브랜치 전략은 레포마다 다른 도크트린이라
사용자 전역이 아니라 이 레포에만 적용한다.

입력 인자: `$ARGUMENTS` → 비었거나 `on`=켜기, `off`=끄기, `status`=상태만.

## Step 0 — 경로 해석

```bash
REPO="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO" ] && { echo "git 레포가 아니다 — 레포 루트에서 실행해라."; exit 1; }
# WORKFLOW.md 원본(플러그인 references) 해석 — 코어 고유 파일로 anchor
P="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/references/WORKFLOW.md 2>/dev/null | sort -V | tail -1)"
[ -z "$P" ] && [ -f plugins/oh-my-gjc/references/WORKFLOW.md ] && P="plugins/oh-my-gjc/references/WORKFLOW.md"
echo "REPO=$REPO  WORKFLOW_SRC=$P"
```

## 관리 대상 블록 (구분자 고정)

`$REPO/AGENTS.md` 안에서 아래 두 마커 사이 구간만 이 커맨드가 소유한다.
켤 때는 이 블록을 넣거나 최신 내용으로 교체하고, 끌 때는 이 블록만 제거한다.
**마커 밖의 다른 내용은 절대 건드리지 않는다.**

```
<!-- BEGIN oh-my-gjc:branchflow -->
## 브랜치 & 릴리즈 규율 (branch-flow)

이 레포는 **dev 통합 / main 릴리즈** 모델을 따른다. 전체 가이드: `docs/WORKFLOW.md`.

- **작업 브랜치**: `dev`에서 분기, 작업 1건 = 브랜치 1개. 접두사는 의도로 —
  `feat/`(기능) · `fix/`(버그) · `chore/`(도구·의존성·리팩터) · `docs/`(문서) + 슬러그.
- **통합**: 작업 브랜치 → **PR로 `dev`에 머지** (작은 단일 기능은 squash 허용, 그 외 merge).
  원격/`gh` 없으면 로컬 `git merge --no-ff`.
- **릴리즈**: **명시적 지시가 있을 때만** `dev` → `main` 머지 PR + 버전 bump + `main` 태그.
  이후 `main` → `dev` 재동기화. 에이전트 자동 릴리즈 금지.
- **불변식**: `main`에 직접 커밋·push 금지. `dev`는 항상 `main`과 같거나 앞선다.
  `dev` 없으면 `main`에서 만들어 시작.
- **병렬 세션**: git worktree (세션당 폴더+브랜치, `dev`에서 분기, `dev`로 합류).
  같은 폴더·같은 브랜치 동시 사용 금지.
- **안전**: 공유 브랜치(`dev`/`main`) push 전 `git fetch` 후 fast-forward만 확인,
  히스토리 재작성·force-push 금지. 남이 만든 변경 revert/stash/reset 금지. 머지된 브랜치 삭제.

끄기: `/omg:branchflow-always off`
<!-- END oh-my-gjc:branchflow -->
```

## 처리 규칙

대상 파일: `$REPO/AGENTS.md` (레포의 커밋되는 컨텍스트 파일).

### `status`
- `$REPO/AGENTS.md`에 `<!-- BEGIN oh-my-gjc:branchflow -->` 마커가 있으면
  `branch-flow 상시: 켜짐`, 없으면 `branch-flow 상시: 꺼짐` 한 줄만 출력하고 끝낸다.
- `$REPO/docs/WORKFLOW.md` 존재 여부도 한 줄로 덧붙인다.

### `on` (기본)
1. `$REPO/AGENTS.md`가 없으면 새로 만든다(빈 파일에서 시작).
2. 있으면 먼저 백업: `cp "$REPO/AGENTS.md" "$REPO/AGENTS.md.bak-$(date +%s)"`.
3. 마커 블록이 이미 있으면 그 구간(BEGIN~END 포함)만 위 최신 블록으로 **교체**한다.
   없으면 파일 **맨 끝에** 위 블록을 추가한다(앞에 빈 줄 1개). 마커 밖 내용은 보존.
4. **`docs/WORKFLOW.md` 복사**: `$REPO/docs/WORKFLOW.md`가 없으면
   `mkdir -p "$REPO/docs" && cp "$P" "$REPO/docs/WORKFLOW.md"`. 이미 있으면 덮지 말고
   "이미 존재 — 갱신하려면 알려달라"고 안내한다.
5. 복사한 `docs/WORKFLOW.md`의 **"Repo specifics" 박스**를 이 레포 값으로 채운다:
   기본 브랜치(`git symbolic-ref --short refs/remotes/origin/HEAD` 또는 현재), 통합 브랜치는
   `dev`, 버전 파일은 감지(`package.json`·`plugin.json`·`Cargo.toml` 등)해 나열.
6. `dev` 브랜치가 없으면 "dev 브랜치가 아직 없다 — `git switch <default> && git switch -c dev && git push -u origin dev`로 만들 것"을 안내한다(자동 생성하지 않음).
7. `branch-flow 상시: 켜짐 ($REPO/AGENTS.md + docs/WORKFLOW.md)` 한 줄로 확인하고,
   **이 변경은 커밋 대상**임을 알린다(`git add AGENTS.md docs/WORKFLOW.md`).

### `off`
1. `$REPO/AGENTS.md`가 없거나 마커가 없으면 `branch-flow 상시: 이미 꺼짐` 한 줄만 출력하고 끝낸다.
2. 있으면 백업(위와 동일) 후 마커 블록만 제거한다(주변 빈 줄 정리). 마커 밖 내용은 보존.
3. `docs/WORKFLOW.md`는 문서라 **자동 삭제하지 않는다** — 지우려면 사용자에게 확인받는다.
4. `branch-flow 상시: 꺼짐` 한 줄로 확인하고, 커밋 대상임을 알린다.

### 그 외 인자
사용법 한 줄만 안내: `/omg:branchflow-always [on|off|status]`.
