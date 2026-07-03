# multivendor-presets

멀티벤더(멀티 프로바이더) **모델 프로파일 프리셋**을 gjc에 설치하는 플러그인.
gjc의 5개 역할(`default` / `executor` / `planner` / `architect` / `critic`)을
여러 벤더에 나눠 배치한 `profiles:` 블록을 사용자의
`~/.gjc/agent/models.yml`에 **이름 단위로 안전하게 병합**한다.

gjc 플러그인 매니페스트에는 `profiles` 필드가 없어 모델 프로파일을 자동 주입할 수
없다. 그래서 이 플러그인은 커맨드/스킬로 gjc를 시켜 병합을 대행한다.

## 프리셋 2종

| 프리셋 | 성격 | 매핑 요약 |
| --- | --- | --- |
| `ultimate` | 비용무시·역할별 최강 + 벤더분산 | default `anthropic/claude-opus-4-8:high` · executor `…:max` · planner `openai-codex/gpt-5.5:xhigh` · architect `google-antigravity/gemini-3.1-pro-low:high` · critic `xai/grok-4.3:high` |
| `ultimate-f5` | **escalation 리네임** — 고실패비용 대응 | default `anthropic/claude-opus-4-8:high`(라우터 유지) · executor `anthropic/claude-fable-5:xhigh`(구원투수, SWE-V 95.0) · planner `openai-codex/gpt-5.5:xhigh` · architect `google-antigravity/gemini-3.1-pro-low:high` · critic `xai/grok-4.3:high` |

- `ultimate-f5`는 사용자 요청대로 `escalation` 프로파일을 이름만 바꿔 실은 것이다:
  라우터(`default`)는 안정·품질상한을 위해 Opus 4.8을 유지하고, `executor`만
  Fable 5로 간헐 승격(구원투수)한다.
- ⚠ `ultimate-f5`의 `executor`는 `:max`를 쓰지 말 것 — Fable 5는 `:max`가 `xhigh`로
  침묵 클램프된다. `:xhigh`로 명시한다.
- 두 프리셋 모두 `required_providers: [anthropic, openai-codex, google-antigravity, xai]`.

> 셀렉터·가격·"축 리더"는 카탈로그/시점 민감(2026-06~07 기준). 개별 검증:
> `gjc -p --no-session --no-tools --model <selector> "Reply OK"`.

원본 정의(정답지): [`references/presets.yml`](./references/presets.yml).

## 설치 / 사용

### 1) 플러그인 설치
```sh
gjc plugin marketplace add devswha/oh-my-gjc      # 최초 1회
gjc plugin install multivendor-presets@oh-my-gjc
```
러닝 gjc 채팅 세션 안에서는 `/plugin` 슬래시 커맨드를 쓴다.

### 2) 프리셋을 models.yml에 병합
gjc 세션에서:
```
/multivendor-presets:install            # ultimate + ultimate-f5 둘 다
/multivendor-presets:install ultimate   # 하나만
```
커맨드는 `~/.gjc/agent/models.yml`을 백업(`.bak-<ts>`)한 뒤 `profiles:` 아래로
대상 프리셋을 **이름 단위 병합**한다(같은 이름이면 교체, 없으면 추가). 다른
프로파일·최상위 키는 건드리지 않는다.

### 3) 활성화
```sh
gjc --mpreset ultimate               # 이번 세션만
gjc --mpreset ultimate --default     # 시작 기본값으로 고정(config.yml)
gjc --mpreset ultimate-f5
```

## 사전 준비 (요구 로그인 — 4벤더)

`required_providers` 중 하나라도 자격증명이 없으면 **활성화가 하드블록**된다.
먼저 로그인한다:
```
/login anthropic
/login openai-codex
/login google-antigravity      # ⚠ 서드파티 클라이언트 ToS 리스크 — 메인 계정 금지 권장
/login xai
```
병합(설치) 자체는 로그인 없이도 되지만, `--mpreset`로 켤 때 검증된다.

## 자동활성화(스킬)는 별도 1회 설치

gjc는 마켓플레이스 플러그인의 `SKILL.md`를 스킬로 싣지 않는다(native `.gjc` 스킬만).
커맨드(`/multivendor-presets:install`)는 설치 즉시 동작하지만, "멀티벤더 프리셋
깔아줘" 같은 자연어 트리거·`skill` 툴로 뜨게 하려면 네이티브 스킬을 1회 설치한다:
```sh
# 설치된 플러그인 캐시 경로에서:
bash ~/.gjc/plugins/cache/plugins/*multivendor-presets*/bin/install-skill.sh          # user 스코프
bash ~/.gjc/plugins/cache/plugins/*multivendor-presets*/bin/install-skill.sh project  # 이 레포만
```

## 안전 계약 (병합, 약화 금지)

- **이름 단위 병합만** — 대상 프리셋 블록만 교체/추가. 다른 프로파일·최상위 키
  (`default`, `modelBindings` 등) 삭제·수정 금지.
- 병합 후 **유효 YAML** + 대상 프리셋 존재 확인. 실패 시 백업 복구, 부분 저장 금지.
- 들여쓰기(2/6칸)·`required_providers`·`model_mapping` 구조·원본 주석 그대로 유지.

## Non-Goals

- 벤더 자동 로그인(수동 `/login`), 자격증명 자동 발급.
- 프로파일 자동 주입(플러그인 매니페스트 미지원) — 병합은 명시적 커맨드로만.
- 셀렉터/가격의 시점 보장 — 카탈로그 변동 시 `references/presets.yml`을 갱신.
