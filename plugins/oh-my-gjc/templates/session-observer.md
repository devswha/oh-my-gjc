---
description: 명시적으로 선택한 GJC 세션을 분리된 tmux 창에서 토큰 없이 읽기 전용으로 관찰한다. 자연어 요청으로는 활성화하지 않는다.
argument-hint: "--tmux NAME | --session ID [--mode conversation|user-only] [--thinking] [--no-follow] [--history N]"
---

# /omg:session-observer

이 명령은 **명시 호출 전용**이다. 자연어로 세션 관찰·추적·요약을 요청해도 이 기능을 자동 활성화하지 않는다.

대상은 정확한 `--tmux NAME` 또는 `--session ID` 하나여야 한다. 기본값은 `mode=conversation`,
`thinking=0`, `follow=1`, `history=20`이며, thinking 표시는 `--thinking`으로만 켠다. `--mode user-only`는
사용자 메시지만 표시한다. history는 0~200으로 제한한다.

모델은 인자를 다음 안전한 env 필드로 해석해 **한 번의 Bash 호출**에만 전달한다. 사용자 텍스트를
셸 코드에 보간하지 않는다: `OBSERVER_TARGET_KIND`(`tmux` 또는 `session`),
`OBSERVER_TARGET_VALUE`, `OBSERVER_MODE`, `OBSERVER_THINKING`(`0`/`1`),
`OBSERVER_FOLLOW`(`0`/`1`), `OBSERVER_HISTORY`(정수). 이 호출은 `--launch-window`로 detached tmux
observer 창을 열며, stdout/stderr의 launch receipt/error만 반환한다. 대화 내용은 절대 도구 결과나
GJC transcript로 보내지 않으며, 창을 연 뒤 관찰은 모델 토큰을 소비하지 않는다.

```bash
set -euo pipefail
[ -n "${TMUX:-}" ] || { printf '%s\n' 'session-observer requires tmux' >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { printf '%s\n' 'session-observer requires Bun' >&2; exit 1; }
: "${OBSERVER_TARGET_KIND:?session-observer target kind is required}"
: "${OBSERVER_TARGET_VALUE:?session-observer target value is required}"
: "${OBSERVER_MODE:=conversation}"
: "${OBSERVER_THINKING:=0}"
: "${OBSERVER_FOLLOW:=1}"
: "${OBSERVER_HISTORY:=20}"
case "$OBSERVER_TARGET_KIND" in tmux|session) ;; *) printf '%s\n' 'invalid session-observer target kind' >&2; exit 2 ;; esac
case "$OBSERVER_MODE" in conversation|user-only) ;; *) printf '%s\n' 'invalid session-observer mode' >&2; exit 2 ;; esac
case "$OBSERVER_THINKING" in 0|1) ;; *) printf '%s\n' 'invalid session-observer thinking setting' >&2; exit 2 ;; esac
case "$OBSERVER_FOLLOW" in 0|1) ;; *) printf '%s\n' 'invalid session-observer follow setting' >&2; exit 2 ;; esac
case "$OBSERVER_HISTORY" in ''|*[!0-9]*) printf '%s\n' 'invalid session-observer history setting' >&2; exit 2 ;; esac
(( 10#$OBSERVER_HISTORY <= 200 )) || { printf '%s\n' 'session-observer history exceeds 200' >&2; exit 2; }

uid="$(id -u)"
project_binding="$PWD/.gjc/runtimes/oh-my-gjc/root"
user_binding="$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
if [ -e "$project_binding" ] || [ -L "$project_binding" ]; then
  binding="$project_binding"
else
  binding="$user_binding"
fi
[ -f "$binding" ] && [ ! -L "$binding" ] || { printf '%s\n' 'trusted oh-my-gjc root binding not found' >&2; exit 1; }
[ "$(stat -c %u -- "$binding")" = "$uid" ] && [ "$(stat -c %a -- "$binding")" = 600 ] || { printf '%s\n' 'oh-my-gjc root binding is unsafe' >&2; exit 1; }
mapfile -t binding_lines < "$binding"
[ "${#binding_lines[@]}" -eq 1 ] && [ -n "${binding_lines[0]}" ] || { printf '%s\n' 'oh-my-gjc root binding is invalid' >&2; exit 1; }
root="$(readlink -f -- "${binding_lines[0]}")"
[ "$root" = "${binding_lines[0]}" ] && [ -d "$root" ] && [ ! -L "$root" ] || { printf '%s\n' 'oh-my-gjc root binding is not canonical' >&2; exit 1; }
runner="$root/bin/session-observer.ts"
[ -f "$runner" ] && [ ! -L "$runner" ] && [ "$(readlink -f -- "$runner")" = "$runner" ] || { printf '%s\n' 'trusted session-observer runner not found' >&2; exit 1; }

argv=("$runner" --launch-window --mode "$OBSERVER_MODE" --history "$OBSERVER_HISTORY")
[ "$OBSERVER_THINKING" = 0 ] || argv+=(--thinking)
[ "$OBSERVER_FOLLOW" = 0 ] || argv+=(--follow)
case "$OBSERVER_TARGET_KIND" in
  tmux) argv+=(--tmux "$OBSERVER_TARGET_VALUE") ;;
  session) argv+=(--session "$OBSERVER_TARGET_VALUE") ;;
esac
exec bun "${argv[@]}"
```

엔진 `bin/session-observer.ts`는 JSONL만 authoritative/default로 읽고 SDK enrichment를 사용하지 않는다.
관찰 대상에는 inject/control/write하지 않으며 upstream activity, network, LLM 호출도 하지 않는다.
tmux 밖이거나 Bun 또는 private user root binding이 없으면 fail-closed한다. 실행 후 receipt 외의 내용을
읽거나 요약하거나 relay하지 않는다.
