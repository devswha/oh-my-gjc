# oh-my-gjc (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** 한 번 설치로 스킬 5개 + 커맨드 5개
(`/omg` + `/omg:*` 4개)가 전부 들어온다. `insane-review`와 `gpt-image`는 ChatGPT+크로미움이 필요하다.
## v0.28.0 identity cutover

`oh-my-gjc` is the canonical repository, marketplace/plugin identity, source `./plugins/oh-my-gjc`, and local checkout name. `/omg:*` commands remain unchanged; the migration contract is below.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git oh-my-gjc
bash oh-my-gjc/install.sh

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```
플러그인 marketplace 추가·설치·업데이트·제거는 **터미널의 `gjc plugin …` shell CLI만** 쓴다.
gjc 세션의 `/plugin …`은 slash command가 아니라 채팅 텍스트다.

## 들어있는 것 (스킬 5 · 커맨드 5)

### 스킬
`no-english` · `extragoal` · `insane-review` · `insane-search` · `gpt-image`

`no-english`는 자연어로 자동 활성화되지 않고 `/omg:no-english`에서만 명시적으로 불러온다.
`no-english`는 일반 한국어 설명만 다듬으며 `ultragoal`, `ralplan`, `deep-interview`, `team` 같은
GJC 정식 이름과 코드·명령·경로·API 이름은 번역하거나 한글로 음역하지 않는다.

`insane-search`는 일반 `read` 또는 웹 접근이 402·403·WAF·challenge·불완전한 SPA로 막혔을 때와 명시적인 공개 자막·미디어 추출 요청에서만 자동 활성화한다. 일반 검색과 이미 읽을 수 있는 페이지에는 사용하지 않는다. 공식 공개 route를 우선하고, 그 밖의 공개 URL은 SSRF-pinned TLS grid로 읽는다. API 키·로그인은 필요 없으며 CAPTCHA·paywall·인증 우회는 하지 않는다. 검색 실행은 의존성을 확인만 하고 자동 설치하지 않으며, 가져온 본문은 신뢰하지 않는 외부 데이터다.

핵심 의존성은 Python 3, `curl_cffi>=0.15`, `bs4`, `PyYAML`, `markdownify`이고, YouTube 등 미디어 경로에는 선택적으로 `yt-dlp`가 필요하다.

`gpt-image`는 `/omg:gpt-image`로만 명시적으로 실행한다. 사용자의 로그인된 ChatGPT 구독과 전용 CDP 프로필로 ChatGPT Images 웹 생성만 수행하며, POSIX 환경, Playwright와 Chrome/Chromium CDP가 필요하다. 자동 로그인과 API·백엔드 fallback은 없다. 원본 **Save/Download** 동작으로만 PNG를 저장하고, PNG와 provenance는 프로젝트 `.gpt-image/` 아래 mode `0600`이다. `insane-review`와 동시 실행하지 않는다.

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 설치 표면과 전제조건 확인 (읽기 전용·멱등) | — |
| `/omg:no-english [on\|off\|status]` | 현재 세션의 한국어 우선 표현 명시 토글 | — |
| `/omg:insane-review` | 검증된 ChatGPT Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |
| `/omg:gpt-image` | ChatGPT Images 웹 생성 | POSIX + ChatGPT 구독 + Playwright + 전용 Chrome/Chromium CDP 로그인 |

> 전제가 붙은 커맨드는 필요한 도구가 없으면 실행 시 안내하고 멈춘다.

### v0.33.0 묘비

- **사용자 직접 요청(2026-08-18):** OMG Ouroboros wrapper skill과 `/omg:ouroboros-setup` command를 제거했다.
- OMG는 external upstream Ouroboros package 0.51.7, `~/.ouroboros`, upstream marketplace/plugin, GJC bridge extension과 MCP state, Seeds, runs, authentication, configuration을 소유하지 않는다. 모두 외부 상태로 보존하며 제거하지 않는다.

### v0.29.0 묘비

- `preset-pack`: 사용자의 직접 지시로 제거. 커스텀 모델 프리셋 배포를 접고 GJC 내장 프리셋만 쓴다. 업그레이드는 번들이 소유한 native `skills/preset-pack/`·`omg:preset-pack.md`와 `references/preset-pack.yml`만 정리하며, 사용자 `models.yml`과 과거 병합된 `daily`/`agent` 프로파일은 사용자 설정이라 절대 삭제·수정하지 않는다.

### v0.26.0 묘비

- `fable`: 사용자의 직접 지시로 제거. 현재 Fable 감사와 Opus fallback 감사가 모두 보고서 없이 멈췄다. 네이티브 교차세션 리뷰와 `insane-review`는 유지한다.
- 업그레이드는 native `omg:fable.md`만 정리한다. `claude-fable-5` 모델 프리셋 참조는 무관하며 유지한다.

### v0.25 묘비

- `time-left`와 `tools/sdk-lab`: ETA가 사용할 수 있는 측정값을 제공하지 못해 제거했다.
- `lazycodex-gjc`: 사용할 수 있는 Codex 인증/토큰이 없었고 GJC 네이티브 워크플로가 위임을 충당해 제거했다.
- 업그레이드는 번들이 소유한 native skill, command, runtime, receipt만 제거한다. 자격증명, `~/.codex`, `models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 절대 제거하지 않는다.

