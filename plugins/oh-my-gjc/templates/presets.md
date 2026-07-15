---
description: 커스텀 모델 프로파일 프리셋 `sol`을 ~/.gjc/agent/models.yml에 안전하게 병합한다. 품질/비상/안전 레인은 gjc 빌트인(opus-codex·codex-pro·fable-opus-codex)을 안내한다.
argument-hint: "[sol|all]  (기본: sol)"
---

# /omg:presets

커스텀 모델 프로파일 프리셋 `sol`(전 구간 저지연 codex+opus)을 사용자의
`~/.gjc/agent/models.yml` `profiles:` 아래로 **이름 단위로 병합**한다. gjc 플러그인은
models.yml 프로파일을 자동 주입하지 못하므로(플러그인 매니페스트에 profiles 필드 없음),
이 커맨드가 gjc를 시켜 직접 병합한다.

커스텀은 `sol` 하나뿐이다 — 나머지 용도는 gjc **빌트인** 프리셋이 커버하므로
병합할 것이 없다(빌트인은 gjc 업그레이드 시 상류가 자동 최신화):

```
gjc --mpreset opus-codex         # 품질 랄플랜 (opus 본체 + codex 좌석)
gjc --mpreset codex-medium      # openai-codex 단일 로그인 비상 (중간)
gjc --mpreset codex-pro         # openai-codex 단일 로그인 비상 (상위)
gjc --mpreset fable-opus-codex   # 안전-크리티컬 (Fable 본체)
```

입력 인자: `$ARGUMENTS` → 비었거나 `sol`/`all`이면 `sol`을 병합한다.
그 외 이름은 현재 정본에 없으므로 안내하고 멈춘다(빌트인 이름이면 병합 불필요 —
`gjc --mpreset <이름>`으로 바로 활성화하라고 안내).

구버전 정리: 대상 파일에 **은퇴 프리셋(닫힌 목록)** — `ultimate`/`ultimate-f5`/`daily`/`fast`/
`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`/`grok`/`codex`/`fable-codex` —
이 있으면, 사용자에게 "옛 프리셋 발견 — 삭제할까?"를 물어보고 동의 시 해당 블록만 제거한다.
**이 목록에 없는 프로파일은 이름이 무엇이든 절대 제거 대상이 아니다**
(다른 프로파일·최상위 키도 절대 건드리지 않는다).

**시작 기본값 보호 (필수 — 약화 금지):** 은퇴 블록을 제거하기 **전에**
`~/.gjc/agent/config.yml`의 `modelProfile.default`를 반드시 확인한다. 삭제 대상 이름이
시작 기본값으로 박혀 있으면, 기본값을 먼저 이전한 뒤에만 그 블록을 삭제한다 —
권장 이전: `sol` 병합 후 `gjc --mpreset sol --default`, 또는 대응 빌트인
(`grok`→`opus-codex` · `codex`→`codex-medium`/`codex-pro` · `fable-codex`→`fable-opus-codex`).
**기본값 이전 없이 그 블록을 삭제하는 것은 금지**한다 — 다음 gjc 시작이
Unknown model profile로 깨진다. 사용자가 이전을 거부하면 해당 블록은 남긴다.

## 절대 규칙 (병합 안전 계약 — 약화 금지)

- **이름 단위 병합만.** `sol`이 이미 있으면 해당 블록만 교체, 없으면 `profiles:` 맨 아래에 추가한다.
- **다른 프로파일·최상위 키(default, modelBindings 등)는 절대 삭제/수정하지 않는다.**
  (옛 프리셋 제거만 예외 — 반드시 사용자 동의 후.)
- 병합 후 파일이 **여전히 유효한 YAML**이어야 하고, `sol`이 실제로
  존재해야 한다. 하나라도 실패하면 원본을 되돌리고 멈춘다(부분 저장 금지).
- 자격증명(로그인)이 없어도 병합은 진행한다 — 활성화 때 gjc가 하드블록한다.

