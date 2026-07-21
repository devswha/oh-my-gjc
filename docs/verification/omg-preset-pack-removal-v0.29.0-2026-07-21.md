# omg v0.29.0 — `preset-pack` 제거 검증 (2026-07-21)

## 범위
사용자 직접 지시로 `preset-pack` 스킬/커맨드/정본을 제거하고 스위트를 6 스킬 + 8 커맨드로 축소.

## 삭제한 파일
- `plugins/oh-my-gajae-code/skills/preset-pack/SKILL.md`
- `plugins/oh-my-gajae-code/templates/preset-pack.md`
- `plugins/oh-my-gajae-code/references/preset-pack.yml`

## 갱신한 표면
- `bin/install-skill.sh`: `EXPECTED_SKILLS`/`EXPECTED_COMMANDS`/`EXPECTED_RUNTIMES`에서 preset-pack 제거, `REMOVED_SKILLS`/`REMOVED_COMMANDS`에 `preset-pack` 추가.
- `.claude-plugin/marketplace.json`, `plugin.json`: version `0.28.0` → `0.29.0`, description 6/8로 갱신, `model-presets` 키워드 제거.
- `install.sh`, `INSTALLATION.md`, `README.md`(루트/플러그인), `templates/omg.md`, `templates/setup.md`, `AGENTS.md`: 카운트·목록·프리셋 문단·묘비 갱신.
- 테스트 6개: 표면 개수·매니페스트·성공 메시지 문자열 동기화, preset-pack 부재 assertion 추가.

## 검증 (fail-closed)
- JSON parse: `plugin.json` + `marketplace.json` OK.
- `bash -n bin/install-skill.sh` / `bash -n install.sh` OK.
- `bun test` (plugins/oh-my-gajae-code): **144 pass / 0 fail**, 1284 expect.
- 격리 HOME 신규 설치 재현: 6 스킬 + 8 커맨드 설치, preset-pack skill/command 부재 확인.
- 업그레이드 청소 재현: 기존 preset-pack native 잔재(`skills/preset-pack/`, `omg:preset-pack.md`) 제거, 사용자 `models.yml`(user-owned `daily` 프로파일 포함) 무접촉 보존.
- `gitleaks` 릴리스 범위 스캔: (아래 커밋 참조) 유출 없음.

## 계약 보존
- 설치 스크립트는 `models.yml`을 절대 수정·삭제하지 않는다.
- 과거 병합된 `daily`/`agent` 프로파일은 사용자 설정이므로 청소 대상이 아니다.
- 클램프로 죽은 세션 복구 경로는 GJC 내장 프리셋(`gjc -r <세션ID> --mpreset <내장 프리셋>`)으로 대체.
