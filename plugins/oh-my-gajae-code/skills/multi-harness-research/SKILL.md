---
name: multi-harness-research
description: "Activate only when the user explicitly invokes `/omg:multi-harness` or explicitly names the `multi-harness-research` skill. It sends one confirmed read-only research task directly to four fixed harnesses; ordinary research, review, comparison, or model-delegation requests never auto-activate it."
---

# Multi-harness research

This is an explicit, read-only research surface. It directly orchestrates four independent
harnesses; it does not create a GJC `team`, task, goal, session, worktree, or worker model.

## Locked intent

- `artifact:research-docs` — publish four fixed-position lane documents and a factual
  `summary.md`; failed lanes keep a fixed placeholder and ledger entry.
- `surface:explicit-command` — only an explicit `multi-harness-research` skill request or
  `/omg:multi-harness` invocation may run it.
- `integration:four-harnesses` — run exactly the four lanes below, in order.
- `constraint:read-only` — workers can inspect the canonical target only; only the
  project-external XDG artifact directory is writable.
- `constraint:same-task` — every lane receives byte-identical normalized task bytes plus
  the same safety/output suffix, recorded by one SHA-256 digest.
- `constraint:single-suite` — all active files and runtime ownership use `oh-my-gajae-code`; no
  additional marketplace plugin is involved.

## Activation and task confirmation

An explicit argument is the canonical task. Without one, preview a one-sentence goal, the
research questions, and expected output; obtain confirmation before running. Do not infer a
task from ordinary conversation, start a background run, or silently split one request into
multiple tasks.

Use the direct `multi-harness-research.mjs` runner installed by the native **user-scope**
installer. Execution requires its trusted mode-`0600` binding and private runtime snapshot at
`~/.gjc/agent/runtimes/multi-harness-research/`. A project-scope installation or a
project-local runner never authorizes execution. Missing, malformed, changed, or unsafe runtime
state fails closed; do not install, update, migrate, set up, or log in on the user's behalf.

## Fixed lanes and isolation

The runner fans the one normalized task to exactly these lanes in this order; it never adds a
fifth model, substitutes a selector, retries through a fallback provider, or asks for a winner,
majority, vote, consensus, ranking, recommendation, or final verdict.

1. `gjc-opus` — GJC 0.11.x with `--model anthropic/claude-opus-4-8 --thinking max`.
2. `gjc-sol` — GJC 0.11.x with `--model openai-codex/gpt-5.6-sol --thinking xhigh`.
3. `codex-sol` — Codex CLI with `--model gpt-5.6-sol`,
   `-c 'model_reasoning_effort="xhigh"'`, and `exec --ephemeral`.
4. `claude-ultracode` — Claude Code with
   `-p --no-session-persistence --effort ultracode`.

Linux and an executable `bwrap` are required. The runner binds the canonical target read-only at
the same path and gives every lane private HOME/XDG/TMP state. It exposes neither the target's
`.gjc`, Git mutable state, host home, nor a target snapshot. Workers cannot edit, delete,
chmod, create symlinks, write notebook data, run browser automation, use MCP/hooks/extensions,
or access skills/rules.

GJC lanes have `GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1`, `--no-session`, `--no-extensions`,
`--no-skills`, and `--no-rules`; their allowlist is read/search/find plus provider-native public
web/package-metadata tools. They have no built-in Bash, write, or edit capability. Claude's
allowlist is exactly `Read,Grep,Glob,WebSearch,WebFetch`; it has no Bash, Write, Edit, Notebook,
browser, MCP, hook, plugin, or persistence capability. Codex uses a private ephemeral state,
read-only workspace profile, provider-native web search only, and `shell_network=false`; it
inherits no shell environment and has no MCP/apps/hooks/browser/plugins. Codex receives no OMO
prompt or resolution. Current Codex OAuth 401 is **pending-environment**, not a successful lane
or a reason to fall back.

