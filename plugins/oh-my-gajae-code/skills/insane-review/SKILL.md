---
name: insane-review
description: GPT-5.6 Sol Pro(웹 전용·API 없음)를 gjc(Gajae Code) 안에서 활용한다. 사용자가 검토/수정/문제/리뷰/의견을 요청하면, 의도를 파악해 repomix로 관련 코드만 정밀 패킹한 뒤 구독 ChatGPT Pro에 투입하고 분석을 회수해 반영한다. 트리거 — "GPT한테 물어봐", "Pro 모델 의견", "다른 모델로 검토해줘", "GPT Pro로 리뷰", "repomix로 묶어서 GPT에 넣어줘", "GPT는 어떻게 생각해", "ask gpt pro", "second opinion", "have Pro review this". agent-council의 웹 전용 멤버로도 동작.
---

# insane-review (gjc 포트)

**왜 존재하나:** GPT-5.6 Sol Pro는 **웹(구독)에서만** 쓸 수 있고 **API가 없다.** 그래서 Codex CLI·API provider·agent-council의 기존 API 멤버로는 못 부른다. 이 스킬은 **구독 ChatGPT 웹을 CDP로 자동화해 Pro를 gjc 안으로 끌어오는 유일한 경로**다. API 비용 0, 사용자의 요금제로 동작.

핵심 가치는 "통째 패킹"이 아니라 **"의도 파악 → 관련 타겟만 정밀 선별 → 그것만 패킹"** 이다. 이 선별을 gjc(너)가 수행하는 것이 이 도구의 차별점이다.

> **엔진은 원본 그대로.** 실제 패킹·CDP 구동·모델검증·턴판정·회수는 번들된 `bin/pack_and_ask.py`(원본 insane-review 엔진, Playwright 기반)가 수행한다. 성능·fail-closed 보장을 유지하기 위해 로직을 재구현하지 않고 이 검증된 엔진을 그대로 호출한다. gjc의 `browser` 도구로 이 흐름을 흉내내지 마라 — 엔진이 더 견고하다.

## 엔진 경로 해석 (`$IR`) — 매 실행 전 1회
`${CLAUDE_PLUGIN_ROOT}` 같은 치환은 gjc 커맨드/스킬 본문에서 동작하지 않는다. 네이티브 설치가 scope마다 기록한 정확한 suite root binding(`root`, mode `0600`)만 사용한다. 새 프로젝트 binding(`$PWD/.gjc/runtimes/oh-my-gajae-code/root`)과 새 user binding(`$HOME/.gjc/agent/runtimes/oh-my-gajae-code/root`)을 순서대로 읽는다. 둘 다 없을 때만 **읽기 전용·기간 한정 compatibility fallback**인 기존 `oh-my-gjc` 프로젝트/user binding을 같은 순서로 읽고, 그마저 없을 때만 이 checkout의 정확한 `plugins/oh-my-gajae-code/` asset으로 fallback한다. 기존 binding이나 user state는 쓰거나 지우지 않는다:
```bash
resolve_omg_asset() (
  fail() { echo "oh-my-gajae-code runtime binding is missing or invalid; rerun https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh." >&2; exit 1; }
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
    "$PWD/.gjc/runtimes/oh-my-gajae-code/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gajae-code/root"
  )
  # Bounded read-only compatibility fallback; never mutate legacy paths.
  local -a legacy_compatibility_bindings=(
    "$PWD/.gjc/runtimes/oh-my-gjc/root"
    "$HOME/.gjc/agent/runtimes/oh-my-gjc/root"
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
  checkout="$PWD/plugins/oh-my-gajae-code"
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
Malformed, symlinked, non-canonical, multiline, control-character-containing, or asset-missing binding fails closed. Do not select a plugin cache; bootstrap, upgrade, or repair by rerunning the hardened root installer at `https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh`.

## 선행 조건 — 선택지 기반 온보딩 (사용자에게 CLI 타이핑 금지)

**커맨드 Step 0이 이걸 자동화한다.** gjc가 `--check-env`/`--ensure-env`를 직접 돌려 마지막 `STATUS node=… deps=… browser=… login=… saved_browser=…`을 파싱하고, 막힌 단계마다 gjc **`ask` 도구 선택지**로 물어본 뒤 gjc가 대신 실행한다(`--install`, 브라우저 실행, 재점검). 초보자는 클릭만으로 따라온다.

- **deps**(`playwright`·`pyperclip`): 없으면 "지금 자동 설치" 선택 → `--check-env --install`. (`npx`/repomix는 `npx -y`로 완전 자동.)
- **browser**: 크로미움 계열 브라우저가 디버그포트(9222)에 **전용 프로필**로 떠 있어야 함(주 브라우저와 격리; Chrome 136+는 전용 프로필 없으면 CDP가 안 열림). 없으면 `--check-env`/`--list-browsers`의 `BROWSERS …` 목록으로 브라우저를 고르게 한 뒤 gjc가 `python3 "$IR" --launch-browser "<이름>"`(크로스플랫폼 mac/win/linux·전용 프로필·선택 자동 저장)을 실행. (쿠키는 전용 프로필에 보존 → 로그인 유지.)
- **login**: 로그인 프로브가 `login=no`면, "방금 연 브라우저에서 chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택" 후 "로그인 완료" 선택 → 재점검. **로그인은 자동 불가 → 반드시 사용자에게 요청**(에러로 끝내지 말 것).
- **모델 5.6 Sol Pro**: 스크립트 `--model pro`가 자동선택·검증(`--require-model "GPT-5.6"`). 안 되면 사용자가 1회 수동 설정하면 새 채팅이 상속.

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
  --model pro --require-model "GPT-5.6" \
  --prompt "<의도를 담은 정확한 질문 — '판정마다 파일/라인/코드조각을 인용하라'를 반드시 포함>"
```
**레포 없이 순수 질문(의견)만:** `--target` 생략 → 프롬프트만 전송.
```bash
python3 "$IR" --model pro --force-answer-after 90 --prompt "<질문>"
```

