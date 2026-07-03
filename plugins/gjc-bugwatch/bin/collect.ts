#!/usr/bin/env bun
/**
 * gjc-bugwatch — dogfooding bug collector for Gajae Code (gjc).
 *
 * Scans the artifacts a normal gjc session already leaves on disk and surfaces
 * candidate **gjc-internal** bugs you'd otherwise miss — the raw material for an
 * upstream PR. Read-only: it never mutates gjc state; it only reads logs +
 * session transcripts and writes a candidate spool you own.
 *
 * Sources (all JSONL, confirmed formats):
 *   - Rotating log:  ~/.gjc/logs/gjc.<date>.log
 *       {timestamp, level, pid, message, ...extra[, stack]}
 *   - Sessions:      ~/.gjc/agent/sessions/--<cwd>--/<ts>_<id>.jsonl
 *       {type:"session"|"message"|...} — tool errors/stacks live inside entries.
 *
 * What counts as a candidate (vs. environmental noise):
 *   - `gjc-internal`  level:error/warn whose stack references the gjc binary
 *                     (`/$bunfs/root/gjc-*`) or repo source (`packages/`,`crates/`)
 *                     → a real code bug. HIGH.
 *   - `error`         any other level:error frame. MEDIUM.
 *   - `warn`          non-noise warnings. LOW.
 *   Filtered by default as noise: provider model-discovery failures, local model
 *   server connection refusals, credential/token refresh/expiry. (`--all` keeps them.)
 *
 * Dedupe: volatile bits (timestamps, pids, ids, emails, urls, line:col) are
 * normalized so the same bug across many sessions collapses to one candidate
 * with a count + first/last seen + one redacted sample.
 *
 * Redaction: emails, account ids, bearer-ish tokens, and URLs with creds are
 * scrubbed before printing/spooling — candidates are meant to be pasteable into a
 * public upstream issue.
 *
 * Usage:
 *   bun run collect.ts                 # scan logs only (high precision), print report
 *   bun run collect.ts --days 3        # only artifacts modified in the last 3 days
 *   bun run collect.ts --include-sessions [--session-limit 20]
 *                                      # ALSO scan session transcripts (heuristic/noisy:
 *                                      # sessions echo logs/source/prose; current session skipped)
 *   bun run collect.ts --all           # include env/credential noise
 *   bun run collect.ts --json          # machine-readable candidates to stdout
 *   bun run collect.ts --out FILE      # spool JSONL candidates (default .gjc/bugwatch/candidates.jsonl)
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Severity = "high" | "medium" | "low";
export type Category = "gjc-internal" | "error" | "warn";

export interface Candidate {
	fingerprint: string;
	category: Category;
	severity: Severity;
	message: string;
	source: "log" | "session";
	sampleStackTop?: string;
	extraKeys?: string[];
}

export interface GroupedCandidate extends Candidate {
	count: number;
	firstSeen?: string;
	lastSeen?: string;
	sample: Record<string, unknown>;
}

// ── noise: environmental / credential, not a code bug ────────────────────────
const NOISE_PATTERNS: RegExp[] = [
	/model discovery failed for provider/i,
	/unable to connect\. is the computer able to access/i,
	/usage credential refresh failed/i,
	/token refresh failed/i,
	/token expired/i,
	/reusing parent modelRegistry/i,
	/usage fetch (requested|queued|resolved)/i,
	/kimi usage token expired/i,
];

// ── stack signatures ─────────────────────────────────────────────────────────
// LOG `stack` fields are trustworthy runtime stacks, so match broadly there.
const GJC_INTERNAL_STACK = /\/\$bunfs\/root\/gjc-|(?:packages|crates)\/[\w.-]+\/src\/|@gajae-code\//;
// SESSION text is polluted with source code, pasted logs, and analysis the agent
// read/wrote — all of which quote `packages/.../src/`, `throw new Error`, and even
// `/$bunfs/root/gjc-*` stack paths. The LOG scanner already catches real runtime
// stacks precisely, so for sessions we trust ONLY an explicit uncaught-exception
// header — a crash surfaced to the agent mid-session that may never reach the log.
const SESSION_RUNTIME_SIGNATURE = /\[Uncaught Exception\]/;

export function isNoise(message: string): boolean {
	return NOISE_PATTERNS.some(p => p.test(message));
}

/** Strip credentials/PII/volatile bits so a candidate is safe to paste upstream. */
export function redact(text: string): string {
	return text
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
		.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
		.replace(/(sk-|Bearer\s+|token[=:]\s*)[A-Za-z0-9._-]{12,}/gi, "$1<redacted>")
		.replace(/https?:\/\/[^@\s"]+@[^\s"]+/g, "<url-with-creds>");
}

