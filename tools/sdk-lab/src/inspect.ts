import { constants, type Stats } from "node:fs";
import { open, readdir, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { SdkClient } from "@gajae-code/bridge-client";

const MAX_DEPTH = 4;
const MAX_ITEMS = 50;
const MAX_STRING = 512;
const MAX_DISCOVERY_BYTES = 64 * 1024;
const MAX_QUERY_BYTES = 16 * 1024 * 1024;
const MAX_QUERY_ITEMS = 20_000;
const MAX_QUERY_PAGES = 64;
const DISCOVERY_KEYS = new Set([
  "version",
  "sessionId",
  "pid",
  "host",
  "port",
  "url",
  "token",
  "startedAt",
  "updatedAt",
  "stale",
  "stoppedAt",
  "lifecycleRequestId",
  "startupPromptRef",
  "intendedSessionId",
]);

type JsonObject = Record<string, unknown>;

export type DiscoveryRecord = {
  version: 1;
  sessionId: string;
  pid: number;
  host: "127.0.0.1";
  port: number;
  url: string;
  token: string;
  startedAt: number;
  updatedAt: number;
  stale: false;
};

export type InspectionSummary = {
  session: Record<string, unknown>;
  protocol: Record<string, unknown>;
  context: Record<string, unknown>;
  models: Record<string, unknown>;
  gates: Record<string, unknown>;
};

export class InspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectionError";
  }
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InspectionError(`Discovery field ${name} must be a non-empty string.`);
  }
  return value;
}

function requireInteger(
  value: unknown,
  name: string,
  options: { positive?: boolean; max?: number } = {},
): number {
  const minimum = options.positive ? 1 : 0;
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || (options.max !== undefined && value > options.max)
  ) {
    throw new InspectionError(`Discovery field ${name} is outside its supported integer domain.`);
  }
  return value;
}

function validateOptionalText(record: JsonObject, name: string): void {
  if (record[name] !== undefined && typeof record[name] !== "string") {
    throw new InspectionError(`Discovery field ${name} must be a string when present.`);
  }
}

export function parseDiscovery(value: unknown): DiscoveryRecord {
  const record = asObject(value);
  if (!record) throw new InspectionError("Discovery JSON must be an object.");
  if (Object.keys(record).some((key) => !DISCOVERY_KEYS.has(key))) {
    throw new InspectionError("Discovery JSON contains fields outside the GJC v0.11 schema.");
  }

  if (record.version !== 1) throw new InspectionError("Discovery field version must be exactly 1 for GJC v0.11.");
  const sessionId = requireText(record.sessionId, "sessionId");
  const pid = requireInteger(record.pid, "pid", { positive: true, max: 0xffff_ffff });
  if (record.host !== "127.0.0.1") throw new InspectionError("Discovery field host must be 127.0.0.1.");
  const port = requireInteger(record.port, "port", { positive: true, max: 65_535 });
  const url = requireText(record.url, "url");
  const token = requireText(record.token, "token");
  const startedAt = requireInteger(record.startedAt, "startedAt");
  const updatedAt = requireInteger(record.updatedAt, "updatedAt");
  const stoppedAt = record.stoppedAt === undefined
    ? undefined
    : requireInteger(record.stoppedAt, "stoppedAt");
  for (const name of ["lifecycleRequestId", "startupPromptRef", "intendedSessionId"]) {
    validateOptionalText(record, name);
  }
  if (updatedAt < startedAt) throw new InspectionError("Discovery updatedAt must not precede startedAt.");
  if (record.stale !== false) throw new InspectionError("Discovery endpoint is marked stale.");
  if (stoppedAt !== undefined) throw new InspectionError("An active discovery endpoint must not have stoppedAt.");

  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new InspectionError("Discovery field url must be a valid loopback WebSocket URL.");
  }
  const urlPort = Number(endpoint.port);
  if (
    endpoint.protocol !== "ws:"
    || endpoint.hostname !== "127.0.0.1"
    || !Number.isInteger(urlPort)
    || urlPort !== port
    || endpoint.username !== ""
    || endpoint.password !== ""
    || (endpoint.pathname !== "" && endpoint.pathname !== "/")
    || endpoint.search !== ""
    || endpoint.hash !== ""
  ) {
    throw new InspectionError("Discovery field url must use ws://127.0.0.1:<port>.");
  }

  return {
    version: 1,
    sessionId,
    pid,
    host: "127.0.0.1",
    port,
    url,
    token,
    startedAt,
    updatedAt,
    stale: false,
  };
}

