---
description: oh-my-gajaecode 초기 설정 — 설치 상태 확인, 프리셋 병합 제안, 상시 토글 안내. 여러 번 실행해도 안전(멱등).
argument-hint: "(인자 없음)"
---

# /omg:setup

oh-my-gajaecode를 이 머신에 셋업한다. **모든 단계는 멱등** — 이미 된 것은 건너뛰고, 파괴적 작업은 없다.
설치는 가볍다: 번들 파일을 네이티브로 복사하고 안내만 한다. 전제조건 도구(ChatGPT
구독+크로미움 등)는 설치 시 요구하지 않는다 — 각 기능 실행 시 자기진단한다.

## Step 0 — 네이티브 설치 상태 확인

`/omg:setup`이 실행 중이면 이 커맨드 자체는 이미 네이티브 표면에 설치된 상태다. 아래 canonical
파일들이 있는지만 확인한다:

```bash
test -f ~/.gjc/agent/commands/omg:setup.md &&
test -f ~/.gjc/agent/skills/release-gate/SKILL.md
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

## Step 2 — 레거시 정리 (있을 때만)

- `~/.gjc/agent/AGENTS.md`의 `my-workflows:*` 마커와 v0.3.0 세대 `oh-my-gjc:*` 마커는
  둘 다 **죽은 표면**(gjc가 user 레벨 AGENTS.md를 주입하지 않음)이라 `/omg:easy-always`·`gate-always`가
  `~/.gjc/agent/SYSTEM.md`로 자동 마이그레이션한다.
- 과거에 개별 플러그인을 따로 설치했던 사용자면, 단일 스위트로 통합됐으니 옛 개별 플러그인
  제거를 제안한다(동의 후에만, 셸): 예 `gjc plugin uninstall my-workflows@oh-my-gjc`.
- 0.14.0 업그레이드는 레거시 네이티브 `~/.gjc/agent/skills/gajae-app/`와 `~/.gjc/agent/commands/omg:gajae-app.md`만 정리하며, 기존 셀프호스트 앱 배포를 삭제하거나 변경하지 않는다. 이후 관리는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## Step 3 — 프리셋 병합 제안

`~/.gjc/agent/models.yml`을 읽어 `sol` 프리셋이 없으면 제안한다:
"커스텀 프리셋 `sol`(전 구간 저지연)을 병합할까? → `/omg:presets`"
이미 있으면 건너뛴다. 은퇴 프리셋(닫힌 목록 — `/omg:presets` 본문의 구버전 정리 목록: `ultimate`/`ultimate-f5`/`daily`/`fast`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`/`grok`/`codex`/`fable-codex`)이 보이면 정리도 함께 제안(동의 후에만, 목록 밖 프로파일은 절대 제거 금지). **시작 기본값 보호:** 제거 전 `~/.gjc/agent/config.yml`의 `modelProfile.default`를 확인 — 삭제 대상이 기본값이면 먼저 `sol`/대응 빌트인으로 이전한 뒤에만 삭제(이전 없이는 삭제 금지).
병합 후 세션 시작 기본은 `gjc --mpreset sol --default`로 고정하도록 안내한다.
품질/비상/안전 레인은 gjc 빌트인 `opus-codex`/`codex-medium`/`codex-pro`/`fable-opus-codex`를 안내한다(병합 불필요).

## Step 4 — 전제조건 기능 사용 가능 여부 (읽기 전용 안내)

전제조건 기능은 **이미 설치돼 있다.** 아래를 감지해 지금 바로 쓸 수 있는 것만 알려준다
(없는 것은 해당 커맨드 실행 시 친절히 안내하고 멈추므로 여기서 언급하지 않는다):

| 감지 | 확인 | 바로 쓸 수 있는 커맨드 |
|---|---|---|
| Chrome + ChatGPT | 크롬 프로필 존재 | `/omg:insane-review` |
| Codex + LazyCodex | `codex`가 PATH에 있고 호환 OMO `$omo:ultrawork` + user-scope runner receipt 설치됨 | `/omg:lazycodex-gjc` |

## Step 5 — 상시 모드 안내 (선택)

마지막으로 세마포어 토글을 소개한다 (실행은 사용자 몫):

```
/omg:easy-always on          # 모든 세션에서 최종 답변을 쉬운 말로
/omg:gate-always on          # 모든 승인 게이트에 비전문가 브리핑 자동 첨부
/omg:branchflow-always on    # 이 레포에 dev통합/main릴리즈 브랜치 규율 (레포별, 커밋 대상)
/omg:plain "아이디어"        # (선택) 쉬운 기획: 선택지 설명 + 인터뷰 후 대화로 스펙 다듬기
```

## 출력 형식

각 Step 결과를 체크리스트 한 줄씩(✓ 완료 / → 제안 / – 해당없음)으로 요약하고 끝낸다.
장황한 설명 금지.
