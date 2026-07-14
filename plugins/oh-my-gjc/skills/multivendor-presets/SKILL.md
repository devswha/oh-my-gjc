---
name: multivendor-presets
description: 멀티벤더 모델 프로파일 프리셋을 ~/.gjc/agent/models.yml에 설치·병합한다. "멀티벤더 프리셋 깔아줘 / grok 프리셋 / sol 프리셋 / codex 프리셋 / fable 프리셋 / mpreset 프로파일 설치 / 역할별 모델 프로파일 세팅" 같은 요청에 활성화. 정본의 grok·sol·codex·fable-codex를 이름 단위로 병합한다.
---

# multivendor-presets — 멀티벤더 모델 프로파일 프리셋

목적: gjc의 5개 역할(default/executor/planner/architect/critic)을 여러 벤더에
분산 배치한 **멀티벤더 프로파일 프리셋**을 사용자의 `~/.gjc/agent/models.yml`에
안전하게 설치한다. gjc 플러그인 매니페스트에는 profiles 필드가 없어 자동 주입이
불가하므로, gjc가 직접 병합한다.

## 프리셋 (v0.8)

| 프리셋 | 성격 | 요약 |
| --- | --- | --- |
| `grok` | 세션 시작 기본 · 품질 중심 범용 | default=grok-build/grok-4.5:high, executor=terra:xhigh, planner=sol:xhigh, architect/critic=opus(:high/:xhigh). interview/ralplan/ultragoal 겸용 |
| `sol` | 빠른 대화·소형 작업 | default=sol:low, 역할 위임 좌석은 grok과 동일 |
| `codex` | openai-codex 단일 로그인 전용 | default=sol:medium, executor=terra:xhigh, planner=sol:high, architect=sol:xhigh, critic=sol:max. 상류 codex-pro 골격 + 벤치 근거 executor |
| `fable-codex` | 안전-크리티컬 세션 | default=claude-fable-5:high(적대적 감사 성향 본체), 위임 좌석 4개는 `codex`와 동일. Fable 본체 + 교차 패밀리 실행/비평 |

원본 정의는 oh-my-gjc 플러그인의 `references/presets.yml`가 정답지다(gjc `read`로 참고).
구버전의 `daily`/`fast`/`ultimate`/`ultimate-f5`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`은 정본에서 제외됨 — 필요 시 git 히스토리 참조.

## 실행

세부 절차·병합 안전 계약은 `/omg:presets` 커맨드 본문과 동일하다. 핵심만:

1. `references/presets.yml` 경로를 잡는다(`~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/references/presets.yml` glob → `sort -V | tail -1`로 최신 → 없으면 프로젝트/레포 폴백). ⚠ `*oh-my-gjc*`는 마켓플레이스명이라 모든 플러그인 폴더에 걸리니 쓰지 말 것.
2. 대상 `~/.gjc/agent/models.yml`을 백업(`.bak-<ts>`) 후 읽는다. 없으면 `profiles:` 한 줄로 생성.
3. 인자로 선택한 `grok`/`sol`/`codex`/`fable-codex`를 **이름 단위 병합**한다. 인자 없음은 `grok`, `all`은 넷 다다.
4. 은퇴 프리셋 블록(닫힌 목록 — `/omg:presets` 커맨드 본문의 구버전 정리 목록과 동일: `ultimate`/`ultimate-f5`/`daily`/`fast`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`)이 보이면 사용자 동의 후에만 제거. 목록 밖 프로파일은 절대 제거 금지.
5. 병합 후 유효 YAML + 선택한 프리셋 존재를 확인. 실패 시 백업으로 복구하고 멈춘다.
6. 활성화·요구 로그인을 안내한다. 세션 기본은 `gjc --mpreset grok --default`.

## 절대 규칙 (약화 금지)

- **이름 단위 병합만.** 다른 프로파일·최상위 키(default 등)를 삭제/수정하지 않는다. (옛 프리셋 정리는 사용자 동의 후 예외.)
- 병합 결과가 유효 YAML이 아니거나 대상 프리셋이 없으면 **부분 저장 금지**, 백업 복구.
- 들여쓰기(2/6칸)·`required_providers`·`model_mapping` 구조와 원본 주석을 그대로 유지.
- 자격증명 검증은 활성화(gjc --mpreset) 시 gjc가 하드블록한다 — 병합 자체는 막지 않는다.
- 실호출 검증(`GJC_NOTIFICATIONS=0 gjc -p ... --model <selector>`)은 해당 벤더 로그인이 있을 때만. (ephemeral 검증 세션이 텔레그램에 붙어 유령 토픽 만들지 않게 알림 끄고 실행.)

## 활성화 안내 (사용자에게 전달)

```
gjc --mpreset grok                   # 품질 중심 범용
gjc --mpreset grok --default         # 시작 기본값 고정(config.yml)
gjc --mpreset sol                    # 빠른 대화·소형 작업
gjc --mpreset codex                  # openai-codex 단일 로그인 전용
gjc --mpreset fable-codex            # Fable 5 본체 + codex 위임 좌석 (안전-크리티컬)

요구 로그인: grok = grok-build · openai-codex · anthropic / sol = openai-codex · anthropic / codex = openai-codex 단독 / fable-codex = anthropic · openai-codex
```
