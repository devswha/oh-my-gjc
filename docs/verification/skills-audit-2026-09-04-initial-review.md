# Independent initial audit

Basis: original `f97288e`, five active skills and their runtime/templates. Reviewer: `anthropic/claude-opus-4-8`, isolated native GJC process with notifications/SDK/MCP disabled and read/search/find only. Two synthetic redaction-test tokens were redacted from the external snapshot after scanning. This is the initial verdict before fixes, not the final candidate verdict.

Audit complete. Findings below, ordered by priority. Sources inspected directly; no files edited, no workflows/credentials/web prompts run.

## Confirmed bugs

### 1. HIGH — `/omg:setup` legacy-binding check is a copy-paste dup (dead detection + spurious warning)
`templates/setup.md:16-19` (and identically in the shipped command it renders):
```bash
new_suite_binding="$root/runtimes/oh-my-gjc/root"
legacy_suite_binding="$root/runtimes/oh-my-gjc/root"   # ← identical to new
if test -e "$legacy_suite_binding" || test -L "$legacy_suite_binding"; then
  printf '%s\n' "warning: preserved compatibility fallback binding is present ..." >&2
fi
```
- **Trigger**: any healthy user-scope install. Because `legacy == new`, the `test -e` is true whenever the canonical binding exists, so setup prints the "preserved compatibility fallback binding is present" warning on **every** normal install — and it **never** detects the actual legacy path.
- **Contradiction with the rest of the suite**: `README.md:101-103` and the SKILL/`install-skill.sh` resolvers define the legacy identity as `oh-my-gajae-code` (e.g. `skills/insane-review/SKILL.md` reads `.gjc/runtimes/oh-my-gajae-code/root` as the bounded read-only fallback). setup.md is the only surface that got the rename wrong.
- **Minimal fix**: `legacy_suite_binding="$root/runtimes/oh-my-gajae-code/root"`.

### 2. HIGH — Model verification cannot match an alphabetic rebrand → maps to the reported "Astra Pro" incompatibility
Two hardcoded source facts combine to make the review skill fail-closed permanently if ChatGPT renames the Pro model to a non-GPT/non-numeric label:
- `bin/pack_and_ask.py:1355` — `MODEL_NAME_RE = r"GPT|gpt|o\d|Claude|Gemini|\d+\.\d+"`. A label like **"Astra Pro"** contains no `GPT`, no `o\d`, no `\d+\.\d+`, so `read_menu_state()` (`:1699-1704`, `:1719`) never collects it as a model. `before["model"]` stays `None` → `select_model` hits the `모델명 획득 실패 → fail-closed` branch (`:1752-1758`).
- The advanced path is no better: `_select_advanced_model_and_effort` (`:1619-1634`) reads the row text and calls `_model_name_matches(current_model, require_model)` / `_click_menu_radio(page, require_model)` against the hardcoded require string `"GPT-5.6 Sol"` (mandated by `skills/insane-review/SKILL.md` and `templates/insane-review.md`). `_model_name_matches` (`:1371`) only strips a `gpt` prefix and does substring containment — `"5.6 sol"` is not a substring of `"astra pro"` → no match → `(False, None)` → `RuntimeError("모델/추론단계 검증 실패 … 전송 중단")` at `:2716-2717`.
- **Net effect**: with the skill-mandated `--require-model "GPT-5.6 Sol"`, a renamed Pro model is *unusable* (every run aborts before send). The only escape is dropping `--require-model`, which the SKILL explicitly forbids because it also disables the fail-closed provenance guarantee.
- **Distinguishing confirmed vs live-UI**: the regex narrowness and the hardcoded require-string are **confirmed source brittleness**; the exact current menu label ("Astra Pro" vs "5.6 Sol") is live-UI. But the failure mode is deterministic for *any* purely-alphabetic model name, independent of the DOM.
- **Minimal fix**: (a) broaden `MODEL_NAME_RE` to also admit a capitalized alphabetic model token (so unknown-brand models are still *detected* as models rather than silently dropped, preserving fail-closed rather than mislabeling), and (b) make the required model name a single configurable constant / `--require-model` default sourced from one place, then update `skills/insane-review/SKILL.md`, `templates/insane-review.md`, and `bin/pack_and_ask.py:2464` guidance together instead of the literal `"GPT-5.6 Sol"` scattered across three files. Without (b) every rebrand needs a coordinated three-file edit.

