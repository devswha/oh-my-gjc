---
description: plain-layer(쉬운 기획)를 이번 대화에 켠다. 인자로 아이디어를 주면 native deep-interview를 시작하고, off면 레이어만 끈다. 선택지 쉬운 설명 + 인터뷰 후 대화로 스펙 다듬기 + 승인 시 gate-briefing 위임. 네이티브 워크플로를 대체하지 않는다.
argument-hint: "[<아이디어>|off]  (기본: 아이디어 입력 요청)"
---

# /omg:plain

`plain-layer` — 세션(현재 대화) 한정 UX 레이어. always/SYSTEM.md 세마포어 없음.

입력 인자: `$ARGUMENTS`

## 처리 규칙

### `off`
1. presentation/polish layer만 끈다.
2. native deep-interview state·spec은 clear/삭제하지 않는다.
3. 한 줄만 출력:
   `쉬운 기획 모드: 꺼짐 — 아직 확정하지 않은 대화 내용은 저장되지 않았습니다. 마지막 저장본: <path|없음>.`
   (마지막 저장본은 가능하면 `gjc state deep-interview read --json`의 `spec_path`, 없으면 `없음`.)

### 그 외 (아이디어 문자열) 또는 인자 비어 있음
1. 인자가 비어 있으면 아이디어를 자유 입력으로 **한 번** 받는다.
2. 현재 대화 컨텍스트에 plain-layer를 켠다 (flag/file/marker 만들지 않음).
3. 이미 active deep-interview가 있으면 restart/clear하지 않고 layer만 붙인다.
4. 없으면 `/skill:deep-interview`에 아이디어를 넘겨 네이티브 인터뷰를 시작한다.
5. 이후 동작은 `skills/plain-layer/SKILL.md` 정본:
   - 선택지 해설 (option value/metadata 불변)
   - Phase-5 **단일** ask + `대화로 더 다듬기` 옵션
   - polish는 자유 대화 + `gjc deep-interview --write`만
   - 승인은 `gate-briefing` 위임 (대행 금지)
6. 이 커맨드 자체가 ralplan/실행/스펙 쓰기를 하지 않는다.

### 잘못된 사용
한 줄: `/omg:plain [<아이디어>|off]`
