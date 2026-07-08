---
description: 이미 빌드된 Codex 데스크톱 App 래퍼를 원격 디버깅(CDP)을 켠 채 (헤드리스면 xvfb로) 띄우고, 준비될 때까지 기다린 뒤 cdp_url을 돌려준다. 상태확인/종료(status/stop)도 한다. 기동만 담당하고 프롬프트 전송은 codex-app-cdp로 이어진다.
argument-hint: "[action=start|status|stop] start_sh=<.../codex-app/start.sh> [cdp_port=9222] [webview_port=5175] [screen=1280x900x24] [ready_timeout_s=60]"
---

사용자가 Codex 데스크톱 App(GUI)을 원격 디버깅 켠 채 기동/상태확인/종료하려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- `$ARGUMENTS`에서 `action`(기본 `start`)과 나머지(`start_sh` 또는 `wrapper_dir`, `cdp_port`, `webview_port`, `screen`, `ready_timeout_s`)를 키-값으로 파싱한다.
- `action=start`인데 `start_sh`/`wrapper_dir`이 **없으면** 앱을 추측해서 띄우지 말고 사용법 한 줄만 안내하고 끝낸다:
  `start_sh is required for action=start. Pass start_sh=<.../codex-app/start.sh> of an already-built Codex App wrapper. This command does not build the wrapper from the DMG.`
- **입력 검증(injection 방지, 기동 전 강제):**
  - `action`은 `start`|`status`|`stop` 중 하나만. 그 외 거부.
  - `cdp_port`/`webview_port`는 양의 정수 1–65535만, `screen`은 `^[0-9]+x[0-9]+x[0-9]+$`만, `ready_timeout_s`는 양의 정수(상한 600)만.
  - `start_sh`(또는 `<wrapper_dir>/codex-app/start.sh`)는 **존재하는 파일**이어야 한다. 없으면 빌드 안내로 실패(빌드는 이 커맨드의 역할이 아님).
  - 알 수 없는 인자 거부. 셸에 임의 문자열 보간 금지(검증된 경로/정수/고정 플래그만). 사용자 입력에서 `--no-sandbox` 등 임의 Electron 플래그 자동 파생 금지.
- 검증 통과 시 **`codex-app-launch` 스킬을 활성화**해 그 절차를 따른다: 멱등 체크(이미 CDP 응답하면 재사용) → `$DISPLAY` 유무로 직접/`xvfb-run` 기동(detached) → `/json/version` 200 준비 대기 → `cdp_url` 반환. 실제 lifecycle 로직은 스킬에 위임하고, 이 커맨드는 인자 파싱·검증만 책임진다.
- 기동 후 사용자가 프롬프트까지 보내려 하면 **`codex-app-control:ask`(codex-app-cdp 스킬)** 로 핸드오프: `cdp_url=http://127.0.0.1:<cdp_port> prompt="..."`.
- **⚠️ 안전 경고**: 앱 기동은 로컬 파일·셸·자격증명 권한을 가진 Codex 에이전트를 CDP로 조종 가능하게 노출하는 동작이다. CDP는 loopback(`127.0.0.1`)에만 두고, 신뢰 환경에서만 띄운다. 비공식 래퍼는 고신뢰 코드다.
