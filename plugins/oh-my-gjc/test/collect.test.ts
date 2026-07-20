import { describe, expect, it } from "bun:test";
import { gzipSync } from "node:zlib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyResolved,
	applyStaleFlags,
	classifyLogEntry,
	extractSessionSignals,
	fingerprint,
	type GroupedCandidate,
	isNoise,
	loadResolved,
	mergeGroups,
	redact,
	redactValue,
	type ResolvedEntry,
	resolvedRef,
	scanLogFile,
} from "../bin/collect";

const gjcErr = {
	timestamp: "2026-07-03T00:05:12.326+09:00",
	level: "error",
	pid: 717893,
	message: "Cleanup invoked recursively",
	stack: "Error\n    at runCleanup (/$bunfs/root/gjc-linux-x64:115456:77)\n    at exit (unknown)",
};

describe("gjc-bugwatch classify", () => {
	it("flags an error with a gjc-internal stack as high-severity gjc-internal", () => {
		const c = classifyLogEntry(gjcErr);
		expect(c).not.toBeNull();
		expect(c?.category).toBe("gjc-internal");
		expect(c?.severity).toBe("high");
		expect(c?.sampleStackTop).toContain("runCleanup");
	});

	it("treats a plain error (no internal stack) as medium", () => {
		const c = classifyLogEntry({ level: "error", message: "something odd happened", pid: 1 });
		expect(c?.category).toBe("error");
		expect(c?.severity).toBe("medium");
	});

	it("drops debug/info and empty-message lines", () => {
		expect(classifyLogEntry({ level: "debug", message: "Usage fetch queued" })).toBeNull();
		expect(classifyLogEntry({ level: "error", message: "" })).toBeNull();
	});

	it("hides env/credential noise by default but keeps it with includeNoise", () => {
		const noise = {
			level: "warn",
			message: "model discovery failed for provider",
			provider: "llama.cpp",
			error: "Unable to connect. Is the computer able to access the url?",
		};
		expect(classifyLogEntry(noise)).toBeNull();
		expect(classifyLogEntry(noise, true)).not.toBeNull();
	});
});

describe("gjc-bugwatch noise + redaction", () => {
	it("classifies known environmental messages as noise", () => {
		expect(isNoise("model discovery failed for provider")).toBe(true);
		expect(isNoise("Kimi token refresh failed: 400")).toBe(true);
		expect(isNoise("Cleanup invoked recursively")).toBe(false);
	});

	it("redacts emails, uuids, tokens, and creds-in-url", () => {
		const r = redact("user devswha@gmail.com id 019f26c8-bfb6-7000-80e3-d1e1b5c68a6b Bearer abcdef1234567890");
		expect(r).toContain("<email>");
		expect(r).toContain("<uuid>");
		expect(r).toContain("<redacted>");
		expect(r).not.toContain("devswha@gmail.com");
	});
});

describe("gjc-bugwatch fingerprint + grouping", () => {
	it("collapses the same bug across pids/timestamps/line-cols into one fingerprint", () => {
		const a = fingerprint("gjc-internal", "Cleanup invoked recursively", "at runCleanup (/$bunfs/root/gjc-linux-x64:115456:77)");
		const b = fingerprint("gjc-internal", "Cleanup invoked recursively", "at runCleanup (/$bunfs/root/gjc-linux-x64:99999:12)");
		expect(a).toBe(b);
	});

	it("distinguishes different messages", () => {
		expect(fingerprint("error", "boom A")).not.toBe(fingerprint("error", "boom B"));
	});

	it("mergeGroups sorts high-severity first and sums counts", () => {
		const merged = mergeGroups([
			{ fingerprint: "low1", category: "warn", severity: "low", message: "w", source: "log", count: 5, sample: {} },
			{ fingerprint: "hi1", category: "gjc-internal", severity: "high", message: "e", source: "log", count: 1, sample: {} },
			{ fingerprint: "hi1", category: "gjc-internal", severity: "high", message: "e", source: "session", count: 2, sample: {} },
		]);
		expect(merged[0].severity).toBe("high");
		expect(merged[0].count).toBe(3);
	});
});

