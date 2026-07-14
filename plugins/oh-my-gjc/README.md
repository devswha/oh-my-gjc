# oh-my-gajaecode (plugin)

**Gajae Code(gjc)의 oh-my 단일 플러그인.** v0.15.0 한 번 설치로 스킬 9개 + 커맨드 14개
(`/omg` + `/omg:*` 13개)가 전부 들어오고, 모두 네이티브 `/omg:*` 커맨드와 트리거 스킬로 뜬다.
전제조건이 있는 기능(ChatGPT 구독+크로미움 — insane-review; 설치·로그인된 Codex+
LazyCodex/OMO — lazycodex-gjc)도 함께 설치되며, 없으면 실행 시 자기진단해
친절히 멈춘다 — 설치는 가볍고 기능이 스스로 안내한다.

## Quick Start

```
gjc plugin marketplace add devswha/oh-my-gjc     # 최초 1회
gjc plugin install oh-my-gjc@oh-my-gjc

# ⚠ gjc는 플러그인 스킬을 세션에 로드하지 않고, 커맨드의 canonical 표면은 네이티브 /omg:*다.
#    네이티브 설치 1회 (셸에서 — setup 커맨드 자체가 아직 안 뜨므로):
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all

# 새 gjc 세션을 연 뒤 (또는 /move .):
/omg
```

## 들어있는 것 (스킬 9 · 커맨드 14)

### 스킬 (자연어 트리거 자동활성화)
`easy-answer` · `gate-briefing` · `plain-layer` · `multivendor-presets` · `branch-flow` · `extragoal`
· `insane-review` · `gjc-bugwatch` · `lazycodex-gjc`

### 커맨드

| 커맨드 | 기능 | 전제 |
|---|---|---|
| `/omg` | 카탈로그 — 설치된 omg 스킬·커맨드 한눈에 | — |
| `/omg:setup` | 셋업 + 프리셋 병합 제안 + 상시 토글 안내 (멱등) | — |
| `/omg:worktree [new <slug> [type]\|list\|clean]` | git worktree 병렬 작업 폴더 생성·목록·정리 (branch-flow 규약) | git |
| `/omg:easy [on\|off]` · `/omg:easy-always [on\|off\|status]` | 쉬운 답변 (이번 세션 / 상시) | — |
| `/omg:gate [on\|off]` · `/omg:gate-always [on\|off\|status]` | 게이트 브리핑 (이번 세션 / 상시) | — |
| `/omg:plain [<아이디어>\|off]` | 쉬운 기획 (선택지 설명·스펙 대화 다듬기·gate 위임, 세션 한정) | GJC ≥0.10.1 |
| `/omg:presets [grok\|sol\|codex\|fable-codex\|all]` | 모델 프리셋 병합 | — |
| `/omg:fable [대상]` | Fable 5 적대적 안전 감사 (읽기전용, 심각도+파일:라인, 스팟체크) | Fable 5 모델 |
| `/omg:branchflow-always [on\|off\|status]` | 레포 dev/main 브랜치 규율 (레포 AGENTS.md + docs/WORKFLOW.md) | — |
| `/omg:insane-review` | GPT-5.5 Pro 웹 코드 리뷰 (API 비용 0) | ChatGPT 구독 + 크로미움 로그인 |
| `/omg:bugwatch-scan` | gjc 자체 버그 수집 (초안만) | — |
| `/omg:lazycodex-gjc "<작업>"` | 격리 외부 `codex exec --ephemeral` 작업자 (기본 read-only) | 설치·로그인된 Codex + LazyCodex/OMO |

> 전제가 붙은 커맨드는 설치는 이미 됐고, 그 도구가 있어야 실제 동작한다. 없으면 실행 시
> 안내하고 멈춘다. 예전 개별 명령들은 폐기됐다 — 구 이름은 더는 설치되지 않는다(0.8.0의 한-릴리스 안내 스텁은 0.8.1에서 삭제).

### `lazycodex-gjc` 격리 경계

`lazycodex-gjc`는 제거된 옛 `lazycodex` setup/work 표면을 되살리지 않는다. 이미 설치된
Codex CLI + LazyCodex/OMO를 외부 `codex exec --ephemeral`로 한 번 동기 실행한다. 기본은
`read-only`이고, 이번 요청에서 대상 저장소 수정을 명시적으로 허용했을 때만 그 저장소에
`workspace-write`를 쓴다. child GJC 세션·task를 만들지 않으며 GJC config·자격증명을 변경하거나
외부 작업자에게 복사하지 않는다. Codex/LazyCodex/OMO 설치·업데이트·로그인도 자동화하지 않는다.

### 모델 프리셋

| 프리셋 | 성격 | 요약 |
|---|---|---|
| `grok` | 세션 시작 기본 · 품질 중심 | default=grok-build/grok-4.5:high · executor=terra:xhigh · planner=sol:xhigh · architect/critic=opus |
| `sol` | 빠른 대화·소형 작업 | default=sol:low · 역할 위임 좌석은 `grok`과 동일 |
| `codex` | openai-codex 단일 로그인 전용 | default=sol:medium · executor=terra:xhigh · planner=sol:high · architect=sol:xhigh · critic=sol:max |
| `fable-codex` | 안전-크리티컬 세션 | default=claude-fable-5:high(적대적 감사 성향 본체) · 위임 좌석 4개는 `codex`와 동일 |

활성화: `gjc --mpreset grok --default` 또는 `gjc --mpreset sol` / `gjc --mpreset codex` / `gjc --mpreset fable-codex`. 정답지: [`references/presets.yml`](./references/presets.yml).

## 세마포어 구조

`*-always` 커맨드는 `~/.gjc/agent/SYSTEM.md`에 마커 블록
(`<!-- BEGIN oh-my-gjc:<name> -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다 —
블록의 존재가 ON. 사용자 전역 `~/.gjc/agent/AGENTS.md`는 gjc가 발견만 하고 주입 단계에서
버리므로(project 레벨만 통과), 매 턴 실제 주입되는 사용자 전역 표면은 SYSTEM.md가 유일하다.
주의: 프로젝트 `.gjc/SYSTEM.md`가 있는 레포에선 프로젝트 파일이 사용자 파일을 통째로 대체한다.

## 마이그레이션

과거에 개별 플러그인(my-workflows, multivendor-presets, tower, insane-review, codex-*,
lazycodex, gjc-bugwatch)을 따로 설치했다면, 이제 이 단일 스위트로 통합됐다. `/omg:setup`이
잔재를 감지해 정리를 제안한다(동의 후 셸): 예 `gjc plugin uninstall my-workflows@oh-my-gjc`.
구 개별 명령 이름은 폐기됐고 더는 설치되지 않는다 — 새 `/omg:*` 이름만 쓴다.
### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- plain-layer does not reimplement deep-interview/ralplan/ultragoal/team; gate-briefing remains the approval-briefing canon (coexist+delegate).
- 벤더 자동 로그인·자격증명 발급.
- 셀렉터/가격의 시점 보장 — 카탈로그 변동 시 `references/presets.yml` 갱신.
