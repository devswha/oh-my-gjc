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

1. **정본 위치 결정**: `references/preset-pack.yml`은 다음 순서로만 해석한다.
   1. 새 프로젝트 binding `<cwd>/.gjc/runtimes/oh-my-gajae-code/root`
   2. 새 user binding `~/.gjc/agent/runtimes/oh-my-gajae-code/root`
   3. **읽기 전용·기간 한정 compatibility fallback**인 기존 `<cwd>/.gjc/runtimes/oh-my-gjc/root` 프로젝트 binding, 이어서 `~/.gjc/agent/runtimes/oh-my-gjc/root` user binding
   4. 정확한 현재 checkout `plugins/oh-my-gajae-code/references/preset-pack.yml`
   각 binding은 절대·단일행·canonical root를 담은 일반 파일이어야 하며, binding 또는 그 경로 구성요소·asset·asset 디렉터리에 symlink가 없어야 한다. 하나라도 존재하지만 malformed, symlinked, non-canonical, control-character-containing, multiline, 또는 asset-missing이면 이후 binding/check-out으로 넘어가지 않고 fail-closed한다. 기존 compatibility binding은 읽기만 하며 쓰거나 지우지 않고, user state도 그 이전에는 수정하지 않는다. 모두 없을 때도 정확한 checkout asset만 허용한다. 바인딩·파일 오류면 병합하지 말고 `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh`의 하드닝된 루트 installer를 재실행하도록 안내한다.
2. **백업**: `cp ~/.gjc/agent/models.yml ~/.gjc/agent/models.yml.bak-$(date +%s)`
   (파일이 없으면 `profiles:` 한 줄짜리 새 파일 생성부터).
3. **이름 단위 병합**: 정본의 `daily`/`agent` 블록만 사용자 `profiles:` 아래에
   추가하거나 같은 이름을 교체한다. **다른 프로파일·최상위 키는 절대 건드리지 않는다.**
4. **폐지분 정리(조건부)**: 사용자 `profiles:`에 `deep`/`sec`가 있으면, 정본 하단의
   `retired_v1_profiles` fixture와 **파스 동등성**(YAML 파싱 결과가 좌석까지 완전 동일)으로
   비교해 일치할 때만 백업이 있는 상태에서 함께 제거한다. 한 좌석이라도 다르면
   사용자 수정본이므로 건드리지 않고 보고만 한다. fixture가 없는 정본(구버전)이면
   폐지분 정리를 건너뛴다(fail-closed).
5. **검증**: YAML 파스 확인 후 각 프리셋 활성 스모크 —
   `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc --mpreset <p> -p --no-session --no-tools "Reply OK"`.
   실패하면 백업 복원 절차를 안내한다.
6. 결과 보고: 병합·제거된 프리셋 이름, 백업 경로, 스모크 결과, 활성화 커맨드
   (사람 세션 `gjc --mpreset daily --default` / 무인 발주 `gjc --mpreset agent`).

### status

`~/.gjc/agent/models.yml`의 `daily`/`agent` 존재 여부, 정본 대비 좌석 차이,
폐지된 `deep`/`sec` 잔존 여부만 보고한다(무수정).

### remove

백업 후 `daily`/`agent`(및 `retired_v1_profiles`와 파스 동등한 잔존 `deep`/`sec`) 블록만 제거한다.
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
- `daily`/`agent`(및 fixture 파스 동등 잔존분) 외 프로파일·최상위 키 수정, `config.yml` 수정.
- 프리셋 활성화 자체(활성화는 사용자가 `--mpreset`으로).
