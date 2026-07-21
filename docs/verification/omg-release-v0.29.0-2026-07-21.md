# omg v0.29.0 릴리스 검증 (2026-07-21)

## 범위 (origin/main..dev)
1. `preset-pack` 스킬/커맨드/정본 제거 → 스위트 6 스킬 + 8 커맨드로 축소 (commit `b533a5d`).
2. opt-in 자동 업데이터 `bin/omg-autoupdate.sh` 추가 (commit `ab1e0da`).

## 검증 (mandatory, fail-closed)
- **JSON parse**: `.claude-plugin/marketplace.json`, `plugins/oh-my-gajae-code/.claude-plugin/plugin.json` OK. 버전 `0.29.0` 일관.
- **`bash -n`**: `install.sh`, `bin/install-skill.sh`, `bin/omg-autoupdate.sh` 모두 OK.
- **`bun test`** (plugins/oh-my-gajae-code): **152 pass / 0 fail**, 1306 expect, 12 files.
- **신규 설치 재현 (격리 HOME, rc 증거)**:
  - `HOME=<tmp> bash install.sh --candidate-ref <checkout>` (`GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`) → **rc=0**.
  - 결과: 6 스킬(adaptive-response, deep-onboarding, extragoal, insane-review, multi-harness-research, no-english) + 8 커맨드(omg, omg:setup/gate/gate-always/no-english/insane-review/deep-onboarding/multi-harness). `skills/preset-pack` 부재 확인.
  - 성공 배너: "one plugin, 6 skills + 8 commands (/omg + 7 /omg:*)".
- **업그레이드 청소 재현**: stale `skills/preset-pack/`·`commands/omg:preset-pack.md` 시드 후 재설치 → 잔재 제거, 사용자 `models.yml`(user-owned `daily` 프로파일 포함) 무접촉 보존.
- **자동 업데이터 동작 재현**:
  - dry-run: canonical `install.sh | bash`, `--local <checkout>`, `enable`(안정 복사본 + OnCalendar/cron daily) 확인.
  - real stub run: 성공 → 로그 `result: OK`; 실패 → `result: FAILED rc=3`.
  - 단일 실행 잠금: 잠금 보유 중 실행 → 로그 `skipped`.
  - systemd `--user` 없으면 cron 폴백.
  - opt-in 보증: `install.sh`에 enable 호출 없음(테스트로 강제). `install-skill.sh uninstall … user`가 타이머 disable 호출.
- **gitleaks**: 각 커밋 staged 스캔 no leaks. 릴리스 범위 재스캔은 발행 전 수행.

## 교차리뷰 (recommended)
- fresh-context 교차패밀리 리뷰(`gjc -p --no-session --model openai-codex/gpt-5.6-sol:high --tools read,search,find`)로 자동 업데이터·uninstall 훅 diff 심사. 결과는 아래 기록.
  - 판정: (본 파일 하단 업데이트)

## 계약 보존
- 설치 스크립트는 `models.yml`을 절대 수정·삭제하지 않는다.
- 자동 업데이터는 기본 OFF(opt-in), root 실행 거부, 단일 실행 잠금, 전 실행 로그, 안정 경로 자기복사로 캐시 버전 변화에 무관.

## 발행
- dev→main `--no-ff` 머지 → 태그 `v0.29.0` → GitHub Release. 롤백은 fix-forward.
