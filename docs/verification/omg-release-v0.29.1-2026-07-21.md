# omg v0.29.1 릴리스 검증 (2026-07-21)

패치 릴리스. v0.29.0 직후 배달된 교차리뷰 최종 라운드의 잔여 결함 하나를 fix-forward하고,
사용자 신규 도트린("삭제된 코드는 docs에 보관")을 반영한다.

## 범위 (origin/main..dev)
1. **`omg-autoupdate.sh do_disable` 확인 강화** — `disable`가 제거를 확인하지 못하면 성공으로
   보고하던 문제 수정. systemd 유저 버스가 없거나 crontab 재작성이 실패하면 **nonzero로 실패**하고,
   소유 유닛 파일은 그래도 제거한다(조용한 잔존 없음). cron 재작성은 태그가 실제로 사라졌는지 확인.
2. **`docs/removed/` 아카이브 도입** — 삭제된 코드를 docs에 보관하는 도트린을 `AGENTS.md`에 명문화하고,
   방금 제거된 `preset-pack`(SKILL.md, 커맨드 본문, `preset-pack.yml`)을 `docs/removed/preset-pack/`에 보관.

## 검증 (mandatory, fail-closed)
- **JSON parse**: `marketplace.json`, `plugin.json` OK. 버전 `0.29.1` 일관.
- **`bash -n`**: `bin/omg-autoupdate.sh`, `bin/install-skill.sh`, `install.sh` OK.
- **`bun test`** (plugins/oh-my-gajae-code): 전 스위트 pass/0 fail (아래 실행 로그).
- **`do_disable` 회귀 재현**:
  - 유닛 파일 존재 + 유저 버스 없음 → **rc≠0**(확인 불가), 유닛 파일은 제거됨.
  - 스케줄 없음 → rc 0 "nothing to remove".
  - dry-run → rc 0.
- **신규 설치 재현 (격리 HOME, rc 증거)**: `install.sh --candidate-ref <checkout>` → rc=0, 6 스킬 / 8 커맨드, `preset-pack` 부재.
- **gitleaks**: 릴리스 범위 스캔 no leaks. 아카이브된 `preset-pack.yml`은 모델 프리셋 설정(비밀 없음).

## 교차리뷰
- v0.29.0에서 진행한 2라운드에 이어, HEAD 스크립트 최종 심사에서 남은 결함(“`disable`가 확인 없이 성공 보고”)을
  본 패치로 해소. `docs/verification/omg-release-v0.29.0-2026-07-21.md`의 교차리뷰 절과 연속.

## 계약 보존
- 설치 스크립트는 `models.yml`을 절대 수정·삭제하지 않는다.
- `docs/removed/`는 문서일 뿐 — 설치·실행·바인딩 해석·installer 참조 대상이 아니다.

## 발행
- dev→main `--no-ff` 머지 → 태그 `v0.29.1` → GitHub Release. v0.29.0은 정상 동작하는 이전 패치이며 rollback이 아님.
