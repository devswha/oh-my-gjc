---
description: 이미 실행 중인 Codex 데스크톱 App에 명시적 CDP URL로 attach해 프롬프트 1개를 보내고 최신 응답 1개를 반환한다. v1 attach-only(앱 기동·CDP 자동탐색 안 함).
argument-hint: "cdp_url=<http://127.0.0.1:9222> prompt=<text> [target=<substring>] [timeout_ms=120000] [stable_ms=3000]"
---

사용자가 실행 중인 Codex 데스크톱 App을 CDP로 제어해 프롬프트 1개를 보내고 응답을 받으려 한다.

입력 인자: $ARGUMENTS

처리 규칙:

- `$ARGUMENTS`에서 `cdp_url`과 `prompt`를 파싱한다. 둘 다 `cdp_url=...`, `prompt=...` 키-값 형태를 우선 인식하고, 공백/`=`이 섞인 긴 프롬프트는 `prompt="..."`(따옴표)로 받는다.
- `cdp_url` 또는 `prompt`가 **없으면** 앱을 띄우거나 포트를 스캔하지 말고, 사용법과 v1 전제(앱이 원격 디버깅을 켠 채 이미 떠 있어야 함)를 한 번 안내하고 끝낸다:
  `cdp_url is required for v1. Start the Codex App yourself with remote debugging enabled, then pass cdp_url=http://127.0.0.1:<port>. v1 does not launch or scan for the app.`
- 인자가 충분하면 **`codex-app-cdp` 스킬을 활성화**해 그 절차(attach → observe 시맨틱 탐색 → 프롬프트 전송 → 하이브리드 턴-완료 감지 → 최신 응답 1개 추출)를 따른다. 실제 제어 로직은 스킬에 위임하고, 이 커맨드는 인자 파싱·검증만 책임진다.
- **안전 경고**: 프롬프트 전송은 Codex가 로컬 파일·셸·자격증명 권한으로 작업을 실행하는 특권 동작이다. loopback `cdp_url`과 신뢰할 수 있는 프롬프트만 사용한다.
