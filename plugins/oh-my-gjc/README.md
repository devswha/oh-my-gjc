# oh-my-gjc (core plugin)

**Gajae Code(gjc)의 oh-my 코어 플러그인.** 한 번 설치하면 UX 스킬·승인 게이트
브리핑·멀티벤더 모델 프리셋·세마포어 토글·환경 감지 셋업이 전부 들어온다.
무겁거나 전제조건이 있는 기능(codex 스위트, insane-review, gjc-bugwatch)은
옵션 플러그인으로 분리돼 있고, `/oh-my-gjc:setup`이 환경을 보고 추천한다.

## Quick Start

```
/plugin marketplace add devswha/oh-my-gjc     # 최초 1회
/plugin install oh-my-gjc@oh-my-gjc

# ⚠ gjc는 마켓플레이스 플러그인의 커맨드·스킬을 세션에 로드하지 않는다.
#    네이티브 설치 1회 (셸에서 — setup 커맨드 자체가 아직 안 뜨므로):
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all

# 새 gjc 세션을 연 뒤 (또는 /move .):
/oh-my-gjc:setup
```

## 들어있는 것

### 스킬 3종 (자연어 트리거 자동활성화 — `:setup`이 네이티브 설치)

| 스킬 | 기능 | 트리거 예 |
|---|---|---|
| `easy-answer` | 최종 답변을 전문용어 없이 쉬운 말로 (정확성 우선) | "쉽게 말해줘", "이게 무슨 뜻이야" |
| `gate-briefing` | 승인 게이트를 도메인 지식 없이 판정할 4부 브리핑: 비전문가 번역 → 승인 경계 → 체크리스트(원문 근거) → 판정 | "승인해도 돼?", "pending 어떻게 해" |
| `multivendor-presets` | 멀티벤더 모델 프리셋을 models.yml에 안전 병합 | "멀티벤더 프리셋 깔아줘" |
| `branch-flow` | 이 레포의 git 브랜치·머지·릴리즈를 dev통합/main릴리즈 모델로 진행 | "브랜치 파줘", "dev에 머지", "릴리즈하자" |

### 커맨드

| 커맨드 | 기능 |
|---|---|
| `/oh-my-gjc:setup` | 셋업 + 환경 감지 → 옵션 플러그인 추천 (멱등) |
| `/oh-my-gjc:easy [on\|off]` | 쉬운 답변 — 이번 세션 토글 |
| `/oh-my-gjc:easy-always [on\|off\|status]` | 쉬운 답변 — 전 세션 상시 (SYSTEM.md 마커 세마포어) |
| `/oh-my-gjc:gate [on\|off]` | 게이트 브리핑 — 이번 세션 토글 |
| `/oh-my-gjc:gate-always [on\|off\|status]` | 게이트 브리핑 — 전 세션 상시 |
| `/oh-my-gjc:presets [이름\|all]` | 모델 프리셋 병합 (`ideal` / `escalate-surgical` / `monorepo`) |
| `/oh-my-gjc:fable [대상 힌트]` | **Fable 5 적대적 안전 감사** — 돈·데이터가 걸린 코드의 불변식 깨기 (읽기 전용, 심각도+파일:라인, 스팟체크 검증, gate-briefing 브리핑). 실증: 3벤더 합의가 놓친 CRITICAL 발견 |
| `/oh-my-gjc:branchflow-always [on\|off\|status]` | 브랜치 규율 — 이 레포에 상시 (레포 `AGENTS.md` + `docs/WORKFLOW.md`, 커밋 대상) |

### 모델 프리셋 3종 (2026-07 증거 리서치 기반)

| 프리셋 | 성격 | 요약 |
|---|---|---|
| `ideal` | 평시 기본 | default/executor=Opus(:xhigh/:max) · planner/architect=GPT-5.5:xhigh(교차 리뷰) · critic=Grok(독립 게이트) |
| `escalate-surgical` | 구원투수 | executor만 Fable 5:xhigh — 난제 전용, 끝나면 복귀 |
| `monorepo` | 거대 repo | 전 역할 ≥1M ctx |

활성화: `gjc --mpreset ideal --default`. 정답지: [`references/presets.yml`](./references/presets.yml).

## 세마포어 구조

`*-always` 커맨드는 `~/.gjc/agent/SYSTEM.md`에 마커 블록
(`<!-- BEGIN oh-my-gjc:<name> -->` ~ `<!-- END ... -->`)을 넣고 빼는 방식이다 —
블록의 존재가 ON. **live-verified (gjc 0.8.2):** 예전 대상이던 사용자 전역
`~/.gjc/agent/AGENTS.md`는 gjc가 발견만 하고 주입 단계에서 버린다(project 레벨만
통과) — 매 턴 실제로 주입되는 사용자 전역 표면은 SYSTEM.md
(`<system-prompt-customization>`)가 유일하다. 구버전(my-workflows) 마커와
AGENTS.md 세대 마커는 자동 마이그레이션. 주의: 프로젝트 `.gjc/SYSTEM.md`가 있는
레포에선 프로젝트 파일이 사용자 파일을 통째로 대체한다.

## 마이그레이션 (my-workflows / multivendor-presets 사용자)

이 플러그인은 구 `my-workflows` v0.3 + `multivendor-presets` v0.2를 흡수했다.
`/oh-my-gjc:setup`이 구버전 잔재를 감지해 정리를 제안한다:
`/plugin uninstall my-workflows@oh-my-gjc`, `/plugin uninstall multivendor-presets@oh-my-gjc`.

## Non-Goals

- gjc 내장 워크플로(team/ultragoal/ralplan/deep-interview) 중복 구현 — gjc가 네이티브로 잘함.
- 벤더 자동 로그인·자격증명 발급.
- 셀렉터/가격의 시점 보장 — 카탈로그 변동 시 `references/presets.yml` 갱신.
