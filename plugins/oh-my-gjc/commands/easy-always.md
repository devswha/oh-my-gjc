---
description: easy-answer(쉬운 답변)를 "매번 자동"으로 상시 적용/해제한다. ~/.gjc/agent/SYSTEM.md에 규칙 블록을 넣거나 빼서 모든 세션·매 턴에 적용한다. 인자 없거나 on이면 켜고, off면 끄고, status면 현재 상태만 본다.
argument-hint: "[on|off|status]  (기본: on)"
---

# /oh-my-gjc:easy-always

`/oh-my-gjc:easy`는 **이번 세션만** 적용되지만, 이 커맨드는 gjc가 매 턴 시스템
프롬프트에 주입하는 **사용자 전역 커스터마이징 파일** `~/.gjc/agent/SYSTEM.md`에
규칙 블록을 심어 **모든 세션·모든 턴에 상시** easy-answer(쉬운 답변)를 적용한다.
마커 블록의 존재 여부가 on/off 세마포어다.

> **왜 SYSTEM.md인가 (live-verified, gjc 0.8.2):** 예전 대상이던
> `~/.gjc/agent/AGENTS.md`는 gjc가 **발견은 하지만 주입 단계에서 버린다** —
> `system-prompt.ts`의 `loadProjectContextFiles`가 project 레벨만 통과시켜 user
> 레벨 컨텍스트 파일이 탈락한다. `rules/*.md`의 `alwaysApply: true`도 기본
> 시스템 프롬프트 템플릿에는 렌더되지 않는다(custom-system-prompt 전용). 매 턴
> 실제로 주입되는 사용자 전역 표면은 SYSTEM.md(`<system-prompt-customization>`
> 슬롯)가 유일하다. 헤드리스 프로브로 실증: AGENTS.md 블록 = 미주입 확인,
> SYSTEM.md 블록 = 주입 + 형식 준수 확인.

입력 인자: `$ARGUMENTS`  → 비었거나 `on`=켜기, `off`=끄기, `status`=상태만.

## 관리 대상 블록 (구분자 고정)

`~/.gjc/agent/SYSTEM.md` 안에서 아래 두 마커 사이 구간만 이 커맨드가 소유한다.
켤 때는 이 블록을 넣거나 최신 내용으로 교체하고, 끌 때는 이 블록만 제거한다.
**마커 밖의 다른 내용은 절대 건드리지 않는다.** (SYSTEM.md는 gate-always 등
다른 마커 블록과 공유하는 파일이다.)

> 레거시 마이그레이션 (두 세대, 둘 다 `~/.gjc/agent/AGENTS.md`에 있음):
> ① 구버전(my-workflows) 마커 `<!-- BEGIN my-workflows:easy-always -->` 블록,
> ② AGENTS.md 세대 — 플러그인 v0.3.0 이하가 심던 `oh-my-gjc:easy-always` 블록
> (죽은 표면 — gjc가 주입하지 않아 효과가 없었다).
> on/off 어느 동작에서든 두 위치를 모두 확인한다: `on`이면 SYSTEM.md에 신 블록을
> 쓰고 AGENTS.md 쪽 잔재 블록은 백업 후 제거, `off`면 양쪽 모두 제거한다.

```
<!-- BEGIN oh-my-gjc:easy-always -->
## 쉬운 답변 상시 적용 (easy-always)

사용자에게 전달하는 **최종 답변**은 전문용어 없이 쉬운 말로 쓴다.

- 형식: ① 한 줄 결론(기술용어 없이) → ② 쉬운 설명(일상어로) → ③ (필요할 때만)
  "자세히" 섹션에 명령어·파일 경로·코드 같은 기술 디테일을 분리해서 모은다.
- **격리(제일 자주 어기는 규칙):** 함수·변수 이름, CLI 플래그, 파일 경로,
  git 용어(커밋/staged/untracked 등)는 ①·②에 절대 쓰지 않는다 — 필요하면 전부
  ③ "자세히"로 보낸다. ②는 그런 단어를 다 빼고도 읽히는 문장이어야 한다.
- 작업 결과·진행 상황 보고("뭘 했고 뭐가 남았나")도 예외 없이 이 형식을 따른다.
- **터미널 출력 전용:** HTML 태그(`<details>`, `<summary>`, `<br>` 등)는 절대 쓰지
  않는다 — 터미널은 못 그려서 태그가 날것으로 노출된다. "자세히"는 `### 자세히`
  같은 일반 마크다운 제목으로 시작하는 보통 섹션으로 쓴다.
