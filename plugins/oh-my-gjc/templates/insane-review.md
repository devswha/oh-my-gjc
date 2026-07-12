---
description: GPT-5.6 Sol Pro(웹 전용)에게 repomix로 패킹한 코드/질문을 보내 의견을 받아온다. 관련 파일 선별은 gjc가 판단, 실제 구동은 번들 엔진(pack_and_ask.py)이 수행.
argument-hint: "<리뷰 대상/질문>  예) review the auth flow in src/auth"
---

# /omg:insane-review

사용자의 요청(`$ARGUMENTS`)을 GPT-5.6 Sol Pro(구독 웹)에게 보내 분석/의견을 받아 반영한다.
세부 절차·가드는 `skills/insane-review/SKILL.md`가 실행 지시서다(gjc `read`로 참고).

> **원칙: 사용자에게 CLI 타이핑을 시키지 않는다.** 환경이 안 갖춰졌으면 gjc가 `--check-env`/`--ensure-env`로 감지하고,
> 필요한 결정은 gjc **`ask` 도구 선택지**로 물어본 뒤 gjc가 대신 실행한다. 초보자도 클릭만으로 따라올 수 있어야 한다.

> **자동활성화 스킬 포함.** 단일 스위트 설치(`install-skill.sh all`)가 이 커맨드와 함께
> `insane-review` 스킬도 네이티브로 깔아준다 — "GPT한테 물어봐" 같은 자연어 트리거로도 뜬다.
## Step 0 — 엔진 경로 해석 (`$IR`)

`${CLAUDE_PLUGIN_ROOT}`는 gjc 커맨드 본문에서 치환되지 않으므로 실제 경로를 잡아 `$IR`에 담는다:
```bash
IR="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/pack_and_ask.py 2>/dev/null | sort -V | tail -1)"
[ -z "$IR" ] && IR="$(ls -d ./.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___*/bin/pack_and_ask.py 2>/dev/null | sort -V | tail -1)"
[ -z "$IR" ] && [ -f plugins/oh-my-gjc/bin/pack_and_ask.py ] && IR="plugins/oh-my-gjc/bin/pack_and_ask.py"
echo "IR=$IR"
```
`$IR`가 비면 insane-review 설치 여부를 안내하고 멈춘다.

## Step 0.5 — 환경 온보딩 (브라우저·로그인; 선택지 기반, 막힌 단계만)

먼저 gjc가 직접 실행한다(사용자에게 시키지 말 것):
```bash
python3 "$IR" --ensure-env
```
`--ensure-env`는 **저장된 브라우저가 있고 CDP가 닫혀 있으면 조용히 1회 자동 기동**한 뒤 상태를 보고한다
(저장값-only·첫감지 폴백 없음, `browser=wrong`이면 자동기동 안 함). **즉 최초 1회 온보딩 이후엔 브라우저를 다시 묻지 않고 알아서 뜬다.**
마지막 줄 `STATUS node=… deps=… browser=… login=… saved_browser=…`을 파싱한다. **전부 ok가 아니면**, 막힌 첫 단계를
gjc `ask` 도구로 물어보고 → 선택대로 gjc가 실행 → `--ensure-env`를 다시 돌려 재확인한다(최대 3~4회 반복).
질문·선택지는 **사용자의 현재 대화 언어**로 작성한다.

- **`deps=missing`** → `ask`(header `의존성`):
  - "지금 자동 설치 (추천)" → gjc가 `python3 "$IR" --check-env --install` 실행
  - "직접 설치할게요" → `pip install playwright pyperclip` 안내만
  - "취소"
- **`browser=down`** — `--ensure-env`가 저장값 자동기동을 **이미 시도한 뒤**의 상태다. `saved_browser`로 분기:
  - **`saved_browser=<이름>`인데도 down** (저장 브라우저 자동기동 실패 — 보통 프로필 락/앱 이동) → `ask`(header `브라우저`):
    ["다시 시도"(→ `--ensure-env` 재호출) / "다른 브라우저로 변경"(→ 아래 감지 분기) / "취소"]. **이때만 묻는다.**
  - **`saved_browser=none`** (최초 1회) → 아래 감지 분기로 한 번 묻고 `python3 "$IR" --launch-browser "<이름>"`로 띄운다(선택 **자동 저장 → 다음 실행부터 무질문 자동기동**).

  브라우저를 직접 띄울 땐 `open -a`가 아니라 `python3 "$IR" --launch-browser "<이름>"`(크로스플랫폼·전용 프로필·선택 자동 저장)로 한다.
  **항상 전용 프로필로 실행되므로 사용자 주 브라우저 세션은 건드리지 않는다.** `python3 "$IR" --list-browsers`의 `BROWSERS` 목록으로 분기:
  - **2개 이상 감지** → `ask`(header `브라우저`): 각 브라우저를 선택지로. 사용자 주 브라우저 추정엔 "메인 추정 — 가급적 다른 것" 주석. 선택 → `--launch-browser "<이름>"` → 재점검.
  - **정확히 1개 감지** → `ask`(header `브라우저`):
    - **"전용 브라우저 하나 설치 (추천)"** → 가벼운 크로미움(Chrome/Brave 등)을 자동화 전용으로 따로 설치 안내 → `--launch-browser`.
    - **"지금 이 브라우저의 격리 프로필로 진행"** → `--launch-browser "<그 이름>"`. 전용 프로필이라 메인과 분리되지만, **같은 앱 2창이라 자동화 창은 실수로 건드리지 말 것**을 한 줄 고지.
    - "취소"
  - **0개 감지** → `ask`(header `브라우저`): "크로미움 계열 브라우저가 없습니다 — 설치할까요?" → ["Chrome 설치 안내"/"취소"]