describe("gjc-bugwatch session extraction", () => {
	it("pulls an uncaught-exception header embedded in a session message entry", () => {
		const entry = {
			type: "message",
			content: [{ type: "text", text: "[Uncaught Exception] TypeError: Unknown option '--verbose'\n    at parseArgs (unknown)" }],
		};
		const sigs = extractSessionSignals(entry);
		expect(sigs.length).toBe(1);
		expect(sigs[0].category).toBe("gjc-internal");
		expect(sigs[0].source).toBe("session");
		expect(sigs[0].message).toContain("Unknown option");
	});

	it("captures explicit tool-error markers only with --all", () => {
		const entry = { isError: true, message: "edit anchor mismatch" };
		expect(extractSessionSignals(entry)).toEqual([]);
		const sigs = extractSessionSignals(entry, true);
		expect(sigs[0].category).toBe("error");
		expect(sigs[0].message).toContain("anchor mismatch");
	});

	it("does NOT flag source code the agent merely read (false-positive guard)", () => {
		const entry = {
			type: "message",
			content: [
				{ type: "text", text: '212│\t\tthrow new Error("--default requires --mpreset <name>");' },
				{ type: "text", text: 'import { SearchProviderError } from "../../../web/search/types";' },
				{ type: "text", text: 'packages/coding-agent/src/config/model-registry.ts:126: color: "error"' },
			],
		};
		expect(extractSessionSignals(entry)).toEqual([]);
	});

	it("ignores ordinary content", () => {
		expect(extractSessionSignals({ type: "message", content: [{ type: "text", text: "all good, tests pass" }] })).toEqual([]);
	});
});

describe("gjc-bugwatch gzip + stale", () => {
	it("scanLogFile reads a rotated .log.gz the same as a plain .log", () => {
		const dir = mkdtempSync(join(tmpdir(), "bw-gz-"));
		const jsonl =
			JSON.stringify({ level: "error", pid: 1, message: "Cleanup invoked recursively", stack: "at runCleanup (/$bunfs/root/gjc-x:1:1)" }) +
			"\n";
		const gzPath = join(dir, "gjc.2026-06-01.log.gz");
		writeFileSync(gzPath, gzipSync(Buffer.from(jsonl)));
		const groups = scanLogFile(gzPath);
		expect(groups.length).toBe(1);
		expect(groups[0].category).toBe("gjc-internal");
		expect(groups[0].message).toBe("Cleanup invoked recursively");
	});

	it("applyStaleFlags marks candidates older than freshDays and computes age", () => {
		const now = Date.parse("2026-07-04T00:00:00Z");
		const mk = (lastSeen: string): GroupedCandidate => ({
			fingerprint: lastSeen,
			category: "error",
			severity: "medium",
			message: "x",
			source: "log",
			count: 1,
			lastSeen,
			sample: {},
		});
		const fresh = mk("2026-07-03T12:00:00Z"); // ~12h ago
		const old = mk("2026-07-01T00:00:00Z"); // 3d ago
		applyStaleFlags([fresh, old], now, 2);
		expect(fresh.stale).toBe(false);
		expect(old.stale).toBe(true);
		expect(old.lastSeenDaysAgo).toBe(3);
	});

	it("applyStaleFlags leaves candidates without a timestamp unflagged", () => {
		const g: GroupedCandidate = { fingerprint: "n", category: "warn", severity: "low", message: "x", source: "log", count: 1, sample: {} };
		applyStaleFlags([g], Date.now(), 2);
		expect(g.stale).toBeUndefined();
	});
});

describe("gjc-bugwatch resolved ledger", () => {
	const mk = (fingerprint: string, over: Partial<GroupedCandidate> = {}): GroupedCandidate => ({
		fingerprint,
		category: "gjc-internal",
		severity: "high",
		message: "x",
		source: "log",
		count: 1,
		sample: {},
		...over,
	});

	it("resolvedRef prefers explicit ref, else builds from issue/pr", () => {
		expect(resolvedRef({ fingerprint: "a", ref: "#1462 / PR #1465" })).toBe("#1462 / PR #1465");
		expect(resolvedRef({ fingerprint: "a", issue: 1462, pr: 1465 })).toBe("#1462 / PR #1465");
		expect(resolvedRef({ fingerprint: "a", issue: 1470 })).toBe("#1470");
		expect(resolvedRef({ fingerprint: "a" })).toBe("");
	});

	it("applyResolved tags only matching fingerprints and sets the ref", () => {
		const hit = mk("fp-fixed");
		const miss = mk("fp-live");
		const ledger = new Map<string, ResolvedEntry>([["fp-fixed", { fingerprint: "fp-fixed", issue: 1462, pr: 1465 }]]);
		applyResolved([hit, miss], ledger);
		expect(hit.resolved).toBe(true);
		expect(hit.resolvedRef).toBe("#1462 / PR #1465");
		expect(miss.resolved).toBeUndefined();
		expect(miss.resolvedRef).toBeUndefined();
	});

	it("applyResolved is a no-op on an empty ledger", () => {
		const g = mk("fp");
		applyResolved([g], new Map());
		expect(g.resolved).toBeUndefined();
	});

	it("loadResolved parses a jsonl ledger and skips blank/corrupt lines", () => {
		const dir = mkdtempSync(join(tmpdir(), "bw-resolved-"));
		const path = join(dir, "resolved.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({ fingerprint: "fp-1", issue: 1462, pr: 1465 }),
				"",
				"{ not valid json",
				JSON.stringify({ noFingerprint: true }),
				JSON.stringify({ fingerprint: "fp-2", ref: "#1470" }),
			].join("\n") + "\n",
		);
		const map = loadResolved(path);
		expect(map.size).toBe(2);
		expect(map.get("fp-1")?.pr).toBe(1465);
		expect(map.get("fp-2")?.ref).toBe("#1470");
	});

	it("loadResolved returns an empty map when the ledger file is missing", () => {
		expect(loadResolved(join(tmpdir(), "bw-nope", "resolved.jsonl")).size).toBe(0);
	});
});

