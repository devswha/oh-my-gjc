# oh-my-gjc

[Gajae Code (`gjc`)](https://github.com/Yeachan-Heo/gajae-code)용 플러그인 모음이에요.

## 설치 방법

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install oh-my-gjc@oh-my-gjc
```

gjc는 플러그인 안의 스킬·명령을 세션에 자동으로 안 불러와요. 그래서 아래 한 줄을
**터미널에서 한 번** 실행해 직접 설치해줘야 해요.

```
bash ~/.gjc/plugins/cache/plugins/*oh-my-gjc*/bin/install-skill.sh all
```

그다음 gjc 세션을 새로 열고(또는 `/move .`) 아래를 실행하면 끝이에요.

```
/oh-my-gjc:setup
```

플러그인을 업그레이드할 때마다 위 설치 한 줄을 다시 실행하세요.

## 스킬 하나씩 보기

### `easy-answer` — 쉬운 말로 답하기

마지막에 사용자에게 하는 답을 전문용어 없이 쉬운 말로 풀어줘요. 지금 이 글처럼요.
작업 내용이나 정확성은 그대로 두고 **말투만** 바꿔요. 쉽게 쓰다 뜻이 틀어질 것 같으면
원래 용어를 그대로 쓰고 괄호로 뜻을 달아요.

- 형식: ① 한 줄 결론 → ② 쉬운 설명 → ③ (필요할 때만) 자세히 — 명령어·경로 같은 건 여기로.
- 위험·주의는 절대 빼지 않아요. 쉬운 말로 꼭 알려줘요.
- 켜기: `/oh-my-gjc:easy` (이번만) / `/oh-my-gjc:easy-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/easy-answer/SKILL.md`](./plugins/oh-my-gjc/skills/easy-answer/SKILL.md)

### `multivendor-presets` — 역할별 모델 묶음 프리셋

여러 회사의 AI 모델을 역할별로 섞어 쓰도록 미리 짜둔 묶음을 설정 파일에 넣어줘요.
(예: 한 모델이 코드 짜고, 다른 모델이 검토하고, 또 다른 모델이 최종 점검.)

- `ideal` — 평소 기본. 균형 잡힌 조합.
- `escalate-surgical` — 어려운 문제 하나 풀 때만 잠깐. 끝나면 `ideal`로 복귀.
- `monorepo` — 아주 큰 코드베이스용(모든 역할이 넓은 문맥 처리).
- 기존 설정은 안 건드리고 해당 프리셋만 넣어요(넣기 전 백업).
- 쓰기: `/oh-my-gjc:presets`로 넣고 → `gjc --mpreset ideal`로 켜요. 각 프리셋은 해당 회사 로그인이 필요해요.
- 원문: [`plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md`](./plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md)

### `branch-flow` — 저장소 브랜치 규칙

작업은 `dev`에서 하고, 다 되면 릴리스할 때만 `main`으로 넘기는 규칙이에요.
`main`은 직접 건드리지 않아요. 이 규칙은 저장소 안에 저장돼서 같이 따라다녀요.

- 흐름: 작업 브랜치 → `dev`에 합치기 → (명시적 지시가 있을 때만) `dev`를 `main`으로 릴리스.
- 사용자 허락 없이 저장·합치기·릴리스 안 해요. 남의 작업은 안 건드려요.
- 켜기: `/oh-my-gjc:branchflow-always on` (`off` / `status`로 확인)
- 원문: [`plugins/oh-my-gjc/skills/branch-flow/SKILL.md`](./plugins/oh-my-gjc/skills/branch-flow/SKILL.md)

## 라이선스

MIT — [LICENSE](./LICENSE) 참고.
