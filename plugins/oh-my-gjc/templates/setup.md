---
description: oh-my-gajaecode 초기 설정 — 설치 상태 확인, 전제조건 점검, 응답 보정 + gate 상시 토글 안내. 여러 번 실행해도 안전(멱등).
argument-hint: "(인자 없음)"
---

# /omg:setup

oh-my-gajaecode를 이 머신에 셋업한다. **모든 단계는 멱등** — 이미 된 것은 건너뛰고, 파괴적 작업은 없다.
설치는 번들 파일을 네이티브로 복사하고, time-left의 exact-lock SDK runtime을 전제조건이
맞을 때 private 디렉터리에 준비한다. ChatGPT 구독·크로미움 같은 외부 전제는 설치하지 않는다.

## Step 0 — 네이티브 설치 상태 확인

`/omg:setup`의 canonical 진단·복구 대상은 hardened one-shot installer와 같은 **user scope**
`~/.gjc/agent`다. retained 표면 전체와 retired 잔재 부재를 assert한다. 프로젝트
`.gjc/runtimes/oh-my-gjc/root`, `.gjc/commands/omg*.md`, 또는 아래 suite-owned
`.gjc/skills/<name>` 중 하나라도 있으면 `프로젝트 scope 잔재가 user 설치보다 우선할 수 있음`
이라고 별도 경고한다. 이 커맨드는 프로젝트 잔재를 수정하지 않는다.

```bash
root="$HOME/.gjc/agent"
for skill in adaptive-response no-english time-left extragoal insane-review lazycodex-gjc; do
  test -f "$root/skills/$skill/SKILL.md" || exit 1
done
for command in omg.md omg:setup.md omg:gate.md omg:gate-always.md omg:no-english.md omg:time-left.md omg:fable.md omg:insane-review.md omg:lazycodex-gjc.md; do
  test -f "$root/commands/$command" || exit 1
done
for skill in gate-briefing korean-first workflow-eta codex-deepwork codex-app-launch codex-app-cdp codex-cli-ask lazycodex tower worktree gajae-app multivendor-presets release-gate easy-answer plain-layer branch-flow gjc-bugwatch; do
  test ! -e "$root/skills/$skill" && test ! -L "$root/skills/$skill" || exit 1
done
for command in codex-run codex-app-launch codex-app-ask codex-ask lazycodex-setup lazycodex-work tower-setup gajae-app presets release easy easy-always plain branchflow-always worktree bugwatch-scan; do
  test ! -e "$root/commands/omg:$command.md" && test ! -L "$root/commands/omg:$command.md" || exit 1
  test ! -e "$root/commands/oh-my-gjc:$command.md" && test ! -L "$root/commands/oh-my-gjc:$command.md" || exit 1
done
for legacy in codex-app-control:ask codex-app-control:launch codex-cli-control:ask codex-deepwork:run gjc-bugwatch:scan insane-review:review lazycodex:setup lazycodex:work oh-my-gjc:branchflow-always oh-my-gjc:easy-always oh-my-gjc:easy oh-my-gjc:fable oh-my-gjc:gate-always oh-my-gjc:gate oh-my-gjc:presets oh-my-gjc:setup tower:setup; do
  test ! -e "$root/commands/$legacy.md" && test ! -L "$root/commands/$legacy.md" || exit 1
done
workflow_eta_runtime="$root/runtimes/oh-my-gjc/sdk-lab"
if command -v bun >/dev/null 2>&1 && [ -f "$workflow_eta_runtime/src/eta.ts" ]; then
  bun --version
else
  printf '%s\n' 'time-left SDK runtime unavailable — rerun hardened installer with Bun >=1.3.14'
fi
```

누락되었거나 플러그인을 업그레이드/복구해야 하면 캐시를 직접 고르거나
`bin/install-skill.sh`를 실행하지 않는다. 셸에서 반드시 현재 설치 결과에 payload identity를
결속하는 hardened installer를 다시 실행한다:

```bash
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash

# curl|bash가 금지된 환경:
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh
```