### 3.5) 누락 검증 — **빠진 파일 없는지 감사**
패킹 직후 출력의 **`📦 패킹 포함 N개 파일: ...`** 목록이 **의도한 관련 파일을 전부 담았는지** 확인한다. 빠진 게 있으면 repomix가 떨어뜨린 것 — 원인별 대응:
- `🔒 secretlint: 의심 파일 N개 제외` → **시크릿 든 파일이 통째 빠짐**(숨은 누락). 그 파일이 리뷰 대상이면 시크릿을 가린 사본을 넣거나 `--no-security-check`(외부 유출 주의).
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
- **fail-closed**: 첨부 미확인 / 모델 미검증(`--require-model`) / timeout·빈 응답은 **성공 저장 안 하고 중단·재시도**한다(잘못된 컨텍스트나 미완성 답을 리뷰로 저장하지 않음).
- 큰 콘텐츠는 **파일 첨부**로 들어간다(붙여넣기 X). 스크립트가 자동 처리.
- 실패 시 `--retries N`으로 전송/회수를 재시도.
- 동시에 두 개의 insane-review 잡이 **같은 브라우저**를 몰면 안 된다.

## 채팅 정리 — 폴더명 ChatGPT 프로젝트 (기본 on)
매 실행이 일반 채팅 목록에 쌓이지 않도록, **현재 폴더명(+경로해시)과 같은 이름의 ChatGPT 프로젝트** 안에 채팅을 정리한다. 폴더당 프로젝트 1개로 묶여 일반 목록이 깨끗하게 유지된다.
- 폴더명→프로젝트URL은 per-repo 캐시(`.insane-review/projects.json`)에 저장 → 다음 실행부턴 사이드바를 안 건드리고 바로 그 프로젝트로 들어간다.
- 프로젝트가 없으면 자동 생성, 있으면 재사용. **프로젝트 미지원 플랜이거나 UI가 바뀌어 실패해도 하드중단 없이 일반 채팅으로 폴백.**
- 이름 바꾸려면 `--project "<이름>"`, 끄려면 `--no-project`.

## 주요 플래그
`--target`(생략=프롬프트only) · `--include`(정밀 글롭) · `--ignore` · `--compress` · `--model pro` · `--require-model "GPT-5.6"` · `--force-answer-after N` · `--max-wait N` · `--retries N` · `--style xml|markdown|plain` · `--browser <이름|경로>` · `--launch-browser <이름>` · `--list-browsers` · `--project "<이름>"` · `--no-project` · `--pack-only` · `--delete-pack` · `--council`

## agent-council 멤버로 쓰기
`references/council-setup.md` 참고. `--council` 모드는 프롬프트를 위치인자로 받고 **응답만 stdout**으로 내보내(진행로그는 stderr) council worker가 그대로 캡처한다. Pro를 웹 전용 council 멤버로 등록하면 다른 모델들과 토론에 참여시킬 수 있다.

## 범위
**한다:** gjc가 관련 코드를 완전하게 선별 → repomix 풀코드 패킹(라인번호·secretlint·감사) → 로그인된 ChatGPT 웹을 CDP로 구동 → GPT-5.6 Sol Pro 모델 검증(fail-closed) → 응답 회수·저장·반영. agent-council 웹 전용 멤버.
**안 한다:** GPT-5.6 Sol Pro API 호출(존재하지 않음), 자동 로그인(사용자 1회 수동), gjc `browser` 도구로 엔진 재구현, OpenAI 계정 자동 생성.
