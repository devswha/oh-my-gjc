---
name: codex-app-launch
description: 이미 빌드된 Codex 데스크톱 App(Linux Electron 래퍼)을 원격 디버깅(CDP)을 켠 채 띄우고, 준비될 때까지 기다린 뒤 cdp_url을 돌려준다. 헤드리스 서버면 xvfb로 가상 디스플레이를 띄운다. "Codex 앱 띄워 / Codex App 켜줘 / 헤드리스로 codex 앱 실행 / launch codex app / start the codex desktop app / codex GUI 띄워서 ~" 같은 요청에 활성화. 기동/상태확인/종료(lifecycle)만 담당하고, 프롬프트 전송·응답 추출은 codex-app-cdp 스킬로 핸드오프한다. 래퍼를 DMG에서 새로 빌드하지는 않는다.
---

# Codex App Launch (headless GUI lifecycle)

이미 **빌드된** Codex 데스크톱 App 래퍼를 **원격 디버깅(CDP)을 켠 채 기동**하고,
CDP/webview가 응답할 때까지 기다린 뒤 `cdp_url`을 돌려준다. 헤드리스(디스플레이 없음)면
`xvfb`로 가상 디스플레이를 띄운다. 그다음 실제 **프롬프트 전송/응답 추출은
`codex-app-cdp` 스킬**이 그 `cdp_url`로 이어받는다.

```
[codex-app-launch]  앱 기동 + CDP 준비   →   cdp_url
        └────────────── 핸드오프 ──────────────┐
                                               ▼
[codex-app-cdp]     attach → 프롬프트 1개 → 완료감지 → 응답 1개
```

대상: OpenAI Codex 데스크톱 App + `HaD0Yun/codex-app-in-linux` 계열 비공식 Linux Electron 래퍼.
App 내부 엔진은 Codex `app-server`이고, 이 스킬은 그 **GUI 프로세스의 lifecycle**(start/status/stop)을 다룬다.

## ⚠️ 안전 경고 (먼저 읽어라)

**앱을 띄운다는 것 = "로컬 파일·셸·자격증명·리포지토리 권한을 가진 Codex 에이전트를
CDP로 조종 가능한 상태로 노출한다"는 뜻이다.** 채팅 데모가 아니다.

- CDP는 **loopback(`127.0.0.1`)** 에만 바인딩하라. CDP 엔드포인트는 사실상 그 브라우저/앱의 풀 제어 권한이다.
- 원격 디버깅 포트를 외부에 공개하거나 `0.0.0.0`에 바인딩하지 마라.
- 비공식 래퍼는 **고신뢰 코드**다. 가급적 disposable 프로젝트/계정에서 검증하라.
- 이 스킬은 래퍼를 **DMG에서 빌드하지 않는다.** 이미 빌드된 `start.sh`만 띄운다(빌드는 사용자 몫, 아래 참고).

## 전제

1. 래퍼가 **이미 빌드돼 있다** → `<wrapper>/codex-app/start.sh`가 존재한다.
2. 헤드리스 서버면 `xvfb-run`이 설치돼 있다(`command -v xvfb-run`).
3. 사용자가 신뢰하는 환경에서 띄운다(위 안전 경고).

빌드가 안 돼 있으면(=`start.sh` 없음) 기동을 시도하지 말고, 한 번만 안내하고 끝낸다:

```
start.sh not found under <wrapper_dir>. This skill launches an ALREADY-BUILT Codex App
wrapper; it does not build from the OpenAI DMG. Build the Linux Electron wrapper first
(e.g. HaD0Yun/codex-app-in-linux from the public Codex.dmg), then pass start_sh=<path>.
```

## 입력 계약

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `action` | ❌ | `start` | `start` \| `status` \| `stop` |
| `start_sh` | `start`에 ✅ | 없음 | 래퍼의 `codex-app/start.sh` **절대경로**. (또는 `wrapper_dir`+`/codex-app/start.sh`) |
| `wrapper_dir` | ❌ | 없음 | 래퍼 루트. `start_sh` 대신 줄 수 있음(이 경우 `<wrapper_dir>/codex-app/start.sh` 사용) |
| `cdp_port` | ❌ | `9222` | 원격 디버깅(CDP) 포트 |
| `webview_port` | ❌ | `5175` | Electron webview 포트(준비확인 보조) |
| `screen` | ❌ | `1280x900x24` | xvfb 가상 화면 `WxHxD` |
| `ready_timeout_s` | ❌ | `60` | CDP `/json/version` 200 응답 대기 상한 |

**입력 검증 (injection 방지 · 기동 전 강제):**

- `action`은 `start`|`status`|`stop` 중 하나만. 그 외 거부.
- `cdp_port`·`webview_port`는 **양의 정수 1–65535** 만. 비숫자/범위초과 거부.
- `screen`은 정규식 `^[0-9]+x[0-9]+x[0-9]+$` 만.
- `ready_timeout_s`는 양의 정수(상한 600).
- `start_sh`/`wrapper_dir`은 **존재하는 경로**여야 하고, 최종 `start.sh`는 **존재하는 파일**이어야 한다(없으면 위 빌드 안내로 실패).
- **알 수 없는 인자 거부.** 셸에 임의 문자열을 보간하지 말고, 경로/정수/검증된 값만 argv로 쓴다.
- `--no-sandbox`·임의 Electron 플래그를 사용자 입력에서 **자동 파생하지 않는다**(검증된 고정 플래그만).

