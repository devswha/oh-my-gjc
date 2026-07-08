---
description: gjc를 쓰며 놓친 gjc 자체 버그를 배치 스캔해 upstream 이슈/PR "초안"을 모은다. 로그(+선택 세션)에서 후보 추출→트리아지→gajae-code clone에서 재현→.gjc/bugwatch/drafts/에 초안 저장. 초안만, 자동 PR 없음.
argument-hint: "[--include-sessions] [--days N]  (예: --days 3)"
---

# /gjc-bugwatch:scan

gjc 세션들이 디스크에 남긴 흔적을 **배치로 훑어** gjc 자체 버그 후보를 뽑고,
진짜인 것만 **이슈/PR 초안으로 모아둔다**. **초안만 만든다 — `gh` 등으로 자동 생성/푸시 금지.**

입력 인자: `$ARGUMENTS` (그대로 collector에 전달; `--include-sessions`, `--days N` 등).

## Step 0 — collector 경로 해석 (`$BW`)

`${CLAUDE_PLUGIN_ROOT}`는 gjc 커맨드 본문에서 치환되지 않으므로 실제 경로를 잡는다:
```bash
BW="$(ls -d ~/.gjc/plugins/cache/plugins/oh-my-gjc___gjc-bugwatch___*/bin/collect.ts 2>/dev/null | sort -V | tail -1)"
[ -z "$BW" ] && BW="$(ls -d ./.gjc/plugins/cache/plugins/oh-my-gjc___gjc-bugwatch___*/bin/collect.ts 2>/dev/null | sort -V | tail -1)"
[ -z "$BW" ] && [ -f plugins/gjc-bugwatch/bin/collect.ts ] && BW="plugins/gjc-bugwatch/bin/collect.ts"
echo "BW=$BW"
```
`$BW`가 비면 gjc-bugwatch 설치 여부를 안내하고 멈춘다.

## Step 1 — 후보 수집 (배치 스캐너)

```bash
bun run "$BW" $ARGUMENTS --json > /tmp/gjc-bugwatch-candidates.json
```
- 기본은 **로그만**(`~/.gjc/logs`) 스캔 = 고정밀. 세션까지 보려면 사용자가 `--include-sessions`를 준다(노이즈 많음, 현재 세션은 자동 제외).
- collector가 이미 노이즈 필터(환경/자격증명)·중복제거·레닥션(이메일/UUID/토큰)을 수행한다.
- `read`로 `/tmp/gjc-bugwatch-candidates.json`을 읽어 `severity` 높은 순으로 트리아지한다.

## Step 2 — 트리아지 (각 후보를 gjc가 판정)

각 후보에 대해 판정한다:
- **gjc 버그인가?** `category: "gjc-internal"`(스택이 `/$bunfs/root/gjc-*` 등)·명백한 크래시/예외 → 유력. 환경/사용자 실수(파일 없음, 자격증명 만료)로 보이면 **dismiss**.
- **재현 경로가 그려지나?** message/stack/extraKeys로 트리거 조건을 추정한다.
- 이미 `.gjc/bugwatch/drafts/`에 같은 `fingerprint`로 초안이 있으면 **건너뛴다**(중복 방지).
- 후보가 **`resolved: true`**(collector가 `.gjc/bugwatch/resolved.jsonl`과 대조해 `✅resolved`로 태깅)면 **이미 upstream에서 고쳐진 것** → **스킵**(초안·PR 금지). collector 리포트에서 이런 후보는 맨 아래로 가라앉는다. 아예 빼려면 `--hide-resolved`.

## Step 3 — upstream 중복·해결 확인 + 소스 근거 (self-awareness)

**먼저 upstream 트래커에서 중복/기존-수정을 확인한다** — 중복 PR 방지의 핵심이다. 로컬 fingerprint dedup은 *내* 초안 재생성만 막지, **남이 이미 올린 이슈/PR**은 못 막는다. `gh` 있으면 read-only 검색, 없으면 `web_search`(github.com/Yeachan-Heo/gajae-code/issues?q=…):
```bash
gh search issues --repo Yeachan-Heo/gajae-code --state all --limit 10 "<메시지 핵심 키워드>"
gh search prs    --repo Yeachan-Heo/gajae-code --state all --limit 10 "<메시지 핵심 키워드>"
```
- 매칭되는 **열린 이슈/PR**이 있으면 → 이미 추적 중 → **초안 스킵**(중복). 필요하면 draft에 기존 ref만 메모.
- 매칭되는 **머지된 PR / fixed-closed 이슈**가 있으면 → 이미 해결 → **초안 대신 resolved.jsonl 등재**(Step 4).

그다음 **소스는 반드시 `dev` 기준으로** 확인한다 — fix는 `dev`에 먼저 머지되고 나중에 `main`으로 간다. 기본(main) 클론만 보면 dev에 이미 고쳐진 버그를 놓쳐 죽은 버그를 다시 드래프트한다:
```bash
D="$(ls -d /tmp/gajae-code* 2>/dev/null | head -1)"
if [ -z "$D" ]; then
  git clone --depth 1 -b dev https://github.com/Yeachan-Heo/gajae-code /tmp/gajae-code-bugwatch && D=/tmp/gajae-code-bugwatch
else
  git -C "$D" fetch --depth 1 origin dev && git -C "$D" checkout -q -B dev origin/dev
fi
echo "verifying against dev @ $(git -C "$D" rev-parse --short HEAD)"
```
- 스택/메시지의 심볼(예: `runCleanup`, `Cleanup invoked recursively`)을 `search`로 **`$D`(dev) 소스**에서 찾아 **원인 파일·라인**을 특정한다.
- **`dev`에서 이미 고쳐진 게 확인되면**(관련 코드가 이미 패치됨 / 관련 PR이 dev 머지) → upstream에서 사실상 해결 → 초안 대신 resolved.jsonl 등재(`main` 미반영이어도 **dev 머지면 해결로 본다**).
- 가능하면 **최소 수정 방향**을 한 문단으로 제안한다(추정이면 "추정"이라 명시). 확실치 않으면 이슈(버그 리포트) 초안까지만.

