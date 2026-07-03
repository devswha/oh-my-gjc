---
name: multivendor-presets
description: 멀티벤더 모델 프로파일 프리셋(멀티벤더/멀티 프로바이더 프리셋)을 ~/.gjc/agent/models.yml에 설치·병합한다. "멀티벤더 프리셋 깔아줘 / ultimate 프리셋 추가 / ultimate-f5 넣어줘 / mpreset 프로파일 설치 / 역할별 모델 프로파일 세팅" 같은 요청에 활성화. ultimate(비용무시·역할별 최강)와 ultimate-f5(escalation 리네임)를 이름 단위로 안전하게 병합한다.
---

# multivendor-presets — 멀티벤더 모델 프로파일 프리셋

목적: gjc의 5개 역할(default/executor/planner/architect/critic)을 여러 벤더에
분산 배치한 **멀티벤더 프로파일 프리셋**을 사용자의 `~/.gjc/agent/models.yml`에
안전하게 설치한다. gjc 플러그인 매니페스트에는 profiles 필드가 없어 자동 주입이
불가하므로, gjc가 직접 병합한다.

## 프리셋 2종

| 프리셋 | 성격 | 요약 |
| --- | --- | --- |
| `ultimate` | 비용무시·역할별 최강 | default=Opus:high, executor=Opus:max, planner=GPT-5.5:xhigh, architect=Gemini 3.1 Pro:high, critic=Grok 4.3:high |
| `ultimate-f5` | escalation 리네임 | default=Opus:high(라우터 유지), executor=Fable 5:xhigh(구원투수), planner=GPT-5.5:xhigh, architect=Gemini 3.1 Pro:high, critic=Grok 4.3:high |

둘 다 `required_providers: [anthropic, openai-codex, google-antigravity, xai]`.
원본 정의는 플러그인의 `references/presets.yml`가 정답지다(gjc `read`로 참고).

## 실행

세부 절차·병합 안전 계약은 `/multivendor-presets:install` 커맨드 본문과 동일하다.
핵심만:

1. `references/presets.yml` 경로를 잡는다(`~/.gjc/plugins/cache/plugins/*multivendor-presets*/references/presets.yml` glob → 없으면 프로젝트/레포 폴백).
2. 대상 `~/.gjc/agent/models.yml`을 백업(`.bak-<ts>`) 후 읽는다. 없으면 `profiles:` 한 줄로 생성.
3. 요청된 프리셋을 **이름 단위 병합**: 같은 이름이면 그 블록만 교체, 없으면 `profiles:` 끝에 추가.
4. 병합 후 유효 YAML + 대상 프리셋 존재를 확인. 실패 시 백업으로 복구하고 멈춘다.
5. 활성화·요구 로그인을 안내한다.

## 절대 규칙 (약화 금지)

- **이름 단위 병합만.** 다른 프로파일·최상위 키(default 등)를 삭제/수정하지 않는다.
- 병합 결과가 유효 YAML이 아니거나 대상 프리셋이 없으면 **부분 저장 금지**, 백업 복구.
- 들여쓰기(2/6칸)·`required_providers`·`model_mapping` 구조와 원본 주석을 그대로 유지.
- 자격증명 검증은 활성화(gjc --mpreset) 시 gjc가 하드블록한다 — 병합 자체는 막지 않는다.
- 실호출 검증(`gjc -p ... --model <selector>`)은 해당 벤더 로그인이 있을 때만.

## 활성화 안내 (사용자에게 전달)

```
gjc --mpreset ultimate               # 이번 세션만
gjc --mpreset ultimate --default     # 시작 기본값 고정(config.yml)
gjc --mpreset ultimate-f5

요구 로그인: /login anthropic · /login openai-codex ·
  /login google-antigravity · /login xai
```
