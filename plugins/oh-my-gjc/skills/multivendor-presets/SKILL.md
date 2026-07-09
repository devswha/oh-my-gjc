---
name: multivendor-presets
description: 멀티벤더 모델 프로파일 프리셋(멀티벤더/멀티 프로바이더 프리셋)을 ~/.gjc/agent/models.yml에 설치·병합한다. "멀티벤더 프리셋 깔아줘 / ideal 프리셋 추가 / escalate-surgical 넣어줘 / monorepo 프리셋 / mpreset 프로파일 설치 / 역할별 모델 프로파일 세팅" 같은 요청에 활성화. ideal(평시 기본)·escalate-surgical(Fable 구원투수)·monorepo(전 역할 1M ctx)를 이름 단위로 안전하게 병합한다.
---

# multivendor-presets — 멀티벤더 모델 프로파일 프리셋

목적: gjc의 5개 역할(default/executor/planner/architect/critic)을 여러 벤더에
분산 배치한 **멀티벤더 프로파일 프리셋**을 사용자의 `~/.gjc/agent/models.yml`에
안전하게 설치한다. gjc 플러그인 매니페스트에는 profiles 필드가 없어 자동 주입이
불가하므로, gjc가 직접 병합한다.

## 프리셋 3종 (2026-07 증거 리서치 기반)

| 프리셋 | 성격 | 요약 |
| --- | --- | --- |
| `ideal` | 평시 기본 | default=Opus:xhigh, executor=Opus:max, planner/architect=GPT-5.5:xhigh(코드 레인 교차 리뷰), critic=Grok 4.3:high(3벤더 독립 게이트) |
| `escalate-surgical` | 구원투수 (상시 아님) | executor만 Fable 5:xhigh — 탐색량 큰 난제 디버깅 전용. 끝나면 ideal 복귀. ⚠:max 금지(침묵 클램프) |
| `monorepo` | 거대 코드베이스 | 전 역할 ≥1M ctx (gpt-5.5 272K 배제). critic=glm-5.2(⚠Claude 증류-상관성 주석 참조) |

원본 정의는 oh-my-gjc 플러그인의 `references/presets.yml`가 정답지다(gjc `read`로 참고).
구버전(multivendor-presets v0.1)의 `ultimate`/`ultimate-f5`는 폐기 — ultimate는
ideal에 흡수(architect gemini가 툴체인 신뢰성 실측으로 탈락), ultimate-f5는
2026-07-07 만료 이벤트였다.

## 실행

세부 절차·병합 안전 계약은 `/omg:presets` 커맨드 본문과 동일하다. 핵심만:

1. `references/presets.yml` 경로를 잡는다(`~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/references/presets.yml` glob → `sort -V | tail -1`로 최신 → 없으면 프로젝트/레포 폴백). ⚠ `*oh-my-gjc*`는 마켓플레이스명이라 모든 플러그인 폴더에 걸리니 쓰지 말 것.
2. 대상 `~/.gjc/agent/models.yml`을 백업(`.bak-<ts>`) 후 읽는다. 없으면 `profiles:` 한 줄로 생성.
3. 요청된 프리셋을 **이름 단위 병합**: 같은 이름이면 그 블록만 교체, 없으면 `profiles:` 끝에 추가.
4. 구버전 `ultimate`/`ultimate-f5` 블록이 보이면 사용자 동의 후에만 제거.
5. 병합 후 유효 YAML + 대상 프리셋 존재를 확인. 실패 시 백업으로 복구하고 멈춘다.
6. 활성화·요구 로그인을 안내한다.

## 절대 규칙 (약화 금지)

- **이름 단위 병합만.** 다른 프로파일·최상위 키(default 등)를 삭제/수정하지 않는다.
- 병합 결과가 유효 YAML이 아니거나 대상 프리셋이 없으면 **부분 저장 금지**, 백업 복구.
- 들여쓰기(2/6칸)·`required_providers`·`model_mapping` 구조와 원본 주석을 그대로 유지.
- 자격증명 검증은 활성화(gjc --mpreset) 시 gjc가 하드블록한다 — 병합 자체는 막지 않는다.
- 실호출 검증(`GJC_NOTIFICATIONS=0 gjc -p ... --model <selector>`)은 해당 벤더 로그인이 있을 때만. (ephemeral 검증 세션이 텔레그램에 붙어 유령 토픽 만들지 않게 알림 끄고 실행.)

## 활성화 안내 (사용자에게 전달)

```
gjc --mpreset ideal                  # 평시 기본 (이번 세션만)
gjc --mpreset ideal --default        # 시작 기본값 고정(config.yml)
gjc --mpreset escalate-surgical      # 난제 하나만, 끝나면 복귀
gjc --mpreset monorepo               # 거대 repo 전용

요구 로그인: ideal = /login anthropic · /login openai-codex · /login xai
  escalate-surgical + /login google-antigravity (부계정 권장)
  monorepo = anthropic · google-antigravity · OPENCODE_API_KEY
```
