---
description: 멀티벤더 모델 프로파일 프리셋(ideal / escalate-surgical / monorepo)을 ~/.gjc/agent/models.yml에 안전하게 병합한다. 인자로 프리셋 이름을 고르며, 없으면 전부.
argument-hint: "[ideal|escalate-surgical|monorepo|all]  (기본: all)"
---

# /oh-my-gjc:presets

멀티벤더(멀티 프로바이더) 모델 프로파일 프리셋을 사용자의 `~/.gjc/agent/models.yml`
`profiles:` 아래로 **이름 단위로 병합**한다. gjc 플러그인은 models.yml 프로파일을
자동 주입하지 못하므로(플러그인 매니페스트에 profiles 필드 없음), 이 커맨드가
gjc를 시켜 직접 병합한다.

입력 인자: `$ARGUMENTS`  → 비었거나 `all`이면 `ideal`+`escalate-surgical`+`monorepo`
전부, 프리셋 이름이면 해당 하나만.

구버전 정리: 대상 파일에 구버전(multivendor-presets v0.1)이 설치한 `ultimate` /
`ultimate-f5` 블록이 있으면, 사용자에게 "구버전 프리셋 발견 — 삭제할까?"를 물어보고
동의 시 그 두 블록만 제거한다(다른 프로파일은 절대 건드리지 않는다).

## 절대 규칙 (병합 안전 계약 — 약화 금지)

- **이름 단위 병합만.** 대상 프리셋 이름이 이미 있으면 그 블록만 교체, 없으면
  `profiles:` 맨 아래에 추가한다.
- **다른 프로파일·최상위 키(default, modelBindings 등)는 절대 삭제/수정하지 않는다.**
  (구버전 ultimate/ultimate-f5 제거만 예외 — 반드시 사용자 동의 후.)
- 병합 후 파일이 **여전히 유효한 YAML**이어야 하고, 대상 프리셋이 실제로 존재해야
  한다. 하나라도 실패하면 원본을 되돌리고 멈춘다(부분 저장 금지).
- 자격증명(로그인)이 없어도 병합은 진행한다 — 활성화 때 gjc가 하드블록한다.

## Step 0 — 프리셋 원본 경로 해석 (`$OMG`)

`${CLAUDE_PLUGIN_ROOT}`는 gjc 커맨드 본문에서 치환되지 않으므로 실제 경로를 잡는다:
```bash
OMG="$(ls -1 ~/.gjc/plugins/cache/plugins/*oh-my-gjc*/references/presets.yml 2>/dev/null | head -1)"
[ -z "$OMG" ] && OMG="$(ls -1 ./.gjc/plugins/cache/plugins/*oh-my-gjc*/references/presets.yml 2>/dev/null | head -1)"
[ -z "$OMG" ] && [ -f plugins/oh-my-gjc/references/presets.yml ] && OMG="plugins/oh-my-gjc/references/presets.yml"
echo "OMG=$OMG"
```
`$OMG`가 비면 oh-my-gjc 플러그인 설치 여부를 안내하고 멈춘다.

## Step 1 — 대상 파일 준비

- 대상: `~/.gjc/agent/models.yml` (모델 프로파일은 이 경로에서만 읽힘).
- 없으면 `profiles:\n` 한 줄만 있는 파일을 새로 만든다.
- 병합 전 백업: `cp ~/.gjc/agent/models.yml ~/.gjc/agent/models.yml.bak-$(date +%s)`
  (파일이 있을 때만). 실패 시 이 백업으로 복구한다.

## Step 2 — 병합 (gjc가 read/edit로 직접 수행)

1. `read $OMG`로 원본 프리셋 블록을 읽는다. `$ARGUMENTS`에 맞는 블록만 고른다.
2. `read ~/.gjc/agent/models.yml`로 현재 상태를 읽는다.
3. 각 대상 프리셋에 대해:
   - `profiles:` 아래에 같은 이름(`  <name>:`, 2칸 들여쓰기) 블록이 있으면
     그 블록 전체(다음 동급 이하 들여쓰기 항목 직전까지)를 원본 블록으로 **교체**.
   - 없으면 `profiles:` 섹션 맨 끝에 원본 블록을 **추가**(들여쓰기·주석 포함 그대로).
4. `edit`/`write`로 반영한다. 들여쓰기(2/6칸)·`required_providers`·`model_mapping`
   구조를 정확히 유지한다.

## Step 3 — 검증

- 파일이 YAML로 파싱되는지, 대상 프리셋이 `profiles:` 아래에 존재하는지 확인한다
  (예: `read`로 다시 열어 블록 존재 확인).
- 해당 벤더가 로그인돼 있으면 실호출 검증을 제안할 수 있다(선택):
  `gjc -p --no-session --no-tools --model anthropic/claude-opus-4-8:high "Reply OK"`
  등 개별 셀렉터로. **로그인이 없으면 실행하지 말고** 아래 안내만 한다.

## Step 4 — 사용자 안내 (현재 대화 언어로)

병합된 프리셋과 다음을 알린다:

```
활성화:
  gjc --mpreset ideal                  # 평시 기본 (이번 세션만)
  gjc --mpreset ideal --default        # 시작 기본값으로 고정(config.yml)
  gjc --mpreset escalate-surgical      # 난제 그 문제 하나만, 끝나면 ideal 복귀
  gjc --mpreset monorepo               # 거대 코드베이스 전용

요구 로그인:
  ideal              /login anthropic · /login openai-codex · /login xai
  escalate-surgical  + /login google-antigravity (부계정 권장 — 비공식 ToS 리스크)
  monorepo           anthropic · google-antigravity · OPENCODE_API_KEY
  → required_providers 중 하나라도 없으면 활성화가 하드블록됩니다.

프리셋 요약:
  ideal              평시 기본. default/executor=Opus(:xhigh/:max),
                     planner/architect=GPT-5.5:xhigh, critic=Grok(3벤더 독립 게이트)
  escalate-surgical  구원투수 — executor만 Fable 5:xhigh. ⚠:max 금지(침묵 클램프),
                     refusal은 HTTP 200으로 옴. Fable 불가 시 ideal이 폴백.
  monorepo           전 역할 ≥1M ctx (gpt-5.5 272K 배제). 괴물 repo 전용.
```
