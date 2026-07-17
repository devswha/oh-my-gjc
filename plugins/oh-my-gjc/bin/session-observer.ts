#!/usr/bin/env bun
/** Read-only JSONL conversation observer for local GJC sessions. */
import {
	closeSync,
	fstatSync,
	openSync,
	readFileSync,
	readSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	statSync,
	type Stats,
} from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { basename, join, relative } from "node:path";

export type Mode = "conversation" | "user-only";
export interface Options {
	session?: string;
	tmux?: string;
	mode: Mode;
	thinking: boolean;
	follow: boolean;
	history: number;
	launchWindow: boolean;
}
const SESSION_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ROOT = join(process.env.HOME ?? "", ".gjc", "agent", "sessions");

export function parseArgs(argv: string[]): Options | "help" {
	const options: Options = {
		mode: "conversation",
		thinking: false,
		follow: false,
		history: 20,
		launchWindow: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") return "help";
		if (arg === "--thinking") {
			options.thinking = true;
			continue;
		}
		if (arg === "--follow") {
			options.follow = true;
			continue;
		}
		if (arg === "--launch-window") {
			options.launchWindow = true;
			continue;
		}
		if (
			!(["--session", "--tmux", "--mode", "--history"] as string[]).includes(
				arg,
			)
		)
			throw new Error(`unknown argument: ${arg}`);
		const value = argv[++index];
		if (value === undefined) throw new Error(`${arg} requires a value`);
		if (arg === "--session") options.session = value;
		else if (arg === "--tmux") options.tmux = value;
		else if (arg === "--mode") {
			if (value !== "conversation" && value !== "user-only")
				throw new Error("--mode must be conversation or user-only");
			options.mode = value;
		} else {
			if (!/^\d+$/.test(value) || Number(value) > 10_000)
				throw new Error("--history must be an integer from 0 to 10000");
			options.history = Number(value);
		}
	}
	if (Boolean(options.session) === Boolean(options.tmux))
		throw new Error("provide exactly one of --session <id> or --tmux <name>");
	if (options.session && !SESSION_ID.test(options.session))
		throw new Error("--session must be a UUID-like session id");
	return options;
}
export const HELP = `Usage: session-observer --session <uuid> | --tmux <name> [options]

Options:
  --mode conversation|user-only  Render both roles (default) or only user messages
  --thinking                     Include assistant thinking content
  --history <N>                  Initial rendered entries (default: 20; maximum: 10000)
  --follow                       Poll for appended complete JSONL records
  --launch-window                Start observer in detached tmux window gjc-observer
  --help                         Show this help
`;
function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel !== "" && !rel.startsWith("..") && !rel.includes("../");
}
function firstRecord(path: string): Record<string, unknown> | undefined {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		const buffer = Buffer.alloc(64 * 1024);
		const count = readSync(fd, buffer, 0, buffer.length, 0);
		const newline = buffer.indexOf(0x0a, 0);
		if (count <= 0 || newline < 0 || newline >= count) return undefined;
		const value = JSON.parse(buffer.subarray(0, newline).toString("utf8"));
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}
function headerHasId(
	value: Record<string, unknown> | undefined,
	id: string,
): boolean {
	return Boolean(value && value.type === "session" && value.id === id);
}
function isMainSession(root: string, path: string): boolean {
	return relative(root, path).split("/").length === 2;
}
function mainSessions(root: string): string[] {
	const found: string[] = [];
	const visit = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (
				entry.isFile() &&
				path.endsWith(".jsonl") &&
				isMainSession(root, path)
			)
				found.push(path);
		}
	};
	visit(root);
	return found;
}
function canonicalSessionId(path: string): string | undefined {
	const match = basename(path).match(
		/^(?:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z|\d{8}_\d{6})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i,
	);
	return match?.[1];
}
function isCanonicalMainSession(root: string, path: string): boolean {
	const id = canonicalSessionId(path);
	return Boolean(id && isMainSession(root, path) && headerHasId(firstRecord(path), id));
}
export function resolveSessionId(
	id: string,
	sessionsRoot: string = DEFAULT_ROOT,
): string {
	if (!SESSION_ID.test(id)) throw new Error("invalid session id");
	const root = realpathSync(sessionsRoot);
	const candidates = mainSessions(root).filter(
		(path) =>
			canonicalSessionId(path)?.toLowerCase() === id.toLowerCase() &&
			headerHasId(firstRecord(path), id),
	);
	if (candidates.length !== 1)
		throw new Error(
			candidates.length ? "ambiguous session id" : "session not found",
		);
	return candidates[0];
}

