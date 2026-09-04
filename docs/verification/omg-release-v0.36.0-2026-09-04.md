# v0.36.0 release verification — 2026-09-04 UTC

## Candidate and independent review

- Previous main/release basis: `f97288e` / v0.35.1.
- Behavior implementation: `9a30dec`; reviewed and verified candidate: `1aade43b208fbdb237b37a4ba5ca81d5666e0a69`.
- Final independent `anthropic/claude-opus-4-8` review: **APPROVE**. Its two LOW doc/test-fixture findings were addressed without changing runtime behavior. Full output: [candidate review](skills-audit-2026-09-04-final-review.md).
- This release-preparation commit adds evidence and status documentation only. No new behavior review is required for those changes.

## Mandatory checks

| Check | Result |
|---|---|
| marketplace/plugin JSON | rc=0; version 0.36.0, canonical single-suite name/source |
| `bash -n` on root installer and active bin shell scripts | rc=0 |
| Python compile on active bin helpers and changed safety module | rc=0 |
| `bun test plugins/oh-my-gjc/test` | rc=0; **245 passed, 0 failed**, 1061 assertions, 17 files |
| Hardened root `install.sh --candidate-ref <candidate>` in a fresh isolated HOME | rc=0 |
| `gjc plugin list` in that isolated HOME | rc=0 |
| Installed surfaces | exactly 5 skills and 5 commands; root binding mode 0600 |
| Installed Python helpers and native SKILL.md payloads | byte-identical to candidate sources |
| `gitleaks git . --log-opts=f97288e..c96a451 --redact --no-banner` | rc=0; 3 commits scanned, no leaks |

The fresh-install reproduction used separate HOME/GJC/XDG roots with `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`. It did not use operator credentials. All previously exercised 12 offline search-engine test scripts passed; details and public-fetch evidence are in the [suite audit](skills-audit-2026-09-04.md).

## Runtime payload SHA-256

- `bin/insane_search.py`: `90b955b024e3956d57e6c63adfa654a6262789cb95300a038277d466e143092d`
- `bin/pack_and_ask.py`: `203f5c2be5cd10870f5f2777330953593d215ec356f2c2d236650fa56ecb4dcc`
- `bin/gpt_image_web.py`: `552f98e16b889e75fd0c11b21f98530e5e25bd4353cfa47d484d445c65255079`
- `bin/setup_insane_search.py`: `354fe70ba46ad578ccfa634c1d337f3fbde19d09d34d97769e245caa0eeaa84c`
- `bin/skill_sandbox.py`: `5af0fb9585c45dfb2cd2dbcccd81c0b4d8c7226b85e702213af07199b08cc8a3`
- `bin/cdp_lock.py`: `8e31424ad6123af2789be6d31949230ddbd34cca197b0f43597c02b459843b7d`

## Operator installation and live boundary

Before release, the operator's user-scope suite binding and native commands still pointed to **v0.35.0**. Its native review command had neither `--require-model current` nor `--inspect-session`. The current project has no overriding project-scope binding/command/skill.

The verified changes were published as v0.36.0. The canonical hardened installer refreshed the existing user installation from 0.35.0 to 0.36.0 (rc=0). No customized native files were found before the update; installed Python helpers and all five native skills match the verified source. The installer did not schedule automatic updates or invoke dependency setup. A separate explicit one-time setup invocation then prepared the private search environment for this repair.

**Live Astra Pro verification is still pending-environment.** There is no GUI DISPLAY/WAYLAND_DISPLAY. A standard dedicated-profile headless launch successfully bound CDP, but ChatGPT returned HTTP 403 with a waiting/challenge page, no composer, and login unknown. No challenge/login bypass or review submission occurred. The diagnostic process was cleaned up; the existing profile was preserved. Release notes disclose this limit. No claim is made that an Astra response has been harvested.

## Publication and operator verification

- Release tag commit: `c96a451e9a32525188195e180d67ba6069411061`.
- GitHub Release v0.36.0 published at **2026-09-04T21:27:20Z**, not a draft or prerelease.
- Main and dev were pushed atomically to the same release commit. The followup evidence commit also fast-forwards both branches; the release tag is not moved.
- GitHub Actions `test`, run **33921159083**, completed **success** for the release commit.
- Canonical installer downloaded from `raw.githubusercontent.com/devswha/oh-my-gjc/main/install.sh`, byte-compared with the verified script, executed with **rc=0**.
- User suite binding: **v0.36.0**, mode **0600**. The installed review command contains both `--require-model current` and `--inspect-session`.
- Separate explicit `setup_insane_search.py --install`: **rc=0**. It prepared `~/.local/share/oh-my-gjc/insane-search/venv` without changing system Python. Ordinary fetches still never install packages.
- Installed `insane_search.py --check-env`: **rc=0**, managed interpreter reused, `missing=[]`, `authentication=not_required`, `browser=not_used`, `model=not_used`.
- Installed public fetch of `https://example.com/` with `--selector h1 --json --trace --timeout 5 --no-retry`: **rc=0**, HTTP 200, **strong_ok**, one pinned curl attempt, 167 extracted characters, `content_trust=untrusted_public_web`, `must_invoke_browser=false`.
- Installed `pack_and_ask.py --inspect-session`: **rc=1**, browser down / login unknown. Actual Astra Pro selection and response harvest remain unverified, as described above.

Existing GJC sessions must be reopened to load the refreshed native command/skill bodies. This evidence update changes documentation only; it does not alter the reviewed runtime.