- **정확성 > 쉬움.** 쉽게 바꾸다 내용이 틀리거나 원래 의미와 어긋나게 될 부분은,
  그 부분만 정확한 전문용어를 그대로 쓴다(괄호로 짧은 뜻 병기 가능).
- 위험·주의·사용자가 직접 해야 할 행동은 절대 생략하지 않는다 — 단 쉬운 말로.
- 군더더기·빈말("좋은 질문이에요") 금지. 쉬우면서 짧게.
- 사용자가 명시적으로 정확한 로그·명령어 등 기술 디테일을 원하면 그 부분은 그대로
  정확히 주되, 맨 위 "한 줄 결론"은 유지한다.

끄기: `/oh-my-gjc:easy-always off`
<!-- END oh-my-gjc:easy-always -->
```

## 처리 규칙

대상 파일: `~/.gjc/agent/SYSTEM.md` (사용자 전역 시스템 프롬프트 커스터마이징 파일).

### `status`
- SYSTEM.md에 `<!-- BEGIN oh-my-gjc:easy-always -->` 마커가 있으면
  `쉬운 답변 상시: 켜짐`, 없으면 `쉬운 답변 상시: 꺼짐` 한 줄만 출력하고 끝낸다.
- `~/.gjc/agent/AGENTS.md`에 신/구 easy-always 마커 잔재가 보이면
  `주의: 죽은 표면(AGENTS.md)에 잔재 블록 있음 — on으로 마이그레이션 권장` 한 줄을 덧붙인다.

### `on` (기본)
1. `~/.gjc/agent/SYSTEM.md`가 없으면 새로 만든다(빈 파일에서 시작).
2. 파일이 있으면 먼저 백업: `cp ~/.gjc/agent/SYSTEM.md ~/.gjc/agent/SYSTEM.md.bak-$(date +%s)`.
3. 마커 블록이 이미 있으면 그 구간(BEGIN~END 포함)만 위 최신 블록으로 **교체**한다.
   없으면 파일 **맨 끝에** 위 블록을 추가한다(앞에 빈 줄 1개).
4. 마커 밖의 기존 내용은 그대로 보존한다.
5. `~/.gjc/agent/AGENTS.md`에 신/구 easy-always 마커 잔재가 있으면
   백업(`.bak-$(date +%s)`) 후 그 블록만 제거한다(주변 빈 줄 정리).
6. `쉬운 답변 상시: 켜짐 (~/.gjc/agent/SYSTEM.md, 새 세션부터 적용)` 한 줄로 확인한다.
   이번 세션에도 바로 적용하려면 `/oh-my-gjc:easy on`을 함께 안내한다.
7. **주의:** 현재 레포에 프로젝트 `.gjc/SYSTEM.md`가 존재하면 프로젝트 파일이
   사용자 파일을 **통째로 대체**하므로 이 규칙이 그 레포에선 적용되지 않는다 —
   이 경우 프로젝트 SYSTEM.md에도 블록을 심을지 사용자에게 물어본다.

### `off`
1. SYSTEM.md와 AGENTS.md 어느 쪽에도 신/구 마커가 없으면
   `쉬운 답변 상시: 이미 꺼짐` 한 줄만 출력하고 끝낸다.
2. 있으면 해당 파일 백업(위와 동일) 후, 양쪽의 신/구 마커 블록을 모두 제거한다
   (주변 빈 줄 정리). 마커 밖 내용은 보존한다.
3. `쉬운 답변 상시: 꺼짐` 한 줄로 확인한다.

### 그 외 인자
사용법 한 줄만 안내: `/oh-my-gjc:easy-always [on|off|status]`.
