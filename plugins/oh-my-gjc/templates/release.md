---
description: 현재 레포에서 3게이트 릴리스 절차를 실행한다 — 검증 → fresh-context 교차리뷰(VERDICT, fail-closed) → 인간 승인(자기 승인 금지) → main 머지·태그·발행 + 증거 문서.
argument-hint: "[<버전> [<한 줄 요약>]]  (기본: 버전 자동 제안)"
---

# /omg:release

`release-gate` 스킬의 3게이트 절차를 현재 레포에 대해 실행한다. 세부 계약(fail-closed·
무제한 fix/re-sign·자기 승인 금지·fix-forward 롤백)은 스킬 본문이 정답지다 — 여기서는
실행 순서만 정의한다.

## Step 0 — 범위 확정

- 직전 릴리스 태그(`git describe --tags --abbrev=0` 또는 최신 `v*` 태그)와 HEAD 사이
  디프가 릴리스 범위다. 디프가 비면 릴리스할 것이 없다고 안내하고 멈춘다.
- `$ARGUMENTS`에서 버전을 받는다. 없으면 변경 성격으로 semver를 제안한다
  (표면/기능 추가=minor, 문서·수정=patch) — 사용자에게 확인받고 진행.
- 버전 필드가 있는 매니페스트(package.json, plugin.json 등)를 전부 찾아 범프한다.

## Step 1 — Gate 1: 검증

레포가 가진 검증 수단을 전부 실행하고 결과를 기록한다:
- 파스 검사(JSON/YAML/`bash -n`), 테스트 러너(전건 통과 필수),
  격리 환경 신규 설치/빌드 재현(가능한 경우 — 불가하면 pending-environment 명시).
- 하나라도 실패하면 여기서 멈추고 고친다. 게이트 우회 금지.

## Step 2 — Gate 2: 외부 교차리뷰 (fail-closed)

1. **클린 트리 확정:** 버전 범프 포함 모든 변경을 커밋하고 `git status --porcelain`이
   비어 있는지 확인 — 서명 대상은 그 HEAD로 고정(서명 후 커밋 추가 시 그 서명 무효).
2. `git diff <직전태그>..HEAD > /tmp/<repo>-release-<ver>.diff` + 시크릿 스캔(발견 시 중단).
3. 리뷰어 기동(작업 맥락 미공유, 읽기 3도구만 — `goal` 등 상태 도구 미노출; 가능하면
   저작 모델과 교차 패밀리, 불가 시 사유 기록):
   ```
   GJC_NOTIFICATIONS=0 gjc -p --no-session --model <셀렉터> \
     --tools read,search,find "<릴리스 요약 + 디프 경로 + 구체 점검 항목 + \
     마지막 줄에 정확히 'VERDICT: APPROVE' 또는 'VERDICT: REQUEST_CHANGES'만 출력>"
   ```
4. REQUEST_CHANGES ⇒ 블로커 수정 → 커밋 → **새** 리뷰어로 **새 HEAD에** 재서명한다.
   verdict 부재/기형/타임아웃도 동일하게 불통과지만, 재서명 횟수에는 상한을 두지 않는다.
   실제 blocker를 고치고 Gate 1부터 반복하며 횟수 제한만으로 릴리스를 중단하지 않는다.

## Step 3 — Gate 3: 인간 승인

게이트 1·2 증거 요약과 **최종 후보 커밋 해시**를 사용자에게 보고한다. **자기 승인 금지.**
- 사용자가 이 릴리스를 **이미 명시 지시**했으면 → 보고와 동시에 Step 4 진행(지시가 곧 승인, 증거 문서에 기록).
- 지시가 없었으면 → 보고 후 **멈추고** 명시 확인을 기다린다.

## Step 4 — 발행 + 증거 (승인된 HEAD 그대로)

0. **빈도 캡 확인:** 당일 이미 발행된 릴리스가 있으면 — 긴급 security/install-breakage
   수정이거나 사용자 명시 지시(사유 기록)가 아닌 한 — 발행을 멈추고 다음 날 번들을 안내한다.
1. **승인된 HEAD를 그대로 발행한다** (발행 전 어떤 커밋도 추가 금지 — 추가되면 승인 무효,
   Gate 2부터 다시). **트리 동일성 검사는 태그·push 전에, fail-closed로:**
   - 로컬 경로(branch-flow 없음): `git checkout main && git merge --no-ff dev` →
     **push 전에** `git diff <승인해시>..main --stat` 확인. 비어 있지 않으면 즉시 중단하고
     `git reset --hard origin/main`으로 main을 복구한다(태그·push 금지).
     비어 있을 때만 `git tag -a v<ver>` → push(main+tags).
   - PR 경로(branch-flow/브랜치 보호): release PR(`gh pr create --base main --head dev`)
     + CI 통과 후 머지 → `git fetch origin main` 후 `git diff <승인해시>..origin/main --stat`
     확인. 비어 있지 않으면 태그를 만들지 않고 중단·보고한다. 비어 있을 때만 태그·발행.
2. 릴리스 발행(예: `gh release create v<ver>`) — 노트에 변경 요약·게이트 증거 링크.
3. **발행 후** 증거 문서를 dev에 docs-only 커밋: `docs/verification/<repo>-release-v<ver>-<날짜>.md`
   (G1 결과표 · G2 전 라운드 verdict와 수정 커밋 · G3 승인 근거와 승인 해시 · 빈도 캡
   예외 시 사유). 릴리스 태그 밖이므로 승인을 무효화하지 않는다.
4. 작업 브랜치로 복귀. 결과(태그·URL·증거 경로)를 보고한다.
