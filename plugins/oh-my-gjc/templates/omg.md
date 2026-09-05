---
description: oh-my-gjc 카탈로그 — 한 번의 설치로 들어온 omg 스킬·커맨드를 한눈에 보여준다. omz(oh-my-zsh) 관례의 단일 엔트리. 인자 없이 /omg 만 입력하면 전체 목록.
argument-hint: "(인자 없음 — 전체 카탈로그)"
---

# /omg — oh-my-gjc 카탈로그

입력 인자: `$ARGUMENTS`

인자가 있으면 `/omg` 사용법만 보여준다. 인자 없는 호출만 아래 카탈로그를 보여준다.

oh-my-gjc 스위트의 단일 진입점(oh-my-zsh의 `omz` 관례 계승). 이 커맨드는 **읽기 전용
안내**다 — 아래 목록을 사용자에게 그대로 정리해 보여준다. 아무것도
설치·실행·변경하지 않는다. **한 번의 설치로 아래가 전부 들어온다.**

## 전체 커맨드 (5)
- `/omg` — 이 카탈로그.
- `/omg:setup` — user·project 설치 파일·binding·마커의 읽기 전용 정적 진단. 로그인/모델 준비는 미검증.
- `/omg:no-english [on|off|status]` — 이번 세션의 한국어 우선 표현을 명시적으로 토글.
- `/omg:insane-review` — 검증된 ChatGPT Pro 웹 코드 리뷰. · 전제: ChatGPT 구독 + 크로미움 로그인
- `/omg:gpt-image <prompt>` — 로그인된 ChatGPT Images 웹 UI로 PNG 생성 및 로컬 provenance 저장. · 전제: ChatGPT 로그인 + 크로미움

> `insane-review`는 필요한 외부 환경이 없으면 안내하고 안전하게 멈춘다.
> 위의 `/omg:*`가 현재 공개 커맨드 전부다.

## 스킬 (5)
- `no-english`(`/omg:no-english`에서만 명시 호출) · `extragoal`(외부 최종 리뷰 게이트) · `insane-review`
- `insane-search` — 일반 URL 읽기가 차단된 공개 페이지를 공식 공개 경로와 안전한 대체 전송으로 읽는다. 일반 검색에는 활성화되지 않으며 로그인·CAPTCHA·paywall은 우회하지 않는다.
- `gpt-image` — 로그인된 ChatGPT Images 웹 UI에서 PNG를 생성하고 provenance와 함께 로컬에 저장한다.

## 첫 사용 · 활성화 예시

| 목적 | 입력 예시 | 범위와 전제조건 |
|---|---|---|
| 설치 상태 확인 | `/omg:setup` | 정적 진단만. 파일 수정·provider/runtime 실행 없음. |
| 한국어 표현 상태 확인 | `/omg:no-english status` | 이번 세션에서 명시적으로 켰는지만 확인. 인자 없음 또는 `on`은 켜기, `off`는 끄기. |
| 웹 코드 리뷰 | `/omg:insane-review src/api 변경을 검토해 줘` | 관련 코드가 외부 ChatGPT로 전송됨. 로그인·모델·첨부 검증이 필요. |
| 이미지 생성 | `/omg:gpt-image 흰 배경의 파란 가재 아이콘` | 명시 호출 전용. ChatGPT Images 전송 후 PNG·provenance를 로컬에 저장. |
| 완성 작업의 외부 최종 게이트 | `extragoal로 커밋된 feature/login 브랜치를 최종 리뷰하고 수정·머지까지 진행해 줘` | **모든 작업이 커밋된 피처 브랜치**가 선행조건. 발견 수정·재검증·머지까지 포함하며 읽기 전용 리뷰와 다름. |
| 막힌 공개 자료 읽기 | `일반 URL 읽기에서 403이 났어. 이 공개 페이지를 읽어 줘: <URL>` | 그때 `insane-search` 사용. 명시적 공개 자막·미디어 추출도 해당. |

일반 한국어 대화·“한국어로 답해 줘”는 `no-english`를 켜지 않는다. 일반적인 “그림을 그려 줘”도
`gpt-image`를 켜지 않는다. 보통 웹 검색·성공한 URL 읽기에는 `insane-search`를 쓰지 않는다.
로그인·CAPTCHA·paywall 우회 요청은 검색 스킬 대상이 아니다. 단순 코드 설명이나 읽기 전용 리뷰는
수정·머지 포함 `extragoal` 전체 게이트를 시작할 요청이 아니다. 별도 `/omg:extragoal` 또는
`/omg:insane-search` 명령은 없다. 자연어 활성화는 모델 판단이며 정적 검사로 보장하지 않는다.

## 문서
- 설치·자세히: 저장소 README. 원샷 설치: `install.sh`(curl 한 줄) / 에이전트용 `INSTALLATION.md`.
- 가재코드 가이드: https://gjc.vibetip.help/ko/docs