installer가 marketplace 갱신, 강제 설치 호환성, 현재 설치 버전의 cache/native 경로 검증,
스킬·커맨드 복사를 한 경로에서 처리한다. `sort -V | tail -1` 같은 newest-cache 선택은 stale
payload를 실행할 수 있으므로 금지한다. 설치 후 **새 세션**을 열거나 `/move .`로 커맨드
팔레트를 재빌드한다.

## Step 1 — 레거시 정리 (있을 때만)

- user-scope hardened installer는 구조가 정상인 제거된 `easy-always` 마커만
  `~/.gjc/agent/SYSTEM.md`와 `AGENTS.md`에서 고유 mode-preserving 백업 후 정리한다.
  malformed 파일, 다른 사용자 내용, `gate-always` 마커는 보존한다.
- post-v0.17.1 prune는 `easy-answer`, `plain-layer`, `branch-flow`/`worktree`,
  public `gjc-bugwatch`, `multivendor-presets`, `release-gate`의 native 스킬·커맨드를 제거한다.
- 0.19.0 업그레이드는 이름이 바뀐 `gate-briefing` 디렉터리를 제거하고 `adaptive-response`,
  `no-english`를 설치하고 이전 이름인 `korean-first` 디렉터리를 제거한다.
- 0.19.1 업그레이드는 `workflow-eta`를 `time-left`로 바꾸며, 전체 설치와 `time-left` 단독 설치 모두
  이전 `workflow-eta` 디렉터리를 제거한다. SDK runtime은 exact lockfile로 원자적으로 교체하며 실패하면
  스킬을 fail-closed로 둔다.
- `lazycodex-gjc`는 유지하고, user runtime 전제조건이 없을 때만 stale binding을 제거한다.
  기존 `models.yml`과 과거 병합된 프로필은 수정하지 않는다.
- 현재 작업 디렉터리가 git 레포라면, 과거 `/omg:branchflow-always`가 `AGENTS.md`에 쓴
  well-formed `oh-my-gjc:branchflow` 블록만 백업 후 제거한다. 다른 레포는 각 레포 루트에서
  installer를 다시 실행한다. `docs/WORKFLOW.md`는 사용자 문서로 취급해 자동 삭제하지 않는다.
- 과거에 개별 플러그인을 따로 설치했던 사용자면, 단일 스위트로 통합됐으니 옛 개별 플러그인
  제거를 제안한다(동의 후에만, 셸): 예 `gjc plugin uninstall my-workflows@oh-my-gjc`.
- 0.14.0 업그레이드는 레거시 네이티브 `~/.gjc/agent/skills/gajae-app/`와 `~/.gjc/agent/commands/omg:gajae-app.md`만 정리하며, 기존 셀프호스트 앱 배포를 삭제하거나 변경하지 않는다. 이후 관리는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Step 2 — 전제조건 기능 사용 가능 여부 (읽기 전용 안내)

전제조건 기능은 **이미 설치돼 있다.** 아래를 감지해 지금 바로 쓸 수 있는 것만 알려준다
(없는 것은 해당 커맨드 실행 시 친절히 안내하고 멈추므로 여기서 언급하지 않는다):

| 감지 | 확인 | 바로 쓸 수 있는 기능 |
|---|---|---|
| GJC SDK workflow ETA | Linux + Bun 1.3.14+ + private `oh-my-gjc/sdk-lab` runtime | `ralplan/ultragoal 언제 끝나?` 자연어 질문 |
| Chrome + ChatGPT | 크롬 프로필 존재 | `/omg:insane-review` |
| Codex + LazyCodex | `codex`가 PATH에 있고 호환 OMO + user-scope runtime binding 설치됨 | `/omg:lazycodex-gjc` (읽기 전용) |

## Step 3 — 응답 보정 + 게이트 브리핑 상시 모드 안내 (선택)

마지막으로 남은 세마포어 토글을 소개한다 (실행은 사용자 몫):

```
/omg:gate-always on          # 프로젝트 SYSTEM.md가 덮지 않는 새 세션의 응답 보정 + 게이트 브리핑
```

## 출력 형식

각 Step 결과를 체크리스트 한 줄씩(✓ 완료 / → 제안 / – 해당없음)으로 요약하고 끝낸다.
장황한 설명 금지.
