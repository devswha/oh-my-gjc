#!/usr/bin/env bun
/**
 * gjc-bugwatch live follow — the streaming companion to the batch scanner.
 *
 * Emits ONLY real bug signals as they land in the gjc log, reusing the exact same
 * classifier/noise-filter/redaction as `collect.ts` (single source of truth). Each
 * emitted line is one event (icon + category + redacted message [+ stack top]).
 * Read-only: it only classifies what it reads; it never touches gjc state.
 *
 * Three input modes:
 *   bun run follow.ts --dir ~/.gjc/logs                       # follow newest gjc*.log, survives date rollover (recommended)
 *   bun run follow.ts --file ~/.gjc/logs/gjc.$(date +%F).log  # self-tail one fixed file
 *   … | bun run follow.ts                                     # read lines from stdin
 *
 * Flags:
 *   --all            include env/credential noise
 *   --min <sev>      floor: high | medium | low (default low = everything)
 */
import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { classifyLogEntry, type Severity } from "./collect";

const includeNoise = process.argv.includes("--all");
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const minIdx = process.argv.indexOf("--min");
const minArg = minIdx >= 0 ? (process.argv[minIdx + 1] as Severity) : undefined;
const floor = RANK[minArg && minArg in RANK ? minArg : "low"];
const fileIdx = process.argv.indexOf("--file");
const filePath = fileIdx >= 0 ? process.argv[fileIdx + 1] : undefined;
const dirIdx = process.argv.indexOf("--dir");
const dirPath = dirIdx >= 0 ? process.argv[dirIdx + 1] : undefined;
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

interface TailState {
	path?: string;
	pos: number;
	carry: string;
}

/** Drain newly-appended lines from `path`. On first attach / rollover, (re)seek. */
function drainFile(path: string, st: TailState, startAtEnd: boolean): void {
	let size: number;
	try {
		size = statSync(path).size;
	} catch {
		return; // not present yet
	}
	if (st.path !== path) {
		// First attach, or rolled over to a new day's file: reseek.
		st.path = path;
		st.carry = "";
		st.pos = startAtEnd ? size : 0;
	}
	if (size < st.pos) {
		// truncated
		st.pos = 0;
		st.carry = "";
	}
	if (size <= st.pos) return;
	const buf = Buffer.alloc(size - st.pos);
	const fd = openSync(path, "r");
	try {
		readSync(fd, buf, 0, buf.length, st.pos);
	} finally {
		closeSync(fd);
	}
	st.pos = size;
	const text = st.carry + buf.toString("utf8");
	const lines = text.split("\n");
	st.carry = lines.pop() ?? ""; // keep incomplete trailing line
	for (const line of lines) emit(line);
}

/** Newest *live* (uncompressed) gjc log in a dir — rotated `.gz` files are excluded. */
function newestLiveLog(dir: string): string | undefined {
	try {
		return readdirSync(dir)
			.filter(f => /^gjc.*\.log$/.test(f))
			.map(f => join(dir, f))
			.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
	} catch {
		return undefined;
	}
}

if (dirPath) {
	// Follow the newest live log and survive date rollover: when today's log rotates
	// to `.log.gz` and a new `gjc.<date>.log` appears, switch to it (from its start).
	const st: TailState = { pos: 0, carry: "" };
	setInterval(() => {
		const latest = newestLiveLog(dirPath);
		if (!latest) return;
		drainFile(latest, st, st.path === undefined); // start at EOF only on first attach
	}, 1000);
} else if (filePath) {
	// Self-tail a fixed file: start at EOF, poll for appended bytes (no external `tail`).
	const st: TailState = { pos: 0, carry: "" };
	setInterval(() => drainFile(filePath, st, st.path === undefined), 1000);
} else {
	createInterface({ input: process.stdin }).on("line", emit);
}
