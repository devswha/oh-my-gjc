---
name: codex-app-cdp
description: 이미 실행 중인 Codex 데스크톱 App(Linux Electron 래퍼 포함)에 명시적 cdp_url로 CDP attach해서 프롬프트 1개를 보내고 최종 응답 1개를 받아올 때 사용한다. "Codex 앱에 물어봐 / Codex App에 프롬프트 보내 / codex app ask / control codex app / Codex 앱한테 시켜" 같은 요청에 활성화. 앱 기동/빌드/재시작이나 CDP 자동탐색에는 사용하지 않으며, 앱은 사용자가 원격 디버깅을 켠 채 미리 띄워 두어야 한다.
---

# Codex App CDP Control (v1, attach-only)

이미 실행 중인 **Codex 데스크톱 App**에 gjc 내장 `browser` 도구로 CDP attach 해서
**프롬프트 1개를 보내고 → 응답이 끝나길 기다린 뒤 → 최신 응답 1개만** 돌려준다.

대상은 OpenAI Codex 데스크톱 App, 그리고 `HaD0Yun/codex-app-in-linux`의 비공식
Linux Electron 래퍼(웹뷰 `127.0.0.1:5175`)다. App 내부 엔진은 Codex `app-server`이며,
이 스킬은 그 위의 **GUI를 CDP/DOM으로** 제어한다.

## ⚠️ 안전 경고 (먼저 읽어라)

**프롬프트를 보내는 것은 채팅이 아니라 "Codex에게 작업을 실행시키는 특권 동작"이다.**
Codex 데스크톱 App은 로컬 **파일·셸·자격증명·리포지토리·브라우저 상태**에 접근할 수 있다.
- 신뢰할 수 없는 지시나 비밀값을 프롬프트로 보내지 마라.
- `cdp_url`은 **loopback(127.0.0.1)** 만 사용하라. CDP 엔드포인트는 사실상 그 브라우저의 풀 제어 권한이다.
- 비공식 래퍼는 고신뢰 코드다. 가급적 disposable 프로젝트에서 검증하라.

## 입력 계약

| 인자 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `cdp_url` | ✅ | 없음 | Codex App의 CDP 엔드포인트. 예: `http://127.0.0.1:9222` |
| `prompt` | ✅ | 없음 | Codex에 보낼 프롬프트 1개 |
| `target` | ❌ | (미지정) | 여러 BrowserWindow 중 선택할 url/title substring (예: `Codex`, `5175`) |
| `timeout_ms` | ❌ | `120000` | 응답 완료 대기 전체 타임아웃 |
| `stable_ms` | ❌ | `3000` | 응답 DOM이 이 시간 동안 무변화면 완료로 간주(폴백) |

**누락/오류 처리 (자동 기동·포트 스캔 금지):**
`cdp_url` 또는 `prompt`가 없으면 아래 형태로 즉시 실패하고 끝낸다.

```
cdp_url is required for v1. Start the Codex App yourself with remote debugging
enabled, then pass cdp_url=http://127.0.0.1:<port>. v1 does NOT launch, build,
restart, or scan for the app.
```

## v1 전제 (충족 안 되면 실패)

1. Codex App이 **이미 실행 중**이다.
2. App이 **원격 디버깅(CDP)** 이 켜진 채 떠 있다 (`--remote-debugging-port=<port>`).
3. 사용자가 `cdp_url`을 **명시**로 제공한다.

전제가 안 맞으면 앱을 띄우려 하지 말고, 위 에러 메시지 + 해결 안내로 실패한다.

## 제어 절차 (gjc `browser` 도구 사용)

> 아래 element 매핑은 **라이브 스파이크로 확정**됨(Codex app `26.623.70822`, Electron 42.1.0, 헤드리스 xvfb). 확정값은 "## 확정 셀렉터" 참고.
> App 버전이 바뀌어 안 맞으면 `tab.observe()` 시맨틱 탐색을 1차 폴백으로 쓴다(하드코딩 셀렉터에만 의존하지 말 것).

### 1. Attach
- `browser` `open` 에 `app.cdp_url`(명시 URL) 지정. 여러 창이면 `app.target`(substring)으로 Codex 웹뷰/`127.0.0.1:5175` 창 선택.
- attach 실패 시: 앱 기동 시도 없이 `cdp_url`, `target`, 해결 안내(원격 디버깅 켜고 재시작)를 담아 실패.

### 2. Observe (시맨틱 탐색 우선)
- `browser` `run` 에서 `const obs = await tab.observe({})` 로 접근성 트리 수집.
- 후보 우선순위(잠정):
  - **프롬프트 입력**: `role`이 `textbox`/`textarea`/`combobox` 계열이고 `name`/placeholder가 `message`·`prompt`·`ask`·`Send a message` 의미. editable/value 상태면 가산.
  - **전송 버튼**: `role: button`, `name`이 `send`·`submit`·`run`·arrow 의미, `disabled` 아님.
  - **생성 중 표시자**: `stop`·`generating`·`thinking`·`loading`·`cancel`/spinner 성격, 또는 전송 버튼이 `disabled` 상태.
  - **어시스턴트 응답**: assistant message 컨테이너 후보. observe로 부족하면 `tab.evaluate(() => ...)`로 visible text block을 수집(fallback).
- 관찰한 후보의 `id/role/name/state`를 진단 로그로 남긴다.

### 3. 전송 직전 스냅샷
- 전송 전 **현재 어시스턴트 응답 개수 또는 마지막 응답 텍스트**를 기록한다(나중에 "새 응답"을 식별하기 위함).

