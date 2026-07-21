# GPT-5.6 Sol Pro를 agent-council 웹 전용 멤버로 등록

GPT-5.6 Sol Pro는 API가 없어 기존 council 멤버(claude/codex/gemini, 전부 CLI/API)로는 못 넣는다.
insane-review의 `--council` 모드가 그 간극을 메운다 — **프롬프트를 위치인자로 받고, 응답만 stdout으로** 내보내(진행 로그는 stderr) council worker가 `output.txt`로 그대로 캡처한다.

## 작동 방식 (council worker 계약)

council worker는 멤버 `command` 문자열을 토큰화한 뒤 **프롬프트를 마지막 인자로 붙여** `spawn(program, [...args, prompt])` 하고 **stdout을 캡처**한다. `--council`은 정확히 그 계약에 맞춰져 있다.

## 엔진 절대경로 확인
council worker는 셸 없이 execFile 하므로 `command`엔 **엔진의 절대경로**를 넣는다(공백 없게).
새 suite binding을 프로젝트→user 순서로 먼저 확인하고, 둘 다 없을 때만 **읽기 전용·기간 한정 compatibility fallback**인 기존 `oh-my-gjc` binding을 프로젝트→user 순서로 확인한다. 모두 없을 때만 정확한 현재 checkout asset을 쓴다. 기존 binding이나 user state는 절대 쓰거나 지우지 않는다:
```bash
resolve_omg_asset() (
  fail() { echo "oh-my-gajae-code runtime binding is missing or invalid; rerun https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh." >&2; exit 1; }
  reject_symlinked_components() {
    local path="$1" current="/" component
    local -a components
    case "$path" in /*) ;; *) fail ;; esac
    IFS=/ read -r -a components <<<"${path#/}"
    for component in "${components[@]}"; do
      [ -n "$component" ] || continue
      current="${current%/}/$component"
      [ ! -L "$current" ] || fail
    done
  }
  local expected_asset="$1" binding root bytes byte asset asset_dir canonical_root canonical_asset_dir checkout
  local -a bindings=(
    "$PWD/.gjc/runtimes/oh-my-gajae-code/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gajae-code/root"
  )
  # Bounded read-only compatibility fallback; never mutate legacy paths.
  local -a legacy_compatibility_bindings=(
    "$PWD/.gjc/runtimes/oh-my-gjc/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
  )
  bindings+=("${legacy_compatibility_bindings[@]}")
  for binding in "${bindings[@]}"; do
    if [ -e "$binding" ] || [ -L "$binding" ]; then
      reject_symlinked_components "$binding"
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
  checkout="$PWD/plugins/oh-my-gajae-code"
  reject_symlinked_components "$checkout"
  [ -d "$checkout" ] && [ ! -L "$checkout" ] || fail
  canonical_root="$(cd -P -- "$checkout" 2>/dev/null && pwd -P)" || fail
  asset="$canonical_root/$expected_asset"
  asset_dir="${asset%/*}"
  canonical_asset_dir="$(cd -P -- "$asset_dir" 2>/dev/null && pwd -P)" || fail
  [ "$asset_dir" = "$canonical_asset_dir" ] && [ -f "$asset" ] && [ ! -L "$asset" ] || fail
  printf '%s\n' "$asset"
)
IR="$(resolve_omg_asset "bin/pack_and_ask.py")" || exit 1
printf '%s\n' "$IR"
```
Malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing bindings fail closed; repair with `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh`, never a plugin cache.

## council.config.yaml 에 멤버 추가

```yaml
council:
  chairman:
    role: "auto"
  members:
    - name: claude
      command: "claude -p"
      emoji: "🧠"
      color: "CYAN"
    - name: codex
      command: "codex exec"
      emoji: "🤖"
      color: "BLUE"
    # ── GPT-5.6 Sol Pro (웹 전용, insane-review 경유) ──
    - name: gpt-pro
      command: "python3 /ABS/PATH/oh-my-gajae-code/bin/pack_and_ask.py --council --model pro --require-model \"GPT-5.6\" --force-answer-after 120"
      emoji: "🌐"
      color: "MAGENTA"
  settings:
    exclude_chairman_from_members: true
    timeout: 600   # ⚠️ Pro 리즈닝이 길다 — 기본 120s로는 SIGTERM될 수 있어 늘린다
```

- `/ABS/PATH/oh-my-gajae-code/bin/pack_and_ask.py`는 위 resolver가 출력한 **절대경로** 그대로. (경로에 공백 없게.)
- `--require-model "GPT-5.6"`: council 경로에서도 활성 모델명을 검증(불일치/미확정이면 fail-closed로 전송 중단). 빼면 effort만 검증되고 기반 모델은 무엇이든 통과한다.
- `--force-answer-after 120`: 120초 후 "지금 답변 받기"로 리즈닝을 끊어 회수 시간을 bound. council `timeout`은 그보다 넉넉히(예: 600).
- council은 멤버를 **병렬 detached**로 띄운다. gpt-pro는 자기 브라우저 탭을 새로 열므로 다른 멤버와 충돌하지 않지만, **동시에 두 개의 insane-review 잡이 같은 브라우저를 몰면 안 된다**(한 council 잡에 gpt-pro 멤버는 하나).

## 선행 조건
- 크로미움 계열 브라우저가 디버그포트(9222)로 실행 + chatgpt.com 로그인 + 모델 Pro.
- `playwright`, `pyperclip` 설치(`python3 <엔진> --check-env --install`).

## 검증 방법
```bash
# 위 binding 검증에서 출력된 절대경로를 그대로 사용한다.
IR="/ABS/PATH/oh-my-gajae-code/bin/pack_and_ask.py"
[ -f "$IR" ] && [ ! -L "$IR" ] || { echo "engine missing" >&2; exit 1; }
# 단독으로 council 계약 확인: stdout엔 응답만, stderr엔 로그
python3 "$IR" --council --model pro --require-model "GPT-5.6" \
  --force-answer-after 60 "한 문장으로: 1+1은?" 2>/dev/null
# → GPT 응답 텍스트만 출력되어야 한다
```
