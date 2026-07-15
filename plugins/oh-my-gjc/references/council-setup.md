# GPT-5.6 Sol Pro를 agent-council 웹 전용 멤버로 등록

GPT-5.6 Sol Pro는 API가 없어 기존 council 멤버(claude/codex/gemini, 전부 CLI/API)로는 못 넣는다.
insane-review의 `--council` 모드가 그 간극을 메운다 — **프롬프트를 위치인자로 받고, 응답만 stdout으로** 내보내(진행 로그는 stderr) council worker가 `output.txt`로 그대로 캡처한다.

## 작동 방식 (council worker 계약)

council worker는 멤버 `command` 문자열을 토큰화한 뒤 **프롬프트를 마지막 인자로 붙여** `spawn(program, [...args, prompt])` 하고 **stdout을 캡처**한다. `--council`은 정확히 그 계약에 맞춰져 있다.

## 엔진 절대경로 확인

council worker는 셸 없이 execFile 하므로 `command`엔 **엔진의 절대경로**를 넣는다(공백 없게).
네이티브 installer가 기록한 exact suite binding에서 확인한다:
```bash
B="$PWD/.gjc/runtimes/oh-my-gjc/root"
[ -f "$B" ] && [ ! -L "$B" ] || B="$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
[ -f "$B" ] && [ ! -L "$B" ] || { echo "binding missing — rerun hardened install.sh" >&2; exit 1; }
[ "$(wc -l < "$B")" -eq 1 ] || { echo "malformed binding" >&2; exit 1; }
IFS= read -r ROOT < "$B"
CANON="$(cd -P -- "$ROOT" 2>/dev/null && pwd -P)" || exit 1
[ "$ROOT" = "$CANON" ] || { echo "non-canonical binding" >&2; exit 1; }
IR="$CANON/bin/pack_and_ask.py"
[ -f "$IR" ] && [ ! -L "$IR" ] || { echo "engine missing" >&2; exit 1; }
printf '%s\n' "$IR"
```

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
      command: "python3 /ABS/PATH/oh-my-gjc/bin/pack_and_ask.py --council --model pro --require-model \"GPT-5.6\" --force-answer-after 120"
      emoji: "🌐"
      color: "MAGENTA"
  settings:
    exclude_chairman_from_members: true
    timeout: 600   # ⚠️ Pro 리즈닝이 길다 — 기본 120s로는 SIGTERM될 수 있어 늘린다
```

- `/ABS/PATH/oh-my-gjc/bin/pack_and_ask.py`는 위에서 확인한 **절대경로** 그대로. (경로에 공백 없게.)
- `--require-model "GPT-5.6"`: council 경로에서도 활성 모델명을 검증(불일치/미확정이면 fail-closed로 전송 중단). 빼면 effort만 검증되고 기반 모델은 무엇이든 통과한다.
- `--force-answer-after 120`: 120초 후 "지금 답변 받기"로 리즈닝을 끊어 회수 시간을 bound. council `timeout`은 그보다 넉넉히(예: 600).
- council은 멤버를 **병렬 detached**로 띄운다. gpt-pro는 자기 브라우저 탭을 새로 열므로 다른 멤버와 충돌하지 않지만, **동시에 두 개의 insane-review 잡이 같은 브라우저를 몰면 안 된다**(한 council 잡에 gpt-pro 멤버는 하나).

## 선행 조건
- 크로미움 계열 브라우저가 디버그포트(9222)로 실행 + chatgpt.com 로그인 + 모델 Pro.
- `playwright`, `pyperclip` 설치(`python3 <엔진> --check-env --install`).

## 검증 방법
```bash
# 위 binding 검증에서 출력된 절대경로를 그대로 사용한다.
IR="/ABS/PATH/FROM/SUITE-BINDING/bin/pack_and_ask.py"
[ -f "$IR" ] && [ ! -L "$IR" ] || { echo "engine missing" >&2; exit 1; }
# 단독으로 council 계약 확인: stdout엔 응답만, stderr엔 로그
python3 "$IR" --council --model pro --require-model "GPT-5.6" \
  --force-answer-after 60 "한 문장으로: 1+1은?" 2>/dev/null
# → GPT 응답 텍스트만 출력되어야 한다
```