/** Normalize a message+stack into a stable dedupe key (volatile parts removed). */
export function fingerprint(category: Category, message: string, stackTop?: string): string {
	const norm = (s: string) =>
		s
			.replace(/\d{4}-\d{2}-\d{2}[T \d:.+Z-]*/g, "")
			.replace(/:\d+:\d+/g, ":L:C")
			.replace(/\b\d{3,}\b/g, "N")
			.replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, "ID")
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
	return `${category}|${norm(message)}|${norm(stackTop ?? "")}`.slice(0, 400);
}

const NOISE_MSG_KEYS = new Set(["timestamp", "level", "pid", "message", "stack"]);

/** Classify one parsed log line. Returns null when it's not a candidate. */
export function classifyLogEntry(o: Record<string, unknown>, includeNoise = false): Candidate | null {
	const level = String(o.level ?? "");
	const message = String(o.message ?? "");
	if (!message) return null;
	if (level !== "error" && level !== "warn") return null;
	if (!includeNoise && isNoise(message)) return null;

	const stack = typeof o.stack === "string" ? o.stack : undefined;
	const stackTop = stack?.split("\n").find(l => l.trim().startsWith("at "))?.trim();
	const internal = stack ? GJC_INTERNAL_STACK.test(stack) : false;

	const category: Category = internal ? "gjc-internal" : level === "error" ? "error" : "warn";
	const severity: Severity = internal ? "high" : level === "error" ? "medium" : "low";
	const extraKeys = Object.keys(o).filter(k => !NOISE_MSG_KEYS.has(k));

	return {
		fingerprint: fingerprint(category, message, stackTop),
		category,
		severity,
		message: redact(message),
		source: "log",
		sampleStackTop: stackTop ? redact(stackTop) : undefined,
		extraKeys: extraKeys.length ? extraKeys : undefined,
	};
}

/** Recursively collect gjc-internal stacks / explicit error markers from a session entry. */
export function extractSessionSignals(entry: unknown, includeNoise = false): Candidate[] {
	const out: Candidate[] = [];
	const seen = new Set<string>();
	const walk = (v: unknown): void => {
		if (typeof v === "string") {
			if (SESSION_RUNTIME_SIGNATURE.test(v)) {
				const line =
					v.split("\n").find(l => SESSION_RUNTIME_SIGNATURE.test(l))?.trim() ?? v.slice(0, 200);
				if (!includeNoise && isNoise(line)) return;
				const stackTop = v.split("\n").find(l => l.trim().startsWith("at "))?.trim();
				const fp = fingerprint("gjc-internal", line, stackTop);
				if (!seen.has(fp)) {
					seen.add(fp);
					out.push({
						fingerprint: fp,
						category: "gjc-internal",
						severity: "high",
						message: redact(line),
						source: "session",
						sampleStackTop: stackTop ? redact(stackTop) : undefined,
					});
				}
			}
			return;
		}
		if (Array.isArray(v)) return void v.forEach(walk);
		if (v && typeof v === "object") {
			const o = v as Record<string, unknown>;
			// Explicit tool-error markers are noisy (mostly agent/user mistakes, not
			// gjc bugs) — only under --all, and only with a real message.
			const rawMsg = o.message ?? o.error ?? o.text;
			if (includeNoise && o.isError === true && typeof rawMsg === "string" && rawMsg.trim()) {
				const msg = redact(rawMsg.slice(0, 200));
				if (!isNoise(msg)) {
					const fp = fingerprint("error", msg);
					if (!seen.has(fp)) {
						seen.add(fp);
						out.push({ fingerprint: fp, category: "error", severity: "medium", message: msg, source: "session" });
					}
				}
			}
			for (const val of Object.values(o)) walk(val);
		}
	};
	walk(entry);
	return out;
}

function parseJsonl(path: string): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) {
		const t = line.trim();
		if (!t) continue;
		try {
			rows.push(JSON.parse(t));
		} catch {
			/* skip partial/corrupt line */
		}
	}
	return rows;
}

export function scanLogFile(path: string, includeNoise = false): GroupedCandidate[] {
	return group(
		parseJsonl(path).flatMap(o => {
			const c = classifyLogEntry(o, includeNoise);
			return c ? [{ c, ts: String(o.timestamp ?? ""), raw: o }] : [];
		}),
	);
}

export function scanSessionFile(path: string, includeNoise = false): GroupedCandidate[] {
	return group(
		parseJsonl(path).flatMap(o =>
			extractSessionSignals(o, includeNoise).map(c => ({ c, ts: String(o.timestamp ?? ""), raw: o })),
		),
	);
}

