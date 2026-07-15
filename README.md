# oh-my-gajaecode

가재코드 철학을 거스르는 플러그인입니다

[가재코드 가이드](https://gjc.vibetip.help/ko/docs)

## 1. 설치

**① 터미널에서:**

```
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```

**② gjc 세션에서:**

```
Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.
```

<details>
<summary>설치가 안되요</summary>

원샷이 막히면 저장소를 받아 같은 hardened installer를 실행한다:

```
git clone --depth 1 https://github.com/devswha/oh-my-gjc.git
bash oh-my-gjc/install.sh
```

한 번 설치로 스킬 4개 + 커맨드 7개(`/omg` + `/omg:*` 6개)가 전부 들어온다(추가 설치 없음). 업그레이드 땐 원샷 한 줄 다시.
원리·글롭 규칙 등 기여자용 상세는 AGENTS.md 참조.

</details>

## 2. 있는것

- `gate-briefing` — 승인 게이트 비전문가 브리핑 · 상시 온·오프 가능(`/omg:gate-always`)
- `extragoal` — 외부 최종 리뷰 게이트(무공유·교차패밀리 리뷰 후 머지)
- `/omg:fable` — 안전-크리티컬 코드 적대적 감사(돈·데이터·보안 코드) · **Fable 5 모델 필요**
- `insane-review` — GPT-5.6 Sol Pro 웹 코드 리뷰 · **ChatGPT 구독 + 크로미움 로그인 필요**
- `lazycodex-gjc` — 설치된 Codex+LazyCodex/OMO를 격리 읽기 전용 외부 작업자로 실행(`/omg:lazycodex-gjc`)

커맨드 전체: `/omg`, `/omg:setup`, `/omg:gate`, `/omg:gate-always`, `/omg:fable`, `/omg:insane-review`, `/omg:lazycodex-gjc`.

모델 구성은 GJC 기본값과 내장 프리셋을 그대로 쓴다. omj는 커스텀 모델 프리셋을 설치하거나 `models.yml`을 수정하지 않는다.

## 3. 자세히

### `gate-briefing` — 승인 게이트 비전문가 브리핑

승인/거절을 눌러야 하는 순간, 뭘 승인하는 건지 비전문가도 알게 풀어준다. 전문용어를
일상어로 옮기고 → 이 승인이 허용하는 범위 → 근거 붙은 체크리스트 → 판정까지 낸다.
대신 눌러주진 않는다 — 판단은 사람 몫이다.

- "명시 없음" 항목이 2개 이상이면 자동으로 **보류**로 민다(모르는 채 승인 방지).
- 도메인 안 가린다. 코드든 인프라든 계약이든 같은 틀로 브리핑한다.
- 켜기: `/omg:gate` (이번만) / `/omg:gate-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/gate-briefing/SKILL.md`](./plugins/oh-my-gjc/skills/gate-briefing/SKILL.md)

### `extragoal` — 외부 최종 리뷰 게이트

완성한 작업을 머지 전에 **작업 과정을 안 본 다른 모델**이 완성 diff만 보고 재심한다. 자기 세션 안에서
검토하는 게 아니라, 실제 PR 리뷰처럼 무공유·교차패밀리로 판정 → 승인/변경요청 verdict → 발견 정리 →
고치고 재서명하며 깨끗한 후보가 될 때까지 fix-forward → 기계적 머지.

- 리뷰어 레인: 네이티브 교차세션 gjc(기본) / `/omg:fable` / `insane-review`(GPT-5.6 Sol Pro 웹) — AND 게이트로 합침.
- fail-closed: verdict 누락·malformed·timeout은 절대 승인으로 안 친다. 시크릿 스캔은 번들이 기기 밖 나가는 레인에서 비타협.
- 켜기: 스킬 트리거로 활성. 별도 reviewer 프리셋 없이 GJC 기본 모델 구성의 교차세션 리뷰를 쓴다. 원문: [`plugins/oh-my-gjc/skills/extragoal/SKILL.md`](./plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `lazycodex-gjc` — 격리된 읽기 전용 Codex+LazyCodex 작업자

이미 설치·로그인된 **Codex CLI + LazyCodex/OMO**를 외부 `codex exec --ephemeral`
작업자로 한 번 동기 실행하고 결과만 가져온다.

- `read-only`만 허용한다. 동시 편집 안전성이 해결될 때까지 `workspace-write`는 fail-closed다.
- child GJC 세션·task를 만들지 않고 GJC config·자격증명을 복사하거나 변경하지 않는다.
- user-scope native install의 private SHA-256 runtime binding과 runner가 일치해야 실행한다.
- 쓰기: `/omg:lazycodex-gjc "읽기 전용 조사·리뷰 작업"`
- 원문: [`plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md`](./plugins/oh-my-gjc/skills/lazycodex-gjc/SKILL.md)
### `/omg:fable` — 안전-크리티컬 코드 적대적 감사

돈·데이터·보안 걸린 코드를 Fable 5 모델로 적대적 감사한다. 설계 리뷰가 아니라
"이 안전장치들이 **동시에** 터지는 시나리오가 있나"를 판다. 읽기 전용, 심각도 +
파일:라인 + 재현 시나리오로 보고한다.

- 스코프는 파일 3~6개만. 넘으면 감사가 얕아진다.
- 보고서 상위 발견은 실코드랑 대조(스팟체크)한 뒤에만 브리핑한다. 억지 결함 안 만든다.
- `:max` 금지 — Fable은 조용히 `xhigh`로 깎인다. Fable이 거부하면 `opus-4-8`로 대체한다.
- 쓰기: `/omg:fable "주문 경로와 손절 로직"`
- 원문: [`plugins/oh-my-gjc/templates/fable.md`](./plugins/oh-my-gjc/templates/fable.md)

### `insane-review` — GPT-5.6 Sol Pro 웹 리뷰

GPT-5.6 Sol Pro는 웹 구독에서만 되고 API가 없다. 이 스킬이 구독 ChatGPT 웹을 CDP로
자동화해서 Pro를 gjc 안으로 끌어온다. API 비용 0. 코드를 통째로 넣는 게 아니라
관련 타겟만 골라 repomix로 묶어 넣고 리뷰를 회수한다.

- 전제: ChatGPT 구독 + 크로미움 로그인(설치는 원샷에 포함, 로그인은 자동 안 됨).
- 크로미움 브라우저를 전용 프로필로 디버그포트(9222)에 띄우고, chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택해야 한다. 로그인은 자동 안 된다.
- 결과는 프로젝트의 `.insane-review/`에 저장한다.
- 원문: [`plugins/oh-my-gjc/skills/insane-review/SKILL.md`](./plugins/oh-my-gjc/skills/insane-review/SKILL.md)

### 가재 앱 마이그레이션 (0.14.0)

`gajae-app` 스킬과 `/omg:gajae-app` 커맨드는 이 번들에서 분리됐다. 이 업그레이드는 기존 셀프호스트 앱 배포를 삭제하지 않는다. 설치·업데이트는 [devswha/claudecodeui SELF-HOST 문서](https://github.com/devswha/claudecodeui/blob/feat/gjc-provider/docs/SELF-HOST.md)를 따른다.

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라.