export interface ProcSeams {
	runTmux?: (args: string[]) => string;
	readFile?: (path: string) => string;
	readdir?: (path: string) => string[];
	readlink?: (path: string) => string;
	stat?: (path: string) => Stats;
}
const proc = {
	readFile: (path: string) => readFileSync(path, "utf8"),
	readdir: (path: string) => readdirSync(path),
	readlink: (path: string) => readlinkSync(path),
	stat: (path: string) => statSync(path),
};
function tmuxOutput(args: string[]): string {
	const child = Bun.spawnSync(["tmux", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (child.exitCode !== 0) throw new Error("tmux selector not found");
	return new TextDecoder().decode(child.stdout).trim();
}
function descendants(
	rootPid: number,
	read: (path: string) => string,
	dirs: (path: string) => string[],
): number[] {
	const children = new Map<number, number[]>();
	for (const name of dirs("/proc")) {
		if (!/^\d+$/.test(name)) continue;
		try {
			const value = read(`/proc/${name}/stat`);
			const end = value.lastIndexOf(")");
			const parent = Number(value.slice(end + 2).split(" ")[1]);
			const list = children.get(parent) ?? [];
			list.push(Number(name));
			children.set(parent, list);
		} catch {}
	}
	const result: number[] = [],
		queue = [rootPid];
	while (queue.length) {
		const pid = queue.shift()!;
		result.push(pid);
		queue.push(...(children.get(pid) ?? []));
	}
	return result;
}
function commandLine(pid: number, read: (path: string) => string): string[] {
	try {
		return read(`/proc/${pid}/cmdline`).split("\0").filter(Boolean);
	} catch {
		return [];
	}
}
interface Pane {
	pid: number;
	active: boolean;
	cwd: string;
	command: string;
}
function selectPane(name: string, output: string): Pane {
	const panes = output
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split("\t"))
		.filter((parts) => parts[0] === name)
		.map((parts) => ({
			pid: Number(parts[1]),
			active: parts[2] === "1",
			cwd: parts[3] ?? "",
			command: parts[4] ?? "",
		}))
		.filter((pane) => Number.isSafeInteger(pane.pid));
	const active = panes.filter((pane) => pane.active);
	if (active.length === 1) return active[0];
	const gjc = panes.filter((pane) => pane.command === "gjc");
	if (gjc.length === 1) return gjc[0];
	throw new Error("tmux selector has no unambiguous pane");
}
/** Resolve an exact tmux session using only argv tmux and Linux proc inspection. */
export function resolveTmuxSession(
	name: string,
	sessionsRoot: string = DEFAULT_ROOT,
	seams: ProcSeams = {},
): string {
	if (!name || /[\r\n]/.test(name)) throw new Error("invalid tmux selector");
	const read = seams.readFile ?? proc.readFile,
		dirs = seams.readdir ?? proc.readdir,
		link = seams.readlink ?? proc.readlink,
		stat = seams.stat ?? proc.stat;
	const pane = selectPane(
		name,
		(seams.runTmux ?? tmuxOutput)([
			"list-panes",
			"-a",
			"-F",
			"#{session_name}\t#{pane_pid}\t#{pane_active}\t#{pane_current_path}\t#{pane_current_command}",
		]),
	);
	const root = realpathSync(sessionsRoot),
		pids = descendants(pane.pid, read, dirs),
		candidates: string[] = [];
	for (const pid of pids)
		for (const fd of (() => {
			try {
				return dirs(`/proc/${pid}/fd`);
			} catch {
				return [];
			}
		})())
			try {
				const path = realpathSync(link(`/proc/${pid}/fd/${fd}`));
				if (
					path.endsWith(".jsonl") &&
					inside(root, path) &&
					stat(path).isFile()
				)
					candidates.push(path);
			} catch {}
	const files = [...new Set(candidates)].filter((path) =>
		isCanonicalMainSession(root, path),
	);
	if (files.length === 1) return files[0];
	if (files.length > 1) throw new Error("ambiguous session files in tmux pane");
	const resumeIds = new Set<string>();
	for (const pid of pids) {
		const args = commandLine(pid, read);
		for (let index = 0; index < args.length; index += 1)
			if (args[index] === "-r" || args[index] === "--resume") {
				const id = args[index + 1];
				if (id && SESSION_ID.test(id)) resumeIds.add(id);
			}
	}
	if (resumeIds.size > 1) throw new Error("ambiguous session ids in tmux pane");
	if (resumeIds.size === 1) return resolveSessionId([...resumeIds][0], root);
	throw new Error("no session associated with tmux pane");
}

export function sanitizeTerminalText(text: string): string {
	return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, (control) =>
		`\\x${control.codePointAt(0)!.toString(16).padStart(2, "0")}`,
	);
}
export function renderRecord(
	line: string,
	options: Pick<Options, "mode" | "thinking">,
): string | undefined {
	let outer: Record<string, unknown>;
	try {
		outer = JSON.parse(line) as Record<string, unknown>;
	} catch {
		return undefined;
	}
	if (
		outer.type !== "message" ||
		!outer.message ||
		typeof outer.message !== "object"
	)
		return undefined;
	const message = outer.message as Record<string, unknown>,
		role = message.role;
	if (
		(role !== "user" && role !== "assistant") ||
		(role === "assistant" && options.mode === "user-only")
	)
		return undefined;
	const content =
			typeof message.content === "string"
				? [{ type: "text", text: message.content }]
				: Array.isArray(message.content)
					? message.content
					: [],
		rendered: string[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object") continue;
		const value = item as Record<string, unknown>;
		if (value.type === "text" && typeof value.text === "string")
			rendered.push(`[${role}]\n${sanitizeTerminalText(value.text)}`);
		if (
			role === "assistant" &&
			options.thinking &&
			value.type === "thinking" &&
			typeof value.thinking === "string"
		)
			rendered.push(`[thinking]\n${sanitizeTerminalText(value.thinking)}`);
	}
	return rendered.length ? rendered.join("\n\n") : undefined;
}
export function renderHistory(
	lines: string[],
	options: Pick<Options, "mode" | "thinking" | "history">,
): string[] {
	return options.history === 0
		? []
		: lines
				.map((line) => renderRecord(line, options))
				.filter((entry): entry is string => Boolean(entry))
				.slice(-options.history);
}
export function snapshotLines(text: string): {
	records: string[];
	pending: string;
} {
	const lines = text.split("\n");
	if (text.endsWith("\n")) return { records: lines.slice(0, -1), pending: "" };
	return { records: lines, pending: lines.at(-1) ?? "" };
}