## Step 4 — 초안 저장 (모아두기만)

확인된 후보마다 초안을 `.gjc/bugwatch/drafts/<severity>-<slug>-<fp8>.md`에 저장한다
(`<fp8>` = fingerprint의 sha1 앞 8자, 중복 판정 키).

> ⚠ **`.gjc/**`는 런타임 소유라 gjc의 `write`/`edit`/`ast_edit` 툴로 못 쓴다**(차단됨).
> 초안은 **서브프로세스로** 써야 한다: 초안 본문을 `/tmp/…md`에 `write`로 저장한 뒤
> `mkdir -p .gjc/bugwatch/drafts && cp /tmp/<draft>.md .gjc/bugwatch/drafts/<name>.md`
> (또는 `bun -e 'require("fs").writeFileSync(...)'`). collector의 `candidates.jsonl`도
> 이렇게 bun 프로세스로 기록된다. `fp8`은 `bun -e`로 sha1 계산.

**이미 고쳐진 걸 발견하면 → resolved 원장에 기록(초안 대신).** Step 3 근거 확인 중 해당 버그가 upstream에서 이미 **머지/클로즈**된 걸 확인하면, 초안을 만들지 말고 `.gjc/bugwatch/resolved.jsonl`에 한 줄(JSONL) 추가한다 — 그래야 다음 스캔부터 `✅resolved`로 자동 제외되어 같은 죽은 버그를 다시 쫓지 않는다. 형식:
> ```json
> {"fingerprint":"<collector fingerprint 그대로>","message":"<한 줄>","severity":"high","issue":1462,"pr":1465,"ref":"#1462 / PR #1465","mergedAt":"YYYY-MM-DD","note":"<확인 근거>","recordedAt":"YYYY-MM-DD"}
> ```
> `fingerprint`는 candidates JSON의 값을 **그대로** 복사(collector가 그 키로 매칭). 같은 fingerprint가 이미 있으면 갱신(중복 금지). 사람용 표 `RESOLVED.md`도 같이 갱신. `.gjc/**`는 못 쓰니 위와 동일하게 **서브프로세스**(bun fs / cp)로 기록.

초안 형식:

```markdown
# [gjc bug] <한 줄 제목>

- fingerprint: <fingerprint>
- severity: <high|medium|low>   count: <N>   source: <log|session>
- first/last seen: <ts> / <ts>
- status: draft   (사람이 검토 후 직접 제출)

## 증상 (관측)
<레닥션된 message + stack top>

## 재현 (추정)
<트리거 조건/스텝>

## 원인 (소스 근거)
<파일:라인 + 설명. gajae-code clone에서 확인한 것만.>

## 제안 수정 (선택)
<최소 패치 방향. 추정이면 '추정'이라 표기.>
```

마지막에 `.gjc/bugwatch/drafts/INDEX.md`(제목·severity·경로 표)를 갱신한다.

## Step 5 — 보고 (현재 대화 언어로)

수집 N건 / 초안 M건(신규 K, 기존 스킵 K) / drafts 경로만 한 줄 요약으로 알린다.

## 절대 규칙 (약화 금지)

- **초안만.** `gh issue/pr create`, `git push`, 커밋, 외부 제출 **금지**. 사람이 검토 후 직접 낸다.
- **⛔ 사람이 제출을 명시적으로 지시한 경우(초안-only override): upstream PR은 반드시 `dev` 브랜치로 — `main` 금지.** upstream(`Yeachan-Heo/gajae-code`)엔 push 권한 없으니 fork(`devswha/gajae-code`)에 브랜치 푸시 후 `gh pr create --repo Yeachan-Heo/gajae-code --base dev --head devswha:<branch>`. 브랜치는 `origin/dev` 기준으로 만든다(`main` 아님). 이슈는 base 없음 — 그냥 낸다.
- **read-only 대상.** gjc 로그/세션/소스는 읽기만. `~/.gjc` 원본을 수정하지 않는다.
- **레닥션 유지.** 초안에 이메일/토큰/계정ID 등 비밀이 들어가면 안 된다(collector가 1차 스크럽; 추가로 눈으로 확인).
- **중복 금지 (로컬 + upstream).** 같은 fingerprint 초안이 있으면 새로 만들지 않는다. 추가로 **초안·제출 전 upstream 이슈/PR 트래커를 검색**(Step 3)해 이미 보고됐거나 수정된 건이면 새 초안·PR을 만들지 않는다. fix는 `dev`에 먼저 들어가므로 소스 근거는 **`dev` 브랜치** 기준으로 확인한다(`main`만 보면 dev에 이미 있는 fix를 놓쳐 중복 PR).
- **추정과 사실 구분.** 소스로 확인 못 한 원인/수정은 "추정"이라 명시. 날조 금지.
- 산출물은 전부 `.gjc/`(gitignore) 아래 — 레포에 커밋되지 않는다.

> **참고 — 자동활성화(스킬)는 별도 1회 설치.** gjc는 플러그인 `SKILL.md`를 자동
> 로드하지 않는다(native `.gjc` 스킬만). 이 커맨드는 그대로 동작하지만, "버그 스캔
> 돌려줘" 같은 자연어로 뜨게 하려면 `bash "$(dirname "$(dirname "$BW")")/bin/install-skill.sh"`.
