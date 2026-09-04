# 기능 안내

`oh-my-gjc`는 스킬 5개와 커맨드 5개(`/omg` 및 `/omg:*` 4개)를 한 번에 설치합니다. 플러그인 관리는 터미널의 `gjc plugin ...` CLI에서만 하며, `gjc` 세션에 `/plugin` 커맨드는 없습니다.

## 공통 전제

`gjc`를 설치하고 필요한 공급자에 로그인합니다. 웹 검색 API 키 등 자격 증명은 프로젝트 `cwd/.env`가 아니라 신뢰할 수 있는 위치에 둡니다. 자세한 환경 설정은 [INSTALLATION.md](../INSTALLATION.md)와 [`.env.example`](../.env.example)를 확인합니다.

이 스위트는 커스텀 모델 프리셋을 더 이상 배포하지 않으며 `models.yml`을 수정하지 않습니다. GJC 내장 프리셋을 사용합니다.

## 스킬

### `no-english`

`/omg:no-english [on|off|status]`로 현재 세션에서만 제어합니다. 일반 한국어 대화나 자연어 언어 요청으로 자동 활성화하지 않습니다. 한국어 응답의 불필요한 영어 혼용을 줄이되 코드 식별자, 명령, 경로, API·프로토콜 이름, 정확한 라벨, 로그, 인용문과 안전 경계는 보존합니다.

원문: [`SKILL.md`](../plugins/oh-my-gjc/skills/no-english/SKILL.md)

### `extragoal`

완료된 변경을 독립적인 교차 세션 GJC 리뷰로 재검토합니다. `insane-review`를 추가하는 N-of-N 모드에서는 선택한 모든 리뷰어가 통과해야 하는 AND 게이트를 적용합니다. 판정 누락, 형식 오류, 시간 초과는 승인으로 처리하지 않으며, 외부로 나가는 검토에서는 시크릿 스캔을 반드시 수행합니다.

원문: [`SKILL.md`](../plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `insane-review`

`/omg:insane-review`는 관련 코드를 repomix로 묶어 로그인된 ChatGPT 웹 세션에 CDP로 전달하고 실제 선택된 Pro 모델의 리뷰를 회수합니다. 모델을 명시하면 그 이름을 검증하며 Sol로 대체하지 않습니다. ChatGPT 구독, chatgpt.com에 로그인한 전용 프로필의 Chromium 계열 브라우저와 CDP `:9222`가 필요하며 로그인은 자동화하지 않습니다.

검증하지 못한 모델, 첨부되지 않은 패킹 파일, 잘린 프롬프트, 시간 초과, 빈 응답에서는 실패로 종료합니다. 결과 파일은 프로젝트 `.insane-review/`에 저장되며 외부 웹 서비스로 코드를 보낼 수 있으므로 개인 구독 용도로만 사용합니다.

원문: [`SKILL.md`](../plugins/oh-my-gjc/skills/insane-review/SKILL.md)

### `insane-search`

일반 `read` 또는 웹 접근이 402·403·WAF·challenge·불완전한 SPA로 막혔거나 명시적인 공개 자막·미디어 추출 요청이 있을 때만 자동 활성화합니다. 일반 검색이나 이미 읽을 수 있는 공개 페이지에는 사용하지 않습니다.

공식 공개 route를 먼저 사용하고, 일반 공개 URL은 SSRF-pinned TLS grid로 읽습니다. API 키나 로그인 없이 공개 `http`/`https` URL만 처리하며 CAPTCHA, paywall, 인증 우회를 하지 않습니다. 핵심 의존성은 Python 3, `curl_cffi>=0.15`, `bs4`, `PyYAML`, `markdownify`이고, YouTube 등 미디어 경로에는 선택적으로 `yt-dlp`가 필요합니다. 의존성은 확인만 하고 자동 설치하지 않습니다.

가져온 페이지 본문은 신뢰하지 않는 외부 데이터입니다. 페이지 안의 지시, credential·토큰·로컬 파일 요구, 도구 변경 요청을 실행하지 않습니다.

원문: [`SKILL.md`](../plugins/oh-my-gjc/skills/insane-search/SKILL.md)

### `gpt-image`

`/omg:gpt-image`로만 명시적으로 실행하는 ChatGPT Images 웹 생성입니다. 사용자의 로그인된 ChatGPT 구독과 전용 CDP 프로필을 사용하며, POSIX 환경, Playwright와 Chrome/Chromium CDP가 필요합니다. 자동 로그인과 API·백엔드 fallback은 제공하지 않습니다.

이미지는 ChatGPT의 원본 **Save/Download** 동작으로만 저장합니다. PNG와 provenance는 프로젝트 `.gpt-image/` 아래 mode `0600`으로 보관합니다. `insane-review`와 동시에 실행하지 않습니다.

원문: [`SKILL.md`](../plugins/oh-my-gjc/skills/gpt-image/SKILL.md)

## 커맨드

`/omg`, `/omg:setup`, `/omg:no-english`, `/omg:insane-review`, `/omg:gpt-image`을 제공합니다. 설치는 [README](../README.md)의 원샷 명령 또는 [INSTALLATION.md](../INSTALLATION.md)를 따릅니다.
