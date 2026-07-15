# GJC SDK lab

Read-only groundwork for using the GJC v0.11 SDK from OMG. This lab inspects a running top-level GJC session without sending prompts, replies, controls, configuration changes, or arbitrary SDK queries.

## Canonical source

The source contract is pinned to:

- repository: `https://github.com/Yeachan-Heo/gajae-code.git`
- release: `v0.11.0`
- commit: `8132409c3f10754fea5f3b0108a7bee979c43652`
- transport: `@gajae-code/bridge-client@0.11.0`
- runtime: Bun `>=1.3.14`
- platform: Linux (descriptor-bound `/proc/self/fd` discovery reads and Unix ownership/mode checks)

Materialize an inert detached source checkout for inspection:

```sh
cd tools/sdk-lab
bun run pin-source
```

The default destination is `${TMPDIR:-/tmp}/oh-my-gjc-upstream/gajae-code-v0.11.0`. Set `OMG_GJC_SDK_SOURCE` for an explicit destination under a private current-user directory. The helper clears ambient Git routing/config/template overrides, initializes from a helper-owned empty template, serializes publication, and requires an in-checkout gitdir/common-dir/index/worktree with no active hooks, replacement refs, grafts, alternates, sparse state, hidden index flags, dirty files, or ignored files. It verifies detached HEAD plus the exact origin/commit/tree, executes no fetched code, and refuses to rewrite an existing checkout.

Important upstream files:

```text
docs/sdk.md
docs/sdk-embedding.md
packages/bridge-client/src/client.ts
packages/coding-agent/src/sdk/
crates/gjc-sdk/src/
```

## Inspect a live session

```sh
cd tools/sdk-lab
bun install --frozen-lockfile
bun run inspect --endpoint /absolute/repo/.gjc/state/sdk/<session-id>.json
```

When run from the target repository, `bun run inspect` parses endpoint candidates, ranks them by valid `updatedAt`, and tries them in order until one completes authenticated v3 hello, exact `sessionId`, and read-only queries. This prevents a dead or PID-reused stale record from blocking an older usable endpoint. The Linux-only inspector binds ownership/mode checks and reads to the same no-follow file descriptor, requires a private current-user parent, enforces the full v0.11 discovery schema, live PID, and filename/session identity, and accepts only `ws://127.0.0.1:<matching-port>`. Tokens stay in memory and are recursively redacted from errors and successful output.

It reports only bounded summaries from:

- SDK `hello` protocol and capabilities
- `session.metadata`
- `context.get`
- `models.list`
- `workflow.gates.list`

Every query response must be a valid SDK v3 envelope. The inspector follows same-query continuation cursors at one stable revision, reconstructs paged scalar snapshots, and enforces page/item/byte ceilings. It fails closed instead of presenting a partial result when a response is malformed or exceeds a ceiling.

## Architecture decision

Do **not** fork, vendor, subtree, or submodule GJC merely to consume or inspect the SDK. A fork adds maintenance but does not improve OMG runtime integration. Use the pinned detached checkout as read-only source evidence and consume exact published packages with a committed lockfile.

Create a GitHub fork only when a reproducible defect requires an upstream patch. That contribution checkout must be separate from OMG, branch from current upstream `dev`, and target an upstream `dev` pull request. OMG must never depend on the fork branch.

The SDK does not install OMG's independent top-level skills or `/omg:*` commands. The hardened native installer remains authoritative for the 4-skill/7-command surface.

## Adoption milestones

1. **Read-only inspection — implemented here.** Prove descriptor-bound endpoint discovery, package compatibility, v3 capability negotiation, complete bounded pagination, session identity, safe summaries, and token hygiene against a live GJC 0.11 session.
2. **Allowlisted invocation.** Add a typed catalog for the seven existing commands and send only validated rendered commands through canonical `user_message` plus `inbound_ack`. No raw prompt passthrough. Egress/process actions require explicit confirmation. This must remain optional and must not change normal OMG installation.
3. **Human gate controls.** List Q12 gates and permit explicit human approve/deny using `gate_id` with `expectedSessionId`. Never infer authority from question text or transient presentation IDs; never auto-approve.
4. **Gajae App integration.** Import the shared OMG catalog and attach to existing GJC sessions through `SdkClient`. Keep endpoint tokens server-side and expose only redacted normalized state to the browser.
5. **Embedding only for app-owned sessions.** Use `@gajae-code/coding-agent` only when Gajae App deliberately owns session creation, auth, persistence, tools, and disposal. Do not replace attached CLI sessions with an embedded runtime.

For fleet scheduling and cross-repository orchestration, evaluate GJC Coordinator MCP rather than expanding this lab into a daemon or scheduler.

## Security boundary

- Loopback WebSocket only.
- Linux-only until equivalent descriptor-bound ACL and owner validation exists on other platforms.
- Discovery reads are bound to a private parent and one no-follow file descriptor.
- Discovery token never logged, serialized, stored in argv, or sent to a browser.
- No SDK mutation authority in the lab.
- No arbitrary query names.
- No automatic reconnect replay of mutations in future phases.
- Generic `reply` uses the active transient action ID; durable workflow controls use Q12 `gate_id` plus `expectedSessionId`.
- Normal disposable OMG reviewer processes still set both `GJC_NOTIFICATIONS=0` and `GJC_SDK_DISABLE=1`; this lab intentionally attaches only to sessions where SDK hosting is enabled.
