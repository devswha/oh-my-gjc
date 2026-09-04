# Independent candidate review

Candidate runtime matches implementation commit `9a30dec`. Reviewer: isolated native GJC `anthropic/claude-opus-4-8`, notifications/SDK/MCP disabled, read/search/find only. The two LOW findings were resolved after this review with documentation wording and canonical temporary test paths; runtime security checks were preserved. No live Astra claim is made.

I've reviewed the full diff plus the complete new/changed runtime, helpers, resolvers, and tests. Here's my assessment.

## Prior-audit fixes — both verified corrected

1. **Setup legacy-path-equals-canonical bug** — `templates/setup.md:17` now sets `legacy_suite_binding="$root/runtimes/oh-my-gajae-code/root"` (was identical to the new binding). The prose at `:30` and all resolver `bindings` arrays (`skills/insane-review/SKILL.md`, `skills/insane-search/SKILL.md`, `templates/insane-review.md`, `references/council-setup.md`) list `oh-my-gjc` then `oh-my-gajae-code` in strict precedence. `skill-resolvers.test.ts` proves project-before-user and the legacy read-only boundary (gpt-image correctly rejects legacy). Fixed and covered.

2. **Pro model detection excluded Astra / commands forced Sol** — `MODEL_NAME_RE` (`pack_and_ask.py:1416`) now includes `Astra|Sol|Terra|Luna`; `_model_name_matches` (`:1420`) does exact family/variant compare after GPT-prefix normalization (no more substring subset match). `--require-model current` reads and freezes the live selected model (`select_model:1808`, `selected_model_in_open_menu:1958`), and all command/skill/council bodies switched `"GPT-5.6 Sol"` → `current`. `read_menu_state` fails closed on ambiguous multi-checked models (`:1770`). Verified by `readiness.test.ts` (exact-match matrix, current-mode freeze, ambiguous rejection) and `pack-and-ask.test.ts` (Astra selection without a Sol label). Fixed and covered.

## Focus areas — all sound

- **Managed Python setup/reuse**: `setup_insane_search.py` is `--install`-gated, one-time, creates a `0700` venv, bootstraps via outer `pip --python`, never invoked by `install.sh`/`install-skill.sh`/`omg-autoupdate.sh`/`/omg:setup` (grep confirms only asset-manifest reference). Launcher re-execs into the managed venv once with no exec loop (`insane_search.py:main`).
- **No auto-install during fetch**: ordinary fetch path only reports `missing` + `setup` command and returns 1; `INSANE_AUTO_INSTALL` stripped. Covered by readiness `search runtime` test.
- **Public-only DNS-pinned fetch**: `safety.py` adds `not ip.is_global` (blocks CGNAT 100.64/10) and `credentials_in_url` rejection in both `resolve_public` and launcher arg-guard; test covers shared-space/loopback/link-local/multicast/IPv6 + `user:pass@`.
- **Exact model verify / current mode / read-only inspect**: `--inspect-session` sends nothing, only reads (`inspect_session:942`); won't connect to an unbound profile (test).
- **login unknown vs logged-out**: `login_state` returns `no` only on a *visible* wall, else `unknown`; send path and `check_env` fail closed on `unknown` without demanding re-login. Covered.
- **Strict resolver precedence + followup conversation ID**: `same_conversation` (`:1173`) requires matching conversation id across project/ordinary routes and rejects a different valid chat. Covered.
- **Five skills / five commands**: `EXPECTED_SKILLS`/`EXPECTED_COMMANDS` = 5 each; plugin/marketplace metadata consistent at `0.36.0`.

## Findings (all LOW, non-blocking)

- **LOW — doc staleness**: `skills/extragoal/SKILL.md:69` still labels the reference adapter `insane-review(GPT-5.6 Sol Pro 웹 …)`, and `AGENTS.md:177` prerequisites still say "GPT-5.6 Sol Pro selected," contradicting the new verified-current-model positioning adopted in README/docs/capabilities/AGENTS skill-audit block. Suggested fix: reword to "검증된 현재 Pro 모델" for consistency.
- **LOW — test portability (not a product defect)**: `readiness.test.ts` "rejects linked and permissive managed environments" and the managed-path walk in `insane_search.py:validate_managed_path` reject any symlinked ancestor of `$XDG_DATA_HOME`. On hosts/CI where a tempdir or home ancestor is a symlink (e.g. macOS `/var`,`/tmp`), `managed_python()` raises before the not-exists short-circuit, so this test is Linux-only-green. This mirrors the suite's established ancestor-symlink hardening used in every resolver, so it fails closed and is intentional, but worth a note. Suggested fix: realpath the XDG base once (or scope the symlink check to components at/below the `oh-my-gjc` dir) so a symlinked system ancestor doesn't gate the whole skill.

No correctness or security regressions found; the two audited bugs are fixed and test-covered, security posture is strengthened (credentials/CGNAT/ambiguous-model/conversation-id/current-model-freeze), and fail-closed invariants and the 5+5 surface hold. Fixture-only checks were not treated as live UI verification.

VERDICT: APPROVE
