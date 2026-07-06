# oh-my-gjc

[가재코드(`gjc`)](https://github.com/Yeachan-Heo/gajae-code)용 플러그인 모음이다 가재.

## 설치 방법

```
/plugin marketplace add devswha/oh-my-gjc
/plugin install oh-my-gjc@oh-my-gjc
```

gjc는 플러그인 속 스킬·명령을 세션에 안 불러온다 가재. 그러니 아래 한 줄을
**터미널에서 딱 한 번** 박아서 직접 깔아야 한다.

```
bash ~/.gjc/plugins/cache/plugins/*oh-my-gjc*/bin/install-skill.sh all
```

그다음 gjc 세션 새로 열고(또는 `/move .`) 이거 실행하면 설정 마무리된다 가재.

```
/oh-my-gjc:setup
```

플러그인 업그레이드할 때마다 위 설치 한 줄 다시 박아라 가재.

## 스킬 하나씩 보기

### `easy-answer` — 쉬운 말로 답한다

마지막에 사람한테 하는 답을 전문용어 빼고 쉬운 말로 풀어준다 가재. 지금 이 글처럼.
작업이나 정확성은 안 건드리고 **말투만** 바꾼다. 쉽게 쓰다 뜻 틀어질 것 같으면
원래 용어 그대로 두고 괄호로 뜻 달아준다.

- 형식: ① 한 줄 결론 → ② 쉬운 설명 → ③ (필요할 때만) 자세히 — 명령어·경로는 여기로 던진다.
- 위험·주의는 절대 안 뺀다 가재. 쉬운 말로 꼭 알려준다.
- 켜기: `/oh-my-gjc:easy` (이번만) / `/oh-my-gjc:easy-always on` (항상)
- 원문: [`plugins/oh-my-gjc/skills/easy-answer/SKILL.md`](./plugins/oh-my-gjc/skills/easy-answer/SKILL.md)

### `multivendor-presets` — 역할별 모델 묶음 프리셋

여러 회사 AI 모델을 역할별로 섞어 쓰게 미리 짜둔 묶음을 설정 파일에 꽂아준다 가재.
(한 놈이 코드 짜고, 다른 놈이 검토하고, 또 다른 놈이 최종 점검하는 식.)

- `ideal` — 평소 기본. 균형 잡힌 조합이다.
- `escalate-surgical` — 어려운 문제 하나 팰 때만 잠깐 쓴다. 끝나면 `ideal`로 돌아와라 가재.
- `monorepo` — 개큰 코드베이스용. 모든 역할이 넓은 문맥 씹는다.
- 기존 설정은 안 건드린다 가재. 해당 프리셋만 꽂는다(넣기 전 백업한다).
- 쓰기: `/oh-my-gjc:presets`로 꽂고 → `gjc --mpreset ideal`로 켠다. 프리셋마다 해당 회사 로그인 필요하다.
- 원문: [`plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md`](./plugins/oh-my-gjc/skills/multivendor-presets/SKILL.md)

### `branch-flow` — 저장소 브랜치 규칙

작업은 `dev`에서 하고, 다 되면 릴리스할 때만 `main`으로 넘긴다 가재.
`main`은 직접 안 건드린다. 이 규칙은 저장소 안에 저장돼서 같이 따라다닌다.

- 흐름: 작업 브랜치 → `dev`에 합치기 → (명시적 지시 있을 때만) `dev`를 `main`으로 릴리스.
- 사용자 허락 없이 저장·합치기·릴리스 안 한다 가재. 남의 작업은 안 건드린다.
- 켜기: `/oh-my-gjc:branchflow-always on` (`off` / `status`로 확인)
- 원문: [`plugins/oh-my-gjc/skills/branch-flow/SKILL.md`](./plugins/oh-my-gjc/skills/branch-flow/SKILL.md)

## 라이선스

MIT. [LICENSE](./LICENSE) 봐라 가재.
