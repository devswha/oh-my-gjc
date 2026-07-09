---
description: gate-briefing(승인 게이트 브리핑)을 "매번 자동"으로 상시 적용/해제한다. ~/.gjc/agent/SYSTEM.md에 규칙 블록을 넣거나 빼서 모든 세션·모든 게이트에 적용한다. 인자 없거나 on이면 켜고, off면 끄고, status면 현재 상태만 본다.
argument-hint: "[on|off|status]  (기본: on)"
---

# /omg:gate-always

`/omg:gate`는 **이번 세션만** 적용되지만, 이 커맨드는 gjc가 매 턴 시스템
프롬프트에 주입하는 **사용자 전역 커스터마이징 파일** `~/.gjc/agent/SYSTEM.md`에
규칙 블록을 심어 **모든 세션의 모든 승인 게이트**에 상시 gate-briefing을 적용한다.
마커 블록의 존재 여부가 on/off 세마포어다.

> **왜 SYSTEM.md인가 (live-verified, gjc 0.8.2):** 예전 대상이던
> `~/.gjc/agent/AGENTS.md`는 gjc가 **발견은 하지만 주입 단계에서 버린다** —
> `system-prompt.ts`의 `loadProjectContextFiles`가 project 레벨만 통과시켜 user
> 레벨 컨텍스트 파일이 탈락한다. 매 턴 실제로 주입되는 사용자 전역 표면은
> SYSTEM.md(`<system-prompt-customization>` 슬롯)가 유일하다. easy-always와
> 동일한 헤드리스 프로브로 실증됨 (자세한 근거는 easy-always.md 참조).

입력 인자: `$ARGUMENTS`  → 비었거나 `on`=켜기, `off`=끄기, `status`=상태만.

## 관리 대상 블록 (구분자 고정)

`~/.gjc/agent/SYSTEM.md` 안에서 아래 두 마커 사이 구간만 이 커맨드가 소유한다.
켤 때는 이 블록을 넣거나 최신 내용으로 교체하고, 끌 때는 이 블록만 제거한다.
**마커 밖의 다른 내용은 절대 건드리지 않는다.** (SYSTEM.md는 easy-always 등
다른 마커 블록과 공유하는 파일이다.)

> 레거시 마이그레이션 (두 세대, 둘 다 `~/.gjc/agent/AGENTS.md`에 있음):
> ① 구버전(my-workflows) 마커 `<!-- BEGIN my-workflows:gate-always -->` 블록,
> ② AGENTS.md 세대 — 플러그인 v0.3.0 이하가 심던 `oh-my-gjc:gate-always` 블록
> (죽은 표면 — gjc가 주입하지 않아 효과가 없었다).
> on/off 어느 동작에서든 두 위치를 모두 확인한다: `on`이면 SYSTEM.md에 신 블록을
> 쓰고 AGENTS.md 쪽 잔재 블록은 백업 후 제거, `off`면 양쪽 모두 제거한다.

```
<!-- BEGIN oh-my-gjc:gate-always -->
## 승인 게이트 브리핑 상시 적용 (gate-always)

승인 게이트(ralplan pending-approval, ultragoal 승인, 계획/실행 승인 요청)를
사용자에게 제시할 때는 **항상** 아래 4부 브리핑을 함께 출력한다.

1. **비전문가 번역** — 계획이 하려는 일을 일상어로, 5문장 이내. 도메인 용어는
   처음 나올 때 괄호로 뜻 병기.
2. **승인의 경계** — 지금 승인하는 것 / 승인하지 않는 것 (특히 실환경·프로덕션
   접촉이 시작되는지, 이후 단계에 별도 승인 게이트가 더 있는지).
3. **도메인-무지 체크리스트** (계획 원문을 실제로 읽고, 근거 위치와 함께):
   롤백 경로 / 실환경 접촉 시점과 추가 게이트 / 관측 가능한 성공·실패 지표 /
   수치를 지금 확정하는지 증거로 도출하는지 / 기존 안전장치 약화 여부 /
   critic·architect 판정 원문. 원문에 없으면 지어내지 말고
   "명시 없음 — 승인 전 확인 요망"으로 표기한다.
4. **판정** — 승인/보류/반려 추천 + 승인 전에 물어볼 질문 후보 1~3개.
   "명시 없음"이 2개 이상이면 추천은 자동으로 "보류"다.

정확성 > 쉬움. 승인/반려 실행은 절대 대행하지 않는다 — 결정은 사용자의 몫이다.

끄기: `/omg:gate-always off`
<!-- END oh-my-gjc:gate-always -->
```

## 처리 규칙

대상 파일: `~/.gjc/agent/SYSTEM.md` (사용자 전역 시스템 프롬프트 커스터마이징 파일).

### `status`
- SYSTEM.md에 `<!-- BEGIN oh-my-gjc:gate-always -->` 마커가 있으면
  `게이트 브리핑 상시: 켜짐`, 없으면 `게이트 브리핑 상시: 꺼짐` 한 줄만 출력하고 끝낸다.
- `~/.gjc/agent/AGENTS.md`에 신/구 gate-always 마커 잔재가 보이면
  `주의: 죽은 표면(AGENTS.md)에 잔재 블록 있음 — on으로 마이그레이션 권장` 한 줄을 덧붙인다.

### `on` (기본)
1. `~/.gjc/agent/SYSTEM.md`가 없으면 새로 만든다(빈 파일에서 시작).
2. 파일이 있으면 먼저 백업: `cp ~/.gjc/agent/SYSTEM.md ~/.gjc/agent/SYSTEM.md.bak-$(date +%s)`.
3. 마커 블록이 이미 있으면 그 구간(BEGIN~END 포함)만 위 최신 블록으로 **교체**한다.
   없으면 파일 **맨 끝에** 위 블록을 추가한다(앞에 빈 줄 1개).
4. 마커 밖의 기존 내용은 그대로 보존한다.
5. `~/.gjc/agent/AGENTS.md`에 신/구 gate-always 마커 잔재가 있으면
   백업(`.bak-$(date +%s)`) 후 그 블록만 제거한다(주변 빈 줄 정리).
6. `게이트 브리핑 상시: 켜짐 (~/.gjc/agent/SYSTEM.md, 새 세션부터 적용)` 한 줄로 확인한다.
   이번 세션에도 바로 적용하려면 `/omg:gate on`을 함께 안내한다.
7. **주의:** 현재 레포에 프로젝트 `.gjc/SYSTEM.md`가 존재하면 프로젝트 파일이
   사용자 파일을 **통째로 대체**하므로 이 규칙이 그 레포에선 적용되지 않는다 —
   이 경우 프로젝트 SYSTEM.md에도 블록을 심을지 사용자에게 물어본다.

### `off`
1. SYSTEM.md와 AGENTS.md 어느 쪽에도 신/구 마커가 없으면
   `게이트 브리핑 상시: 이미 꺼짐` 한 줄만 출력하고 끝낸다.
2. 있으면 해당 파일 백업(위와 동일) 후, 양쪽의 신/구 마커 블록을 모두 제거한다
   (주변 빈 줄 정리). 마커 밖 내용은 보존한다.
3. `게이트 브리핑 상시: 꺼짐` 한 줄로 확인한다.

### 그 외 인자
사용법 한 줄만 안내: `/omg:gate-always [on|off|status]`.
