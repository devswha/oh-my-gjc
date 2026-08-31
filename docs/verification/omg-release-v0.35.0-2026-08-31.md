# omg v0.35.0 verification — 2026-08-31

식별자 릴리스: 스위트가 **oh-my-gjc로 돌아온다**(저장소·마켓플레이스·플러그인 ID·
소스 경로·체크아웃 이름). v0.28.0이 oh-my-gjc → oh-my-gajae-code로 전환했던 것의
역방향이며, 같은 컷오버 규율을 따른다. 더불어 미발표 상태였던 insane-review의
2026-08-31 모델 메뉴 수리와 lane 우선 경로가 이 릴리스에 포함된다.

## 변경 (v0.34.3..HEAD, 4커밋)

1. **식별자 복귀 → oh-my-gjc** (`05304bb`) — `MARKET_DEFAULT`/`ENTRY`,
   `plugins/oh-my-gjc` 소스 경로, 모든 하드코딩 URL·경로·단언. 공식 인스톨러는
   `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`이며
   구 `.../oh-my-gajae-code/...` raw URL은 리다이렉트되지 않는다(레포 페이지·
   git remote는 리다이렉트). 호환성: 신규 설치는 `oh-my-gjc` 바인딩만 기록하고,
   기존 `oh-my-gajae-code` 바인딩은 모든 asset resolver에서 읽기 전용 폴백으로
   유지(재작성·정리 없음). `/omg:*` 커맨드명·XDG 데이터·credentials·`models.yml`·
   안정 내부 `oh-my-gjc:gate-always` 마커 불변.
2. **insane-review 엔진: 2026-08-31 모델 메뉴 수리** (`781efb7`, sol-lane
   `e8c1a3f` 포팅) — 모델명이 'GPT-5.6 Sol'에서 '5.6 Sol'로(접두사 제거), effort
   표시가 메뉴에서 composer pill 둘째 줄로 이동, 메뉴 오픈 중 pill이 DOM에서
   사라짐. `MODEL_NAME_RE` 확장(접두사 없는 버전 숫자 인정; 모델 radio를
   items/effort 후보에서 제외), `_model_name_matches`(양방향 GPT- 접두사 제거
   매칭, 검증 4곳), already-pill 경로(메뉴 오픈 전 pill 스냅숏으로 조작 없이
   인정). lane 하네스(`LANE_ENGINE` 오버라이드)로 라이브 검증: 2판이 각각 한
   결함씩 fail-closed로 고립, 3판째 완주(5.6 Sol, 첨부 확인, 응답 저장, 31s).
3. **lane 우선 경로** (`0625044`) — sol-lane(github.com/devswha/sol-lane)이
   있는 머신은 `/omg:insane-review`가 `lane review --root`를 우선 사용(회수·
   직렬화 + 어디서든 등록 없이 실행), 없으면 기존 `$IR` 경로 그대로. 편집된
   스킬의 Sol Pro 리뷰로 공존 확인.

## 검증

- `bun test` **176 pass / 49 fail** — 개명 전 베이스라인과 동일(49는 기존
  `docs/removed` 아카이브 계약 테스트의 삭제된 경로 참조, 본 변경과 무관함을
  클린 HEAD 대조로 확인). 방향 민감 단언 2종(gpt-image legacy `not.toContain`,
  suite-root-binding `legacyBindingPath`)은 구 이름을 가리키도록 반전.
- 격리 HOME 신규 설치 — rc 0, `oh-my-gjc@oh-my-gjc (0.34.3→0.35.0)` 캐노니컬
  원격 설치, `runtimes/oh-my-gjc/root` 바인딩 기록, 컷오버 안내문 출력.
- gitleaks `v0.34.3..HEAD`: 4커밋, 누출 없음.
- GitHub 리네임 실측(22:10 KST): 새 raw 인스톨러 200, 구 레포 페이지 301 →
  `devswha/oh-my-gjc`, 구 raw URL은 Fastly 캐시(≤300s) 후 404 수렴 — v0.28.0
  때 문서화된 것과 동일 경계.

## 크로스리뷰

- 생략(문서화): 엔진 수리는 sol-lane에서 동일 코드로 라이브 검증됐고(완주 2판,
  메시지 소비 4통), 식별자 전환은 위 격리 설치·리다이렉트 실측이 증거.

## 릴리스 확정

- 태그 `v0.35.0`(main), GitHub Release 게시 — 노트에 위 변경 전체 명시.
