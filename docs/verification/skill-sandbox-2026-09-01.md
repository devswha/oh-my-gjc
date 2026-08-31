# OMG skill sandbox verification — 2026-09-01

## Scope

Added a real bubblewrap integration harness for all five shipped OMG skills:
`extragoal`, `gpt-image`, `insane-review`, `insane-search`, and `no-english`.

The harness uses the real root installer, real GJC plugin/native-skill loading, and real
`/skill:<name>` activation. Model traffic is redirected to a local Responses-API SSE stub
inside the same isolated network namespace; no paid or public-network request is possible.

## Sandbox contract

- New PID, IPC, UTS, and network namespaces.
- Network namespace exposes only its own loopback stub.
- Host `/home`, `/root`, `/run/user`, and `/tmp` are masked.
- The actual host home path is passed into the sandbox only as a test string and must be absent.
- The candidate suite is mounted read-only; a temporary workspace is the only writable checkout.
- Child environment is cleared and rebuilt with a fake API key, local base URL,
  `GJC_NOTIFICATIONS=0`, and `GJC_SDK_DISABLE=1`.
- The parent Bun test passes only `PATH`, locale, and the two GJC disable flags; it does not pass
  host credentials.
- Every activation must place a skill-specific marker from the installed `SKILL.md` into the
  actual GJC Responses request.

## Verification evidence

```text
python3 -m py_compile plugins/oh-my-gjc/bin/skill_sandbox.py
PASS

uvx ruff check plugins/oh-my-gjc/bin/skill_sandbox.py
All checks passed!

python3 plugins/oh-my-gjc/bin/skill_sandbox.py --json
PASS: 5/5 skills loaded through real GJC
provider=local-responses-stub, network_namespace=isolated-loopback-only, paid_calls=0

bun test plugins/oh-my-gjc/test/skill-sandbox.test.ts
1 pass, 0 fail, 6 expect() calls

bun test plugins/oh-my-gjc/test
148 pass, 0 fail, 853 expect() calls

python3 -m json.tool .claude-plugin/marketplace.json
PASS

python3 -m json.tool plugins/oh-my-gjc/.claude-plugin/plugin.json
PASS

git diff --cached --binary | gitleaks stdin --no-banner --redact
no leaks found
```

## Independent cross-review

Fresh-context reviewer:

```text
GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc -p --no-session \
  --model openai-codex/gpt-5.5:xhigh --tools read,search,find ...
```

First pass returned `REQUEST_CHANGES` for missing child disable flags, an over-broad parent
environment, and a host-specific home-mask assertion. All three findings were fixed.

Re-review result:

```text
No remaining blocker/high/medium defects found in the reviewed sandbox files.
VERDICT: APPROVE
```

## Live-only canaries

Not run by this offline harness:

- `insane-review`: logged-in Chromium CDP → ChatGPT Pro turn and response harvest.
- `gpt-image`: logged-in Chromium CDP → ChatGPT Images generation and provenance.

Those remain explicit, credentialed, potentially paid manual/self-hosted canaries. This report
does not claim live ChatGPT evidence.
