import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  InspectionError,
  assertHello,
  assertSafeDiscoveryFile,
  assertSessionMetadata,
  boundedJson,
  discoverLatest,
  loadDiscovery,
  queryComplete,
  redactJson,
  parseDiscovery,
  redactToken,
  summarizeInspection,
} from "../src/inspect";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "omg-sdk-lab-"));
  temporaryDirectories.push(directory);
  return directory;
}
const VALID_DISCOVERY = {
  version: 1,
  sessionId: "session-1",
  pid: process.pid,
  host: "127.0.0.1",
  port: 43123,
  url: "ws://127.0.0.1:43123",
  token: "secret-token",
  startedAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  stale: false,
} as const;

describe("discovery validation", () => {
  test("accepts a loopback discovery record", () => {
    expect(parseDiscovery(VALID_DISCOVERY)).toEqual(VALID_DISCOVERY);
  });

  test("rejects a remote discovery URL", () => {
    expect(() => parseDiscovery({
      ...VALID_DISCOVERY,
      url: "ws://192.0.2.10:43123",
    })).toThrow(InspectionError);
  });

  test("rejects discovery URLs with path or query components", () => {
    for (const url of [
      "ws://127.0.0.1:43123/control",
      "ws://127.0.0.1:43123/?token=must-not-be-accepted",
    ]) {
      expect(() => parseDiscovery({ ...VALID_DISCOVERY, url })).toThrow(InspectionError);
    }
  });

  test("rejects stale discovery records and mismatched ports", () => {
    expect(() => parseDiscovery({ ...VALID_DISCOVERY, stale: true })).toThrow("marked stale");
    expect(() => parseDiscovery({
      ...VALID_DISCOVERY,
      url: "ws://127.0.0.1:43124",
    })).toThrow("ws://127.0.0.1:<port>");
  });

  test("rejects unknown, contradictory, and out-of-domain schema fields", () => {
    expect(() => parseDiscovery({ ...VALID_DISCOVERY, unexpected: true })).toThrow("outside the GJC v0.11 schema");
    expect(() => parseDiscovery({ ...VALID_DISCOVERY, stoppedAt: VALID_DISCOVERY.updatedAt })).toThrow(
      "must not have stoppedAt",
    );
    expect(() => parseDiscovery({ ...VALID_DISCOVERY, pid: 0x1_0000_0000 })).toThrow("integer domain");
    expect(parseDiscovery({ ...VALID_DISCOVERY, lifecycleRequestId: "request-1" })).toEqual(VALID_DISCOVERY);
  });

  test("requires the discovery filename to match the session", async () => {
    const directory = await temporaryDirectory();
    const endpoint = join(directory, "wrong-session.json");
    await writeFile(endpoint, JSON.stringify(VALID_DISCOVERY), { mode: 0o600 });
    await expect(loadDiscovery(endpoint)).rejects.toThrow("filename must match");
  });

  test("rejects group-readable discovery files", async () => {
    if (process.platform !== "linux") return;
    const directory = await temporaryDirectory();
    const endpoint = join(directory, "endpoint.json");
    await writeFile(endpoint, "{}", { mode: 0o600 });
    await chmod(endpoint, 0o640);
    await expect(assertSafeDiscoveryFile(endpoint)).rejects.toThrow("group or other permissions");
  });

  test("rejects oversized discovery files", async () => {
    if (process.platform !== "linux") return;
    const directory = await temporaryDirectory();
    const endpoint = join(directory, "endpoint.json");
    await writeFile(endpoint, "x".repeat(64 * 1024 + 1), { mode: 0o600 });
    await expect(assertSafeDiscoveryFile(endpoint)).rejects.toThrow("size limit");
  });

  test("rejects non-private discovery directories", async () => {
    if (process.platform !== "linux") return;
    const directory = await temporaryDirectory();
    const endpoint = join(directory, "endpoint.json");
    await writeFile(endpoint, "{}", { mode: 0o600 });
    await chmod(directory, 0o750);
    await expect(assertSafeDiscoveryFile(endpoint)).rejects.toThrow("directory must not grant");
  });

  test("rejects symbolic-link discovery files", async () => {
    const directory = await temporaryDirectory();
    const target = join(directory, "target.json");
    const endpoint = join(directory, "endpoint.json");
    await writeFile(target, "{}", { mode: 0o600 });
    await symlink(target, endpoint);
    await expect(assertSafeDiscoveryFile(endpoint)).rejects.toThrow("symbolic link");
  });

  test("selects the newest valid discovery record", async () => {
    const cwd = await temporaryDirectory();
    const directory = join(cwd, ".gjc", "state", "sdk");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const older = { ...VALID_DISCOVERY, updatedAt: VALID_DISCOVERY.updatedAt + 1 };
    const newer = {
      ...VALID_DISCOVERY,
      sessionId: "session-2",
      port: 43124,
      url: "ws://127.0.0.1:43124",
      updatedAt: VALID_DISCOVERY.updatedAt + 2,
    };
    await writeFile(join(directory, "session-1.json"), JSON.stringify(older), { mode: 0o600 });
    await writeFile(join(directory, "session-2.json"), JSON.stringify(newer), { mode: 0o600 });
    await writeFile(join(directory, "newest-but-stale.json"), JSON.stringify({
      ...newer,
      sessionId: "newest-but-stale",
      stale: true,
      updatedAt: VALID_DISCOVERY.updatedAt + 3,
    }), { mode: 0o600 });

    expect(await discoverLatest(cwd)).toBe(join(directory, "session-2.json"));
  });
});

test("redacts tokens from error text", () => {
  const token = "only-for-this-test";
  const output = redactToken(`connection failed for ${token}: ws://127.0.0.1:1?token=${token}`, token);
  expect(output).not.toContain(token);
  expect(output).toContain("[redacted]");
});