function group(items: { c: Candidate; ts: string; raw: Record<string, unknown> }[]): GroupedCandidate[] {
	const by = new Map<string, GroupedCandidate>();
	for (const { c, ts, raw } of items) {
		const g = by.get(c.fingerprint);
		if (g) {
			g.count++;
			if (ts && (!g.firstSeen || ts < g.firstSeen)) g.firstSeen = ts;
			if (ts && (!g.lastSeen || ts > g.lastSeen)) g.lastSeen = ts;
		} else {
			by.set(c.fingerprint, { ...c, count: 1, firstSeen: ts || undefined, lastSeen: ts || undefined, sample: raw });
		}
	}
	return [...by.values()];
}

export function mergeGroups(groups: GroupedCandidate[]): GroupedCandidate[] {
	const by = new Map<string, GroupedCandidate>();
	for (const g of groups) {
		const cur = by.get(g.fingerprint);
		if (cur) {
			cur.count += g.count;
			if (g.firstSeen && (!cur.firstSeen || g.firstSeen < cur.firstSeen)) cur.firstSeen = g.firstSeen;
			if (g.lastSeen && (!cur.lastSeen || g.lastSeen > cur.lastSeen)) cur.lastSeen = g.lastSeen;
		} else by.set(g.fingerprint, { ...g });
	}
	const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
	return [...by.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

// ── file discovery ───────────────────────────────────────────────────────────
function recentFiles(dir: string, match: (f: string) => boolean, sinceMs: number): string[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	return entries
		.filter(match)
		.map(f => join(dir, f))
		.filter(p => {
			try {
				return statSync(p).mtimeMs >= sinceMs;
			} catch {
				return false;
			}
		});
}

export function discoverLogFiles(root = join(homedir(), ".gjc", "logs"), sinceMs = 0): string[] {
	return recentFiles(root, f => f.endsWith(".log"), sinceMs);
}

export function discoverSessionFiles(root = join(homedir(), ".gjc", "agent", "sessions"), sinceMs = 0): string[] {
	let dirs: string[];
	try {
		dirs = readdirSync(root).map(d => join(root, d));
	} catch {
		return [];
	}
	return dirs
		.flatMap(d => recentFiles(d, f => f.endsWith(".jsonl"), sinceMs))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(flag: string, def?: string): string | undefined {
	const i = process.argv.indexOf(flag);
	return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const has = (flag: string) => process.argv.includes(flag);

function main(): void {
	const includeNoise = has("--all");
	const includeSessions = has("--include-sessions");
	const days = Number(arg("--days", "7"));
	const maxSessions = Number(arg("--session-limit", arg("--sessions", "40")));
	const sinceMs = Date.now() - days * 86_400_000;

	const logFiles = discoverLogFiles(undefined, sinceMs);
	// Sessions echo logs, source the agent read, and analysis prose — low-precision
	// and self-contaminating. Opt-in only, and never scan the current session.
	const selfId = process.env.GJC_SESSION_ID;
	const sessionFiles = includeSessions
		? discoverSessionFiles(undefined, sinceMs)
				.filter(f => !selfId || !f.includes(selfId))
				.slice(0, maxSessions)
		: [];

	const groups = mergeGroups([
		...logFiles.flatMap(f => scanLogFile(f, includeNoise)),
		...sessionFiles.flatMap(f => scanSessionFile(f, includeNoise)),
	]);

	if (has("--json")) {
		process.stdout.write(JSON.stringify(groups, null, 2) + "\n");
	} else {
		const icon: Record<Severity, string> = { high: "🔴", medium: "🟠", low: "🟡" };
		process.stdout.write(
			`gjc-bugwatch — ${logFiles.length} log file(s)` +
				`${includeSessions ? `, ${sessionFiles.length} session(s)` : " (sessions off; --include-sessions to add)"}, last ${days}d\n` +
				`${groups.length} candidate(s)${includeNoise ? "" : " (env/credential noise hidden; --all to show)"}\n\n`,
		);
		for (const g of groups) {
			process.stdout.write(
				`${icon[g.severity]} [${g.category}] ×${g.count}  (${g.source})\n  ${g.message}\n` +
					(g.sampleStackTop ? `  ${g.sampleStackTop}\n` : "") +
					(g.lastSeen ? `  last: ${g.lastSeen}\n` : "") +
					"\n",
			);
		}
	}

	const out = arg("--out", join(process.cwd(), ".gjc", "bugwatch", "candidates.jsonl"));
	if (out && !has("--json")) {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, groups.map(g => JSON.stringify(g)).join("\n") + (groups.length ? "\n" : ""));
		process.stdout.write(`spooled ${groups.length} candidate(s) → ${out}\n`);
	}
}

if (import.meta.main) main();
