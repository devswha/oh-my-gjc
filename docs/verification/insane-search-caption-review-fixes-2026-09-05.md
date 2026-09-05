# Caption independent-review fixes — 2026-09-05

Base: `e2bf3fdde96c9c48c10ca599c288d687a195bbd0` on
`work/improvements-20260905-search`. The parent integrates and pushes this
follow-up. Scope: `engine/captions.py`, `engine/tests/test_public_captions.py`,
and this evidence; no version or global documentation changes.

## Accepted findings and resulting behavior

- Player access status is checked before yt-dlp's implicit fallback loop and
  before `ignore_no_formats_error` can discard authentication evidence. Both
  watch-page and player-API login/private/age-gate responses return
  `auth_required` with `player_requires_authentication` and no transcript.
- A YouTube extractor subclass rejects non-web config/embed requests and
  non-web player requests before transport, including when config fetching is
  skipped. Its extractor key remains `Youtube`, preserving the configured web
  client and manifest exclusions.
- Public manual/automatic caption tracks still work with missing formats,
  absent status metadata, and non-authentication no-format errors. Public
  metadata without a track still returns `no_captions`. Authentication terms in
  ordinary titles/descriptions and the word `signing` do not create auth gates.
- WebVTT separators consume arbitrary blank-line runs. Tests preserve cue
  identifiers, NOTE blocks, overlap, repetition, and multiline text across
  LF/CRLF/CR and space/tab-only blank lines.

## Local verification

Interpreter: `/tmp/omg-improvements-release/pdf-venv/bin/python`, with actual
yt-dlp package `2026.8.19` (`yt_dlp.version.__version__ = 2026.08.19`). No packages
were installed. Integration tests use real `YoutubeDL` and `YoutubeIE` parsing,
with HTTP responses supplied in memory. Socket/DNS, subprocess, and native curl
execution are blocked; the tests also fail if an upstream handler swallows a
blocked-operation exception. The focused combined run adds a Python audit hook
rejecting socket/DNS/subprocess operations.

| Check | Result |
|---|---|
| Combined `test_search_completeness`, `test_search_outputs`, `test_public_captions` | rc=0; 35 tests, no skips |
| Actual caption suite alone | rc=0; 18 tests, no skips |
| System-Python caption suite without optional dependencies | rc=0; 14 tests, real-dependency class explicitly skipped |
| `bun test plugins/oh-my-gjc/test/insane-search.test.ts` with the dependency venv first on PATH | rc=0; 13 pass, 0 fail |
| Changed Python AST parse and marketplace/manifest JSON/name parity | rc=0 |
| `git diff --check` | rc=0 |
| Gitleaks scan of the scoped diff, redacted output | rc=0; no leaks |

Regression sensitivity was checked without changing disk files: load the base
`captions.py` into an isolated in-memory module and run the new tests against it.
The blank-line test detects 54 failing cases, the real-dependency access test
detects 12, and the non-web dispatch test detects 4. The fixed source passes all
three tests. The dispatch test deliberately steers the real upstream loop to an
unrequested client, covering both config and direct player request paths.

To rerun the actual caption suite from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 /tmp/omg-improvements-release/pdf-venv/bin/python -B \
  plugins/oh-my-gjc/skills/insane-search/engine/tests/test_public_captions.py -v
```

Live YouTube access was not exercised; this is deterministic local policy and
parser evidence. No browser or model calls, release, or push was performed.
