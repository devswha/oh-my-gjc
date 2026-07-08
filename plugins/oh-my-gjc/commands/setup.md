---
description: oh-my-gjc 초기 설정 — 네이티브 스킬+커맨드 설치, 프리셋 병합 제안, 환경을 감지해 어울리는 옵션 플러그인을 추천한다. 여러 번 실행해도 안전(멱등).
argument-hint: "(인자 없음)"
---

# /oh-my-gjc:setup

oh-my-gjc 코어를 이 머신에 셋업하고, 환경을 감지해 옵션 플러그인을 추천한다.
**모든 단계는 멱등** — 이미 된 것은 건너뛰고, 파괴적 작업은 없다.

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
비면 `/plugin install oh-my-gjc@oh-my-gjc`를 안내하고 멈춘다.

## Step 1 — 네이티브 스킬 + 커맨드 설치 (필수)

gjc는 마켓플레이스 플러그인의 **스킬도 커맨드도 세션에 로드하지 않는다**(스킬 레지스트리는
native `.gjc`만; 슬래시 커맨드 provider(`discovery/claude-plugins.ts`)는 `discovery/index.ts`가
import하지 않아 등록조차 안 됨 — gjc 0.8.2 `main`/`dev` 실측, ACP `available_commands_update`에
플러그인 커맨드 0개). 따라서 스킬·커맨드를 네이티브로 1회 복사해야 한다:

```bash
bash "${OMG_ROOT}bin/install-skill.sh" all
```

- 스킬 4종 → `~/.gjc/agent/skills/<name>/SKILL.md` (트리거 자동활성화):
  `easy-answer`, `gate-briefing`, `multivendor-presets`, `branch-flow`.
- 커맨드 8종 → `~/.gjc/agent/commands/oh-my-gjc:<name>.md` (파일명이 곧 커맨드명이라
  `/oh-my-gjc:<name>` UX 유지): `setup`, `easy`, `gate`, `easy-always`, `gate-always`,
  `presets`, `fable`, `branchflow-always`.

⚠ **최초 부트스트랩은 셸에서** 돌려야 한다 — `/oh-my-gjc:setup` 자체가 설치 전엔 안 뜨는
커맨드라 (닭-달걀): `bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all`.
설치 후 **새 세션**을 열거나 `/move .`로 커맨드 팔레트를 재빌드한다. 플러그인 업그레이드 후 재실행.

## Step 2 — 레거시 정리 (있을 때만)

- `~/.gjc/agent/skills/` 나 `~/.gjc/agent/AGENTS.md`에 구버전 잔재가 보이면 안내:
  `~/.gjc/agent/AGENTS.md`의 `my-workflows:*` 마커와 v0.3.0 세대 `oh-my-gjc:*` 마커는
  둘 다 **죽은 표면**(gjc가 user 레벨 AGENTS.md를 주입하지 않음 — 0.8.2 실증)이라
  `/oh-my-gjc:easy-always`·`gate-always`가 `~/.gjc/agent/SYSTEM.md`로 자동 마이그레이션한다.
- 구 플러그인이 설치돼 있으면 제거를 제안: `/plugin uninstall my-workflows@oh-my-gjc`,
  `/plugin uninstall multivendor-presets@oh-my-gjc` (동의 후에만).

## Step 3 — 프리셋 병합 제안

`~/.gjc/agent/models.yml`을 읽어 `ideal` 프리셋이 없으면 제안한다:
"멀티벤더 프리셋(ideal/escalate-surgical/monorepo)을 병합할까? → `/oh-my-gjc:presets`"
이미 있으면 건너뛴다. 구버전 `ultimate`/`ultimate-f5`가 보이면 정리도 함께 제안.

## Step 4 — 환경 감지 → 옵션 플러그인 추천

각 항목을 감지해 **해당되는 것만** 추천한다 (설치는 사용자 동의 후 `/plugin install`):

| 감지 | 명령 | 추천 플러그인 |
|---|---|---|
| Codex CLI 있음 | `command -v codex` | `codex-cli-control` (읽기 위임), `codex-deepwork` (쓰기 위임) |
| LazyCodex 하네스 | `ls ~/.codex 2>/dev/null` | `lazycodex` |
| Codex 데스크톱 앱 | 앱 바이너리/설치 흔적 | `codex-app-control` |
| Chrome + ChatGPT 사용자 | 크롬 프로필 존재 | `insane-review` (GPT-5.5 Pro 웹 리뷰, API 비용 0) |
| gjc 개발/도그푸딩 | `~/.gjc/logs` 에 에러 로그 다수 | `gjc-bugwatch` |

감지 안 되는 항목은 언급하지 않는다 — 추천 목록은 짧을수록 좋다.

## Step 5 — 상시 모드 안내 (선택)

마지막으로 세마포어 토글을 소개한다 (실행은 사용자 몫):

```
/oh-my-gjc:easy-always on          # 모든 세션에서 최종 답변을 쉬운 말로
/oh-my-gjc:gate-always on          # 모든 승인 게이트에 비전문가 브리핑 자동 첨부
/oh-my-gjc:branchflow-always on    # 이 레포에 dev통합/main릴리즈 브랜치 규율 (레포별, 커밋 대상)
```

## 출력 형식

각 Step 결과를 체크리스트 한 줄씩(✓ 완료 / → 제안 / – 해당없음)으로 요약하고 끝낸다.
장황한 설명 금지.