## Step 0 — 프리셋 원본 경로 해석 (`$OMG`)
`${CLAUDE_PLUGIN_ROOT}`는 gjc 커맨드 본문에서 치환되지 않는다. 네이티브 설치가 기록한 정확한
suite root binding만 사용한다. 프로젝트 binding을 우선하고, 없을 때만 user binding을 쓰며,
둘 다 없을 때만 현재 checkout의 정확한 asset으로 fallback한다:
```bash
resolve_omg_asset() (
  fail() { echo "oh-my-gjc runtime binding is missing or invalid; rerun hardened install.sh." >&2; exit 1; }
  local expected_asset="$1" binding root bytes byte asset asset_dir canonical_root canonical_asset_dir
  for binding in "$PWD/.gjc/runtimes/oh-my-gjc/root" "$HOME/.gjc/agent/runtimes/oh-my-gjc/root"; do
    if [ -e "$binding" ] || [ -L "$binding" ]; then
      [ -f "$binding" ] && [ ! -L "$binding" ] || fail
      bytes="$(LC_ALL=C od -An -v -tu1 "$binding")" || fail
      for byte in $bytes; do
        case "$byte" in 0|[1-9]|1[1-9]|2[0-9]|3[01]|127) fail ;; esac
      done
      exec 3< "$binding" || fail
      IFS= read -r root <&3 || { exec 3<&-; fail; }
      if IFS= read -r -n 1 _ <&3; then exec 3<&-; fail; fi
      exec 3<&-
      case "$root" in ""|*[[:cntrl:]]*) fail ;; /*) ;; *) fail ;; esac
      canonical_root="$(cd -P -- "$root" 2>/dev/null && pwd -P)" || fail
      [ "$root" = "$canonical_root" ] || fail
      asset="$canonical_root/$expected_asset"
      asset_dir="${asset%/*}"
      canonical_asset_dir="$(cd -P -- "$asset_dir" 2>/dev/null && pwd -P)" || fail
      [ "$asset_dir" = "$canonical_asset_dir" ] && [ -f "$asset" ] && [ ! -L "$asset" ] || fail
      printf '%s\n' "$asset"
      exit 0
    fi
  done
  [ -f "plugins/oh-my-gjc/$expected_asset" ] && [ ! -L "plugins/oh-my-gjc/$expected_asset" ] || fail
  canonical_root="$(cd -P -- "plugins/oh-my-gjc" 2>/dev/null && pwd -P)" || fail
  asset="$canonical_root/$expected_asset"
  asset_dir="${asset%/*}"
  canonical_asset_dir="$(cd -P -- "$asset_dir" 2>/dev/null && pwd -P)" || fail
  [ "$asset_dir" = "$canonical_asset_dir" ] && [ -f "$asset" ] && [ ! -L "$asset" ] || fail
  printf '%s\n' "$asset"
)
OMG="$(resolve_omg_asset "references/presets.yml")" || exit 1
echo "OMG=$OMG"
```
A malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing binding stops here; rerun hardened `install.sh` rather than selecting a cache.

## Step 1 — 대상 파일 준비

- 대상: `~/.gjc/agent/models.yml` (모델 프로파일은 이 경로에서만 읽힘).
- 없으면 `profiles:\n` 한 줄만 있는 파일을 새로 만든다.
- 병합 전 백업: `cp ~/.gjc/agent/models.yml ~/.gjc/agent/models.yml.bak-$(date +%s)`
  (파일이 있을 때만). 실패 시 이 백업으로 복구한다.

## Step 2 — 병합 (gjc가 read/edit로 직접 수행)

1. `read $OMG`로 원본에서 `sol` 블록을 읽는다.
2. `read ~/.gjc/agent/models.yml`로 현재 상태를 읽는다.
3. `profiles:` 아래에 같은 이름(2칸 들여쓰기) 블록이 있으면
   그 블록 전체(다음 동급 이하 들여쓰기 항목 직전까지)를 원본 블록으로 **교체**.
   없으면 `profiles:` 섹션 맨 끝에 원본 블록을 **추가**(들여쓰기·주석 포함 그대로).
4. `edit`/`write`로 반영한다. 들여쓰기(2/6칸)·`required_providers`·`model_mapping`
   구조를 정확히 유지한다.

## Step 3 — 검증

- 파일이 YAML로 파싱되는지, `sol`이 `profiles:` 아래에 존재하는지 확인한다
  (예: `read`로 다시 열어 블록 존재 확인).
- 해당 벤더가 로그인돼 있으면 실호출 검증을 제안할 수 있다(선택):
  `GJC_NOTIFICATIONS=0 gjc -p --no-session --no-tools --model openai-codex/gpt-5.6-sol:low "Reply OK"`
  등 개별 셀렉터로. **로그인이 없으면 실행하지 말고** 아래 안내만 한다.

## Step 4 — 사용자 안내 (현재 대화 언어로)

병합 결과와 다음을 알린다:

```
활성화:
  gjc --mpreset sol                    # 이번 세션만
  gjc --mpreset sol --default          # 시작 기본값으로 고정(config.yml, 권장)

빌트인 레인 (병합 불필요 — 바로 활성화):
  gjc --mpreset opus-codex             # 품질 랄플랜
  gjc --mpreset codex-medium           # openai-codex 단일 로그인 비상 (중간)
  gjc --mpreset codex-pro              # openai-codex 단일 로그인 비상 (상위)
  gjc --mpreset fable-opus-codex       # 안전-크리티컬

요구 로그인:
  sol                openai-codex · anthropic
  → required_providers 중 하나라도 없으면 활성화가 하드블록됩니다.

sol 요약:
  default=sol:low · planner=sol:high · architect=opus:medium · critic=opus:high
  · executor=terra:xhigh (벤치 근거). 실측(n=1): 실전 ralplan 신형 8:24 합의완료
  vs 구형 xhigh 좌석 17:18에도 합의 미완 — ≥2×.
```
