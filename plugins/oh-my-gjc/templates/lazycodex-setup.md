---
description: LazyCodex(OmO Codex Light) deep-work 하니스를 Codex(~/.codex)에 설치/업데이트/점검/제거한다. 기본은 doctor(점검). 설치/업데이트는 ~/.codex를 수정하고 npx/네트워크를 쓴다.
argument-hint: "[doctor|install|update|uninstall]"
---

사용자가 LazyCodex 하니스를 Codex에 셋업(설치/업데이트/점검/제거)하려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- 인자를 `doctor`|`install`|`update`|`uninstall` 중 하나로 파싱(비면 `doctor`). 그 외 값은 사용법 안내 후 종료.
- **`lazycodex` 스킬을 활성화**해 그 "A. 셋업" 절차를 따른다(실제 명령은 스킬에 위임).
- **전제 확인**: `command -v codex`, `command -v npx`. 없으면 무엇을 설치해야 하는지 안내하고 종료(자동 설치 금지).
- 동작:
  - `doctor` → `command -v lazycodex` 후 `lazycodex doctor` 출력(읽기 전용). 미설치면 설치 방법 안내.
  - `install` → 이미 설치+`doctor` OK면 재설치하지 말고 알린다. 미설치일 때만 `npx --yes lazycodex-ai install --codex-autonomous` 실행 후 `lazycodex doctor`로 확인.
  - `update` → `lazycodex update` (또는 `npx --yes lazycodex-ai update`) 후 `doctor`.
  - `uninstall` → 사용자에게 영향(스킬/훅 제거)을 알리고 **명시 확정 시에만** `lazycodex uninstall`.
- **⚠️ 안전**: install/update/uninstall는 `~/.codex`의 스킬·훅·에이전트·config를 수정하고 npm/네트워크를 쓴다. 이미 동작 중인 Codex 설정을 사용자 요청 없이 건드리지 마라. codex/lazycodex 자동 로그인은 하지 않는다.
- 설치/사용은 `/omg:lazycodex-work`로 이어서 deep-work를 돌릴 수 있음을 한 줄 안내한다.
