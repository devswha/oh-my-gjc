---
description: oh-my-gajaecode 초기 설정 — 네이티브 스킬+커맨드 설치, 프리셋 병합 제안, 상시 토글 안내. 여러 번 실행해도 안전(멱등).
argument-hint: "(인자 없음)"
---

# /omg:setup

oh-my-gajaecode를 이 머신에 셋업한다. **모든 단계는 멱등** — 이미 된 것은 건너뛰고, 파괴적 작업은 없다.
설치는 가볍다: 번들 파일을 네이티브로 복사하고 안내만 한다. 전제조건 도구(Codex CLI, ChatGPT
구독+크로미움, 빌드된 Codex 앱 등)는 설치 시 요구하지 않는다 — 각 기능 실행 시 자기진단한다.

## Step 0 — 플러그인 루트 해석 (`$OMG_ROOT`)

```bash
# ⚠ 캐시 폴더명은 <marketplace>___<plugin>___<ver>. 마켓플레이스명이 oh-my-gjc라
#   *oh-my-gjc* 글롭은 같은 마켓플레이스의 모든 플러그인 폴더에 걸린다. 코어를 정확히
#   anchor(oh-my-gjc___oh-my-gjc___*)하고 다중 버전은 sort -V | tail -1로 최신 선택.
P="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/references/presets.yml 2>/dev/null | sort -V | tail -1)"
OMG_ROOT="${P:+$(dirname "$(dirname "$P")")/}"
[ -z "$OMG_ROOT" ] && [ -d plugins/oh-my-gjc ] && OMG_ROOT="plugins/oh-my-gjc/"
echo "OMG_ROOT=$OMG_ROOT"
```

비면 `gjc plugin install oh-my-gjc@oh-my-gjc`(셸)를 안내하고 멈춘다.

## Step 1 — 네이티브 스킬 + 커맨드 설치 (필수)

gjc는 마켓플레이스 플러그인의 **스킬**을 세션에 로드하지 않고, **커맨드**는 잘못된
네임스페이스(`<plugin>:<name>`)로만 자동 노출될 수 있다 — 그래서 커맨드 본문은 자동 등록이
안 되는 `templates/`에 있다. 스킬·커맨드를 네이티브 `/omg:*`로 1회 복사해야 한다:

```bash
bash "${OMG_ROOT}bin/install-skill.sh" all
```

- 스킬 → `~/.gjc/agent/skills/<name>/SKILL.md` (트리거로 자동활성화).
- 커맨드 → `~/.gjc/agent/commands/omg:<name>.md` (파일명이 곧 커맨드명이라 `/omg:<name>` UX).
- 누락 파일이 있으면 설치는 "복사 가능한 것만"이 아니라 **전체 실패**로 보고한다.

⚠ **최초 부트스트랩은 셸에서** 돌려야 한다 — `/omg:setup` 자체가 설치 전엔 안 뜨는
커맨드라 (닭-달걀): `bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all`.
설치 후 **새 세션**을 열거나 `/move .`로 커맨드 팔레트를 재빌드한다. 업그레이드 후 재실행.

## Step 2 — 레거시 정리 (있을 때만)

- `~/.gjc/agent/AGENTS.md`의 `my-workflows:*` 마커와 v0.3.0 세대 `oh-my-gjc:*` 마커는
  둘 다 **죽은 표면**(gjc가 user 레벨 AGENTS.md를 주입하지 않음)이라 `/omg:easy-always`·`gate-always`가
  `~/.gjc/agent/SYSTEM.md`로 자동 마이그레이션한다.
- 과거에 개별 플러그인을 따로 설치했던 사용자면, 단일 스위트로 통합됐으니 옛 개별 플러그인
  제거를 제안한다(동의 후에만, 셸): 예 `gjc plugin uninstall my-workflows@oh-my-gjc`.

## Step 3 — 프리셋 병합 제안

`~/.gjc/agent/models.yml`을 읽어 `ideal` 프리셋이 없으면 제안한다:
"멀티벤더 프리셋(ideal/escalate-surgical/monorepo/reviewer)을 병합할까? → `/omg:presets`"
이미 있으면 건너뛴다. 구버전 `ultimate`/`ultimate-f5`가 보이면 정리도 함께 제안.

## Step 4 — 전제조건 기능 사용 가능 여부 (읽기 전용 안내)

전제조건 기능은 **이미 설치돼 있다.** 아래를 감지해 지금 바로 쓸 수 있는 것만 알려준다
(없는 것은 해당 커맨드 실행 시 친절히 안내하고 멈추므로 여기서 언급하지 않는다):

| 감지 | 확인 | 바로 쓸 수 있는 커맨드 |
|---|---|---|
| Codex CLI | `command -v codex` | `/omg:codex-ask` |
| LazyCodex 하네스 | `ls ~/.codex 2>/dev/null` | `/omg:lazycodex-setup`, `/omg:lazycodex-work` |
| Chrome + ChatGPT | 크롬 프로필 존재 | `/omg:insane-review` |
| tmux | `command -v tmux` | `/omg:tower-setup` |

## Step 5 — 상시 모드 안내 (선택)

마지막으로 세마포어 토글을 소개한다 (실행은 사용자 몫):

```
/omg:easy-always on          # 모든 세션에서 최종 답변을 쉬운 말로
/omg:gate-always on          # 모든 승인 게이트에 비전문가 브리핑 자동 첨부
/omg:branchflow-always on    # 이 레포에 dev통합/main릴리즈 브랜치 규율 (레포별, 커밋 대상)
```

## 출력 형식

각 Step 결과를 체크리스트 한 줄씩(✓ 완료 / → 제안 / – 해당없음)으로 요약하고 끝낸다.
장황한 설명 금지.
