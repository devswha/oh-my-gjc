---
name: preset-pack
description: "`/omg:preset-pack` 명령이 명시적으로 요청했을 때만 omg 최종 프리셋(daily/agent)을 사용자 `~/.gjc/agent/models.yml`에 이름 단위로 병합·확인·제거한다. 다른 입력에서는 자동 활성화하지 않으며, 명시 호출 없이는 models.yml을 절대 수정하지 않는다."
---

# Preset Pack (omg 최종 프리셋 설치)

목적: 확정된 프리셋 2개(`daily`=사람 세션 / `agent`=무인 자율 세션)를 사용자
`~/.gjc/agent/models.yml`에 **명시 호출 시에만** 병합한다. 정본은 스위트의
`references/preset-pack.yml`이며, 이 스킬은 그 블록을 이름 단위로 반영하는 절차다.

## 좌석표 (한눈)

| 좌석 | daily (사람) | agent (무인) |
|---|---|---|
| default | fable-5:medium | **sol:medium** |
| planner | k3:high | **sol:high** |
| executor | terra:xhigh | terra:xhigh |
| architect | opus-4-8:medium | opus-4-8:medium |
| critic | opus-4-8:high | opus-4-8:high |

- `daily` — 대화 세션 상주 기본. 주력 fable은 보안 주제에서 클램프로 세션이 죽을 수 있다.
- `agent` — 무인 자율 러닝 계약: 주력이 Codex 창(sol)이라 사람 세션의 Claude 창과 쿼터가
  분리되고 클램프 무풍. 제작(OpenAI) ↔ 심사(Anthropic) 완전 분리.
  **클램프로 죽은 세션의 복구 프리셋을 겸한다**: `gjc -r <세션ID> --mpreset agent`.
- v1의 `deep`/`sec`는 폐지됨(2026-07-20 하코 확정) — 폐지 근거는 정본 yml 하단 기록 참조.

## 절차

### install (기본)

1. **정본 위치 결정**: 스위트 루트 바인딩(`<cwd>/.gjc/runtimes/oh-my-gjc/root` →
   `~/.gjc/agent/runtimes/oh-my-gjc/root` 순) 안의 `references/preset-pack.yml`.
   바인딩·파일이 없으면 병합하지 말고 하드닝된 루트 `install.sh` 재실행을 안내한다(fail-closed).
2. **백업**: `cp ~/.gjc/agent/models.yml ~/.gjc/agent/models.yml.bak-$(date +%s)`
   (파일이 없으면 `profiles:` 한 줄짜리 새 파일 생성부터).
3. **이름 단위 병합**: 정본의 `daily`/`agent` 블록만 사용자 `profiles:` 아래에
   추가하거나 같은 이름을 교체한다. **다른 프로파일·최상위 키는 절대 건드리지 않는다.**
4. **폐지분 정리(조건부)**: 사용자 `profiles:`에 `deep`/`sec`가 있고 그 내용이
   과거 이 팩(v1)이 병합한 좌석표와 **정확히 일치**하면 백업이 있는 상태에서 함께 제거한다.
   사용자가 한 글자라도 수정한 사본이면 건드리지 않고 보고만 한다.
5. **검증**: YAML 파스 확인 후 각 프리셋 활성 스모크 —
   `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc --mpreset <p> -p --no-session --no-tools "Reply OK"`.
   실패하면 백업 복원 절차를 안내한다.
6. 결과 보고: 병합·제거된 프리셋 이름, 백업 경로, 스모크 결과, 활성화 커맨드
   (사람 세션 `gjc --mpreset daily --default` / 무인 발주 `gjc --mpreset agent`).

### status

`~/.gjc/agent/models.yml`의 `daily`/`agent` 존재 여부, 정본 대비 좌석 차이,
폐지된 `deep`/`sec` 잔존 여부만 보고한다(무수정).

### remove

백업 후 `daily`/`agent`(및 v1 잔존 `deep`/`sec` 원본 일치분) 블록만 제거한다.
다른 프로파일은 보존. 확인 없이 실행하지 않는다.

## 전제·주의

- 요구 로그인: `daily`는 anthropic + openai-codex + kimi-code, `agent`는 anthropic + openai-codex.
  `required_providers` 중 자격증명이 없으면 활성화가 하드블록된다.
- K3 실측(2026-07-19): 선언 1M이어도 kimi-code 게이트웨이 요청 총 페이로드 2MiB 캡 때문에
  gjc 경유 실효 ≈400~600k 토큰(codex 272k보다는 커서 daily planner 좌석 우위 유지).
  k3에 `:medium`을 주면 서버에서 high로 승격된다 — 이 팩은 high만 쓴다.
- daily의 K3 planner는 ralplan 계약(receipt-only·`--write` 경유) 실전 검증 대기 상태다 —
  ralplan에서 이상 동작하면 planner만 `openai-codex/gpt-5.6-sol:high`(=agent planner 좌석)로
  되돌리는 게 원포인트 복구다.
- 빌트인 `opus-codex`는 대체재가 아니다(실정의: 주력 opus-4-8:xhigh·executor terra:low —
  대화형 설계라 무인 함대에 깔면 Claude 창을 폭식한다). 무인은 `agent`.
- 셀렉터·벤치 근거는 카탈로그 시점 민감. 실패 시 `gjc --list-models`로 재확인.

## 하지 않는 것

- 명시 호출 없는 자동 병합(설치 스크립트 포함 어떤 경로로도).
- `daily`/`agent`(및 v1 원본 일치 잔존분) 외 프로파일·최상위 키 수정, `config.yml` 수정.
- 프리셋 활성화 자체(활성화는 사용자가 `--mpreset`으로).
