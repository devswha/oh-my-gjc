---
description: 현재 레포에서 3게이트 릴리스 절차를 실행한다 — 검증 → fresh-context 교차리뷰(VERDICT, fail-closed) → 인간 승인(자기 승인 금지) → main 머지·태그·발행 + 증거 문서.
argument-hint: "[<버전> [<한 줄 요약>]]  (기본: 버전 자동 제안)"
---

# /omg:release

`release-gate` 스킬의 3게이트 절차를 현재 레포에 대해 실행한다. 세부 계약(fail-closed·
재서명 ≤2라운드·자기 승인 금지·fix-forward 롤백)은 스킬 본문이 정답지다 — 여기서는
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
4. REQUEST_CHANGES ⇒ 블로커 수정 → 커밋 → **새** 리뷰어로 **새 HEAD에** 재서명(최대 2라운드).
   verdict 부재/기형/타임아웃도 동일하게 불통과. 한도 소진 시 릴리스 중단 + 사용자 보고.

## Step 3 — Gate 3: 인간 승인

게이트 1·2 증거 요약과 **최종 후보 커밋 해시**를 제시하고 사용자 승인을 요청하고 멈춘다.
**작업 시작 전의 "릴리스해라" 지시는 착수 권한이지 발행 승인이 아니다** — 최종 후보가
확정된 지금 명시 확인을 받은 뒤에만 Step 4로 간다. **자기 승인 금지.**

## Step 4 — 발행 + 증거

1. 증거 문서 작성·커밋: `docs/verification/<repo>-release-v<ver>-<날짜>.md`
   (G1 결과표 · G2 전 라운드 verdict와 수정 커밋 · G3 승인 근거 · 빈도 캡 예외 시 사유).
2. 발행 경로는 레포 거버넌스 우선: branch-flow/브랜치 보호가 있으면 release PR
   (`gh pr create --base main --head dev`) + CI 통과 후 머지, 없으면
   `git checkout main && git merge --no-ff dev` → `git tag -a v<ver>` → push(main+tags).
3. 릴리스 발행(예: `gh release create v<ver>`) — 노트에 변경 요약·게이트 증거 링크.
4. 작업 브랜치로 복귀. 결과(태그·URL·증거 경로)를 보고한다.
