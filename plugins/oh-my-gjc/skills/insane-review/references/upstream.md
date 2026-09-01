# Upstream provenance

This capability forks and adapts `fivetaku/insane-review` 0.5.3 at commit
`2b3c926737031600e166dbce7dbd8d15b17be9eb` (2026-06-28).

Source: https://github.com/fivetaku/insane-review

The upstream source is MIT licensed. The complete upstream license is preserved in
[`upstream-LICENSE`](./upstream-LICENSE).

The fork point is exact: the first OMG port commit (`0904c95`, 2026-07-02) carried
`bin/pack_and_ask.py` byte-identical to upstream v0.5.3 (`md5 dc5d054b29104c0a512bcbb9baf478d7`).
The two engines have diverged since; the current file is no longer an upstream release.

## OMG-specific changes

- Drops the Claude-Code `setup/` flow (GitHub-star prompt, `~/.claude/settings.json`
  SessionStart update hook) and the `${CLAUDE_PLUGIN_ROOT}` substitution, resolving assets
  through the hardened OMG suite-root binding instead.
- Proves CDP-to-dedicated-profile binding from the 127.0.0.1 listener process itself
  (`cdp_binds_dedicated_profile`) because Chrome 136+/145+ no longer writes the
  `DevToolsActivePort` receipt; the receipt remains a secondary proof for older Chromium.
- Selects model and reasoning effort by alias with evidence-based verification
  (`_select_advanced_model_and_effort`, `_drive_effort_slider`, `_radio_effort_actually_checked`).
- Serialises ChatGPT CDP automation with a cross-process single-flight lease
  (`bin/cdp_lock.py`), shared with `gpt-image`.
- Refuses refusal pages and prompt echoes as successful answers (`rejection_reason`,
  `REFUSAL_MARKERS`, `PROMPT_ECHO_CHARS`), and aborts when an explicitly requested
  `--include` path is missing from the pack (`missing_explicit_include_paths`).
- Writes responses with `O_EXCL | O_NOFOLLOW` at mode `0600` (`write_response_artifact`).
- Adds `--stream`, `--no-gitignore`, and `--no-default-patterns`.

## Upstream features not carried over

Upstream reached 0.6.8 after the fork point. The following are absent here:
conversation-URL binding and `data-message-id` turn identification (0.6.0), `--harvest`
and run manifests (0.6.0), harvest-only retries and the 3600s Pro wait ceiling (0.6.0),
quota-block detection (0.6.1), the four-state project cache with workspace binding and
sidebar-API lookup (0.6.3-0.6.6), stall-reload recovery (0.6.5), the force-answer timeout
grace (0.5.8), Chat/Work mode gating (0.6.8), and `--set-launch-mode`.
