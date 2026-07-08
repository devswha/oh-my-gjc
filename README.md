# oh-my-gjc

[가재코드(`gjc`)](https://github.com/Yeachan-Heo/gajae-code)용 플러그인 모음이다.

📖 **공식 문서: https://gajae-code-docs.vercel.app** (시작하기·가이드·워크플로·레퍼런스)

## 1. 설치

**① 터미널에서:**

```
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash
```

**② gjc 세션에서:**

> Install oh-my-gjc by following https://raw.githubusercontent.com/devswha/oh-my-gjc/main/INSTALLATION.md — run the steps, verify, and report.

새 gjc 세션 열면 끝(또는 `/move .`).

<details>
<summary>설치가 안되요</summary>

원샷은 본체 + 옵션 플러그인 **전부**를 네이티브 설치까지 한 방에 깐다(oh-my-zsh처럼). 변형:

```
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash -s -- --core
curl -fsSL https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh | bash -s -- tower insane-review
```

첫 줄은 본체만(미니멀), 둘째 줄은 본체 + 특정 옵션만.

**수동 설치 (원샷이 막힐 때).** gjc는 플러그인 속 스킬·명령을 세션에 안 불러온다 — 그래서 원샷이 대신 해주는 일은 이 셋:

```
gjc plugin marketplace add devswha/oh-my-gjc
gjc plugin install oh-my-gjc@oh-my-gjc
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all
```

**옵션 플러그인 나중에 하나만 더.** 플러그인마다 ① 설치 ② 네이티브 한 줄(마켓플레이스 추가는 한 번 했으면 생략):

```
gjc plugin install tower@oh-my-gjc
bash "$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___tower___*/bin/install-skill.sh 2>/dev/null | sort -V | tail -1)" all
```

`tower` 자리에 플러그인 이름만 바꾸면 된다(`oh-my-gjc___<플러그인>___*`). 본체·옵션 같이 깔 때 순서 무관 — 각 네이티브 한 줄이 자기 폴더만 정확히 집는다(`*oh-my-gjc*` 같은 막연한 글롭 금지).

**확인·마무리.** `/omg`로 뭐가 깔렸는지 본다. 모델 프리셋 병합·상시 모드는 원할 때만 `/omg:setup`(필수 아님). 커맨드는 `/omg:<name>`(구 `/oh-my-gjc:<name>`는 폐기 예정 별칭). 업그레이드 때마다 원샷 한 줄 다시.

</details>

## 2. 있는것

**코어 (`oh-my-gjc`)**
- `easy-answer` — 쉬운 말로 답
- `gate-briefing` — 승인 게이트 비전문가 브리핑
- `multivendor-presets` — 역할별 모델 프리셋
- `branch-flow` — dev 통합 / main 릴리스 브랜치 규칙
- `extragoal` — 외부 최종 리뷰 게이트(무공유·교차패밀리 리뷰 후 머지)

**옵션 플러그인 (필요할 때 따로 설치)**
- `codex-cli-control` — 로컬 Codex CLI에 읽기 전용 질문 위임
- `codex-deepwork` — Codex에 파일 쓰는 자동 작업 위임
- `lazycodex` — LazyCodex 하네스 설치·관리 + ultrawork 실행
- `codex-app-control` — Codex 데스크톱 앱 GUI를 CDP로 제어
- `insane-review` — GPT-5.5 Pro 웹 코드 리뷰
- `gjc-bugwatch` — gjc 자체 버그 수집
- `tower` — TUI 에이전트 세션 함대를 관제탑 하나로 감시·전파·결정 큐(gjc team과 다름)

## 3. 자세히

### `easy-answer` — 쉬운 말로 답한다

마지막에 사람한테 하는 답을 전문용어 빼고 쉬운 말로 풀어준다. 지금 이 글처럼.
작업이나 정확성은 안 건드리고 **말투만** 바꾼다. 쉽게 쓰다 뜻 틀어질 것 같으면
원래 용어 그대로 두고 괄호로 뜻 달아준다.

- 형식: ① 한 줄 결론 → ② 쉬운 설명 → ③ (필요할 때만) 자세히 — 명령어·경로는 여기로 던진다.
- 위험·주의는 절대 안 뺀다. 쉬운 말로 꼭 알려준다.
- 켜기: `/omg:easy` (이번만) / `/omg:easy-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/easy-answer/SKILL.md`](./plugins/oh-my-gjc/skills/easy-answer/SKILL.md)