### 4. Prompt send
- 입력 요소를 `tab.id(n)`(observe id) 또는 검증된 fallback selector로 잡아 `fill`/`type`.
- 전송 버튼이 있으면 `click`. 버튼이 없고 single-line이거나 전송 단축키가 검증된 경우에만 Enter / Meta·Ctrl+Enter.
- 전송 성공 증거(입력창 비워짐 / 전송 버튼 disabled / stop 버튼 출현 / DOM mutation) 중 최소 1개를 관찰.

### 5. 하이브리드 턴-완료 감지
1. **Primary**: 생성-중 표시자가 사라지고 전송 버튼이 다시 enabled 되는 **완료 표시자**를 기다린다.
2. **Secondary (폴백)**: 최신 응답 텍스트가 변하다가 `stable_ms` 동안 **무변화**면 완료로 본다.
3. **Guard**: `timeout_ms` 초과 시 **부분 스트리밍 텍스트를 성공으로 반환하지 않고** timeout 에러 + 진단 반환.
4. (보조) `tab.waitForResponse(pat)`로 app-server 스트리밍이 식별되면 **보조 진단**으로만 사용. 네트워크 이벤트만으로 완료를 단정하지 않는다.

### 6. 최신 응답 추출
- 전송 전 스냅샷과 비교해 **새로 생기거나 갱신된 최신 어시스턴트 응답 1개**의 텍스트만 추출.
- 이전 대화 전체·사용자 프롬프트 echo·중간 스트리밍 조각은 제외.
- 반환: 최신 응답 텍스트 + 최소 진단(attach target, 경과 ms, 사용한 완료 신호).

### 7. 진단/실패
- 실패 시 observe 스냅샷 또는 screenshot을 진단으로 남길 수 있으나 **비밀값 노출에 주의**.
- timeout 에러에는 cdp_url, target, 선택 요소 후보, 완료 신호 후보, 대기시간을 포함.

## browser run 의사코드 (실제 도구 능력에 맞춤)

```js
// browser open: { app: { cdp_url, target? } } 로 attach 후
// browser run 본문:
const obs = await tab.observe({});                 // 접근성 트리
// 후보 탐색(시맨틱)…  const input = obs.elements.find(...);
const before = await tab.evaluate(() => /* 응답 개수/마지막 텍스트 스냅샷 */);
await (await tab.id(inputId)).type(PROMPT);          // 또는 tab.fill(sel, PROMPT)
await (await tab.id(sendId)).click();               // 또는 검증된 Enter 계열
// 하이브리드 완료 대기: 완료표시자 → stable_ms 무변화 → timeout_ms guard
// 최신 응답 1개 추출(before 대비 신규/갱신분), 부분 스트리밍 반환 금지
```

사용 가능한 헬퍼: `tab.observe()`, `tab.id(n)`, `tab.click/type/fill(selector)`,
`tab.waitFor(selector)`, `tab.evaluate(fn)`, `tab.waitForResponse(pat)`, `tab.screenshot()`, `page`.

## 확정 셀렉터 (라이브 검증됨 · Codex app 26.623.70822)

실제 헤드리스 Codex App에 CDP attach해 PONG 왕복으로 확정:

- **CDP attach**: `app.cdp_url` = `http://127.0.0.1:9222`, `app.target` = `Codex`(page url `127.0.0.1:5175`).
- **프롬프트 입력**: `.ProseMirror[contenteditable="true"]` — focus 후 `tab.type(...)` 또는 keyboard.type.
- **전송**: **Enter** 키(입력창이 비워지면 전송 성공). 폴백: composer의 arrow-up 전송 버튼 click.
- **온보딩**: 최초 실행 시 "What type of work…" 화면이면 `Skip` 버튼 클릭으로 통과.
- **완료 감지(하이브리드)**: "Thinking" 텍스트가 사라지고 stop 버튼이 send로 복귀 + 최종 응답 요소 출현·안정.
- **최종 응답 추출**: `[data-local-conversation-final-assistant]` 안의 `[data-selected-text-overlay-target]`(=markdownContent) `innerText`. 래퍼 innerText엔 타임스탬프가 섞이므로 markdownContent를 읽는다.

> **헤드리스 기동 레시피**(사용자/lifecycle 몫): wrapper의 `start.sh`는 `--` 뒤 인자를 Electron에 전달한다. CDP 켜고 띄우려면:
> ```sh
> xvfb-run -a ./codex-app/start.sh -- --remote-debugging-port=9222 --use-gl=swiftshader --enable-unsafe-swiftshader
> ```
> webview=`127.0.0.1:5175`, CDP=`127.0.0.1:9222`. (이 스킬 v1은 attach만; 기동은 사용자 몫.)

App 버전이 바뀌어 위 셀렉터가 안 맞으면 `tab.observe()` 시맨틱 탐색으로 폴백한다.

## 범위

**한다 (v1):** 실행 중인 App에 cdp_url attach → 프롬프트 1개 → 하이브리드 완료 감지 → 최신 응답 1개.
**안 한다 (Non-Goal):** 앱 빌드/기동/재시작/헬스, CDP 자동 포트 스캔/자동탐색, MCP 서버·hooks·sub-agent,
다중 프롬프트 대화 루프·세션 관리·스레드 분기, screenshot/ydotool 좌표 기반 Computer Use,
Codex `app-server` JSON-RPC 직접 제어. (이들은 후속 버전.)