## 절차 — `action=start`

### 1. 멱등 체크 (이미 떠 있으면 재사용)
- `http://127.0.0.1:<cdp_port>/json/version`가 200이면 **새로 띄우지 말고** 그 `cdp_url`을 그대로 반환하고 핸드오프로 넘어간다(중복 기동 방지).

### 2. start.sh 해석
- `start_sh`(절대경로) 또는 `<wrapper_dir>/codex-app/start.sh`로 확정. 파일 없으면 빌드 안내로 실패.

### 3. 디스플레이 판단 후 detached 기동
래퍼의 `start.sh`는 `--` 뒤 인자를 Electron으로 전달한다. **반드시 백그라운드로 detach**(`setsid`/`nohup` + `&`)해서 도구 호출이 끝나도 살아 있게 한다.

- **디스플레이 있음(`$DISPLAY` set):**
  ```sh
  cd "<start_sh_dir>" && setsid ./start.sh -- --remote-debugging-port=<cdp_port> >/tmp/codex-app-launch.log 2>&1 &
  ```
- **헤드리스(`$DISPLAY` unset) — xvfb 사용 (라이브 검증된 레시피):**
  ```sh
  cd "<start_sh_dir>" && setsid xvfb-run -a -s "-screen 0 <screen>" \
    ./start.sh -- --remote-debugging-port=<cdp_port> --use-gl=swiftshader --enable-unsafe-swiftshader \
    >/tmp/codex-app-launch.log 2>&1 &
  ```
  (`bash`로 띄울 때 출력 리다이렉트가 가드에 걸리면, 위 한 줄을 셸 스크립트 파일로 적어 실행하거나 `eval`/launcher로 우회한다.)

### 4. 준비 대기 (readiness, 폴백 금지)
- `cdp_port`의 `/json/version`이 **200**이 될 때까지 폴링(최대 `ready_timeout_s`). 응답 JSON의 `Browser`/`User-Agent`에 `Codex/<version>`이 보이면 확정.
- 보조로 `webview_port` TCP open 확인.
- 타임아웃이면 **준비됐다고 단정하지 말고** 실패: 런처 로그 경로(`<XDG_CACHE_HOME|~/.cache>/codex-desktop/launcher.log`)와 `/tmp/codex-app-launch.log`, 마지막 줄 진단을 함께 낸다.

### 5. 출력 + 핸드오프
- 성공 시: `cdp_url=http://127.0.0.1:<cdp_port>`, `target` 힌트(`Codex` 또는 `<webview_port>`), `ready=true`, app 버전을 보고한다.
- 사용자가 프롬프트까지 원하면 **`codex-app-cdp` 스킬로 핸드오프**(그 입력 계약: `cdp_url` + `prompt` [+ `target`/`timeout_ms`/`stable_ms`]). 최초 실행 시 온보딩 "What type of work…" 화면은 codex-app-cdp가 `Skip`으로 통과한다.

## 절차 — `action=status`
- `/json/version` 200 여부 + `pgrep -af start.sh`(해당 `--remote-debugging-port=<cdp_port>` 매칭)로 up/down, pid, `cdp_url`을 보고. 비밀값은 출력하지 않는다.

## 절차 — `action=stop`
- 이 스킬이 띄운 인스턴스만 정리한다(가능하면 `--remote-debugging-port=<cdp_port>` 매칭으로 한정):
  ```sh
  pkill -f "remote-debugging-port=<cdp_port>"   # 해당 start.sh/electron
  pkill -f "codex-app/start.sh"                 # 보수적 폴백
  pkill Xvfb                                     # 헤드리스로 띄운 경우만
  ```
- 무관한 다른 Codex 인스턴스/사용자 프로세스를 죽이지 않도록 포트 매칭을 우선한다.

## 라이브 검증된 레시피 (Codex app 26.623.70822 · Electron/Chrome 148)

실제 헤드리스 서버에서 아래로 기동·attach가 확정됨:

```sh
cd ~/workspace/codex-wrapper-build/wrapper/codex-app
setsid xvfb-run -a -s "-screen 0 1280x900x24" \
  ./start.sh -- --remote-debugging-port=9222 --use-gl=swiftshader --enable-unsafe-swiftshader &
# 준비확인:
curl -s http://127.0.0.1:9222/json/version   # -> {"Browser":"Chrome/148...","User-Agent":"... Codex/26.623.70822 ..."}
```
- webview = `127.0.0.1:5175`, CDP = `127.0.0.1:9222`.
- 이후 `codex-app-cdp`가 `cdp_url=http://127.0.0.1:9222`, `target=Codex`로 attach → `.ProseMirror`에 입력 → Enter → 완료감지 → `[data-local-conversation-final-assistant]`에서 응답 추출.

## 범위

**한다:** 이미 빌드된 래퍼를 CDP 켠 채 (헤드리스면 xvfb로) **기동 / 상태확인 / 종료**, 준비 대기, `cdp_url` 반환, `codex-app-cdp`로 핸드오프.
**안 한다 (Non-Goal):** OpenAI DMG에서 래퍼 **빌드**, 다중 인스턴스 오케스트레이션, 임의 포트 자동탐색(멱등 재사용 체크는 함), 프롬프트 전송·대화 루프·세션 관리(→ `codex-app-cdp`), `app-server` JSON-RPC 직접 제어.