### `multivendor-presets` — 역할별 모델 묶음 프리셋

여러 회사 AI 모델을 역할별로 섞어 쓰게 미리 짜둔 묶음을 설정 파일에 꽂아준다.
(한 놈이 코드 짜고, 다른 놈이 검토하고, 또 다른 놈이 최종 점검하는 식.)

- `ideal` — 평소 기본. 균형 잡힌 조합이다.
- `escalate-surgical` — 어려운 문제 하나 팰 때만 잠깐 쓴다. 끝나면 `ideal`로 돌아온다.
- `monorepo` — 개큰 코드베이스용. 모든 역할이 넓은 문맥 씹는다.
- `reviewer` — 리뷰/감사 전용 조합(코드 저작 패밀리와 다른 패밀리가 판정). extragoal 외부 리뷰 게이트에서 씀.
- 기존 설정은 안 건드린다. 해당 프리셋만 꽂는다(넣기 전 백업한다).
- 쓰기: `/omg:presets`로 꽂고 → `gjc --mpreset ideal`로 켠다. 프리셋마다 해당 회사 로그인 필요하다.
- 원문: [`plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md`](./plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md)

### `extragoal` — 외부 최종 리뷰 게이트

완성한 작업을 머지 전에 **작업 과정을 안 본 다른 모델**이 완성 diff만 보고 재심한다. 자기 세션 안에서
검토하는 게 아니라, 실제 PR 리뷰처럼 무공유·교차패밀리로 판정 → 승인/변경요청 verdict → 발견 정리 →
(최대 2라운드) 고치고 재서명 → 기계적 머지.

- 리뷰어 레인: 네이티브 교차세션 gjc(기본) / `/omg:fable` / `insane-review`(GPT-5.5 Pro 웹) — AND 게이트로 합침.
- fail-closed: verdict 누락·malformed·timeout은 절대 승인으로 안 친다. 시크릿 스캔은 번들이 기기 밖 나가는 레인에서 비타협.
- 켜기: `reviewer` 프리셋 흡수(`/omg:presets`) 후 스킬 트리거로 활성. 원문: [`plugins/oh-my-gjc/skills/extragoal/SKILL.md`](./plugins/oh-my-gjc/skills/extragoal/SKILL.md)

### `branch-flow` — 저장소 브랜치 규칙

작업은 `dev`에서 하고, 다 되면 릴리스할 때만 `main`으로 넘긴다.
`main`은 직접 안 건드린다. 이 규칙은 저장소 안에 저장돼서 같이 따라다닌다.

- 흐름: 작업 브랜치 → `dev`에 합치기 → (명시적 지시 있을 때만) `dev`를 `main`으로 릴리스.
- 사용자 허락 없이 저장·합치기·릴리스 안 한다. 남의 작업은 안 건드린다.
- 켜기: `/omg:branchflow-always on` (`off` / `status`로 확인)
- 원문: [`plugins/oh-my-gjc/skills/branch-flow/SKILL.md`](./plugins/oh-my-gjc/skills/branch-flow/SKILL.md)

### `/omg:fable` — 안전-크리티컬 코드 적대적 감사

돈·데이터·보안 걸린 코드를 Fable 5 모델로 적대적 감사한다. 설계 리뷰가 아니라
"이 안전장치들이 **동시에** 터지는 시나리오가 있나"를 판다. 읽기 전용, 심각도 +
파일:라인 + 재현 시나리오로 보고한다.

