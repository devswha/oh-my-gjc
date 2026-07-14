# v0.14.0 릴리스 — 공개 릴리스 게이트 증거 (2026-07-14)

하코 직접 발주("0.14 배포되게 만들어놔 메인 브랜치"). main은 v0.11.0에 머물러 있으므로
이 릴리스는 **미발행 v0.12.0 번들 + 0.14.0 번들을 합본**해 dev→main으로 나간다
(하루 1회 규정 충족: 직전 발행 v0.11.0 = 07-13, 오늘 발행분 없음).

## 0. 릴리스 범위 (기준 태그 `v0.11.0`, 14 commits)

- **v0.12.0 번들(기발행 보류분, Gate 1–2 증거는 `omg-release-v0.12.0-2026-07-13.md`):**
  codex-cli-ask·lazycodex·tower 제거 + worktree 스킬 branch-flow 흡수 → 8 skills / 13 commands.
- **plain-layer 신설:** 선택지 번역 + 인터뷰 후 대화식 스펙 다듬기 + gate-briefing 위임
  (`/omg:plain`, 세션 한정). 스킬+커맨드+테스트(plain-layer.test.ts).
- **gajae-app 소유권 이관:** 대상은 devswha/claudecodeui(SELF-HOST 문서)로 이전.
  네이티브 skill/command **파일만** `REMOVED_*` 스윕 — 앱 체크아웃·서비스·데이터·네트워크
  상태는 불변(installer 주석·setup.md·INSTALLATION에 명문화). 테스트(gajae-app-removal.test.ts).
- **presets v0.7:** gajae-code `docs/gpt-5.6-codex-preset-benchmark.md` 반영 —
  grok·sol executor `terra:high`→`terra:xhigh` 승격(selected 6/11 vs 9/12+broad 8/8;
  executor는 벤치가 직접 측정한 유일 역할) + `codex` 단일 로그인 프리셋 신설(상류 codex-pro
  골격 + executor terra:xhigh). `/omg:presets [grok|sol|codex|all]`. 테스트(presets.test.ts).
- 매니페스트: `EXPECTED_SKILLS` **8**(gajae-app→plain-layer) / `EXPECTED_COMMANDS` **13**
  (gajae-app→plain); `REMOVED_*`에 gajae-app 추가. 버전 0.14.0 (marketplace/plugin.json,
  description에 plain-layer + codex 프리셋 반영).

## 1. Static

| 항목 | 결과 |
|---|---|
| JSON parse (marketplace.json, plugin.json) | OK, 버전 0.14.0 |
| `bash -n` (install.sh, install-skill.sh) | OK |
| YAML parse (references/presets.yml) | OK — profiles: grok·sol·codex |

## 2. 단위 테스트 — 61 pass / 0 fail (bun 1.3.14)

plugins/oh-my-gjc: **43 pass** (collect 26 · plain-layer · gajae-app-removal · presets 신규
포함, 4 files) + ops/tools: **18 pass** (trigger 15 · e2e-bridge 3).
presets.test.ts는 3프리셋 좌석·provider 정합·전 프리셋 executor=terra:xhigh 회귀를 고정.

## 3. Fresh install smoke (격리 HOME, `install.sh --candidate-ref` 로컬 dev)

| 지표 | 값 |
|---|---|
| install.sh rc | **0** |
| cache | `oh-my-gjc___oh-my-gjc___0.14.0` |
| native_skills | **8** (branch-flow, easy-answer, extragoal, gate-briefing, gjc-bugwatch, insane-review, multivendor-presets, **plain-layer**) |
| native_commands | **13** (`omg.md` + 12 `omg:*.md`, **`omg:plain.md` 포함**) |
| gajae-app 스킬/커맨드 | 부재(correct) |

## 4. 업그레이드 sweep (`cleanup_removed`)

gajae-app 잔존물(skill dir + `omg:gajae-app.md`) 심고 재설치: rc=0, 둘 다 제거 확인,
sweep 후 native_skills=8 / native_commands=13.

## 5. Fail-closed preflight

payload에서 expected 2개(`skills/plain-layer/SKILL.md`, `templates/plain.md`) 삭제 후
`install-skill.sh all`: rc=**1**, missing list 2건 열거, 부분 설치 없음(skills=0, commands=0).

## 6. 셀렉터 실호출 (GJC_NOTIFICATIONS=0, 2026-07-14)

신규 좌석 4종 `terra:xhigh`·`sol:medium`·`sol:high`·`sol:max` 전건 "OK" rc=0.
`gjc --mpreset codex -p "Reply OK"` e2e OK. (⚠ grok 활성은 grok-build 잔액 402 —
설정 무관, 프로파일 라우팅 자체는 정상.)

## 7. Gate 2 — extragoal 교차 리뷰 (cross-family, fresh context)

리뷰어: `GJC_NOTIFICATIONS=0 gjc -p --no-session --model openai-codex/gpt-5.6-sol:xhigh
--tools read,search,find`, 입력 = `git diff v0.11.0..HEAD` + 레포 읽기 권한.
점검 지시: 카운트 정합·REMOVED 스윕·presets 정합·안전계약 불약화·회귀.

**Round 1 (candidate 3c098c5): VERDICT: REQUEST_CHANGES** — 5건, 전건 fix-forward(60b6888):
1. plain-layer sanctioned-write 스니펫이 커맨드-로컬 할당으로 빈 spec 전달 → **export + 비어있지
   않음 가드**로 교체, 정적 회귀 + stub-gjc 행동 테스트(--spec 비공백 수신 증명) 추가.
2. presets 레거시 정리가 AGENTS 병합 계약과 모순 → 계약을 "은퇴 프리셋 목록 한정·동의 게이트"로
   정합 + 보존 테스트(정리 문단에 활성 프리셋 이름 금지) 추가.
3. 커맨드 카운트 표기 불일치 → 전 표면 "13 commands (/omg + 12 /omg:*)" 통일, AGENTS "=14" 오기 정정.
4. stale 참조 2건(plain-layer hook 8/13, codex-deepwork 묘비의 lazycodex-work 방향 지시) 정정.
5. provenance MARKERS에 `references/presets.yml`·`skills/plain-layer/SKILL.md` 추가(py_compile OK).

수정 후 단위 테스트 **46 pass / 0 fail**(신규 회귀 3건 포함), `bash -n`·JSON parse OK.

**Round 2 (re-sign, candidate 60b6888): VERDICT: (수신 후 기록)**

## 8. 판정

Gate 1 **PASS**. Gate 2 round-2 verdict 수신 후 본 절 갱신. Gate 3 = 하코 직접 발주(본 릴리스의
발원 지시 "0.14 배포되게 만들어놔 메인 브랜치")로 충족 — 발행: dev→main 머지 + `v0.14.0` 태그 +
GitHub Release.
