---
name: insane-review
description: GPT-5.6 Sol Pro(웹 전용·API 없음)를 gjc(Gajae Code) 안에서 활용한다. 사용자가 검토/수정/문제/리뷰/의견을 요청하면, 의도를 파악해 repomix로 관련 코드만 정밀 패킹한 뒤 구독 ChatGPT Pro에 투입하고 분석을 회수해 반영한다. 트리거 — "GPT한테 물어봐", "Pro 모델 의견", "다른 모델로 검토해줘", "GPT Pro로 리뷰", "repomix로 묶어서 GPT에 넣어줘", "GPT는 어떻게 생각해", "ask gpt pro", "second opinion", "have Pro review this". agent-council의 웹 전용 멤버로도 동작.
---

# insane-review (gjc 포트)

**왜 존재하나:** GPT-5.6 Sol Pro는 **웹(구독)에서만** 쓸 수 있고 **API가 없다.** 그래서 Codex CLI·API provider·agent-council의 기존 API 멤버로는 못 부른다. 이 스킬은 **구독 ChatGPT 웹을 CDP로 자동화해 Pro를 gjc 안으로 끌어오는 유일한 경로**다. API 비용 0, 사용자의 요금제로 동작.

이 스킬은 [`fivetaku/insane-review`](https://github.com/fivetaku/insane-review) 0.5.3을
포크해 독자 하드닝한 것이다. 정확한 SHA, MIT 고지, 상류와의 차이는
`references/upstream.md`와 `references/upstream-LICENSE`에 보존한다.

핵심 가치는 "통째 패킹"이 아니라 **"의도 파악 → 관련 타겟만 정밀 선별 → 그것만 패킹"** 이다. 이 선별을 gjc(너)가 수행하는 것이 이 도구의 차별점이다.

> **엔진은 hardened local engine이다.** 실제 패킹·CDP 구동·모델검증·턴판정·회수는 감사된 로컬 DOM·보안 패치를 포함한 `bin/pack_and_ask.py`(Playwright 기반)가 수행한다. 로직을 gjc의 `browser` 도구로 재구현하지 마라 — 이 엔진의 검증 경계를 유지한다.

## 엔진 경로 해석 (`$IR`) — 매 실행 전 1회
`${CLAUDE_PLUGIN_ROOT}` 같은 치환은 gjc 커맨드/스킬 본문에서 동작하지 않는다. 네이티브 설치가 scope마다 기록한 정확한 suite root binding(`root`, mode `0600`)만 사용한다. 새 프로젝트 binding(`$PWD/.gjc/runtimes/oh-my-gjc/root`)과 새 user binding(`$HOME/.gjc/agent/runtimes/oh-my-gjc/root`)을 순서대로 읽는다. 둘 다 없을 때만 **읽기 전용·기간 한정 compatibility fallback**인 기존 `oh-my-gjc` 프로젝트/user binding을 같은 순서로 읽고, 그마저 없을 때만 이 checkout의 정확한 `plugins/oh-my-gjc/` asset으로 fallback한다. 기존 binding이나 user state는 쓰거나 지우지 않는다:
```bash
resolve_omg_asset() (
  fail() { echo "oh-my-gjc runtime binding is missing or invalid; rerun https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh." >&2; exit 1; }
  reject_symlinked_components() {
    local path="$1" current="/" component
    local -a components
    case "$path" in /*) ;; *) fail ;; esac
    IFS=/ read -r -a components <<<"${path#/}"
    for component in "${components[@]}"; do
      [ -n "$component" ] || continue
      current="${current%/}/$component"
      [ ! -L "$current" ] || fail
    done
  }
  local expected_asset="$1" binding root bytes byte asset asset_dir canonical_root canonical_asset_dir checkout
  local -a bindings=(
    "$PWD/.gjc/runtimes/oh-my-gjc/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
  )
  # Bounded read-only compatibility fallback; never mutate legacy paths.
  local -a legacy_compatibility_bindings=(
    "$PWD/.gjc/runtimes/oh-my-gajae-code/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gajae-code/root"
  )
  bindings+=("${legacy_compatibility_bindings[@]}")
  for binding in "${bindings[@]}"; do
    if [ -e "$binding" ] || [ -L "$binding" ]; then
      reject_symlinked_components "$binding"
      [ -f "$binding" ] && [ ! -L "$binding" ] || fail
      bytes="$(LC_ALL=C od -An -v -tu1 "$binding")" || fail
      for byte in $bytes; do
        case "$byte" in 0|[1-9]|1[1-9]|2[0-9]|3[01]|127) fail ;; esac
      done
      exec 3< "$binding" || fail
      IFS= read -r root <&3 || { exec 3<&-; fail; }
      if IFS= read -r -n 1 _ <&3; then exec 3<&-; fail; fi
      exec 3<&-
      case "$root" in ""|*[[:cntrl:]]*) fail ;; /*) ;; *) fail ;; esac
      canonical_root="$(cd -P -- "$root" 2>/dev/null && pwd -P)" || fail
      [ "$root" = "$canonical_root" ] || fail
      asset="$canonical_root/$expected_asset"
      asset_dir="${asset%/*}"
      canonical_asset_dir="$(cd -P -- "$asset_dir" 2>/dev/null && pwd -P)" || fail
      [ "$asset_dir" = "$canonical_asset_dir" ] && [ -f "$asset" ] && [ ! -L "$asset" ] || fail
      printf '%s\n' "$asset"
      exit 0
    fi
  done
  checkout="$PWD/plugins/oh-my-gjc"
  reject_symlinked_components "$checkout"
  [ -d "$checkout" ] && [ ! -L "$checkout" ] || fail
  canonical_root="$(cd -P -- "$checkout" 2>/dev/null && pwd -P)" || fail
  asset="$canonical_root/$expected_asset"
  asset_dir="${asset%/*}"
  canonical_asset_dir="$(cd -P -- "$asset_dir" 2>/dev/null && pwd -P)" || fail
  [ "$asset_dir" = "$canonical_asset_dir" ] && [ -f "$asset" ] && [ ! -L "$asset" ] || fail
  printf '%s\n' "$asset"
)
IR="$(resolve_omg_asset "bin/pack_and_ask.py")" || exit 1
echo "IR=$IR"
```
Malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing binding fails closed. Do not select a plugin cache; bootstrap, upgrade, or repair by rerunning the hardened root installer at `https://raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`.

## 선행 조건 — 선택지 기반 온보딩 (사용자에게 CLI 타이핑 금지)

**커맨드 Step 0이 이걸 자동화한다.** gjc가 `--check-env`/`--ensure-env`를 직접 돌려 마지막 `STATUS node=… deps=… browser=… login=… saved_browser=…`을 파싱하고, 막힌 단계마다 gjc **`ask` 도구 선택지**로 물어본 뒤 gjc가 대신 실행한다(`--install`, 브라우저 실행, 재점검). 초보자는 클릭만으로 따라온다.

- **deps**(`playwright`·`pyperclip`): 없으면 "지금 자동 설치" 선택 → `--check-env --install`. (`npx`/repomix는 `npx -y`로 완전 자동.)
- **browser**: 크로미움 계열 브라우저가 디버그포트(9222)에 **전용 프로필**로 떠 있어야 함(주 브라우저와 격리; Chrome 136+는 전용 프로필 없으면 CDP가 안 열림). 없으면 `--check-env`/`--list-browsers`의 `BROWSERS …` 목록으로 브라우저를 고르게 한 뒤 gjc가 `python3 "$IR" --launch-browser "<이름>"`(크로스플랫폼 mac/win/linux·전용 프로필·선택 자동 저장)을 실행. (쿠키는 전용 프로필에 보존 → 로그인 유지.)
- **login**: 로그인 프로브가 `login=no`면, "방금 연 브라우저에서 chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택" 후 "로그인 완료" 선택 → 재점검. **로그인은 자동 불가 → 반드시 사용자에게 요청**(에러로 끝내지 말 것).
- **모델 5.6 Sol Pro**: 스크립트가 고급 메뉴에서 `모델: GPT-5.6 Sol`과 `추론 강도: Pro`를 선택·검증한다. 기존 radio/list와 2026-08 effort slider를 모두 지원하며, UI가 바뀌어 선택 또는 검증에 실패하면 전송하지 않고 fail-closed로 중단한다.

## 핵심 절차 (검토/수정/리뷰 요청을 받았을 때)

### 1) 의도 파악
사용자가 GPT Pro에게 **무엇을** 묻고 싶은지 한 문장으로 정리한다. (버그 원인? 설계 리뷰? 리팩터 방향? 특정 함수 검증?)

### 2) 타겟 선별 — **완전한 관련 집합을 네가(gjc) 판단** (사용자가 누락을 잡아주는 구조면 안 된다)
"repomix로 무엇을 넣을지 = 무엇이 완전한 관련 집합인지"의 **판단은 네 책임**이다. 기본은 **"넓게, 빠짐없이"**:
- **단일 모듈/플러그인/기능 리뷰면 그 디렉토리를 통째로** 넣어라(`--target <dir>`, `--include` 생략 또는 광범위). 한 파일만 넣으면 실행지시서·설정·통합 맥락이 빠진다.
- 더 넓은 범위면 지목 파일에서 **import/require·호출자·피호출자(gjc `search`/`lsp references`/`lsp definition`)·테스트·타입·설정**까지 추적해 집합을 *닫는다*.
- **패킹 후 `📦 패킹 포함 N개 파일` 감사 목록이 네가 의도한 완전한 집합을 담았는지 직접 확인**한다(§3.5). 사용자가 지적하기 전에 네가 잡아라.
- 결과를 **글롭**(→ `--include "src/auth/**,*.test.ts"`)으로 좁힌다.
- **코드 리뷰/원인분석은 풀 코드로 보내라 — `--compress` 쓰지 마라.** 압축은 함수 본문(조건·early return·예외·루프 = 버그 판단 근거)을 제거해 리뷰 AI가 구현을 *상상*하게 만든다(본문 손실 → false-positive·fail-open). 
- 타겟이 너무 커서 컨텍스트를 넘기면 **압축하지 말고 `--include`로 관련 파일만 좁혀 풀로** 보낸다. `--compress`는 오직 "큰 레포 *개요*"(정확성 리뷰 아님)용.

### 3) 패킹 + 투입 + 회수 — 엔진 실행
```bash
python3 "$IR" \
  --target <repo_root> --include "<관련 파일 글롭>" \
  --model pro --require-model "GPT-5.6 Sol" \
  --prompt "<의도를 담은 정확한 질문 — '판정마다 파일/라인/코드조각을 인용하라'를 반드시 포함>"
```
**레포 없이 순수 질문(의견)만:** `--target` 생략 → 프롬프트만 전송.
```bash
python3 "$IR" --model pro --force-answer-after 90 --prompt "<질문>"
```


### 2.5) lane 우선 경로 — sol-lane이 이 머신에 있을 때

[sol-lane](https://github.com/devswha/sol-lane)은 이 엔진을 감싼 파이프라인 하니스다. 같은
fail-closed 검증 위에 **회수 경로**(죽은 판의 답을 `harvest`로 무료 회수, `salvage`로 부분
회수, `followup`으로 재패킹 없이 후속 질문)와 브라우저 직렬화 락이 있다. 실행 전 확인:

```bash
command -v lane >/dev/null 2>&1 || test -x ~/workspace/sol-lane/.venv/bin/lane
```

있으면 §3의 엔진 직접 실행 대신:

```bash
uv run --project ~/workspace/sol-lane lane review \
  --root "$PWD" --include "<관련 파일 글롭, 쉼표 구분>" \
  --stream "<질문 — 판정마다 파일:라인·코드조각 인용 강제>"
```

- 패킹·모델 검증·회수는 lane이 한다 — `--compress` 금지와 누락 감사(§3.5)는 그대로 네 책임.
- 실패 안내의 `retry lane harvest <proj>` 줄을 사용자에게 그대로 보여줘라: 값 치른 메시지는
  회수로 되살린다.
- lane이 없으면 아래 §3의 `$IR` 직접 경로가 항상 유효하다(공개 배포 기본 경로).

### 3.2) 장기 실행 중계(기본 권장) — 백그라운드 + 로그 폴링
Sol Pro 리뷰는 수 분 걸린다. 세션이 멈춘 것처럼 보이지 않게 **엔진을 백그라운드로 띄우고 로그를 폴링**해 Chrome에서 일어나는 일(패킹·모델 검증·생성 진행·실시간 응답)을 사용자에게 중계한다:
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
- 그 의견을 읽고 **GPT-5.6 Sol Pro의 의견임을 명시**하여 사용자에게 반영/요약한다. 동의/이견을 너의 판단과 함께 제시하라.

## 주의/가드 (실측 기반)

- **git submodule**: 부모 레포 루트에서 서브모듈 파일은 repomix가 제외한다. 서브모듈 안에서 실행하거나 `--target <submodule>` 또는 `--no-gitignore --no-default-patterns`.
- **압축은 코드 파일만** 줄인다(마크다운/문서 위주 폴더엔 무효).
- **정밀 리뷰엔 `--force-answer-after`를 쓰지 마라** — Pro 추론을 중간에 끊어 "다 생각 안 한 채" 답하게 만든다(fail-open과 곱해져 미완성 답을 정답 저장). 완전 추론이 더 정확. 안전장치는 `--max-wait`(기본 20분, env/`--max-wait`로 조절)만. force-answer는 빠른 의견·짧은 질문·council에만.
- **fail-closed**: 첨부 미확인 / 모델 미검증(`--require-model`) / timeout·빈 응답 / 거부 페이지 / 긴 프롬프트 echo는 **성공 저장·출력 없이 중단**한다(잘못된 컨텍스트나 답변 아닌 페이지를 리뷰로 저장하지 않음).
- 큰 콘텐츠는 **파일 첨부**로 들어간다(붙여넣기 X). 스크립트가 자동 처리.
- 실패 시 `--retries N`으로 전송/회수를 재시도.
- 동시에 두 개의 insane-review 잡이 **같은 브라우저**를 몰면 안 된다.
- 전용 프로필 CDP 브라우저는 CLI 종료 뒤에도 실행 상태를 유지한다. 다음 실행에서 인증 프로필과 쿠키를 재사용하며, 스크립트는 외부 브라우저를 종료하지 않는다.

## 채팅 정리 — 폴더명 ChatGPT 프로젝트 (기본 on)
매 실행이 일반 채팅 목록에 쌓이지 않도록, **현재 폴더명(+경로해시)과 같은 이름의 ChatGPT 프로젝트** 안에 채팅을 정리한다. 폴더당 프로젝트 1개로 묶여 일반 목록이 깨끗하게 유지된다.
- 폴더명→프로젝트URL은 per-repo 캐시(`.insane-review/projects.json`)에 저장 → 다음 실행부턴 사이드바를 안 건드리고 바로 그 프로젝트로 들어간다.
- 프로젝트가 없으면 자동 생성, 있으면 재사용. **프로젝트 미지원 플랜이거나 UI가 바뀌어 실패해도 하드중단 없이 일반 채팅으로 폴백.**
- 이름 바꾸려면 `--project "<이름>"`, 끄려면 `--no-project`.

## 주요 플래그
`--target`(생략=프롬프트only) · `--include`(정밀 글롭) · `--ignore` · `--compress` · `--model pro` · `--require-model "GPT-5.6 Sol"` · `--force-answer-after N` · `--max-wait N` · `--retries N` · `--stream`(생성 중 응답 실시간 증분 출력) · `--style xml|markdown|plain` · `--browser <이름|경로>` · `--launch-browser <이름>` · `--list-browsers` · `--project "<이름>"` · `--no-project` · `--pack-only` · `--delete-pack` · `--council`

## agent-council 멤버로 쓰기
`references/council-setup.md` 참고. `--council` 모드는 프롬프트를 위치인자로 받고 **응답만 stdout**으로 내보내(진행로그는 stderr) council worker가 그대로 캡처한다. Pro를 웹 전용 council 멤버로 등록하면 다른 모델들과 토론에 참여시킬 수 있다.

## 범위
**한다:** gjc가 관련 코드를 완전하게 선별 → repomix 풀코드 패킹(라인번호·secretlint·감사) → 로그인된 ChatGPT 웹을 CDP로 구동 → GPT-5.6 Sol Pro 모델 검증(fail-closed) → 응답 회수·저장·반영. agent-council 웹 전용 멤버.
**안 한다:** GPT-5.6 Sol Pro API 호출(존재하지 않음), 자동 로그인(사용자 1회 수동), gjc `browser` 도구로 엔진 재구현, OpenAI 계정 자동 생성.