### v0.32.0 묘비

- **사용자 직접 요청(2026-08-18):** `adaptive-response`, `deep-onboarding`, `multi-harness-research`와 관련 커맨드를 제거하고 multi-harness private native runtime을 퇴역했다.
- 업그레이드 정리는 스위트 소유 native surface, private runtime, 백업된 정상 `gate-always` 소유 마커만 제거한다. 마커 밖 바이트, 손상 마커, 기존 multi-harness research artifact, 외부·사용자 인증/설정, 자격증명, 모델, 무관한 상태는 보존한다.

### 모델 프리셋

모델 구성은 GJC 내장 프리셋을 그대로 쓴다. 설치 스크립트는 `models.yml`을 절대 수정하지 않으며, 이 스위트는 더 이상 커스텀 프리셋을 배포하지 않는다(`preset-pack`은 v0.29.0에서 제거됨). fable 클램프로 죽은 세션은 `gjc -r <세션ID> --mpreset <내장 프리셋>`으로 복구한다.

## 자동 업데이트 (opt-in)

기본 설치는 자동 업데이트를 켜지 않는다. 원하면 명시적으로 opt-in한다:

```sh
bin/omg-autoupdate.sh enable            # systemd --user 타이머(없으면 cron 폴백), 기본 daily
bin/omg-autoupdate.sh enable --interval weekly
bin/omg-autoupdate.sh enable --local /path/to/checkout   # 네트워크 대신 로컬 checkout 재실행
bin/omg-autoupdate.sh status            # 스케줄 여부 + 최근 로그
bin/omg-autoupdate.sh disable           # 해제
```

- 갱신은 신뢰된 canonical `install.sh` 재실행(또는 `--local` checkout)이다. **root 실행 금지**, 단일 실행 잠금, 모든 실행을 `${XDG_STATE_HOME:-~/.local/state}/oh-my-gjc/autoupdate.log`에 기록한다.
- `enable`은 이 스크립트의 안정 복사본을 상태 디렉터리에 두고 타이머가 그것을 가리키게 해서, 플러그인 캐시 경로가 버전마다 바뀌어도 스케줄이 깨지지 않는다.
- 무인 원격 실행(`curl | bash`) 위험을 인지하고 쓰는 것이다. 오프라인·감사 필요 환경은 `--local`을 쓴다.
- `install-skill.sh uninstall … user`는 이 타이머도 함께 해제한다.

## 마이그레이션

v0.27.0은 이전 identity의 마지막 bridge release였다. `oh-my-gjc`가 canonical repository, marketplace/plugin identity, source, local checkout 이름이며, canonical installer는 `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`다.

이전 `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/...` raw URL은 redirect하지 않는다. 이전 GitHub repository page와 Git remote는 redirect하지만, active install 문서와 새 checkout은 새 URL과 `oh-my-gjc` 이름만 쓴다.

새 install은 `oh-my-gjc` runtime binding만 쓴다. 기존 `oh-my-gajae-code` binding은 최소 30일 또는 두 release 동안 read-only fallback으로만 읽고, rewrite·cleanup하지 않는다. 기존 XDG research data, credentials, `models.yml`은 보존한다.

hardened installer 재실행은 이름이 바뀐 `gate-briefing`과 제거된 공개 기능
(`multivendor-presets`, `preset-pack`, `release-gate`, `easy-answer`, `plain-layer`, `branch-flow`,
`gjc-bugwatch`, `time-left`, `lazycodex-gjc`, `adaptive-response`, `deep-onboarding`,
`multi-harness-research`)의 번들 소유 네이티브 잔재와 retired private multi-harness runtime만 정리한다. 기존
`models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 수정하거나 제거하지 않는다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
