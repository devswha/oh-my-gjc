# ChatGPT Pro를 agent-council 웹 멤버로 등록

insane-review의 `--council` 모드는 로그인된 구독 ChatGPT 웹을 사용하며 **프롬프트를 위치인자로 받고 응답만 stdout으로** 내보낸다. 모델을 지정하지 않으면 현재 선택 모델을 고정하고 Pro 강도를 검증한다.

## 작동 방식 (council worker 계약)

council worker는 멤버 `command` 문자열을 토큰화한 뒤 **프롬프트를 마지막 인자로 붙여** `spawn(program, [...args, prompt])` 하고 **stdout을 캡처**한다. `--council`은 정확히 그 계약에 맞춰져 있다.

## 엔진 절대경로 확인
council worker는 셸 없이 execFile 하므로 `command`엔 **엔진의 절대경로**를 넣는다(공백 없게).
새 suite binding을 프로젝트→user 순서로 먼저 확인하고, 둘 다 없을 때만 **읽기 전용·기간 한정 compatibility fallback**인 기존 `oh-my-gajae-code` binding을 프로젝트→user 순서로 확인한다. 모두 없을 때만 정확한 현재 checkout asset을 쓴다. 기존 binding이나 user state는 절대 쓰거나 지우지 않는다:
```bash
IR="$(python3 - <<'PY'
from pathlib import Path
import os
import stat
import sys

asset = Path("bin/pack_and_ask.py")
bindings = [
    Path.cwd() / ".gjc/runtimes/oh-my-gjc/root",
    Path.home() / ".gjc/agent/runtimes/oh-my-gjc/root",
    Path.cwd() / ".gjc/runtimes/oh-my-gajae-code/root",
    Path.home() / ".gjc/agent/runtimes/oh-my-gajae-code/root",
]


def reject_links(path):
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError("symlinked path")


def resolve_asset(root, relative):
    reject_links(root)
    if not root.is_absolute() or str(root.resolve(strict=True)) != str(root):
        raise ValueError("non-canonical suite root")
    asset = root / relative
    reject_links(asset)
    if not asset.is_file():
        raise ValueError("missing suite asset")
    return asset


try:
    for binding in bindings:
        reject_links(binding)
        try:
            fd = os.open(binding, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        except FileNotFoundError:
            continue
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode)
                    or (hasattr(os, "getuid") and info.st_uid != os.getuid())
                    or (os.name != "nt" and stat.S_IMODE(info.st_mode) & 0o077)):
                raise ValueError("binding must be a private owned regular file")
            value = stream.read(4097).decode("utf-8")
        if (len(value.encode("utf-8")) > 4096 or not value.endswith("\n")
                or value.count("\n") != 1
                or any(ord(ch) < 32 or ord(ch) == 127 for ch in value[:-1])):
            raise ValueError("malformed suite binding")
        root = Path(value[:-1])
        if str(root) != value[:-1]:
            raise ValueError("non-canonical suite binding")
        print(resolve_asset(root, asset))
        raise SystemExit(0)
    print(resolve_asset(Path.cwd() / "plugins/oh-my-gjc", asset))
except (OSError, ValueError, UnicodeError) as error:
    print(f"Invalid OMG runtime binding: {error}; rerun the hardened installer", file=sys.stderr)
    raise SystemExit(1)
PY
)" || exit 1
echo "IR=$IR"
```
Malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing bindings fail closed; repair with `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`, never a plugin cache.

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
    # ── ChatGPT Pro (insane-review 웹 경유) ──
    - name: gpt-pro
      command: "python3 /ABS/PATH/oh-my-gjc/bin/pack_and_ask.py --council --model pro --require-model current --force-answer-after 120"
      emoji: "🌐"
      color: "MAGENTA"
  settings:
    exclude_chairman_from_members: true
    timeout: 600   # ⚠️ Pro 리즈닝이 길다 — 기본 120s로는 SIGTERM될 수 있어 늘린다
```

- `/ABS/PATH/oh-my-gjc/bin/pack_and_ask.py`는 위 resolver가 출력한 **절대경로** 그대로. (경로에 공백 없게.)
- `--require-model current`: council 경로에서도 활성 모델명을 검증(불일치/미확정이면 fail-closed로 전송 중단). 빼면 effort만 검증되고 기반 모델은 무엇이든 통과한다.
- `--force-answer-after 120`: 120초 후 "지금 답변 받기"로 리즈닝을 끊어 회수 시간을 bound. council `timeout`은 그보다 넉넉히(예: 600).
- council은 멤버를 **병렬 detached**로 띄운다. gpt-pro는 자기 브라우저 탭을 새로 열므로 다른 멤버와 충돌하지 않지만, **동시에 두 개의 insane-review 잡이 같은 브라우저를 몰면 안 된다**(한 council 잡에 gpt-pro 멤버는 하나).

## 선행 조건
- 크로미움 계열 브라우저가 디버그포트(9222)로 실행 + chatgpt.com 로그인 + 모델 Pro.
- `playwright`, `pyperclip` 설치(`python3 <엔진> --check-env --install`).

## 검증 방법
```bash
# 위 binding 검증에서 출력된 절대경로를 그대로 사용한다.
IR="/ABS/PATH/oh-my-gjc/bin/pack_and_ask.py"
[ -f "$IR" ] && [ ! -L "$IR" ] || { echo "engine missing" >&2; exit 1; }
# 단독으로 council 계약 확인: stdout엔 응답만, stderr엔 로그
python3 "$IR" --council --model pro --require-model current \
  --force-answer-after 60 "한 문장으로: 1+1은?" 2>/dev/null
# → GPT 응답 텍스트만 출력되어야 한다
```