describe("gjc-bugwatch redaction hardening (C-1/H-1/H-2)", () => {
	it("redact scrubs additional credential shapes that used to leak", () => {
		expect(redact("Authorization: Basic dXNlcjpwYXNzd29yZA==")).not.toContain("dXNlcjpwYXNzd29yZA");
		expect(redact("api_key=AKfycb1234567890abcdef")).toContain("<redacted>");
		expect(redact("password: hunter2")).toContain("<redacted>");
		expect(redact("client_secret=abc123")).toContain("<redacted>");
		expect(redact("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N")).toContain("<jwt>");
		expect(redact("key AKIAIOSFODNN7EXAMPLE here")).toContain("<aws-key>");
		expect(redact("token ghp_ABCDEFabcdef0123456789ABCDEFabcdef here")).toContain("<gh-token>");
		expect(redact("short token=abc123")).not.toContain("abc123");
	});

	it("redact scrubs suffixed key names and JSON-in-string payloads (G003 review)", () => {
		expect(redact("session_secret=a1b2c3d4e5f6")).not.toContain("a1b2c3d4e5f6");
		expect(redact("x_api_key: zZ9y8x7w6v")).not.toContain("zZ9y8x7w6v");
		expect(redact('body {"session_secret":"a1b2c3d4e5f6"}')).not.toContain("a1b2c3d4e5f6");
		expect(redact('{"token":"abcqrs123"}')).not.toContain("abcqrs123");
		// escaped JSON-in-string (literal backslashes in the payload) and JSON5 single quotes
		expect(redact('{\\"x-api-key\\":\\"escape987\\"}')).not.toContain("escape987");
		expect(redact("body {\\\"session_secret\\\":\\\"esc456\\\"}")).not.toContain("esc456");
		expect(redact("'session_secret': 'v1secretx'")).not.toContain("v1secretx");
	});

	it("redact still covers the original formats (no regression)", () => {
		const r = redact("user devswha@gmail.com id 019f26c8-bfb6-7000-80e3-d1e1b5c68a6b Bearer abcdef1234567890");
		expect(r).toContain("<email>");
		expect(r).toContain("<uuid>");
		expect(r).toContain("<redacted>");
		expect(r).not.toContain("devswha@gmail.com");
		expect(redact("https://user:s3cr3t@host.example/path")).toBe("<url-with-creds>");
	});

	it("redactValue scrubs string values and drops secret-named keys in a nested object", () => {
		const out = redactValue({
			message: "login for devswha@gmail.com failed",
			authorization: "Bearer abcdef1234567890",
			nested: { password: "hunter2", note: "id 019f26c8-bfb6-7000-80e3-d1e1b5c68a6b" },
			count: 3,
		}) as Record<string, any>;
		expect(out.message).not.toContain("devswha@gmail.com");
		expect(out.authorization).toBe("<redacted>");
		expect(out.nested.password).toBe("<redacted>");
		expect(out.nested.note).toContain("<uuid>");
		expect(out.count).toBe(3); // non-strings pass through untouched
	});

	it("scanLogFile stores a redacted sample — no raw secret reaches --json/spool (C-1)", () => {
		const dir = mkdtempSync(join(tmpdir(), "bw-sample-"));
		const path = join(dir, "gjc.2026-07-06.log");
		writeFileSync(
			path,
			JSON.stringify({
				level: "error",
				pid: 1,
				message: "request failed for devswha@gmail.com",
				token: "sk-abcdef1234567890",
				stack: "Error\n    at boom (/$bunfs/root/gjc-x:1:1)",
			}) + "\n",
		);
		const [g] = scanLogFile(path);
		const dumped = JSON.stringify(g.sample);
		expect(dumped).not.toContain("devswha@gmail.com");
		expect(dumped).not.toContain("sk-abcdef1234567890");
	});

	it("fingerprint no longer carries a raw email from the message (H-1)", () => {
		const c = classifyLogEntry({ level: "error", message: "boom for devswha@gmail.com", pid: 1 });
		expect(c?.fingerprint).not.toContain("devswha@gmail.com");
	});
});