export function redactToken(message: string, token?: string): string {
  let redacted = message.replace(/([?&]token=)[^&\s]*/gi, "$1[redacted]");
  if (token) redacted = redacted.split(token).join("[redacted]");
  return redacted;
}

export function redactJson(value: unknown, token: string): unknown {
  if (typeof value === "string") return redactToken(value, token);
  if (Array.isArray(value)) return value.map((item) => redactJson(item, token));
  const object = asObject(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, redactJson(item, token)]),
  );
}

function assertLinux(): void {
  if (process.platform !== "linux" || typeof process.getuid !== "function") {
    throw new InspectionError("Secure SDK discovery inspection is supported on Linux only.");
  }
}

function assertPrivateStats(info: Stats, kind: "directory" | "file"): void {
  if (kind === "directory" ? !info.isDirectory() : !info.isFile()) {
    throw new InspectionError(`Discovery ${kind} has an unsupported file type.`);
  }
  if (info.uid !== process.getuid!()) {
    throw new InspectionError(`Discovery ${kind} must be owned by the current user.`);
  }
  if ((info.mode & 0o077) !== 0) {
    throw new InspectionError(`Discovery ${kind} must not grant group or other permissions.`);
  }
  if (kind === "file" && info.size > MAX_DISCOVERY_BYTES) {
    throw new InspectionError("Discovery file exceeds the safe size limit.");
  }
}

async function openSafeDiscoveryFile(path: string): Promise<FileHandle> {
  assertLinux();
  const absolute = resolve(path);
  let parent: FileHandle;
  try {
    parent = await open(
      dirname(absolute),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch {
    throw new InspectionError("Discovery directory does not exist, is unsafe, or cannot be read.");
  }

  try {
    assertPrivateStats(await parent.stat(), "directory");
    let file: FileHandle;
    try {
      file = await open(
        `/proc/self/fd/${parent.fd}/${basename(absolute)}`,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch {
      throw new InspectionError("Discovery file does not exist, cannot be read, or is a symbolic link.");
    }
    try {
      assertPrivateStats(await file.stat(), "file");
      return file;
    } catch (error) {
      await file.close();
      throw error;
    }
  } finally {
    await parent.close();
  }
}

export async function assertSafeDiscoveryFile(path: string): Promise<void> {
  const file = await openSafeDiscoveryFile(path);
  await file.close();
}

async function readSafeDiscoveryFile(path: string): Promise<string> {
  const file = await openSafeDiscoveryFile(path);
  try {
    const buffer = Buffer.alloc(MAX_DISCOVERY_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > MAX_DISCOVERY_BYTES) {
      throw new InspectionError("Discovery file exceeds the safe size limit.");
    }
    return buffer.subarray(0, offset).toString("utf8");
  } finally {
    await file.close();
  }
}

async function discoverCandidatePaths(cwd = process.cwd()): Promise<string[]> {
  const directory = join(cwd, ".gjc", "state", "sdk");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new InspectionError("No SDK discovery directory found at .gjc/state/sdk; pass --endpoint <discovery.json>.");
  }

  const candidates: Array<{ path: string; updatedAt: number }> = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".json") || !entry.isFile()) continue;
    const path = join(directory, entry.name);
    try {
      const discovery = await loadDiscovery(path);
      candidates.push({ path, updatedAt: discovery.updatedAt });
    } catch (error) {
      if (error instanceof InspectionError) continue;
      throw error;
    }
  }
  candidates.sort((a, b) => b.updatedAt - a.updatedAt || a.path.localeCompare(b.path));
  if (!candidates[0]) throw new InspectionError("No valid private SDK discovery JSON file found; pass --endpoint <discovery.json>.");
  return candidates.map((candidate) => candidate.path);
}

