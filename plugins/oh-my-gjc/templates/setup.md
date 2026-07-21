---
description: oh-my-gajaecode 읽기 전용 진단 — 설치 표면·binding 존재와 전제조건만 확인하며 설치·로그인·연구는 하지 않는다.
argument-hint: "(인자 없음)"
---

# /omg:setup

`/omg:setup`은 **읽기 전용 사용 가능 여부 진단만** 한다. 설치·업그레이드·복구·로그인·마이그레이션·연구 실행은 하지 않으며, provider CLI나 runtime을 실행하지 않는다.

## Step 0 — 네이티브 표면과 binding 확인

canonical 진단 대상은 user scope `~/.gjc/agent`다. 아래 7개 skill과 10개 command가 모두 있는지와 private runtime binding의 **존재만** 확인한다. binding 존재는 실제 로그인·selector·credential 검증 성공을 뜻하지 않는다.

```bash
root="$HOME/.gjc/agent"
for skill in adaptive-response no-english extragoal insane-review deep-onboarding preset-pack multi-harness-research; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:gate.md omg:gate-always.md omg:no-english.md omg:fable.md omg:insane-review.md omg:deep-onboarding.md omg:preset-pack.md omg:multi-harness.md; do
  test -f "$root/commands/$command" || exit 1
done
for runtime in "$root/runtimes/multi-harness-research"; do
  test ! -L "$runtime" || exit 1
done
test ! -e "$root/runtimes/multi-harness-research" ||
  { test -f "$root/runtimes/multi-harness-research/runner.mjs" && test -f "$root/runtimes/multi-harness-research/binding"; }
```

프로젝트 `.gjc/runtimes/oh-my-gjc/root`, `.gjc/commands/omg*.md`, 또는 suite-owned `.gjc/skills/<name>`가 있으면 `프로젝트 scope 잔재가 user 설치보다 우선할 수 있음`이라고 경고만 한다. 이 커맨드는 프로젝트·user scope 어느 쪽도 수정하지 않는다.

누락·손상은 체크리스트에 `→ hardened installer를 사용자가 별도 셸에서 실행해야 함`으로 보고한다. 이 커맨드 안에서 installer를 실행하거나 provider 인증을 고치지 않는다.

## Step 1 — 전제조건 기능 사용 가능 여부

존재와 binding만 확인해 지금 바로 시도 가능한 표면을 안내한다. 없는 것은 설치·로그인·수정하지 않고 fail-closed 상태로 보고한다.

| 감지 | 읽기 전용 확인 | 기능 |
|---|---|---|
| Chrome + ChatGPT | Chrome 프로필 존재 | `/omg:insane-review` |
| 네 하니스 조사 | Linux + `bwrap` + Node/GJC/Codex/Claude + private `multi-harness-research` binding과 세 credential leaf | 명시 전용 `/omg:multi-harness` |

`/omg:multi-harness`는 binding이 있어도 네 provider의 실제 selector/auth preflight를 실행할 때만 런타임이 확인한다. 현재 Codex OAuth `401`은 **pending-environment**이며, 이 진단은 로그인 성공으로 바꾸거나 fixture를 성공으로 주장하지 않는다.

## Step 2 — 출력 형식

각 결과를 체크리스트 한 줄로만 정리한다: `✓ 확인됨` / `– 현재 사용할 수 없음` / `→ 사용자가 별도 조치 필요`. 설치·로그인·migration·research·파일 변경을 제안한 뒤 실행하지 않는다.
