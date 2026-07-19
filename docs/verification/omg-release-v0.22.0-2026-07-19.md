# oh-my-gajaecode v0.22.0 release evidence — 2026-07-19

## Candidate

- Behavior candidate: `5ab2411` (dev)
- Release scope (v0.20.0..dev): `deep-onboarding` skill+command, token-free `session-observer` skill+command (current-tmux default), lazycodex-gjc 개선 패키지(observation tap `--observe-log`, orchestration standard, #202 bounded-output atomicity), backtick-frontmatter quoting fix, `preset-pack` skill+command(하코 07-19 발주 — daily/deep/sec 좌석표를 명시 호출 시에만 백업 후 이름 단위 병합), time-left workflow-invocation docs, gitleaks fixture allowlisting, install.sh 카운트 동기화.
- `preset-fit`(측정 스킬)은 같은 사이클에 추가됐다가 릴리스 전 드롭됨(하코 07-19 "어차피 daily면 된다", `33970e7`) — 미출시라 묘비·cleanup 불요. 최종 표면 = **9 skills / 12 commands**.

## Gate 1 — verification

- `bun test plugins/oh-my-gjc/test`: **226 pass, 0 fail**, 1230 expectations across 13 files (dev `d2bcd68` 병합 직후 + `5ab2411` lazycodex 스위트 52/52 재확인).
- `python3 -m unittest ops.verify.test_record_provenance`: 33 tests, `OK` (PROVENANCE FAIL 라인은 negative-case 의도된 fail-closed 진단).
- `bash -n` root `install.sh` + native `install-skill.sh`: pass.
- `python3 -m py_compile ops/verify/record_provenance.py`: pass.
- marketplace.json + plugin.json JSON parse: pass (version 0.22.0 both).
- `git diff --check v0.20.0..dev`: pass.
- **New-install reproduction (isolated HOME, `--candidate-ref` local checkout): rc=0** — plugin `0.22.0` registered in `installed_plugins.json`, exactly 9 skills + 12 native commands copied, suite-root binding emitted; lazycodex runtime unbound(fail-closed 안내) and time-left runtime disabled by `OMG_TIME_LEFT_RUNTIME=0`(fail-closed) as documented.
- `gitleaks git --log-opts='v0.20.0..dev'`: 12 commits scanned, **no leaks found**. (첫 스캔의 1건은 lazycodex 레닥션 테스트의 합성 `ghp_` 픽스처 오탐 — inline `gitleaks:allow` + `.gitleaksignore` 지문(bdec70f)으로 정리, `5ab2411`.)

## Gate 2 — external cross-family review

Fresh-context `openai-codex/gpt-5.5:xhigh`, tools read/search/find only, `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`, reviewing `/tmp/omg-v0.22.0-release.diff` (v0.20.0..dev) against the live repo.

- Verdict: PENDING — 실행 중, 완료 시 본 절 갱신.

## Gate 3 — human approval

- PENDING — Gate 2 통과 후 관제탑 큐로 하코 승인 요청. 자기승인 없음.

## Publication contract

- Merge `dev` to `main` without rewriting reviewed history; tag the merge `v0.22.0`; publish the GitHub Release; send the post-publication control-tower report (version, candidate hash, evidence path).
