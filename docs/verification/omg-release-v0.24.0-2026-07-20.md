# oh-my-gajaecode v0.24.0 release evidence — 2026-07-20

첫 정식 자율 릴리스 사이클(AGENTS.md Release rules — 승인 게이트 없음, 검증 필수 + 교차리뷰 권장 + 발행 후 report).

## Candidate

- 발행 후보: `43caa54` (dev; 라운드1 후보 `e7b0dde` + 블로커 수정 `43caa54`). Release scope (v0.23.0..dev):
  1. **거버넌스 자율화** — 승인 게이트·빈도 캡·승인 큐 의무 폐지, Release rules 신설 (`5c60ca8`·`066cc58`, 하코 direct order 07-19; in-session architect APPROVE + executor QA passed).
  2. **G003 코드 리뷰 실결함 수정** — cron 게이트 우회(daily-scan.sh), secretlint fail-open(pack_and_ask.py), redact 누출 4계열(collect.ts, 회귀 테스트 7건), /tmp 클로버(enqueue-pr.sh) (`852a17b`·`c044e8c`; in-session architect 3레인 CLEAR + red-team 블로커 2건 fix-forward).
  3. **preset-pack v2** — 프리셋 `daily`(사람)+`agent`(무인) 2개로 확정(하코 2026-07-20), `deep`/`sec` 폐지(조건부 정리: v1 원본 일치분만), 빌트인 `opus-codex` 실매핑(주력 opus:xhigh·executor terra:low — 바이너리 채굴) 대비 무인 부적합 근거 문서화 (`a63e09f`).
  4. gitleaks 합성 픽스처 allowlist (`e7b0dde`).

## Verification (mandatory)

- YAML parse(`references/preset-pack.yml`) + JSON parse(marketplace 0.24.0 + plugin 0.24.0): pass.
- `bun test plugins/oh-my-gjc/test`: **197 tests, 0 fail** (+ ops/gjc-bugwatch 스위트는 G003 사이클에서 29/29).
- `bash -n`·`py_compile`: G003 사이클에서 전 대상 pass.
- **New-install reproduction (isolated HOME, `--candidate-ref`): rc=0**, 등록 버전 `0.24.0`, 캐시 정본에 `agent` 프로파일 포함 확인.
- **활성 스모크**: `gjc --mpreset daily|agent -p --no-session --no-tools "Reply OK"` — 둘 다 OK (agent 좌석 셀렉터 `openai-codex/gpt-5.6-sol:medium` 단독 스모크도 OK).
- `gitleaks git --log-opts='v0.23.0..dev'`: 5 commits, **no leaks found** (합성 픽스처 2건은 inline allow + `.gitleaksignore` 지문으로 정리).
- 사용자 `models.yml` 명시 적용 실측(하코 세션 내 확정 = 명시 호출): 백업 생성 → deep/sec v1 원본 일치 확인 후 제거, daily 교체, agent 추가 → 재파스 OK, 최종 profiles = [sol(사용자 유산), daily, agent].

## Cross-review (recommended lane)

Fresh-context `openai-codex/gpt-5.5:xhigh`, read/search/find only, `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`.

- **Round 1 (`e7b0dde`): REQUEST_CHANGES** — 블로커 1건: v2가 "v1 원본 일치 시에만 deep/sec 정리"를 약속하면서 설치본에 비교 원본이 없음(네이티브 설치는 git 히스토리 접근 불가 → 휴리스틱 삭제 또는 무정리로 퇴화 위험).
- Fix-forward: `43caa54` — 정본 yml에 비병합 `retired_v1_profiles` fixture 동봉(v0.23.0 정본과 파스 동등성 스크립트 검증), 스킬/템플릿/AGENTS를 파스 동등성 계약으로 갱신, fixture 부재 시 정리 스킵 fail-closed. bun 197/0 재확인.
- **Round 2 (`43caa54`): VERDICT: APPROVE** — 블로커 해소 확인(fixture 비병합·v1 파스 동등·계약 일관), 재스캔 신규 블로커 없음: 버전 0.24.0 정합, installer/models.yml 경계 유지, G003 수정 전건 존재 확인, deep/sec 잔존은 은퇴 기록·fixture뿐.

## Publish

- PENDING — 교차리뷰 종료 후 main 병합 → tag `v0.24.0` → GitHub Release → 관제탑 report → 공개 경로 로컬 재설치.