test("redacts the exact token from successful JSON output", () => {
  const token = "actual-discovery-secret";
  const output = redactJson({
    identity: `prefix-${token}-suffix`,
    capabilities: [token],
    model: { id: token },
  }, token);
  expect(JSON.stringify(output)).not.toContain(token);
  expect(JSON.stringify(output)).toContain("[redacted]");
});

test("validates the negotiated SDK hello frame", () => {
  expect(() => assertHello({ type: "hello", protocolVersion: 3, capabilities: ["context"] })).not.toThrow();
  expect(() => assertHello({ type: "hello", protocolVersion: 4, capabilities: [] })).toThrow("valid v3 hello");
});

test("requires queried metadata to match the discovery session", () => {
  const metadata = {
    type: "query_response",
    page: { items: [{ sessionId: "session-1" }] },
  };
  expect(() => assertSessionMetadata(metadata, "session-1")).not.toThrow();
  expect(() => assertSessionMetadata(metadata, "session-2")).toThrow("does not match");
  expect(() => assertSessionMetadata({ type: "query_response", page: { items: [] } }, "session-1")).toThrow(
    "does not match",
  );
  expect(() => assertSessionMetadata({
    type: "query_response",
    page: { items: [{ id: "session-1" }] },
  }, "session-1")).toThrow("does not match");
});

test("follows bounded query pages and preserves one revision", async () => {
  const cursors: Array<string | undefined> = [];
  const responses = [
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{ provider: "openai", id: "one" }],
        complete: false,
        continuationCursor: "cursor-2",
        revision: "revision-1",
      },
    },
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{ provider: "openai", id: "two" }],
        complete: true,
        revision: "revision-1",
      },
    },
  ];
  const client = {
    async query(_query: string, _input: Record<string, unknown>, cursor?: string): Promise<unknown> {
      cursors.push(cursor);
      return responses.shift();
    },
  };

  const response = await queryComplete(client, "models.list") as {
    page: { items: unknown[]; complete: boolean; revision: string };
  };
  expect(cursors).toEqual([undefined, "cursor-2"]);
  expect(response.page).toEqual({
    items: [
      { provider: "openai", id: "one" },
      { provider: "openai", id: "two" },
    ],
    complete: true,
    revision: "revision-1",
  });
});

test("rejects non-allowlisted queries and revision drift", async () => {
  let called = false;
  const unusedClient = {
    async query(): Promise<unknown> {
      called = true;
      return undefined;
    },
  };
  await expect(queryComplete(
    unusedClient,
    "transcript.body" as Parameters<typeof queryComplete>[1],
  )).rejects.toThrow("outside the read-only allowlist");
  expect(called).toBe(false);

  const responses = [
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{ id: "one" }],
        complete: false,
        continuationCursor: "cursor-2",
        revision: "revision-1",
      },
    },
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{ id: "two" }],
        complete: true,
        revision: "revision-2",
      },
    },
  ];
  const driftingClient = {
    async query(): Promise<unknown> {
      return responses.shift();
    },
  };
  await expect(queryComplete(driftingClient, "workflow.gates.list")).rejects.toThrow("changed revision");
});

test("reconstructs paged scalar snapshots", async () => {
  const snapshot = JSON.stringify({ sessionId: "session-1", title: "한글" });
  const firstBody = snapshot.slice(0, 20);
  const secondBody = snapshot.slice(20);
  const responses = [
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{ byteOffset: 0, body: firstBody, complete: false }],
        complete: false,
        continuationCursor: "cursor-2",
        revision: "revision-1",
      },
    },
    {
      type: "query_response",
      ok: true,
      page: {
        items: [{
          byteOffset: Buffer.byteLength(firstBody),
          body: secondBody,
          complete: true,
        }],
        complete: true,
        revision: "revision-1",
      },
    },
  ];
  const client = {
    async query(): Promise<unknown> {
      return responses.shift();
    },
  };

  const response = await queryComplete(client, "session.metadata") as {
    page: { items: unknown[] };
  };
  expect(response.page.items).toEqual([{ sessionId: "session-1", title: "한글" }]);
});

test("produces bounded summaries from representative query shapes", () => {
  const veryLong = "x".repeat(1_000);
  const summary = summarizeInspection(
    { type: "hello", protocolVersion: 3, capabilities: ["read", "metadata"] },
    { type: "query_response", ok: true, page: { complete: true, items: [{ sessionId: "session-1", title: veryLong }] } },
    { type: "query_response", ok: true, page: { complete: true, items: [{ isStreaming: false, steeringQueueDepth: 1, followupQueueDepth: 1, items: [{ id: 1 }, { id: 2 }] }] } },
    { type: "query_response", ok: true, page: { complete: true, items: [{ provider: "openai", id: "one" }, { provider: "openai", id: "two", current: true }] } },
    { type: "query_response", ok: true, page: { complete: true, items: [{ tag: "pending" }, { tag: "quarantined", lifecycle: { state: "quarantined" } }, { tag: "complete" }] } },
    "fallback-session",
  );

  expect(summary).toEqual({
    session: { id: "session-1", identity: veryLong.slice(0, 512) },
    protocol: { version: 3, capabilities: ["read", "metadata"] },
    context: { status: "idle", count: 2 },
    models: { count: 2, current: "openai/two" },
    gates: { pending: 1, quarantined: 1 },
  });
  expect(JSON.stringify(summary)).not.toContain("token");
  expect(JSON.stringify(boundedJson({ nested: { a: { b: { c: { d: "hidden" } } } } }))).toContain("[truncated]");
});