- **`browser=wrong`**(포트 점유) → `ask`(header `포트충돌`): "9222를 다른 프로세스가 쓰고 있어요. 종료하고 전용 브라우저를 다시 띄울까요?" → ["다시 띄우기"(점유 프로세스 종료 안내 후 `--launch-browser`)/"취소"]
- **`login=no`** → `ask`(header `로그인`): "방금 띄운 **전용 브라우저 창**에서 **chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택**을 끝낸 뒤 계속하세요. (전용 프로필이라 이 로그인은 계속 유지됩니다.)"
  → ["로그인 완료 — 계속"(→ `--ensure-env` 재확인) / "취소"]
- **`node=missing`** → `ask`(header `Node`): "Node.js가 필요합니다(repomix 자동설치에 사용). 설치를 도와드릴까요?" → ["패키지 매니저로 설치"/"직접 설치할게요"/"취소"]

`STATUS … login=ok`까지 가면 Step 1로. 사용자가 "취소"하면 멈추고 무엇이 남았는지 한 줄로 알려준다.

## Step 1~ — 리뷰 실행

1. **의도 파악** — `$ARGUMENTS`(또는 직전 대화 맥락)에서 GPT Pro에게 물을 핵심 질문을 한 문장으로 정한다.
   타겟/범위가 애매하면 gjc `ask` 도구로 선택지를 줘서 고르게 한다(타이핑 요구 금지). 예) header `리뷰 대상`,
   options = 후보 디렉토리들 + "프로젝트 전체" + "질문만(코드 없이)".
2. **타겟 선별(완전한 집합은 네 판단)** — 코드면 의도에 직결된 **모듈/디렉토리를 통째로**(`--target <dir>`, 풀코드).
   더 넓으면 import·호출자·테스트·설정까지 닫는다(gjc `search`/`lsp`). **`--compress` 금지**(본문 누락). 순수 질문이면 생략.
3. **실행** (정확성 리뷰는 풀코드 + 모델검증):
   ```bash
   python3 "$IR" \
     --target <repo_or_dir> --include "<관련 파일 글롭 또는 생략=전체>" \
     --model pro --require-model "GPT-5.6" \
     --prompt "<의도 담은 질문 — 판정마다 파일:라인·코드조각 인용 강제>"
   ```
   - 응답이 오래 걸려도 되면 그대로(완전추론). 시간을 bound하려면 `--force-answer-after <초>`. 단독 리뷰는 보통 끄고, council은 켜서 cap.
4. **누락 확인** — 출력의 `📦 패킹 포함 N개 파일`이 의도한 완전한 집합을 담았는지 확인(빠지면 SKILL §3.5 원인 제거).
5. **회수·반영** — 현재 프로젝트의 **`.insane-review/response_*.md`**를 gjc `read`로 읽고, **GPT-5.6 Sol Pro의 의견임을 명시**해
   반영하고 너의 판단(동의/이견)을 덧붙인다.

> **채팅 정리(기본 on):** 매 실행은 일반 채팅 목록 대신 **현재 폴더명 ChatGPT 프로젝트** 안에 정리된다(폴더당 1개, 캐시 재사용·자동 생성·실패 시 일반채팅 폴백). 이름은 `--project "<이름>"`, 끄려면 `--no-project`.

> **안전:** 이 커맨드는 로그인된 ChatGPT 웹 세션을 자동화하고, 관련 코드를 외부(ChatGPT)로 전송한다. 시크릿은 repomix secretlint가 기본으로 걸러 제외하며, 첨부/모델 미검증·미완성 응답은 fail-closed로 저장하지 않는다. 웹 UI 자동화는 OpenAI ToS가 보장하지 않으니 **개인 구독 용도로만** 쓴다.
