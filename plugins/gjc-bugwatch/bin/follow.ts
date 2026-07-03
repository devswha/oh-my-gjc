#!/usr/bin/env bun
/**
 * gjc-bugwatch live follow — the streaming companion to the batch scanner.
 *
 * Emits ONLY real bug signals as they land in the gjc log, reusing the exact same
 * classifier/noise-filter/redaction as `collect.ts` (single source of truth). Each
 * emitted line is one event (icon + category + redacted message [+ stack top]).
 * Read-only: it only classifies what it reads; it never touches gjc state.
 *
 * Two input modes:
 *   bun run follow.ts --file ~/.gjc/logs/gjc.$(date +%F).log   # self-tail a file (no external tail)
 *   … | bun run follow.ts                                      # read lines from stdin
 *
 * Flags:
 *   --all            include env/credential noise
 *   --min <sev>      floor: high | medium | low (default low = everything)
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { classifyLogEntry, type Severity } from "./collect";

const includeNoise = process.argv.includes("--all");
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const minIdx = process.argv.indexOf("--min");
const minArg = minIdx >= 0 ? (process.argv[minIdx + 1] as Severity) : undefined;
const floor = RANK[minArg && minArg in RANK ? minArg : "low"];
const fileIdx = process.argv.indexOf("--file");
const filePath = fileIdx >= 0 ? process.argv[fileIdx + 1] : undefined;
const icon: Record<Severity, string> = { high: "🔴", medium: "🟠", low: "🟡" };

function emit(line: string): void {
	const t = line.trim();
	if (!t) return;
	let o: Record<string, unknown>;
	try {
		o = JSON.parse(t) as Record<string, unknown>;
	} catch {
		return;
	}
	const c = classifyLogEntry(o, includeNoise);
	if (!c || RANK[c.severity] > floor) return;
	const who = o.pid != null ? ` (pid ${o.pid})` : "";
	process.stdout.write(
		`${icon[c.severity]} [${c.category}]${who} ${c.message}${c.sampleStackTop ? ` — ${c.sampleStackTop}` : ""}\n`,
	);
}

if (filePath) {
	// Self-tail: start at EOF, poll for appended bytes (no external `tail` dependency).
	let pos = (() => {
		try {
			return statSync(filePath).size;
		} catch {
			return 0;
		}
	})();
	let carry = "";
	setInterval(() => {
		let size: number;
		try {
			size = statSync(filePath).size;
		} catch {
			return; // file not present yet (e.g. before first write / date rollover)
		}
		if (size < pos) {
			pos = 0; // truncated or rotated
			carry = "";
		}
		if (size <= pos) return;
		const buf = Buffer.alloc(size - pos);
		const fd = openSync(filePath, "r");
		try {
			readSync(fd, buf, 0, buf.length, pos);
		} finally {
			closeSync(fd);
		}
		pos = size;
		const text = carry + buf.toString("utf8");
		const lines = text.split("\n");
		carry = lines.pop() ?? ""; // keep incomplete trailing line
		for (const line of lines) emit(line);
	}, 1000);
} else {
	createInterface({ input: process.stdin }).on("line", emit);
}
