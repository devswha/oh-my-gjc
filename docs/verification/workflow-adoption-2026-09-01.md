# 워크플로 도입 검증 — patina 방식 수용 (2026-09-01)

하코 승인 하에 patina(`~/workspace/patina`의 `AGENTS.md` + `docs/WORKFLOW.md` +
`GOVERNANCE.md` + `scripts/`)에서 이 저장소 워크플로로 가져올 항목을 전량 도입했다.
플러그인 설치면(templates/skills/bin/매니페스트)은 변경 없음 — 버전 bump·태그 없음.

## 도입 항목과 커밋

1. **dev-drift 방지 규칙** (`c2b27c7`) — AGENTS.md Git autonomy에 "dev must never
   drift behind main" 명시. 도입 직후 dev를 main으로 fast-forward(`a9b80a9..c2b27c7`,
   13커밋 drift 해소).
2. **CI 테스트 워크플로** (`86f9c69`) — `.github/workflows/test.yml`: bun 1.4.0,
   push(main)/PR 트리거, 정적 검사(매니페스트 JSON 파스 + `bash -n`) +
   `bun test plugins/oh-my-gjc/test`. 이전까지 테스트 스위트(12→14개 파일)는
   로컬 수동 실행뿐이었다.
3. **version-sync 게이트** (`86f9c69`) — `test/version-sync.test.ts`: 세 버전 필드
   (`plugin.json`, `marketplace.json` metadata + plugins[0]) 상호 일치 + semver 형식
   + name parity. 릴리스 흐름상 bump-후-태그-전 창이 있으므로 태그와는 비교하지
   않는다(필드 간 일치만 검사 — patina `check-release-metadata.mjs` 방식).
4. **retired-surfaces 게이트** (`86f9c69`) — `test/retired-surfaces.test.ts`:
   은퇴 목록을 `install-skill.sh`의 `REMOVED_SKILLS`/`REMOVED_COMMANDS`/
   `LEGACY_COMMANDS` 배열에서 직접 소싱(향후 제거 시 게이트 자동 확장).
   설치면(templates/, skills/, references/, 매니페스트 2종, 루트 install.sh)에서
   `omg:<은퇴커맨드>` 토큰·legacy 네임스페이스 커맨드·`skills/<은퇴스킬>` 경로
   부정 + templates/skills 디렉터리가 정준 5+5와 정확히 일치해야 통과.
   `bin/install-skill.sh` 자체는 예외 — `cleanup_removed`가 은퇴 잔존물 삭제를
   위해 이름을 참조하는 게 직무다(문자열 스캔 대신 별도 계약 테스트가 담당).
   변이 검증: setup.md에 `omg:ouroboros-setup`·`skills/tower/` 프로브 삽입 시
   2개 단언이 실제로 실패함을 확인 후 복구.
5. **Git 규칙 3종** (`1a0c5f9`) — worktree-per-session(병렬 세션), push 전
   fast-forward 검증(`git fetch` + `merge-base --is-ancestor`), 머지된 브랜치
   삭제+prune.
6. **묘비 슬리밍** (`1a0c5f9`) — AGENTS.md의 16개 `(REMOVED …)` 섹션(약 8KB)을
   한 줄 배경+청소 경계 표로 압축, 전문 원문 그대로 `docs/removed/tombstones.md`
   로 이전(2026-07-21 아카이브 지침과 양립 — 묘비의 배경/경계 기록 의무는 표가
   계속 담당). AGENTS.md 267→234줄. `docs/removed/README.md` 인덱스 갱신.
7. **브랜치 보호(기계적 서브셋)** (설정 변경, 커밋 없음) — main/dev 양쪽:
   force-push 차단, 삭제 차단, PR 리뷰 요구 **없음**(2026-07-19 자율화 지시 유지),
   `enforce_admins=false`(비상 복구 경로). 실측: `gh api .../protection` GET로
   `force_pushes=false, deletions=false, required_pr_reviews=false` 확인.

## 브랜치 청소

- `pr-26-fixes`(main에 머지 완료, `git branch -d` 안전 삭제 확인) 제거.
- `refs/remotes/contributor/pr26` 잔류 ref 제거(contributor 리모트는 이미 config에
  없음). `git fetch --prune origin` 실행. 잔존 브랜치: main, dev뿐.

## 첫 CI 실행 실패 → 근본 수정

첫 CI run(`33427740726`, 12s)에서 4 fail / 1 skip:

- **3× omg-autoupdate**: `omg-autoupdate.sh`가 `command -v gjc` 가드로 종료
  (CI에 gjc 없음). 수정(`c5ad4b2`): 테스트 하네스가 inert stub gjc(PATH 우선,
  exit 0, 테스트 경로에서 실행되지 않음) 마운트. "gjc 부재 시 die" 부정 테스트는
  존재하지 않아 계약 약화 없음.
- **1× suite-root-binding gate-always 마커 제거**: `install-skill.sh`의
  `cleanup_retired_gate_markers`가 `node -` 인라인 스크립트에 의존 — node 없는
  환경에서 "malformed markers"로 스킵하고 은퇴 마커를 남겼다. 로컬 재현
  (nodeless PATH + 임시 HOME): 동일 스킵 확인. 근본 수정(`c857f3c`): 같은 파일의
  easy-always/branchflow가 이미 쓰는 awk 패턴으로 포팅, node의 바이트 정확
  semantics(CRLF 통과, 파일 말미 개행 보존, 마커별 seen-set, 중첩/stray/미종결
  거부) 유지. nodeless 엣지케이스 6종 검증: 마커만 있는 파일→0바이트, CRLF 보존,
  2블록 제거 바이트 정확, malformed 3종(미종결/중첩/stray-END)은 원문 보존.

## 검증 기록

- `bun test plugins/oh-my-gjc/test` — **158 pass / 0 fail / 870 expect()**
  (도입 전 148 pass; +10 신규 게이트, skill-sandbox 로컬 실행 유지).
- `python3 -m json.tool` 매니페스트 2종 PASS; `bash -n` install.sh + bin/*.sh PASS;
  test.yml YAML 파스 PASS.
- CI 그린 확정 — run `33428305124`(commit `c5ad4b2`, 16s): **success**. 첫 실행
  `33427740726`(4 fail) 대비 전량 통과 + skill-sandbox 1 skip(gjc/bwrap 부재
  환경에서 명시적 skip — 설계된 동작).

## 환경 제한(pending-environment)

- insane-review/gpt-image 라이브 CDP 카나리는 이번 변경과 무관(설치면 미변경).
