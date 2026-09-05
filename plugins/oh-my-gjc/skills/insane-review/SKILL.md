---
name: insane-review
description: >
  사용자가 ChatGPT Pro에게 리뷰나 의견을 구하라고 명시할 때 관련 코드를 repomix로
  패킹해 로그인된 ChatGPT 웹 세션에 보내고 답을 회수한다. 트리거: "GPT한테 물어봐",
  "Pro 모델 의견", "GPT Pro로 리뷰", "repomix로 묶어서 GPT에 넣어줘",
  "ask gpt pro", "have Pro review this". 일반 코드리뷰·수정·검색 요청에는
  활성화하지 않는다. insane-search의 공개 페이지 읽기에는 브라우저 로그인이 필요 없다.
---

# insane-review (gjc 포트)

**왜 존재하나:** 사용자가 구독 ChatGPT 웹의 Pro 리뷰를 요청하면 기존 전용 브라우저
세션을 재사용해 질문과 관련 코드를 보내고 응답을 회수한다. 특정 모델 버전을 고정하지
않으며 실제 UI에서 모델과 Pro 강도를 검증한다. 이 스킬은 API를 호출하지 않는다.

이 스킬은 [`fivetaku/insane-review`](https://github.com/fivetaku/insane-review) 0.5.3을
포크해 독자 하드닝한 것이다. 정확한 SHA, MIT 고지, 상류와의 차이는
검증한 suite root의 `skills/insane-review/references/upstream.md`와 `upstream-LICENSE`에 보존한다.

핵심 가치는 "통째 패킹"이 아니라 **"의도 파악 → 관련 타겟만 정밀 선별 → 그것만 패킹"** 이다. 이 선별을 gjc(너)가 수행하는 것이 이 도구의 차별점이다.

> **엔진은 hardened local engine이다.** 실제 패킹·CDP 구동·모델검증·턴판정·회수는 감사된 로컬 DOM·보안 패치를 포함한 `bin/pack_and_ask.py`(Playwright 기반)가 수행한다. 로직을 gjc의 `browser` 도구로 재구현하지 마라 — 이 엔진의 검증 경계를 유지한다.

## 엔진 경로 해석 (`$IR`) — 매 실행 전 1회
`${CLAUDE_PLUGIN_ROOT}` 같은 치환은 gjc 커맨드/스킬 본문에서 동작하지 않는다. 네이티브 설치가 scope마다 기록한 정확한 suite root binding(`root`, mode `0600`)만 사용한다. 새 프로젝트 binding(`$PWD/.gjc/runtimes/oh-my-gjc/root`)과 새 user binding(`$HOME/.gjc/agent/runtimes/oh-my-gjc/root`)을 순서대로 읽는다. 둘 다 없을 때만 **읽기 전용·기간 한정 compatibility fallback**인 기존 `oh-my-gajae-code` 프로젝트/user binding을 같은 순서로 읽고, 그마저 없을 때만 이 checkout의 정확한 `plugins/oh-my-gjc/` asset으로 fallback한다. 기존 binding이나 user state는 쓰거나 지우지 않는다:
```bash
IR="$(python3 - <<'PY'
from pathlib import Path
import os
import stat
import sys

asset = Path("bin/pack_and_ask.py")
bindings = [
    Path.cwd() / ".gjc/runtimes/oh-my-gjc/root",
    Path.home() / ".gjc/agent/runtimes/oh-my-gjc/root",
    Path.cwd() / ".gjc/runtimes/oh-my-gajae-code/root",
    Path.home() / ".gjc/agent/runtimes/oh-my-gajae-code/root",
]


def reject_links(path):
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError("symlinked path")


def resolve_asset(root, relative):
    reject_links(root)
    if not root.is_absolute() or str(root.resolve(strict=True)) != str(root):
        raise ValueError("non-canonical suite root")
    asset = root / relative
    reject_links(asset)
    if not asset.is_file():
        raise ValueError("missing suite asset")
    return asset


try:
    for binding in bindings:
        reject_links(binding)
        try:
            fd = os.open(binding, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        except FileNotFoundError:
            continue
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode)
                    or (hasattr(os, "getuid") and info.st_uid != os.getuid())
                    or (os.name != "nt" and stat.S_IMODE(info.st_mode) & 0o077)):
                raise ValueError("binding must be a private owned regular file")
            value = stream.read(4097).decode("utf-8")
        if (len(value.encode("utf-8")) > 4096 or not value.endswith("\n")
                or value.count("\n") != 1
                or any(ord(ch) < 32 or ord(ch) == 127 for ch in value[:-1])):
            raise ValueError("malformed suite binding")
        root = Path(value[:-1])
        if str(root) != value[:-1]:
            raise ValueError("non-canonical suite binding")
        print(resolve_asset(root, asset))
        raise SystemExit(0)
    print(resolve_asset(Path.cwd() / "plugins/oh-my-gjc", asset))
except (OSError, ValueError, UnicodeError) as error:
    print(f"Invalid OMG runtime binding: {error}; rerun the hardened installer", file=sys.stderr)
    raise SystemExit(1)
PY
)" || exit 1
echo "IR=$IR"
```
Malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing binding fails closed. Do not select a plugin cache; bootstrap, upgrade, or repair by rerunning the hardened root installer at `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`.

## 선행 조건 — 선택지 기반 온보딩 (사용자에게 CLI 타이핑 금지)

**커맨드 Step 0이 이걸 자동화한다.** gjc가 `--check-env`/`--ensure-env`를 직접 돌려 마지막 `STATUS node=… deps=… browser=… login=… saved_browser=…`을 파싱하고, 막힌 단계마다 gjc **`ask` 도구 선택지**로 물어본 뒤 gjc가 대신 실행한다(`--install`, 브라우저 실행, 재점검). 초보자는 클릭만으로 따라온다.

- **deps**(`playwright`·`pyperclip`): 없으면 "지금 자동 설치" 선택 → `--check-env --install`. (`npx`/repomix는 `npx -y`로 완전 자동.)
- **browser**: 크로미움 계열 브라우저가 디버그포트(9222)에 **전용 프로필**로 떠 있어야 함(주 브라우저와 격리; Chrome 136+는 전용 프로필 없으면 CDP가 안 열림). Linux에서 DISPLAY/WAYLAND_DISPLAY가 없고 사용자 소유 X11 소켓이 정확히 하나면 그 화면을 자동으로 사용한다. 여러 화면이나 다른 사용자 화면은 추측하지 않는다. 없으면 `--check-env`/`--list-browsers`의 `BROWSERS …` 목록으로 브라우저를 고르게 한 뒤 gjc가 `python3 "$IR" --launch-browser "<이름>"`(크로스플랫폼 mac/win/linux·전용 프로필·선택 자동 저장)을 실행. (쿠키는 전용 프로필에 보존 → 로그인 유지.)
- **login**: 로그인 프로브가 `login=no`면, "방금 연 브라우저에서 chatgpt.com 로그인" 후 "로그인 완료" 선택 → 재점검. **로그인은 자동 불가 → 반드시 사용자에게 요청**(에러로 끝내지 말 것).
- **로그인 상태 불명**: `login=unknown`은 로그아웃이 아니다. 로딩·접속·UI 상태를 진단하고 멈춘다. 반복 로그인, 프로필 삭제, 개인 브라우저 쿠키 복사는 하지 않는다.
- **현재 Pro 모델**: 모델을 지정하지 않은 요청은 `--model pro --require-model current`로 실제 선택 모델을 읽어 고정하고 Pro 강도를 검증한다. 사용자가 Astra 등 특정 모델을 지정하면 UI의 정확한 이름을 `--require-model "<모델명>"`에 전달한다. Sol이나 다른 패밀리로 대체하지 않는다. 모델명이 모호하거나 Pro 증거가 없으면 전송하지 않는다.
- **전송 없는 진단**: `python3 "$IR" --inspect-session`은 기존 전용 세션의 로그인·모델·추론 강도를 JSON으로 확인한다. 브라우저 기동·모델 선택·패킹·질문 전송은 하지 않는다. 특정 모델은 `--require-model "<정확한 모델명>"`으로 점검한다.

## 핵심 절차 (ChatGPT Pro 리뷰를 명시적으로 요청받았을 때)

### 1) 의도 파악
사용자가 GPT Pro에게 **무엇을** 묻고 싶은지 한 문장으로 정리한다. (버그 원인? 설계 리뷰? 리팩터 방향? 특정 함수 검증?)

### 2) 타겟 선별 — **완전한 관련 집합을 네가(gjc) 판단** (사용자가 누락을 잡아주는 구조면 안 된다)
"repomix로 무엇을 넣을지 = 무엇이 완전한 관련 집합인지"의 **판단은 네 책임**이다. 기본은 **"넓게, 빠짐없이"**:
- **단일 모듈/플러그인/기능 리뷰면 그 디렉토리를 통째로** 넣어라(`--target <dir>`, `--include` 생략 또는 광범위). 한 파일만 넣으면 실행지시서·설정·통합 맥락이 빠진다.
- 더 넓은 범위면 지목 파일에서 **import/require·호출자·피호출자(gjc `search`/`lsp references`/`lsp definition`)·테스트·타입·설정**까지 추적해 집합을 *닫는다*.
- **패킹 후 `📦 패킹 포함 N개 파일` 감사 목록이 네가 의도한 완전한 집합을 담았는지 직접 확인**한다(§3.5). 사용자가 지적하기 전에 네가 잡아라.
- 결과를 **글롭**(→ `--include "src/auth/**,*.test.ts"`)으로 좁힌다.
- **코드 리뷰/원인분석은 풀 코드로 보내라 — `--compress` 쓰지 마라.** 압축은 함수 본문(조건·early return·예외·루프 = 버그 판단 근거)을 제거해 리뷰 AI가 구현을 *상상*하게 만든다(본문 손실 → false-positive·fail-open). 
- 타겟이 너무 커서 컨텍스트를 넘기면 **압축하지 말고 `--include`로 관련 파일만 좁혀 풀로** 보낸다. `--compress`는 `--pack-only` 개요 산출물에만 쓴다. 전송할 리뷰는 소스와 패킹 본문을 대조할 수 있는 풀 코드가 필요하다.

### 3) 패킹 + 투입 + 회수 — 엔진 실행
```bash
python3 "$IR" \
  --target <repo_root> --include "<관련 파일 글롭>" \
  --model pro --require-model current \
  --prompt "<의도를 담은 정확한 질문 — '판정마다 파일/라인/코드조각을 인용하라'를 반드시 포함>"
```
**레포 없이 순수 질문(의견)만:** `--target` 생략 → 프롬프트만 전송.
```bash
python3 "$IR" --model pro --require-model current --force-answer-after 90 --prompt "<질문>"
```


### 2.5) lane 우선 경로 — sol-lane이 이 머신에 있을 때

[sol-lane](https://github.com/devswha/sol-lane)은 이 엔진을 감싼 파이프라인 하니스다. 같은
fail-closed 검증 위에 **회수 경로**(죽은 판의 답을 `harvest`로 무료 회수, `salvage`로 부분
회수, `followup`으로 재패킹 없이 후속 질문)와 브라우저 직렬화 락이 있다. 실행 전 확인:

```bash
lane_cmd() {
  if command -v lane >/dev/null 2>&1; then printf 'lane\n'; return 0; fi
  # 체크아웃 위치는 사람마다 다르다 — 명시 override를 먼저 존중한다.
  local root="${SOL_LANE_ROOT:-$HOME/workspace/sol-lane}"
  [ -x "$root/.venv/bin/lane" ] && printf '%s\n' "$root/.venv/bin/lane"
}
LANE="$(lane_cmd)"
```

`$LANE`가 있고 그 설치 버전이 요청한 모델을 선택·검증한다는 근거가 있을 때만 §3 대신 사용한다. 모델 호환성을 확인하지 못했거나 Astra/current 요청을 Sol로 고정한다면 §3의 번들 엔진을 사용한다:

```bash
"$LANE" review --root "$PWD" --include "<관련 파일 글롭, 쉼표 구분>" \
  --stream "<질문 — 판정마다 파일:라인·코드조각 인용 강제>"
```

- 패킹·모델 검증·회수는 lane이 한다 — `--compress` 금지와 누락 감사(§3.5)는 그대로 네 책임.
- 실패 안내의 `retry lane harvest <proj>` 줄을 사용자에게 그대로 보여줘라: 값 치른 메시지는
  회수로 되살린다.
- lane이 없으면 아래 §3의 `$IR` 직접 경로가 항상 유효하다(공개 배포 기본 경로).

### 3.2) 장기 실행 중계(기본 권장) — 백그라운드 + 로그 폴링
Pro 리뷰는 수 분 걸린다. 세션이 멈춘 것처럼 보이지 않게 **엔진을 백그라운드로 띄우고 로그를 폴링**해 Chrome에서 일어나는 일(패킹·모델 검증·생성 진행·실시간 응답)을 사용자에게 중계한다:
```bash
mkdir -p .insane-review && python3 -u "$IR" ...위 플래그... --stream \
  > .insane-review/live.log 2>&1 &
```
- bash 비동기(async) 실행 뒤 15~30초 간격으로 `read`로 `.insane-review/live.log`의 **증분**을 읽어: 진행 라인(`모델 검증 OK`, `30s | ⏳ 생성중`…)은 요약해 알리고, `── 실시간 응답(생성 중) ──` 뒤의 본문 조각은 그대로 보여준다.
- 로그에 `[완료]`가 나오면 프로세스 종료를 확인하고 §4로 간다(응답 파일 회수는 동일).
- 실패/재시도 로그도 그대로 중계한다 — 사용자가 기다리는 동안 상황을 알 권리가 있다.

### 3.5) 누락 검증 — **빠진 파일 없는지 감사**
패킹 직후 출력의 **`📦 패킹 포함 N개 파일: ...`** 목록이 **의도한 관련 파일을 전부 담았는지** 확인한다. 빠진 게 있으면 repomix가 떨어뜨린 것 — 원인별 대응:
- `🔒 secretlint: 의심 파일 N개 제외` → **시크릿 든 파일이 통째 빠짐**(숨은 누락). secretlint는 필수이며 우회하지 않는다. 그 파일이 필요하면 시크릿을 제거·가린 안전한 사본만 별도 대상으로 검토한다.
- 기본 ignore/`.gitignore`가 떨어뜨림 → `--no-default-patterns`/`--no-gitignore`.
- 서브모듈 파일이 빠짐(부모서 패킹) → 서브모듈 안에서 `--target`.
- `⚠️ pack이 큼(truncation)` 경고 → ChatGPT가 잘라먹을 수 있으니 `--include`로 더 좁히거나 여러 번 나눠 보낸다.
- **손실 플래그 금지**: `--compress`/`--remove-comments`/`--remove-empty-lines`는 내용을 누락시키니 리뷰엔 쓰지 않는다. 라인번호는 기본 ON(인용용).

### 4) 회수 & 반영
- 응답은 **현재 프로젝트의 `.insane-review/response_*.md`**에 저장되고, stdout 끝에 미리보기가 나온다. gjc `read` 도구로 전문을 읽어라.
- 그 의견을 읽고 **응답 파일에 기록된 실제 검증 모델의 의견임을 명시**하여 사용자에게 반영/요약한다. 동의/이견을 너의 판단과 함께 제시하라.

### 4.5) 타임아웃·연결 끊김 — 전송 없는 회수
번들 엔진이 전송을 **시도한 뒤**에는 성공 여부가 불명이어도 새 실행으로 재전송하지 않는다.
로그의 `Run journal:` 경로를 보존하고 같은 실행의 완료 응답만 회수한다:
```bash
python3 "$IR" --harvest-only .insane-review/runs/run_<tag>.json --max-wait 1200
```
`--resume`은 같은 회수 전용 별칭이다. 전송·재패킹·모델 재선택을 하지 않는다.
대화 URL, 정확한 요청 턴, 검증 모델 증거가 부족하면 추측하지 않고 중단한다.
코드/패킹본이 달라졌거나 턴이 모호해도 저장하지 않는다. 상세 조건은 검증한 suite root의
`skills/insane-review/references/recovery.md`를 읽는다(네이티브 스킬 옆으로 복사되지 않음).
lane 실행의 회수에는 lane이 출력한 `lane harvest` 안내를 그대로 사용한다.

### 5) 후속 질문 — 재패킹 없이 이어서 묻기
답을 읽고 더 물을 게 생기면 **처음부터 다시 하지 마라.** 응답 파일 헤더의
`- 대화: <url>`이 그 대화를 가리킨다. 그 파일(또는 URL)을 그대로 넘기면 코드 재전송
없이 같은 대화에 이어서 묻는다:
```bash
python3 "$IR" --followup .insane-review/response_<label>_<tag>.md \
  --prompt "<후속 질문 — 앞 답변을 가리켜도 된다>"
```
- Pro가 앞 대화를 그대로 기억하므로 "방금 2번 지적을 더 파봐" 같은 질문이 된다.
- 패킹·프로젝트 정리·모델 재선택을 모두 건너뛴다(그 대화는 이미 검증된 모델이다).
- 코드가 **바뀌었으면** 후속이 아니라 새 실행이다 — 그 대화의 첨부는 옛 코드다. 새 형식의 응답 파일은 journal의 원본 코드·패킹 해시를 검증한 뒤 후속 질문에 상속한다. URL만 넘긴 후속이나 구형 응답에는 그 증거가 없어 회수 전용 재개를 보장하지 않는다.
- 대상 대화에 진입하지 못하면 중단한다(엉뚱한 대화로 질문이 새지 않게).

## 주의/가드 (실측 기반)

- **git submodule**: 부모 레포 루트에서 서브모듈 파일은 repomix가 제외한다. 서브모듈 안에서 실행하거나 `--target <submodule>` 또는 `--no-gitignore --no-default-patterns`.
- **압축은 코드 파일만** 줄인다(마크다운/문서 위주 폴더엔 무효).
- **정밀 리뷰엔 `--force-answer-after`를 쓰지 마라** — Pro 추론을 중간에 끊어 "다 생각 안 한 채" 답하게 만든다(fail-open과 곱해져 미완성 답을 정답 저장). 완전 추론이 더 정확. 안전장치는 `--max-wait`(기본 20분, env/`--max-wait`로 조절)만. force-answer는 빠른 의견·짧은 질문·council에만.
- **fail-closed**: 첨부 미확인 / 모델 미검증(`--require-model`) / timeout·빈 응답 / 거부 페이지 / 긴 프롬프트 echo는 **성공 저장·출력 없이 중단**한다(잘못된 컨텍스트나 답변 아닌 페이지를 리뷰로 저장하지 않음).
- 큰 콘텐츠는 **파일 첨부**로 들어간다(붙여넣기 X). 스크립트가 자동 처리.
- `--retries N`은 **전송 시도 전** 실패만 재시도한다(기본 1 = 준비 최대 2회). 클릭 오류·요청 턴 미관찰·timeout 이후 자동 재전송은 없다. `--followup`은 새 질문을 실제 전송하므로 회수 대신 쓰지 않는다.
- 동시에 두 개의 insane-review 잡이 **같은 브라우저**를 몰면 안 된다.
- 전용 프로필 CDP 브라우저는 CLI 종료 뒤에도 실행 상태를 유지한다. 다음 실행에서 인증 프로필과 쿠키를 재사용하며, 스크립트는 외부 브라우저를 종료하지 않는다.

## 채팅 정리 — 폴더명 ChatGPT 프로젝트 (기본 on)
매 실행이 일반 채팅 목록에 쌓이지 않도록, **현재 폴더명(+경로해시)과 같은 이름의 ChatGPT 프로젝트** 안에 채팅을 정리한다. 폴더당 프로젝트 1개로 묶여 일반 목록이 깨끗하게 유지된다.
- 폴더명→프로젝트URL은 per-repo 캐시(`.insane-review/projects.json`)에 저장 → 다음 실행부턴 사이드바를 안 건드리고 바로 그 프로젝트로 들어간다.
- 프로젝트가 없으면 자동 생성, 있으면 재사용. **프로젝트 미지원 플랜이거나 UI가 바뀌어 실패해도 하드중단 없이 일반 채팅으로 폴백.**
- 이름 바꾸려면 `--project "<이름>"`, 끄려면 `--no-project`.

## 주요 플래그
`--target`(생략=프롬프트only) · `--include`(정밀 글롭) · `--ignore` · `--compress` · `--model pro` · `--require-model current`(또는 정확한 모델명) · `--inspect-session` · `--harvest-only <run.json>`(`--resume` 동일) · `--followup <response.md|URL>` · `--force-answer-after N` · `--max-wait N` · `--retries N` · `--stream`(생성 중 응답 실시간 증분 출력) · `--style xml|markdown|plain` · `--browser <이름|경로>` · `--launch-browser <이름>` · `--list-browsers` · `--project "<이름>"` · `--no-project` · `--pack-only` · `--delete-pack` · `--council`

## agent-council 멤버로 쓰기
검증한 `$IR`의 suite root 아래 `references/council-setup.md` 참고. 네이티브 스킬 옆에는 참고 문서를 복사하지 않으므로 `${IR%/bin/pack_and_ask.py}/references/council-setup.md`를 읽는다. `--council` 모드는 프롬프트를 위치인자로 받고 **응답만 stdout**으로 내보내(진행로그는 stderr) council worker가 그대로 캡처한다. Pro를 웹 전용 council 멤버로 등록하면 다른 모델들과 토론에 참여시킬 수 있다.

## 범위
**한다:** gjc가 관련 코드를 완전하게 선별 → repomix 풀코드 패킹(라인번호·secretlint·감사) → 로그인된 ChatGPT 웹을 CDP로 구동 → 요청한 모델과 Pro 강도 검증(fail-closed) → 응답 회수·저장·반영. agent-council 웹 전용 멤버.
**안 한다:** API 호출, 자동 로그인(사용자 1회 수동), gjc `browser` 도구로 엔진 재구현, OpenAI 계정 자동 생성.
