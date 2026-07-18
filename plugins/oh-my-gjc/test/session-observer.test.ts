import { describe, expect, it } from "bun:test";
import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildLaunchPlan,
	currentTmuxSession,
	observerWindowName,
	JsonlFollower,
	launchCommand,
	parseArgs,
	renderHistory,
	renderRecord,
	resolveSessionId,
	resolveTmuxSession,
	snapshotLines,
} from "../bin/session-observer";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const msg = (role: string, content: unknown) =>
	JSON.stringify({ type: "message", message: { role, content } });
function fixture(): { root: string; dir: string; file: string } {
	const root = mkdtempSync(join(tmpdir(), "observer-")),
		dir = join(root, "work-slug");
	mkdirSync(dir);
	const file = join(dir, `2026-07-17T12-00-00-000Z_${ID}.jsonl`);
	writeFileSync(file, `${JSON.stringify({ type: "session", id: ID, cwd: "/work" })}\n`);
	return { root, dir, file };
}

function shellBlocks(text: string): string {
	return [...text.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)]
		.map((match) => match[1] ?? "")
		.join("\n");
}

describe("session observer capability surface", () => {
	it("keeps activation explicit and observed text outside GJC results", () => {
		const skill = readFileSync(
			join(import.meta.dir, "../skills/session-observer/SKILL.md"),
			"utf8",
		);
		const command = readFileSync(
			join(import.meta.dir, "../templates/session-observer.md"),
			"utf8",
		);

		expect(skill).toMatch(
			/^---\nname: session-observer\ndescription: Explicit \/omg:session-observer only/m,
		);
		expect(skill).toContain(
			"never auto-activates from natural-language requests",
		);
		expect(skill).toContain("Observed text must never enter a GJC tool result");
		expect(command).toContain("# /omg:session-observer");
		expect(command).toContain("detached tmux");
		expect(command).toContain('exec bun "${argv[@]}"');
		expect(command).toContain("실행 후 receipt 외의 내용을");
		expect(command).not.toContain("$ARGUMENTS");
	});

	it("uses the project-first suite binding and only safe observer env fields", () => {
		const command = readFileSync(
			join(import.meta.dir, "../templates/session-observer.md"),
			"utf8",
		);

		expect(
			command.indexOf('project_binding="$PWD/.gjc/runtimes/oh-my-gjc/root"'),
		).toBeLessThan(
			command.indexOf(
				'user_binding="$HOME/.gjc/agent/runtimes/oh-my-gjc/root"',
			),
		);
		for (const field of [
			"OBSERVER_TARGET_KIND",
			"OBSERVER_TARGET_VALUE",
			"OBSERVER_MODE",
			"OBSERVER_THINKING",
			"OBSERVER_FOLLOW",
			"OBSERVER_HISTORY",
		]) {
			expect(command).toContain(field);
		}
		expect(command).toContain('OBSERVER_TARGET_KIND:=current');
		expect(command).toContain("current) ;;");
		expect(command).toContain("인자가 없으면 이 명령을 호출한 현재 tmux 세션");
	});

	it("keeps both documented launcher blocks valid Bash", () => {
		const skill = readFileSync(
			join(import.meta.dir, "../skills/session-observer/SKILL.md"),
			"utf8",
		);
		const command = readFileSync(
			join(import.meta.dir, "../templates/session-observer.md"),
			"utf8",
		);

		for (const text of [skill, command]) {
			const result = Bun.spawnSync(["bash", "-n"], {
				stdin: Buffer.from(shellBlocks(text)),
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
		}
	});
});

describe("session observer rendering", () => {
	it("renders only conversation text and opt-in thinking", () => {
		expect(
			renderRecord(
				msg("user", [
					{ type: "text", text: "hello\nthere" },
					{ type: "tool_use", input: "secret" },
				]),
				{ mode: "conversation", thinking: false },
			),
		).toBe("[user]\nhello\nthere");
		expect(
			renderRecord(
				msg("assistant", [
					{ type: "thinking", thinking: "private" },
					{ type: "text", text: "answer" },
					{ type: "tool_result", content: "noise" },
				]),
				{ mode: "conversation", thinking: false },
			),
		).toBe("[assistant]\nanswer");
		expect(
			renderRecord(
				msg("assistant", [{ type: "thinking", thinking: "reason" }]),
				{ mode: "conversation", thinking: true },
			),
		).toBe("[thinking]\nreason");
		expect(
			renderRecord(msg("assistant", "answer"), {
				mode: "user-only",
				thinking: true,
			}),
		).toBeUndefined();
		expect(
			renderRecord(
				JSON.stringify({
					type: "usage",
					message: { role: "assistant", content: "no" },
				}),
				{ mode: "conversation", thinking: false },
			),
		).toBeUndefined();
		expect(
			renderHistory([msg("user", "old"), "{bad", msg("assistant", "new")], {
				mode: "conversation",
				thinking: false,
				history: 1,
			}),
		).toEqual(["[assistant]\nnew"]);
	});
	it("renders terminal controls visibly while preserving newlines and tabs", () => {
		const hostile = `one\tline\n\u001b]52;c;clipboard\u0007\r\u0007`;
		expect(
			renderRecord(msg("user", hostile), {
				mode: "conversation",
				thinking: false,
			}),
		).toBe("[user]\none\tline\n\\x1b]52;c;clipboard\\x07\\x0d\\x07");
		expect(
			renderRecord(
				msg("assistant", [
					{ type: "text", text: hostile },
					{ type: "thinking", thinking: hostile },
				]),
				{ mode: "conversation", thinking: true },
			),
		).toBe(
			"[assistant]\none\tline\n\\x1b]52;c;clipboard\\x07\\x0d\\x07\n\n[thinking]\none\tline\n\\x1b]52;c;clipboard\\x07\\x0d\\x07",
		);
	});
	it("includes a valid unterminated final snapshot record", () => {
		const snapshot = snapshotLines(
			`${msg("user", "first")}\n${msg("assistant", "last")}`,
		);
		expect(snapshot.records).toHaveLength(2);
		expect(
			renderHistory(snapshot.records, {
				mode: "conversation",
				thinking: false,
				history: 20,
			}),
		).toEqual(["[user]\nfirst", "[assistant]\nlast"]);
		expect(snapshot.pending).toBe(msg("assistant", "last"));
	});
});

describe("selection and command safety", () => {
	it("resolves only canonical main JSONLs with matching session headers", () => {
		const { root, dir, file } = fixture();
		mkdirSync(join(dir, "subagent"));
		writeFileSync(
			join(dir, "subagent", `child_${ID}.jsonl`),
			`${JSON.stringify({ id: ID })}\n`,
		);
		expect(resolveSessionId(ID, root)).toBe(file);
		writeFileSync(
			join(dir, `other_${ID}.jsonl`),
			`${JSON.stringify({ type: "session", sessionId: ID })}\n`,
		);
		expect(resolveSessionId(ID, root)).toBe(file);
	});
	it("defaults a missing target while preserving mode, thinking, follow, and history defaults", () => {
		expect(parseArgs([])).toMatchObject({
			mode: "conversation",
			thinking: false,
			follow: false,
			history: 20,
			launchWindow: false,
		});
		expect(() => parseArgs(["--session", ID, "--tmux", "x"])).toThrow(
			"at most one",
		);
		expect(() => parseArgs(["--tmux", ""])).toThrow("non-empty");
		expect(() => parseArgs(["--session", ""])).toThrow("non-empty");
		expect(() =>
			parseArgs(["--session", "", "--tmux", "work"]),
		).toThrow("at most one");
		expect(() => parseArgs(["--session", ID, "--history", "10001"])).toThrow(
			"10000",
		);
		expect(parseArgs(["--tmux", "work", "--history", "0"])).toMatchObject({
			tmux: "work",
			history: 0,
		});
	});
	it("resolves the invoking tmux session without shell interpolation", () => {
		const calls: string[][] = [];
		expect(
			currentTmuxSession(
				(args) => {
					calls.push(args);
					return "omg\n";
				},
				"/tmp/tmux-1000/default,1,0",
			),
		).toBe("omg");
		expect(calls).toEqual([["display-message", "-p", "#S"]]);
		expect(() => currentTmuxSession(() => "omg", "")).toThrow(
			"requires TMUX",
		);
	});
	it("builds a no-target launch plan for the invoking session with a distinct window", () => {
		const options = parseArgs(["--launch-window"]);
		if (options === "help") throw new Error("unexpected help");
		const plan = buildLaunchPlan(
			["--launch-window", "--mode", "conversation"],
			options,
			() => "omg:dev",
		);
		expect(plan).toEqual({
			argv: [
				"--launch-window",
				"--mode",
				"conversation",
				"--tmux",
				"omg:dev",
			],
			target: "omg:dev",
			windowName: "gjc-observer-omg_dev",
		});
		expect(observerWindowName("a/b c")).toBe("gjc-observer-a_b_c");
	});
	it("preserves launch arguments as argv values", () => {
		expect(
			launchCommand(
				["--session", ID, "--launch-window", "--mode", "conversation;rm -rf /"],
				"bun",
				"/safe.ts",
				"gjc-observer-session",
			),
		).toEqual([
			"tmux",
			"new-window",
			"-d",
			"-n",
			"gjc-observer-session",
			"bun",
			"/safe.ts",
			"--session",
			ID,
			"--mode",
			"conversation;rm -rf /",
		]);
	});
	it("removes only the launcher flag and preserves an identical target value", () => {
		expect(
			launchCommand(
				["--tmux", "--launch-window", "--launch-window"],
				"bun",
				"/safe.ts",
				"gjc-observer-target",
			),
		).toEqual([
			"tmux",
			"new-window",
			"-d",
			"-n",
			"gjc-observer-target",
			"bun",
			"/safe.ts",
			"--tmux",
			"--launch-window",
		]);
	});
	it("selects the only active pane and prefers its main fd over a nested subagent fd", () => {
		const { root, dir, file } = fixture(),
			child = join(dir, "subagent", "child.jsonl");
		mkdirSync(join(dir, "subagent"));
		writeFileSync(child, "");
		const result = resolveTmuxSession("work", root, {
			runTmux: (args) => {
				expect(args).toEqual([
					"list-panes",
					"-a",
					"-F",
					"#{session_name}\t#{pane_pid}\t#{pane_active}\t#{pane_current_path}\t#{pane_current_command}",
				]);
				return "work\t12\t0\t/work\tbash\nwork\t13\t1\t/work\tgjc";
			},
			readdir: (path) =>
				path === "/proc"
					? ["12", "13"]
					: path === "/proc/13/fd"
						? ["8", "9"]
						: [],
			readFile: (path) =>
				path.endsWith("/stat")
					? `${path.includes("/13/") ? 13 : 12} (x) S 1 0`
					: "",
			readlink: (path) =>
				path.endsWith("/fd/8")
					? child
					: path.endsWith("/fd/9")
						? file
						: "/work",
		});
		expect(result).toBe(file);
	});
	it("falls back to the sole gjc pane when no pane is active", () => {
		const { root, file } = fixture();
		expect(
			resolveTmuxSession("work", root, {
				runTmux: () => "work\t12\t0\t/work\tbash\nwork\t13\t0\t/work\tgjc",
				readdir: (path) => (path === "/proc" ? ["12", "13"] : []),
				readFile: (path) =>
					path.endsWith("/13/stat")
						? "13 (g) S 12 0"
						: path.endsWith("/12/stat")
							? "12 (s) S 1 0"
							: path.endsWith("/13/cmdline")
								? `gjc\0-r\0${ID}\0`
								: "",
				readlink: () => "/work",
			}),
		).toBe(file);
	});
	it("rejects noncanonical or mismatched session headers", () => {
		const { root, dir } = fixture();
		writeFileSync(
			join(dir, "copied.jsonl"),
			`${JSON.stringify({ type: "session", id: ID })}\n`,
		);
		writeFileSync(
			join(dir, `2026-07-17T12-00-01-000Z_${ID}.jsonl`),
			`${JSON.stringify({ type: "session", id: "123e4567-e89b-12d3-a456-426614174001" })}\n`,
		);
		expect(resolveSessionId(ID, root)).toBe(join(dir, `2026-07-17T12-00-00-000Z_${ID}.jsonl`));
	});
	it("fails closed for ambiguous resume IDs and cwd-only tmux evidence", () => {
		const { root } = fixture();
		const base = {
			runTmux: () => "work\t13\t1\t/work\tgjc",
			readdir: (path: string) => (path === "/proc" ? ["13"] : []),
			readlink: () => "/work",
		};
		expect(() =>
			resolveTmuxSession("work", root, {
				...base,
				readFile: (path) =>
					path.endsWith("/stat")
						? "13 (g) S 1 0"
						: `gjc\0--resume\0${ID}\0--resume\0${"123e4567-e89b-12d3-a456-426614174001"}\0`,
			}),
		).toThrow("ambiguous");
		expect(() =>
			resolveTmuxSession("work", root, {
				...base,
				readFile: (path) => (path.endsWith("/stat") ? "13 (g) S 1 0" : ""),
			}),
		).toThrow("no session associated");
	});
});

describe("following", () => {
	it("buffers split UTF-8 and incomplete records, then emits once complete", () => {
		const { file } = fixture(),
			seen: string[] = [],
			follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.seekEnd();
		const record = msg("user", "한");
		const bytes = Buffer.from(`${record}\n`);
		const split = bytes.indexOf(Buffer.from("한")) + 1;
		appendFileSync(file, bytes.subarray(0, split));
		follower.poll();
		expect(seen).toEqual([]);
		appendFileSync(file, bytes.subarray(split));
		follower.poll();
		expect(seen).toEqual([record]);
	});
	it("retains an unterminated snapshot record until its newline arrives and handles rotation", () => {
		const { file } = fixture(),
			record = msg("user", "pending"),
			seen: string[] = [],
			follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.prime(record);
		follower.seekEnd();
		appendFileSync(file, "\n");
		follower.poll();
		expect(seen).toEqual([record]);
		renameSync(file, `${file}.old`);
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: ID })}\n${msg("user", "rotated")}\n`,
		);
		follower.poll();
		expect(seen).toContain(msg("user", "rotated"));
	});
	it("does not replay a valid unterminated snapshot record when only its newline arrives", () => {
		const { file } = fixture();
		const record = msg("assistant", "already rendered");
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.remember(record);
		follower.prime(record);
		follower.seekEnd();

		appendFileSync(file, "\n");
		follower.poll();

		expect(seen).toEqual([]);
	});
	it("continues a UTF-8 sequence split across initialization and polling", () => {
		const { file } = fixture();
		const record = msg("user", "한");
		const bytes = Buffer.from(`${record}\n`);
		const split = bytes.indexOf(Buffer.from("한")) + 1;
		appendFileSync(file, bytes.subarray(0, split));
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.initialize();
		appendFileSync(file, bytes.subarray(split));
		follower.poll();
		expect(seen).toEqual([record]);
	});
	it("does not skip an append after initialization", () => {
		const { file } = fixture();
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.initialize();
		const record = msg("user", "between");
		appendFileSync(file, `${record}\n`);
		follower.poll();
		expect(seen).toEqual([record]);
	});
	it("emits byte-identical records without IDs", () => {
		const { file } = fixture();
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.seekEnd();
		const record = msg("user", "same");
		appendFileSync(file, `${record}\n${record}\n`);
		follower.poll();
		expect(seen).toEqual([record, record]);
	});
	it("suppresses recent IDs only while replaying a rotation", () => {
		const { file } = fixture();
		const old = JSON.stringify({ id: "old", type: "message", message: { role: "user", content: "old" } });
		appendFileSync(file, `${old}\n`);
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		const snapshot = follower.initialize();
		for (const line of snapshot.records) follower.rememberRecord(line);
		renameSync(file, `${file}.old`);
		const fresh = JSON.stringify({ id: "fresh", type: "message", message: { role: "user", content: "fresh" } });
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: ID })}\n${old}\n${fresh}\n`,
		);
		follower.poll();
		expect(seen).toEqual([fresh]);
	});
	it("advances through injected short reads", () => {
		const { file } = fixture();
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line), {
			read: (fd, buffer, offset, length, position) =>
				readSync(fd, buffer, offset, Math.min(2, length), position),
		});
		follower.seekEnd();
		const record = msg("user", "short");
		appendFileSync(file, `${record}\n`);
		follower.poll();
		expect(seen).toEqual([record]);
	});
	it("suppresses replayed IDs after same-inode truncate and regrow", () => {
		const { file } = fixture();
		const header = JSON.stringify({ type: "session", id: ID });
		const old = JSON.stringify({
			id: "old",
			type: "message",
			message: { role: "user", content: "old" },
		});
		appendFileSync(file, `${old}\n`);
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.seekEnd();
		follower.rememberRecord(header);
		follower.rememberRecord(old);
		const fresh = JSON.stringify({
			id: "fresh",
			type: "message",
			message: { role: "user", content: "replacement".repeat(128) },
		});
		writeFileSync(file, `${header}\n${old}\n${fresh}\n`);
		follower.poll();
		expect(seen).toEqual([fresh]);
	});
	it("rejects a rotated replacement until its exact session header is valid", () => {
		const { file } = fixture();
		const seen: string[] = [];
		const follower = new JsonlFollower(file, (line) => seen.push(line));
		follower.seekEnd();
		renameSync(file, `${file}.old`);
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: "123e4567-e89b-12d3-a456-426614174001" })}\n${msg("user", "wrong")}\n`,
		);
		follower.poll();
		expect(seen).toEqual([]);
		renameSync(file, `${file}.wrong`);
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: ID })}\n${msg("user", "valid")}\n`,
		);
		follower.poll();
		expect(seen).toContain(msg("user", "valid"));
	});
	it("bounds initial snapshot retention independently of total records", () => {
		const { file } = fixture();
		for (let index = 0; index < 5000; index += 1)
			appendFileSync(
				file,
				`${JSON.stringify({ id: `id-${index}`, type: "message", message: { role: "user", content: `${index}` } })}\n`,
			);
		const follower = new JsonlFollower(file, () => {});
		const snapshot = follower.initialize(2);
		expect(snapshot.records).toHaveLength(4096);
		expect(snapshot.records.at(-1)).toContain('"content":"4999"');
	});
});