export interface FollowerSeams {
	open?: (path: string, flags: string) => number;
	close?: (fd: number) => void;
	read?: (
		fd: number,
		buffer: Buffer,
		offset: number,
		length: number,
		position: number,
	) => number;
	stat?: (path: string) => Stats;
	fstat?: (fd: number) => Stats;
}
interface Checkpoint {
	start: number;
	bytes: Buffer;
}
const CHECKPOINT_BYTES = 4096;
const RECENT_IDS = 4096;
export class JsonlFollower {
	private pos = 0;
	private carry = "";
	private decoder = new StringDecoder("utf8");
	private inode?: number;
	private checkpoint?: Checkpoint;
	private pendingSuppression?: string;
	private rotated = false;
	private readonly recentIds = new Set<string>();
	private readonly expectedId: string | undefined;
	constructor(
		private readonly path: string,
		private readonly emit: (line: string) => void,
		private readonly seams: FollowerSeams = {},
	) {
		this.expectedId = canonicalSessionId(path);
	}
	private open(): number {
		return (this.seams.open ?? openSync)(this.path, "r");
	}
	private read(
		fd: number,
		buffer: Buffer,
		offset: number,
		length: number,
		position: number,
	): number {
		return (this.seams.read ?? readSync)(fd, buffer, offset, length, position);
	}
	private checkpointFrom(fd: number): void {
		const start = Math.max(0, this.pos - CHECKPOINT_BYTES);
		const bytes = Buffer.alloc(this.pos - start);
		let offset = 0;
		while (offset < bytes.length) {
			const count = this.read(fd, bytes, offset, bytes.length - offset, start + offset);
			if (count <= 0) break;
			offset += count;
		}
		this.checkpoint =
			offset === bytes.length ? { start, bytes } : undefined;
	}
	private checkpointMatches(fd: number): boolean {
		if (!this.checkpoint) return true;
		const bytes = Buffer.alloc(this.checkpoint.bytes.length);
		let offset = 0;
		while (offset < bytes.length) {
			const count = this.read(
				fd,
				bytes,
				offset,
				bytes.length - offset,
				this.checkpoint.start + offset,
			);
			if (count <= 0) return false;
			offset += count;
		}
		return bytes.equals(this.checkpoint.bytes);
	}
	private headerMatches(fd: number): boolean {
		if (!this.expectedId) return false;
		const buffer = Buffer.alloc(64 * 1024);
		let offset = 0;
		while (offset < buffer.length) {
			const count = this.read(fd, buffer, offset, buffer.length - offset, offset);
			if (count <= 0) return false;
			offset += count;
			const newline = buffer.indexOf(0x0a, 0);
			if (newline >= 0 && newline < offset) {
				try {
					const value = JSON.parse(
						buffer.subarray(0, newline).toString("utf8"),
					) as Record<string, unknown>;
					return headerHasId(value, this.expectedId);
				} catch {
					return false;
				}
			}
		}
		return false;
	}
	private reset(rotation: boolean): void {
		this.pos = 0;
		this.carry = "";
		this.decoder = new StringDecoder("utf8");
		this.checkpoint = undefined;
		this.pendingSuppression = undefined;
		this.rotated = rotation;
	}
	private recordId(line: string): string | undefined {
		try {
			const value = JSON.parse(line) as Record<string, unknown>;
			return typeof value.id === "string" ? value.id : undefined;
		} catch {
			return undefined;
		}
	}
	private rememberId(line: string): void {
		const id = this.recordId(line);
		if (!id) return;
		this.recentIds.delete(id);
		this.recentIds.add(id);
		if (this.recentIds.size > RECENT_IDS) {
			const oldest = this.recentIds.values().next().value;
			if (oldest !== undefined) this.recentIds.delete(oldest);
		}
	}
	private emitLine(line: string): void {
		if (this.pendingSuppression === line) {
			this.pendingSuppression = undefined;
			return;
		}
		const id = this.recordId(line);
		if (this.rotated && id && this.recentIds.has(id)) return;
		this.emit(line);
		this.rememberId(line);
	}
	private ingest(text: string): void {
		const lines = (this.carry + text).split("\n");
		this.carry = lines.pop() ?? "";
		for (const line of lines) this.emitLine(line);
	}
	initialize(retain: number = RECENT_IDS): { records: string[]; pending: string } {
		const records: string[] = [];
		const retainLimit = Math.max(RECENT_IDS, retain);
		const remember = (line: string): void => {
			records.push(line);
			if (records.length > retainLimit) records.shift();
		};
		const fd = this.open();
		try {
			const stat = (this.seams.fstat ?? fstatSync)(fd);
			if (!this.headerMatches(fd))
				throw new Error("selected session header changed");
			this.inode = stat.ino;
			for (;;) {
				const buffer = Buffer.alloc(64 * 1024);
				const count = this.read(fd, buffer, 0, buffer.length, this.pos);
				if (count <= 0) break;
				this.pos += count;
				const lines = (
					this.carry + this.decoder.write(buffer.subarray(0, count))
				).split("\n");
				this.carry = lines.pop() ?? "";
				for (const line of lines) remember(line);
			}
			this.checkpointFrom(fd);
		} finally {
			(this.seams.close ?? closeSync)(fd);
		}
		if (this.carry) remember(this.carry);
		return { records, pending: this.carry };
	}
	seekEnd(): void {
		const fd = this.open();
		try {
			const stat = (this.seams.fstat ?? fstatSync)(fd);
			if (!this.headerMatches(fd))
				throw new Error("selected session header changed");
			this.pos = stat.size;
			this.inode = stat.ino;
			this.checkpointFrom(fd);
		} finally {
			(this.seams.close ?? closeSync)(fd);
		}
	}
	prime(text: string): void {
		this.carry += text;
	}
	poll(): void {
		let fd: number | undefined;
		try {
			fd = this.open();
			const stat = (this.seams.fstat ?? fstatSync)(fd);
			const replay =
				(this.inode !== undefined && this.inode !== stat.ino) ||
				stat.size < this.pos ||
				!this.checkpointMatches(fd);
			if (replay) {
				if (!this.headerMatches(fd)) return;
				this.reset(true);
			}
			this.inode = stat.ino;
			if (stat.size <= this.pos) return;
			const limit = stat.size;
			while (this.pos < limit) {
				const buffer = Buffer.alloc(Math.min(64 * 1024, limit - this.pos));
				const count = this.read(fd, buffer, 0, buffer.length, this.pos);
				if (count <= 0) break;
				this.pos += count;
				this.ingest(this.decoder.write(buffer.subarray(0, count)));
			}
			this.checkpointFrom(fd);
			if (this.pos === limit) this.rotated = false;
		} catch {
			return;
		} finally {
			if (fd !== undefined) (this.seams.close ?? closeSync)(fd);
		}
	}
	remember(line: string): void {
		this.pendingSuppression = line;
		this.rememberId(line);
	}
	rememberRecord(line: string): void {
		this.rememberId(line);
	}
}
export function launchCommand(
	argv: string[],
	executable: string = process.execPath,
	script: string = import.meta.path,
): string[] {
	return [
		"tmux",
		"new-window",
		"-d",
		"-n",
		"gjc-observer",
		executable,
		script,
		...argv.filter((arg) => arg !== "--launch-window"),
	];
}
function launch(argv: string[]): void {
	if (!process.env.TMUX) throw new Error("--launch-window requires TMUX");
	const child = Bun.spawnSync(launchCommand(argv), {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (child.exitCode !== 0)
		throw new Error("could not launch tmux observer window");
	process.stdout.write("launched tmux window gjc-observer\n");
}
function run(): void {
	let options: Options | "help";
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (error) {
		process.stderr.write(`session-observer: ${(error as Error).message}\n`);
		process.exitCode = 2;
		return;
	}
	if (options === "help") {
		process.stdout.write(HELP);
		return;
	}
	try {
		if (options.launchWindow) {
			launch(process.argv.slice(2));
			return;
		}
		const path = options.session
			? resolveSessionId(options.session)
			: resolveTmuxSession(options.tmux!);
		const follower = new JsonlFollower(path, (line) => {
			const rendered = renderRecord(line, options);
			if (rendered) process.stdout.write(`${rendered}\n\n`);
		});
		const snapshot = follower.initialize(options.history);
		const visible = renderHistory(snapshot.records, options);
		if (visible.length) process.stdout.write(`${visible.join("\n\n")}\n`);
		if (!options.follow) return;
		for (const line of snapshot.records) follower.rememberRecord(line);
		if (snapshot.pending) follower.remember(snapshot.pending);
		const timer = setInterval(() => follower.poll(), 250);
		const stop = () => {
			clearInterval(timer);
			process.exit(0);
		};
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	} catch (error) {
		process.stderr.write(`session-observer: ${(error as Error).message}\n`);
		process.exitCode = 1;
	}
}
if (import.meta.main) run();
