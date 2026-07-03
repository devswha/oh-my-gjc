import { describe, expect, it } from "bun:test";
import {
	classifyLogEntry,
	extractSessionSignals,
	fingerprint,
	isNoise,
	mergeGroups,
	redact,
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