- 스코프는 파일 3~6개만. 넘으면 감사가 얕아진다.
- 보고서 상위 발견은 실코드랑 대조(스팟체크)한 뒤에만 브리핑한다. 억지 결함 안 만든다.
- `:max` 금지 — Fable은 조용히 `xhigh`로 깎인다. Fable이 거부하면 `opus-4-8`로 대체한다.
- 쓰기: `/omg:fable "주문 경로와 손절 로직"`
- 원문: [`plugins/oh-my-gjc/commands/fable.md`](./plugins/oh-my-gjc/commands/fable.md)

### `insane-review` — GPT-5.5 Pro 웹 리뷰 (별도 플러그인)

GPT-5.5 Pro는 웹 구독에서만 되고 API가 없다. 이 스킬이 구독 ChatGPT 웹을 CDP로
자동화해서 Pro를 gjc 안으로 끌어온다. API 비용 0. 코드를 통째로 넣는 게 아니라
관련 타겟만 골라 repomix로 묶어 넣고 리뷰를 회수한다.

- 별도 플러그인이다: `gjc plugin install insane-review@oh-my-gjc` (셸에서) 후 네이티브 설치 필요.
- 크로미움 브라우저를 전용 프로필로 디버그포트(9222)에 띄우고, chatgpt.com 로그인 + GPT-5.5 Pro 선택해야 한다. 로그인은 자동 안 된다.
- 결과는 프로젝트의 `.insane-review/`에 저장한다.
- 원문: [`plugins/insane-review/skills/insane-review/SKILL.md`](./plugins/insane-review/skills/insane-review/SKILL.md)

### `gjc-bugwatch` — gjc 버그 수집 (별도 플러그인)

gjc 쓰다가 로그에 남은 gjc 자체 버그를 긁어모은다. `~/.gjc/logs`를 훑어 런타임
에러·크래시를 뽑고, 중복 묶고, 개인정보 지우고, gajae-code clone에서 재현·근거
확인한 뒤 초안만 만든다. 자동 PR 없다 — 제출은 사람이 한다.

- 별도 플러그인이다.
- 라이브 모니터(뜨는 즉시 알림) + 배치 스캐너(쌓인 로그 몰아 읽기) 두 축이다.
- 이미 고쳐진 버그는 resolved 원장으로 걸러서 다시 안 쫓는다.
- 초안은 프로젝트의 `.gjc/bugwatch/drafts/`에 저장한다.
- 원문: [`plugins/gjc-bugwatch/skills/gjc-bugwatch/SKILL.md`](./plugins/gjc-bugwatch/skills/gjc-bugwatch/SKILL.md)

### `tower` — 관제탑 (별도 플러그인)

세션 여러 개 띄우는 건 쉽다. 어려운 건 사람 쪽이다 — 주의는 싱글스레드라 N개를
동시에 지켜보려는 순간 컨텍스트 스위칭으로 무너진다. `tower`가 그 관측을 대신한다:
감시기가 각 세션의 완료(작업 중→입력 대기)·블록을 잡고, 사람에겐 **결정이 필요한 것만**
큐로 모아 온다. 관측은 기계가, 판정은 사람이. (하루 7세션 굴리다 나온 도구.)

- 별도 플러그인이다: `gjc plugin install tower@oh-my-gjc` (셸에서) 후 네이티브 설치 필요.
- 세션에 메시지를 tmux로 주입할 때 TUI 함정 3종(물결·괄호대문자·실존 경로 토큰)을 방어한다.
- 감시·순찰은 세션 귀속 — 관제탑 세션 재개 시 재등록한다. 빈 순찰은 무보고.
- gjc `team`(작업 워커 조율)과 다르다 — team은 일 분배, tower는 상주 관측 + 사람 결정 큐.
- 원문: [`plugins/tower/skills/tower/SKILL.md`](./plugins/tower/skills/tower/SKILL.md)

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라.
