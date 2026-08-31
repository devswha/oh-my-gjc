# Upstream provenance

This capability vendors and adapts `fivetaku/insane-search` 0.14.0 at commit
`019ee16bbf471595f9b67b164e4a92208183af2d` (2026-08-06).

Source: https://github.com/fivetaku/insane-search

The upstream source is MIT licensed. The complete upstream license is preserved in
[`upstream-LICENSE`](./upstream-LICENSE).

OMG-specific changes remove Claude-only setup/star prompts, resolve assets through the hardened
OMG suite-root binding, keep dependency installation confirmation-gated, disable learning and
observation persistence by default, and harden SSRF/browser-profile handling. These changes are
not an official upstream release.
