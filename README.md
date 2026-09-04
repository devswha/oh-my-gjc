# oh-my-gjc

Gajae Code (`gjc`)에 한국어 우선 표현과 외부 코드 리뷰를 더하는 단일 플러그인 스위트입니다.

## 설치

터미널에서 한 번 실행합니다.

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```

`gjc` 세션에서는 다음 프롬프트를 사용합니다.

```text
Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.
```

한 번 설치하면 스킬 5개와 커맨드 5개(`/omg` 및 `/omg:*` 4개)가 모두 설치됩니다. 업그레이드할 때는 원샷 설치 명령을 다시 실행합니다.

설치가 안 되면 저장소를 받은 뒤 같은 설치 프로그램을 실행합니다.

```sh
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git oh-my-gjc
bash oh-my-gjc/install.sh
```

플러그인 관리는 터미널의 `gjc plugin ...` CLI에서만 합니다. `gjc`에는 `/plugin` 슬래시 커맨드가 없습니다.

## 구성

### `no-english`

`/omg:no-english [on|off|status]`로 현재 세션에서만 제어합니다. 일반 한국어 대화나 자연어 언어 요청으로 자동 활성화하지 않습니다. 한국어 응답의 불필요한 영어 혼용을 줄이되 코드 식별자, 명령, 경로, API·프로토콜 이름, 정확한 라벨, 로그, 인용문과 안전 경계는 보존합니다.

### `extragoal`

완료된 변경을 독립적인 교차 세션 GJC 리뷰로 재검토합니다. `insane-review`를 추가하는 N-of-N 모드에서는 선택한 모든 리뷰어가 통과해야 하는 AND 게이트를 적용합니다. 판정 누락, 형식 오류, 시간 초과는 승인으로 처리하지 않으며, 외부로 나가는 검토에서는 시크릿 스캔을 반드시 수행합니다.

### `insane-review`

`/omg:insane-review`는 관련 코드를 repomix로 묶어 로그인된 ChatGPT 웹 세션에 CDP로 전달하고 실제 선택된 Pro 모델의 리뷰를 회수합니다. 모델을 명시하면 그 이름을 검증하며 Sol로 대체하지 않습니다. ChatGPT 구독, chatgpt.com에 로그인한 전용 프로필의 Chromium 계열 브라우저와 CDP `:9222`가 필요하며 로그인은 자동화하지 않습니다.

`--ensure-env`는 저장된 전용 브라우저를 다시 사용합니다. `login=unknown`은 재로그인이 필요한 상태로 단정하지 않습니다. `--inspect-session`으로 질문을 보내지 않고 현재 모델과 로그인 상태를 확인할 수 있습니다. 일반 코드리뷰나 검색 요청은 이 웹 리뷰 스킬을 자동으로 켜지 않습니다.

검증하지 못한 모델, 첨부되지 않은 패킹 파일, 잘린 프롬프트, 시간 초과, 빈 응답에서는 실패로 종료합니다. 결과 파일은 프로젝트 `.insane-review/`에 저장되며 외부 웹 서비스로 코드를 보낼 수 있으므로 개인 구독 용도로만 사용합니다.

### `insane-search`

일반 `read` 또는 웹 접근이 402·403·WAF·challenge·불완전한 SPA로 막혔을 때, 또는 명시적인 공개 자막·미디어 추출 요청에서만 자동 활성화합니다. 일반 검색이나 이미 읽을 수 있는 페이지에는 사용하지 않습니다.

공식 공개 route를 먼저 사용하고, 그 밖의 공개 URL은 SSRF-pinned TLS grid로 읽습니다. API 키나 로그인은 필요하지 않으며 CAPTCHA, paywall, 인증 우회는 하지 않습니다. 검색 실행은 의존성을 확인만 하고 자동 설치하지 않으며, 가져온 페이지 본문은 항상 신뢰하지 않는 외부 데이터로 취급합니다.

처음 환경을 준비할 때만 저장소에서 아래 명령을 실행하면 전용 가상환경을 만듭니다. 이후 검색은 이를 자동 재사용하며, 브라우저 로그인이나 ChatGPT 모델 설정이 필요하지 않습니다.

```sh
python3 plugins/oh-my-gjc/bin/setup_insane_search.py --install
```

### `gpt-image`

`/omg:gpt-image`로만 명시적으로 실행하는 ChatGPT Images 웹 생성입니다. 사용자의 로그인된 ChatGPT 구독과 전용 CDP 프로필을 사용하며, POSIX 환경, Playwright와 Chrome/Chromium CDP가 필요합니다. 자동 로그인이나 API·백엔드 fallback은 제공하지 않습니다.

결과는 원본 **Save** 동작으로만 저장하고, PNG와 provenance를 프로젝트 `.gpt-image/` 아래 mode `0600`으로 보관합니다. `insane-review`와 동시에 실행하지 않습니다.

커맨드: `/omg`, `/omg:setup`, `/omg:no-english`, `/omg:insane-review`, `/omg:gpt-image`

각 기능의 활성 조건, 안전 경계, 전제 조건은 [기능 안내](./docs/capabilities.md)를 확인합니다.

## 전제 조건

- `gjc`를 설치하고 필요한 모델 공급자에 로그인합니다.
- `insane-review`는 ChatGPT 구독과 chatgpt.com에 로그인한 Chromium 계열 브라우저의 CDP `:9222`가 필요합니다.
- `insane-search`의 핵심 의존성은 Python 3, `curl_cffi>=0.15`, `bs4`, `PyYAML`, `markdownify`이며, YouTube 등 미디어 경로에는 선택적으로 `yt-dlp`가 필요합니다. 누락된 의존성은 자동 설치하지 않습니다.
- `gpt-image`는 POSIX 환경, ChatGPT 구독, Playwright, 그리고 chatgpt.com에 로그인한 전용 Chrome/Chromium CDP 프로필이 필요합니다.

설치와 환경 설정은 [INSTALLATION.md](./INSTALLATION.md), 상세 기능은 [기능 안내](./docs/capabilities.md), 식별자 변경과 제거 이력은 [마이그레이션 안내](./docs/migrations.md), 삭제된 소스 기록은 [보관 목록](./docs/removed/README.md)을 참고합니다.

## 라이선스

[MIT](./LICENSE)