export async function discoverLatest(cwd = process.cwd()): Promise<string> {
  return (await discoverCandidatePaths(cwd))[0]!;
}

export async function loadDiscovery(path: string): Promise<DiscoveryRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readSafeDiscoveryFile(path));
  } catch (error) {
    if (error instanceof InspectionError) throw error;
    throw new InspectionError("Discovery file contains invalid JSON.");
  }
  const discovery = parseDiscovery(parsed);
  if (basename(path) !== `${discovery.sessionId}.json`) {
    throw new InspectionError("Discovery filename must match its sessionId.");
  }
  assertLiveProcess(discovery.pid);
  return discovery;
}

function assertLiveProcess(pid: number): void {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") {
      throw new InspectionError("Discovery endpoint process is not running.");
    }
  }
}

export function boundedJson(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => boundedJson(item, depth + 1));
  const object = asObject(value);
  if (!object) return String(value).slice(0, MAX_STRING);
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, item]) => item !== undefined)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key.slice(0, 128), boundedJson(item, depth + 1)]),
  );
}

function countLike(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  const object = asObject(value);
  if (!object) return 0;
  for (const key of ["count", "total", "items", "entries", "models", "gates", "pending", "quarantined"]) {
    const candidate = object[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
}

function firstDefined(object: JsonObject | null, keys: string[]): unknown {
  if (!object) return undefined;
  for (const key of keys) if (object[key] !== undefined) return object[key];
  return undefined;
}

function queryItems(value: unknown): unknown[] {
  const object = asObject(value);
  const page = asObject(object?.page);
  return Array.isArray(page?.items) ? page.items : [];
}

function queryItem(value: unknown): JsonObject | null {
  return asObject(queryItems(value)[0]) ?? asObject(value);
}

export type AllowedQuery =
  | "session.metadata"
  | "context.get"
  | "models.list"
  | "workflow.gates.list";

const ALLOWED_QUERY_NAMES = new Set<AllowedQuery>([
  "session.metadata",
  "context.get",
  "models.list",
  "workflow.gates.list",
]);

type QueryClient = Pick<SdkClient, "query">;

function normalizeScalarItems(query: AllowedQuery, items: unknown[]): unknown[] {
  const first = asObject(items[0]);
  const chunked = first
    && typeof first.body === "string"
    && Number.isSafeInteger(first.byteOffset)
    && typeof first.complete === "boolean";

  if (!chunked) {
    if (items.length !== 1) {
      throw new InspectionError(`SDK query ${query} must return exactly one snapshot.`);
    }
    return items;
  }

  let body = "";
  let byteOffset = 0;
  for (const item of items) {
    const chunk = asObject(item);
    if (
      !chunk
      || typeof chunk.body !== "string"
      || chunk.byteOffset !== byteOffset
      || typeof chunk.complete !== "boolean"
    ) {
      throw new InspectionError(`SDK query ${query} returned invalid scalar chunks.`);
    }
    body += chunk.body;
    byteOffset += Buffer.byteLength(chunk.body);
  }
  if (asObject(items.at(-1))?.complete !== true) {
    throw new InspectionError(`SDK query ${query} returned incomplete scalar chunks.`);
  }

  try {
    return [JSON.parse(body)];
  } catch {
    throw new InspectionError(`SDK query ${query} returned malformed scalar JSON.`);
  }
}

export async function queryComplete(client: QueryClient, query: AllowedQuery): Promise<unknown> {
  if (!ALLOWED_QUERY_NAMES.has(query)) {
    throw new InspectionError("SDK query is outside the read-only allowlist.");
  }
  const items: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let revision: string | undefined;
  let totalBytes = 0;

  for (let pageNumber = 0; pageNumber < MAX_QUERY_PAGES; pageNumber += 1) {
    const response = await client.query(query, {}, cursor);
    let responseBytes: number;
    try {
      responseBytes = Buffer.byteLength(JSON.stringify(response));
    } catch {
      throw new InspectionError(`SDK query ${query} returned a non-JSON response.`);
    }
    totalBytes += responseBytes;
    if (totalBytes > MAX_QUERY_BYTES) {
      throw new InspectionError(`SDK query ${query} exceeded the response byte limit.`);
    }

    const envelope = asObject(response);
    const page = asObject(envelope?.page);
    if (
      envelope?.type !== "query_response"
      || envelope.ok !== true
      || !page
      || !Array.isArray(page.items)
      || typeof page.complete !== "boolean"
      || typeof page.revision !== "string"
      || page.revision === ""
    ) {
      throw new InspectionError(`SDK query ${query} returned an invalid v3 page.`);
    }
    if (revision !== undefined && page.revision !== revision) {
      throw new InspectionError(`SDK query ${query} changed revision while paging.`);
    }
    revision = page.revision;
    if (query === "session.metadata" || query === "context.get") {
      const chunk = asObject(page.items[0]);
      const isChunk = chunk
        && typeof chunk.body === "string"
        && Number.isSafeInteger(chunk.byteOffset)
        && typeof chunk.complete === "boolean";
      if (isChunk && (page.items.length !== 1 || chunk.complete !== page.complete)) {
        throw new InspectionError(`SDK query ${query} returned an inconsistent scalar chunk.`);
      }
    }
    items.push(...page.items);
    if (items.length > MAX_QUERY_ITEMS) {
      throw new InspectionError(`SDK query ${query} exceeded the item limit.`);
    }

    if (page.complete) {
      if (page.continuationCursor !== undefined) {
        throw new InspectionError(`SDK query ${query} returned a cursor after completion.`);
      }
      const completeItems = query === "session.metadata" || query === "context.get"
        ? normalizeScalarItems(query, items)
        : items;
      return {
        type: "query_response",
        ok: true,
        page: { items: completeItems, complete: true, revision },
      };
    }

    if (
      page.items.length === 0
      || typeof page.continuationCursor !== "string"
      || page.continuationCursor === ""
      || seenCursors.has(page.continuationCursor)
    ) {
      throw new InspectionError(`SDK query ${query} returned an invalid continuation cursor.`);
    }
    cursor = page.continuationCursor;
    seenCursors.add(cursor);
  }

  throw new InspectionError(`SDK query ${query} exceeded the page limit.`);
}

export function assertHello(hello: unknown): void {
  const frame = asObject(hello);
  if (
    frame?.type !== "hello"
    || frame.protocolVersion !== 3
    || !Array.isArray(frame.capabilities)
    || !frame.capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new InspectionError("SDK endpoint did not negotiate a valid v3 hello frame.");
  }
}

export function assertSessionMetadata(metadata: unknown, expectedSessionId: string): void {
  const actualSessionId = queryItem(metadata)?.sessionId;
  if (
    typeof actualSessionId !== "string"
    || actualSessionId === ""
    || actualSessionId !== expectedSessionId
  ) {
    throw new InspectionError("SDK session metadata does not match the discovery record.");
  }
}

export function summarizeInspection(
  hello: unknown,
  metadata: unknown,
  context: unknown,
  models: unknown,
  gates: unknown,
  fallbackSessionId: string,
): InspectionSummary {
  const helloObject = asObject(hello);
  const metadataObject = queryItem(metadata);
  const contextObject = queryItem(context);
  const modelItems = queryItems(models);
  const modelsObject = asObject(models);
  const gateList = queryItems(gates);
  const gatesObject = asObject(gates);
  const pending = gateList.filter((gate) => {
    const object = asObject(gate);
    return firstDefined(object, ["tag", "status", "state"]) === "pending";
  }).length || Number(firstDefined(gatesObject, ["pendingCount", "pending"]) ?? 0) || 0;
  const quarantined = gateList.filter((gate) => {
    const object = asObject(gate);
    const lifecycle = asObject(object?.lifecycle);
    return firstDefined(object, ["tag", "status", "state"]) === "quarantined"
      || lifecycle?.state === "quarantined";
  }).length || Number(firstDefined(gatesObject, ["quarantinedCount", "quarantined"]) ?? 0) || 0;
  const currentModel = modelItems.map(asObject).find((model) => model?.current === true);
  const currentModelId = currentModel
    ? [currentModel.provider, currentModel.id].filter((part) => typeof part === "string").join("/")
    : firstDefined(modelsObject, ["currentModel", "current", "selected"]);

  const queueDepth = ["steeringQueueDepth", "followupQueueDepth"]
    .map((key) => contextObject?.[key])
    .filter((value): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    .reduce((total, value) => total + value, 0);

  return {
    session: boundedJson({
      id: firstDefined(metadataObject, ["sessionId", "id"]) ?? fallbackSessionId,
      identity: firstDefined(metadataObject, ["identity", "name", "title"]),
    }) as Record<string, unknown>,
    protocol: boundedJson({
      version: firstDefined(helloObject, ["protocolVersion", "protocol_version", "version"]),
      capabilities: firstDefined(helloObject, ["capabilities"]),
    }) as Record<string, unknown>,
    context: boundedJson({
      status: firstDefined(contextObject, ["status", "state"])
        ?? (typeof contextObject?.isStreaming === "boolean" ? (contextObject.isStreaming ? "busy" : "idle") : undefined),
      count: queueDepth || countLike(contextObject),
    }) as Record<string, unknown>,
    models: boundedJson({
      count: modelItems.length || countLike(models),
      current: currentModelId || null,
    }) as Record<string, unknown>,
    gates: boundedJson({ pending, quarantined }) as Record<string, unknown>,
  };
}

function endpointArgument(args: string[]): string | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === "--endpoint" && args[1]) return args[1];
  throw new InspectionError("Usage: bun run inspect [--endpoint <discovery.json>].");
}

async function inspectPath(discoveryPath: string): Promise<InspectionSummary> {
  const discovery = await loadDiscovery(discoveryPath);
  let client: SdkClient | undefined;
  let unsubscribe: (() => void) | void;
  let hello: unknown;
  try {
    client = new SdkClient(discovery.url, discovery.token, {
      reconnectAttempts: 0,
      timeoutMs: 5_000,
    });
    unsubscribe = client.onFrame((frame) => {
      const frameObject = asObject(frame);
      if (!hello && frameObject?.type === "hello") hello = frame;
    });
    await client.connect();
    assertHello(hello);
    const [metadata, context, models, gates] = await Promise.all([
      queryComplete(client, "session.metadata"),
      queryComplete(client, "context.get"),
      queryComplete(client, "models.list"),
      queryComplete(client, "workflow.gates.list"),
    ]);
    assertSessionMetadata(metadata, discovery.sessionId);
    const summary = summarizeInspection(
      redactJson(hello, discovery.token),
      redactJson(metadata, discovery.token),
      redactJson(context, discovery.token),
      redactJson(models, discovery.token),
      redactJson(gates, discovery.token),
      discovery.sessionId,
    );
    return redactJson(summary, discovery.token) as InspectionSummary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "SDK inspection failed.";
    throw new InspectionError(redactToken(message, discovery.token));
  } finally {
    try {
      if (typeof unsubscribe === "function") unsubscribe();
      await client?.close();
    } catch {
      // A failed close must not hide a completed read-only inspection.
    }
  }
}

export async function inspect(endpoint?: string, cwd = process.cwd()): Promise<InspectionSummary> {
  if (endpoint) return await inspectPath(resolve(cwd, endpoint));

  const candidates = await discoverCandidatePaths(cwd);
  for (const candidate of candidates) {
    try {
      return await inspectPath(candidate);
    } catch (error) {
      if (!(error instanceof InspectionError)) throw error;
    }
  }
  throw new InspectionError("No discovered SDK endpoint completed authenticated read-only inspection.");
}

if (import.meta.main) {
  try {
    const summary = await inspect(endpointArgument(Bun.argv.slice(2)));
    console.log(JSON.stringify(summary));
  } catch (error) {
    const message = error instanceof Error ? error.message : "SDK inspection failed.";
    console.error(redactToken(message));
    process.exitCode = 1;
  }
}
