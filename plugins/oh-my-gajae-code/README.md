# oh-my-gajae-code (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** 한 번 설치로 스킬 6개 + 커맨드 8개
(`/omg` + `/omg:*` 7개)가 전부 들어온다. `insane-review`는 ChatGPT+크로미움,
`multi-harness-research`는 Linux user namespace+`bwrap`, 정확한 credential-file layout,
그리고 네 provider CLI의 기존 로그인이 필요하다.
## v0.28.0 identity cutover

`oh-my-gajae-code` is the canonical repository, marketplace/plugin identity, source `./plugins/oh-my-gajae-code`, and local checkout name. `/omg:*` commands remain unchanged; the migration contract is below.

## Quick Start

```sh
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gajae-code.git oh-my-gajae-code
bash oh-my-gajae-code/install.sh

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```
플러그인 marketplace 추가·설치·업데이트·제거는 **터미널의 `gjc plugin …` shell CLI만** 쓴다.
gjc 세션의 `/plugin …`은 slash command가 아니라 채팅 텍스트다.

## 들어있는 것 (스킬 6 · 커맨드 8)

### 스킬
`adaptive-response` · `no-english` · `extragoal` · `insane-review` · `deep-onboarding` · `multi-harness-research`

`adaptive-response`, `no-english`, `multi-harness-research`는 자연어로 자동 활성화되지 않는다.
각각 `/omg:gate*`, `/omg:no-english`, `/omg:multi-harness`에서만 명시적으로 불러온다.
`no-english`는 일반 한국어 설명만 다듬으며 `ultragoal`, `ralplan`, `deep-interview`, `team` 같은
GJC 정식 이름과 코드·명령·경로·API 이름은 번역하거나 한글로 음역하지 않는다.

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 셋업 + 전제조건 확인 + 상시 토글 안내 (멱등) | — |
| `/omg:gate [on\|off]` · `/omg:gate-always [on\|off\|status]` | adaptive-response 보정 + 승인 게이트 브리핑 (이번 세션 / 상시) | — |
| `/omg:no-english [on\|off\|status]` | 현재 세션의 한국어 우선 표현 명시 토글 | — |
| `/omg:insane-review` | GPT-5.6 Sol Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |
| `/omg:deep-onboarding [출력 경로]` | 저장소 분석·인터뷰 뒤 확인된 경로에 프로젝트 맵·ADR 제안·인수인계 생성 | — |
| `/omg:multi-harness [확인된 조사 과제]` | 동일 과제를 정확한 네 read-only harness에 직접 fan-out하고 프로젝트 밖 XDG에 결과 보존 | Linux + bwrap + GJC/Codex/Claude의 지원 layout·기존 로그인 |

> 전제가 붙은 커맨드는 필요한 도구가 없으면 실행 시 안내하고 멈춘다.

### v0.29.0 묘비

- `preset-pack`: 사용자의 직접 지시로 제거. 커스텀 모델 프리셋 배포를 접고 GJC 내장 프리셋만 쓴다. 업그레이드는 번들이 소유한 native `skills/preset-pack/`·`omg:preset-pack.md`와 `references/preset-pack.yml`만 정리하며, 사용자 `models.yml`과 과거 병합된 `daily`/`agent` 프로파일은 사용자 설정이라 절대 삭제·수정하지 않는다.

### v0.26.0 묘비

- `fable`: 사용자의 직접 지시로 제거. 현재 Fable 감사와 Opus fallback 감사가 모두 보고서 없이 멈췄다. 네이티브 교차세션 리뷰와 `insane-review`는 유지한다.
- 업그레이드는 native `omg:fable.md`만 정리한다. `claude-fable-5` 모델 프리셋 참조는 무관하며 유지한다.

### v0.25 묘비