Credential-bearing input is limited to these read-only regular files after canonical,
owner/mode/link, descriptor-identity, and no-symlink validation. There is no credential discovery,
parent-directory bind, broad home bind, alternate layout, or writable refresh path.

| Lanes | Exact host source | Private sandbox destination |
|---|---|---|
| `gjc-opus`, `gjc-sol` | `${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json` | the identical canonical path in the lane-private HOME/XDG view |
| `codex-sol` | `${CODEX_HOME:-$HOME/.codex}/auth.json` | `$CODEX_HOME/auth.json` in private `CODEX_HOME` |
| `claude-ultracode` | `$HOME/.claude/.credentials.json` | `$HOME/.claude/.credentials.json` in private HOME |

## Artifacts, lane truth, and output limits

The orchestrator alone atomically publishes new artifacts under
`${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gajae-code/multi-harness/<repo-id>/<run-id>/`; the
fallback is `$HOME/.local/share`. Artifact directories are mode `0700`, files are mode `0600`,
creation is no-follow and exclusive, and publication uses same-directory fsync plus atomic rename.
Raw tasks, raw child streams, credentials, tokens, auth state, and target snapshots are never
persisted.

**Preserved historical artifact data:** the former
`${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gjc/multi-harness/<repo-id>/<run-id>/` root is
read-only historical data. Never write, migrate, or clean it.

Each lane is independent. Valid Markdown is non-empty UTF-8, no more than 1 MiB, secret-clean,
and contains `## Conclusion`, `## Evidence`, and `## Uncertainties` with a verifiable path+line or
external URL. Raw stdout and stderr each stop at 8 MiB; output is never truncated into success.
The closed lane error classes are `preflight`, `spawn`, `timeout`, `nonzero_exit`,
`invalid_output`, and `contract_breach`. A failed lane never cancels a peer or discards a valid
peer document.

After all four lanes reach terminal state, phase 1 seals the factual base summary. Four valid
lanes produce `COMPLETE` with runner exit `0`; mixed valid/failed lanes produce `INCOMPLETE` with
exit `10`; no valid document or a run-level fatal produces exit `1`. The bounded user surface may
show only overall lane state, per-lane status/error class, absolute summary/success paths, and a
short comparison—never full documents, raw stderr, task bytes, credentials, or a nonce.

## Two-phase comparison

The factual base is sealed first with immutable lane facts, fixed-order placeholders, failure
ledger, `comparison_status: pending`, task digest, and final phase-1 exit. Only after that does
the current GJC leader read successful lane documents and author a bounded, explicitly
non-authoritative list of commonalities, differences, and uncertainties. The leader does not
change lane facts and is not a fifth synthesis model.

The leader sends only that bounded prose and the protected one-use receipt path to the no-model
`finalize-comparison` runner mode through protected mode-`0600` stdin/env transport. The runner
reads the receipt itself; never put the task, comparison, receipt nonce, credential, or token into
shell source, argv, logs, or chat. The finalizer revalidates the nonce digest, base digest,
immutable facts, held summary descriptor, and current summary path identity immediately before
atomic publication. It may replace only the comparison placeholder and status.

Finalizer exit `0` is `FINALIZED`. Its independent exit `20` is `FINALIZATION_FAILED` with only
one bounded class: `leader_input_invalid`, `authorization_failed`, `base_changed`, or
`publication_failed`. It does not reinterpret finalizer failure as a lane failure or change the
sealed lane outcome, run exit, lane artifacts, or factual base summary. A controlled retry is
permitted only with the same unconsumed receipt and byte-identical base.

## Never do

- Do not use `gjc team`, worktrees, arbitrary shell brokers, a fifth model, winner selection,
  consensus, voting, ranking, recommendation, or fallback.
- Do not install, update, migrate, configure, set up, or log in to any provider or CLI.
- Do not permit target writes, target `.gjc` access, mutable Git access, built-in Bash in GJC or
  Claude lanes, Codex shell networking, or credential/config directory mounts.
- Do not claim the Codex 401 pending-environment condition passed.
