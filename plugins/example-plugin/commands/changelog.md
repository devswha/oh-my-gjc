---
description: Summarize staged git changes into a concise changelog/commit message.
argument-hint: "[optional scope or ticket id]"
---

You are generating a changelog entry from the currently staged git changes.

Steps:

1. Run `git diff --cached --stat` and `git diff --cached` to inspect the staged changes.
2. If there are no staged changes, say so and stop.
3. Produce:
   - One imperative subject line, 72 characters or fewer.
   - A short bullet list of the notable changes (group related edits).
   - A one-line "Risk/Test" note describing what to verify.

If `$ARGUMENTS` is non-empty, treat it as the scope or ticket id and prefix the
subject line accordingly (e.g. `feat(scope): ...` or `[TICKET-123] ...`).

Keep it terse. Do not invent changes that are not in the diff.