## Verified sound (no change needed)

- **Activation boundaries**: `no-english` (`/omg:no-english`-only) and `gpt-image` (`/omg:gpt-image`-only) frontmatter both state explicit-command-only and "never auto-activate"; `insane-search` gates on post-block 402/403/WAF/challenge with an explicit public-caption exception; correct.
- **install/root resolution**: the `resolve_omg_asset` bash resolver (`skills/insane-review/SKILL.md`) and the Python resolvers in `bin/gpt_image_web.py`/`skills/gpt-image/SKILL.md` are symlink-rejecting, canonical-path-checked, single-line, control-char-rejecting, 0600-owner-checked, fail-closed, with a bounded read-only `oh-my-gajae-code` fallback and a final checkout fallback. `install-skill.sh:154-195` writes the binding atomically (`mktemp`+`chmod 600`+`mv -f`) and verifies content round-trip.
- **Login reuse**: single dedicated profile `~/.insane-review/browser-profile`, hardened 0700/owner-checked (`pack_and_ask.py:_prepare_browser_profile`/`_profile_dir_hardened`), CDP bound to that profile via DevToolsActivePort receipt *or* Chrome-136+ listener-argv `--user-data-dir` proof (`_cdp_matches_dedicated_profile`, `:811-827`); `gpt_image_web.dedicated_profile_ok` reuses the same proof. `CdpLease` serializes cooperating runs and is honest about the TOCTOU limits it does not close.
- **insane-search public-only safety**: `bin/insane_search.py` allowlists exactly one absolute http/https URL, rejects embedded credentials and unknown flags, clamps `--device`/`--timeout`, pops `INSANE_ALLOW_PRIVATE`/`INSANE_AUTO_INSTALL`/all proxy vars, forces `INSANE_LEARN=0`, and always appends `--no-playwright` (no local browser). `engine/safety.py` does default-deny SSRF with DNS-pin-before-connect (`resolve_public`/`curl_resolve_entries`) covering loopback/RFC-1918/link-local/reserved/metadata. `--json`/`--trace` omit body/route to stdout-safe channels. Terminal auth/paywall/CAPTCHA are non-bypassed. Usability trade-off (curl_cffi≥0.15 required, keyword→GJC-search-first) is documented and reasonable.
- **gpt-image output**: saves only the fullscreen **Save** download (`run` `:333-365`), validates real PNG magic+IHDR+dims (`png_details`), atomic O_EXCL 0600 write into a 0700 non-symlink in-project `.gpt-image/`, provenance JSON excludes cookies/signed URLs, temp downloads cleaned on failure; POSIX-gated deadline is documented.
- **extragoal**: read-only leaf contract, untrusted-bundle framing, last-nonempty-line verdict parse, fail-closed on malformed/`APPROVE`-with-open-CRITICAL, mandatory secret scan on off-box lanes, cross-family/no-shared-context reviewer via `env -u GJC_SESSION_ID … --no-session --model … --tools read,search,find` (reviewer isolation is a runtime property, not verifiable here — live-UI uncertainty, not a defect).
- **no-english**: preserves code/identifiers/paths/log/quote originals and canonical GJC workflow names; never softens severity/uncertainty/approval boundaries; explicit-only.

The two confirmed defects (setup.md dup, model-name brittleness) both ship in template/runtime source and the second directly reproduces the user's reported failure, so this cannot pass as-is.

VERDICT: REQUEST_CHANGES
