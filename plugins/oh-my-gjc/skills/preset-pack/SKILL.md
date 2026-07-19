---
name: preset-pack
description: "`/omg:preset-pack` 명령이 명시적으로 요청했을 때만 omg 최종 좌석표 프리셋(daily/deep/sec)을 사용자 `~/.gjc/agent/models.yml`에 이름 단위로 병합·확인·제거한다. 다른 입력에서는 자동 활성화하지 않으며, 명시 호출 없이는 models.yml을 절대 수정하지 않는다."
---

# Preset Pack (omg 최종 좌석표 프리셋 설치)

목적: 검증된 좌석표 1개 + effort 변형 3개(`daily`/`deep`/`sec`)를 사용자
`~/.gjc/agent/models.yml`에 **명시 호출 시에만** 병합한다. 정본은 스위트의
`references/preset-pack.yml`이며, 이 스킬은 그 블록을 이름 단위로 반영하는 절차다.

## 좌석표 (한눈)

| 좌석 | daily | deep | sec |
|---|---|---|---|
| default | fable-5:medium | fable-5:high | **k3:high** |
| planner | k3:high | k3:high | k3:high |
| executor | terra:xhigh | terra:xhigh | terra:xhigh |
| architect | opus-4-8:medium | opus-4-8:high | opus-4-8:high |
| critic | opus-4-8:high | opus-4-8:high | opus-4-8:high |

- `daily` 상주 / `deep` 토론·`--deliberate` 고위험 / `sec` 보안 작업(fable 클램프 회피).
- fable이 세션 중 클램프로 죽었으면 그 세션을 `--mpreset sec`로 resume/fork해 이어간다.

## 절차

### install (기본)

1. **정본 위치 결정**: 스위트 루트 바인딩(`<cwd>/.gjc/runtimes/oh-my-gjc/root` →
   `~/.gjc/agent/runtimes/oh-my-gjc/root` 순) 안의 `references/preset-pack.yml`.
   바인딩·파일이 없으면 병합하지 말고 하드닝된 루트 `install.sh` 재실행을 안내한다(fail-closed).
2. **백업**: `cp ~/.gjc/agent/models.yml ~/.gjc/agent/models.yml.bak-$(date +%s)`
   (파일이 없으면 `profiles:` 한 줄짜리 새 파일 생성부터).
3. **이름 단위 병합**: 정본의 `daily`/`deep`/`sec` 블록만 사용자 `profiles:` 아래에
   추가하거나 같은 이름을 교체한다. **다른 프로파일·최상위 키는 절대 건드리지 않는다.**
4. **검증**: YAML 파스 확인 후 각 프리셋 활성 스모크 —
   `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc --mpreset <p> -p --no-session --no-tools "Reply OK"`.
   실패하면 백업 복원 절차를 안내한다.
5. 결과 보고: 병합된 프리셋 이름, 백업 경로, 스모크 결과, 활성화 커맨드
   (`gjc --mpreset daily --default` 권장).

### status

`~/.gjc/agent/models.yml`의 `daily`/`deep`/`sec` 존재 여부와 정본 대비 좌석 차이만 보고한다(무수정).

### remove

백업 후 `daily`/`deep`/`sec` 블록만 제거한다. 다른 프로파일은 보존. 확인 없이 실행하지 않는다.

## 전제·주의

- 요구 로그인: anthropic + openai-codex + kimi-code. `required_providers` 중 자격증명이
  없으면 활성화가 하드블록된다.
- K3 1M 컨텍스트는 Kimi 플랜 티어 게이트가 있다(하위 티어는 256k로 잘림). **실측(2026-07-19):**
  선언 1M이어도 kimi-code 게이트웨이의 요청 총 페이로드 2MiB 캡 때문에 gjc 경유 실효는
  ≈400~600k 토큰이다(단발·멀티턴 누적 모두 400 재현; ~350k 단발은 양끝 니들 완벽 회수).
  codex 272k보다는 크므로 planner 좌석 우위는 유지된다.
- k3에 `:medium`을 주면 서버에서 high로 승격된다 — 이 팩은 low/high만 쓴다.
- 셀렉터·벤치 근거는 카탈로그 시점 민감(2026-07-19 실호출 검증). 실패 시 `gjc --list-models`로 재확인.
- K3 planner는 ralplan 계약(receipt-only·`--write` 경유) 실전 검증 대기 상태다 —
  ralplan에서 이상 동작하면 planner만 `openai-codex/gpt-5.6-sol:high`로 되돌리는 게 원포인트 복구다.

## 하지 않는 것

- 명시 호출 없는 자동 병합(설치 스크립트 포함 어떤 경로로도).
- `daily`/`deep`/`sec` 외 프로파일·최상위 키 수정, `config.yml` 수정.
- 프리셋 활성화 자체(활성화는 사용자가 `--mpreset`으로).
