---
name: multivendor-presets
description: 커스텀 모델 프로파일 프리셋을 ~/.gjc/agent/models.yml에 설치·병합한다. "프리셋 깔아줘 / sol 프리셋 / 모델 프리셋 설치 / mpreset 프로파일 설치 / 역할별 모델 프로파일 세팅" 같은 요청에 활성화. 정본의 sol을 이름 단위로 병합하고, 품질/비상/안전 레인은 gjc 빌트인을 안내한다.
---

# multivendor-presets — 모델 프로파일 프리셋

목적: gjc의 5개 역할(default/executor/planner/architect/critic)에 대한 **커스텀
프로파일 프리셋**을 사용자의 `~/.gjc/agent/models.yml`에 안전하게 설치한다.
gjc 플러그인 매니페스트에는 profiles 필드가 없어 자동 주입이 불가하므로, gjc가 직접 병합한다.

## 프리셋 (v0.10 — 커스텀은 sol 단일)

| 레인 | 프리셋 | 출처 | 요약 |
| --- | --- | --- | --- |
| **기본 (권장 default)** | `sol` | 커스텀 (이 스위트) | default=sol:low · planner=sol:high · architect=opus:medium · critic=opus:high · executor=terra:xhigh(벤치 근거). 실측(n=1): 실전 ralplan 신형 8:24 합의완료 vs 구형 xhigh 좌석 17:18에도 미완 — ≥2× |
| 품질 랄플랜 | `opus-codex` | gjc 빌트인 | opus 본체 + codex 좌석. 틀리면 비싼 계획일 때만 |
| 비상 단일 로그인 | `codex-medium` / `codex-pro` | gjc 빌트인 | openai-codex 하나로 전 좌석 |
| 안전-크리티컬 | `fable-opus-codex` | gjc 빌트인 | Fable 5 본체 + opus/codex 좌석 |

빌트인은 병합할 필요 없이 `gjc --mpreset <이름>`으로 바로 활성화되고, gjc 업그레이드
시 상류가 자동 최신화한다(커스텀 사본은 낡아 썩으므로 만들지 않는다 — v0.10 축소의 근거).
원본 정의는 oh-my-gjc 플러그인의 `references/presets.yml`가 정답지다(gjc `read`로 참고).
구버전의 `daily`/`fast`/`ultimate`/`ultimate-f5`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`/`grok`/`codex`/`fable-codex`는 정본에서 제외됨 — 필요 시 git 히스토리 참조.

## 실행

세부 절차·병합 안전 계약은 `/omg:presets` 커맨드 본문과 동일하다. 핵심만:

1. `references/presets.yml`은 네이티브 설치가 scope마다 기록한 정확한 suite root binding(`root`, mode `0600`)으로만 찾는다. 현재 프로젝트 binding(`$PWD/.gjc/runtimes/oh-my-gjc/root`)을 먼저, 없을 때만 user binding(`$HOME/.gjc/agent/runtimes/oh-my-gjc/root`)을 읽고, 둘 다 없을 때만 이 checkout의 `plugins/oh-my-gjc/references/presets.yml`으로 fallback한다. `/omg:presets` Step 0의 `resolve_omg_asset` 검증(일반 파일·비symlink·한 줄 절대 canonical root·asset 존재)을 그대로 적용해 `PRESETS="$(resolve_omg_asset "references/presets.yml")"`를 얻는다. binding이 없거나 malformed이면 fail-closed로 중단하고, cache를 고르지 말고 hardened root `install.sh`를 다시 실행해 bootstrap/upgrade/repair한다.
2. 대상 `~/.gjc/agent/models.yml`을 백업(`.bak-<ts>`) 후 읽는다. 없으면 `profiles:` 한 줄로 생성.
3. `sol`을 **이름 단위 병합**한다. 인자 없음/`sol`/`all` 전부 `sol` 병합이다. 빌트인 이름이 오면 병합 불필요 — 활성화 명령만 안내.
4. 은퇴 프리셋 블록(닫힌 목록 — `/omg:presets` 커맨드 본문의 구버전 정리 목록과 동일: `ultimate`/`ultimate-f5`/`daily`/`fast`/`ideal`/`escalate-surgical`/`monorepo`/`reviewer`/`fable-sol`/`grok-main`/`grok`/`codex`/`fable-codex`)이 보이면 사용자 동의 후에만 제거. 목록 밖 프로파일은 절대 제거 금지. **시작 기본값 보호:** 제거 전 `~/.gjc/agent/config.yml`의 `modelProfile.default`를 확인하고, 삭제 대상이 기본값이면 먼저 `sol`/대응 빌트인으로 이전한 뒤에만 삭제(이전 없이는 삭제 금지 — 다음 시작이 Unknown model profile로 깨진다).
5. 병합 후 유효 YAML + `sol` 존재를 확인. 실패 시 백업으로 복구하고 멈춘다.
6. 활성화·요구 로그인을 안내한다. 세션 기본은 `gjc --mpreset sol --default`.

## 절대 규칙 (약화 금지)

- **이름 단위 병합만.** 다른 프로파일·최상위 키(default 등)를 삭제/수정하지 않는다. (옛 프리셋 정리는 사용자 동의 후 예외.)
- 병합 결과가 유효 YAML이 아니거나 대상 프리셋이 없으면 **부분 저장 금지**, 백업 복구.
- 들여쓰기(2/6칸)·`required_providers`·`model_mapping` 구조와 원본 주석을 그대로 유지.
- 자격증명 검증은 활성화(gjc --mpreset) 시 gjc가 하드블록한다 — 병합 자체는 막지 않는다.
- 실호출 검증(`GJC_NOTIFICATIONS=0 gjc -p ... --model <selector>`)은 해당 벤더 로그인이 있을 때만. (ephemeral 검증 세션이 텔레그램에 붙어 유령 토픽 만들지 않게 알림 끄고 실행.)

## 활성화 안내 (사용자에게 전달)

```
gjc --mpreset sol --default          # 기본 (전 구간 저지연 — 빠른 ralplan 포함)
gjc --mpreset opus-codex             # 품질 랄플랜 (빌트인)
gjc --mpreset codex-pro              # openai-codex 단일 로그인 비상 (빌트인)
gjc --mpreset fable-opus-codex       # 안전-크리티컬 (빌트인)

요구 로그인: sol = openai-codex · anthropic (빌트인은 각자 프로바이더)
```