- `time-left`와 `tools/sdk-lab`: ETA가 사용할 수 있는 측정값을 제공하지 못해 제거했다.
- `lazycodex-gjc`: 사용할 수 있는 Codex 인증/토큰이 없었고 GJC 네이티브 워크플로와 multi-harness가 위임을 충당해 제거했다.
- 업그레이드는 번들이 소유한 native skill, command, runtime, receipt만 제거한다. 자격증명, `~/.codex`, `models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 절대 제거하지 않는다.

### `multi-harness-research` direct orchestration boundary

`/omg:multi-harness` 또는 명시 스킬 호출만 실행을 시작한다. 인자가 없으면 현재 GJC 리더가
한 문장 목표·질문·기대 산출물을 preview하고 확인을 받는다. `gjc team`·worker synthesis를 쓰지 않는
dedicated orchestrator가 byte-identical normalized task와 동일 safety/output suffix의 SHA-256을 기록해
다음 네 lane에 **이 순서로만** 보낸다: `gjc-opus` (GJC 0.11.x
`anthropic/claude-opus-4-8`, `--thinking max`), `gjc-sol` (GJC 0.11.x
`openai-codex/gpt-5.6-sol`, `--thinking xhigh`), `codex-sol` (`gpt-5.6-sol`, xhigh,
`exec --ephemeral`), `claude-ultracode` (`-p --no-session-persistence --effort ultracode`).
Fallback, model/effort substitution, fifth model, winner/majority/vote/consensus/ranking/recommendation/final verdict는 없다.

실행 전 Linux user namespace, `bwrap`, private user-scope runtime binding, supported exact credential
layout과 네 기존 login을 fail-closed로 확인한다. runner는 provider 설치·업데이트·마이그레이션·login을
하지 않는다. target은 bubblewrap read-only이며 target `.gjc`와 mutable Git state는 노출하지 않는다. GJC/Claude에는
read/search/find + provider-native web만 노출한다: built-in Bash, Write, Edit, Notebook, browser automation,
MCP, hooks, extensions, skills, rules는 없다. Codex는 shell network를 끄고 provider-native web만 쓰는
strict read-only profile이다. 각 private sandbox가 받는 credential은 검증된 read-only regular leaf 하나뿐이다:
GJC `${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json`, Codex
`${CODEX_HOME:-$HOME/.codex}/auth.json`, Claude `$HOME/.claude/.credentials.json`. broad HOME/auth bind,
credential discovery, token environment 전달은 금지된다.

worker는 쓰지 못하며 orchestrator/finalizer만
`${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gajae-code/multi-harness/<repo-id>/<run-id>/`에
no-follow/atomic artifacts를 쓴다 (directory `0700`, file `0600`). 모든 lane terminal 뒤 phase 1이
failure ledger와 `comparison_status: pending` factual base summary를 seal한다: 네 success는
`COMPLETE`/rc `0`, 일부 success는 `INCOMPLETE`/rc `10`, no valid result 또는 run fatal은 rc `1`이다.
valid peer 문서는 실패한 peer 때문에 버리지 않는다. 현재 GJC leader만 성공 문서를 읽고
비권위적 commonalities/differences와 uncertainty를 작성한다. no-model phase-2 finalizer가 one-use receipt,
nonce, digest, immutable facts를 재검증해 comparison placeholder만 atomically publish한다.
`FINALIZATION_FAILED`/rc `20`은 lane truth, phase-1 rc, lane artifact를 변경하지 않는다.
현재 Codex OAuth live result는 **pending-environment (401)** 이며 fake/fixture 성공으로 대체하지 않는다.
uninstall은 owned native surface/runtime만 제거하고 이 XDG artifacts나 provider auth/config를 보존한다.
disposable GJC smoke는 `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`을 prefix하며 일반 working session에는 적용하지 않는다.

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

- 갱신은 신뢰된 canonical `install.sh` 재실행(또는 `--local` checkout)이다. **root 실행 금지**, 단일 실행 잠금, 모든 실행을 `${XDG_STATE_HOME:-~/.local/state}/oh-my-gajae-code/autoupdate.log`에 기록한다.
- `enable`은 이 스크립트의 안정 복사본을 상태 디렉터리에 두고 타이머가 그것을 가리키게 해서, 플러그인 캐시 경로가 버전마다 바뀌어도 스케줄이 깨지지 않는다.
- 무인 원격 실행(`curl | bash`) 위험을 인지하고 쓰는 것이다. 오프라인·감사 필요 환경은 `--local`을 쓴다.
- `install-skill.sh uninstall … user`는 이 타이머도 함께 해제한다.

## 세마포어 구조

`/omg:gate-always`는 `~/.gjc/agent/SYSTEM.md`에 소유 마커 블록
(`<!-- BEGIN oh-my-gjc:gate-always -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다. 이 안정적인 내부 마커는 이름 변경 후에도 보존한다.
업그레이드는 제거된 `easy-always` 마커만 백업 후 정리하며, 다른 사용자 내용은 건드리지 않는다.

## 마이그레이션

v0.27.0은 이전 identity의 마지막 bridge release였다. `oh-my-gajae-code`가 canonical repository, marketplace/plugin identity, source, local checkout 이름이며, canonical installer는 `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh`다.

이전 `https://raw.githubusercontent.com/devswha/oh-my-gjc/...` raw URL은 redirect하지 않는다. 이전 GitHub repository page와 Git remote는 redirect하지만, active install 문서와 새 checkout은 새 URL과 `oh-my-gajae-code` 이름만 쓴다.

새 install은 `oh-my-gajae-code` runtime binding만 쓴다. 기존 `oh-my-gjc` binding은 최소 30일 또는 두 release 동안 read-only fallback으로만 읽고, rewrite·cleanup하지 않는다. 기존 XDG research data, credentials, `models.yml`, 안정적인 내부 `oh-my-gjc:gate-always` marker는 보존한다.

hardened installer 재실행은 이름이 바뀐 `gate-briefing`과 제거된 공개 기능
(`multivendor-presets`, `preset-pack`, `release-gate`, `easy-answer`, `plain-layer`, `branch-flow`,
`gjc-bugwatch`, `time-left`, `lazycodex-gjc`)의 번들 소유 네이티브 잔재만 정리한다. 기존
`models.yml`, 사용자 LazyCodex/OMO, 다른 runtime은 수정하거나 제거하지 않는다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
