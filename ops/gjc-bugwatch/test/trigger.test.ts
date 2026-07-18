import { describe, expect, it } from "bun:test";
import {
	arrived,
	dailyDigestPrompt,
	gateOpen,
	injectTmux,
	isHighTrigger,
	liveTriagePrompt,
	shouldFire,
	triggerSignature,
	residue,
} from "../trigger";

describe("isHighTrigger", () => {
	it("fires on a 🔴 high line", () => {
		expect(isHighTrigger("🔴 [gjc-internal] (pid 42) Cleanup invoked recursively — at runCleanup")).toBe(true);
	});
	it("fires on any gjc-internal line even without the icon", () => {
		expect(isHighTrigger("[gjc-internal] Uncaught exception")).toBe(true);
	});
	it("does not fire on medium/low lines", () => {
		expect(isHighTrigger("🟠 [error] (pid 1) Subagent prompt failed")).toBe(false);
		expect(isHighTrigger("🟡 [warn] Claude usage fetch failed")).toBe(false);
		expect(isHighTrigger("")).toBe(false);
	});
});

describe("triggerSignature", () => {
	it("collapses pid and line:col so the same bug dedupes across occurrences", () => {
		const a = "🔴 [gjc-internal] (pid 42) Cleanup invoked recursively — at runCleanup (/x:115454:77)";
		const b = "🔴 [gjc-internal] (pid 99) Cleanup invoked recursively — at runCleanup (/x:222222:11)";
		expect(triggerSignature(a)).toBe(triggerSignature(b));
	});
	it("keeps distinct messages distinct", () => {
		expect(triggerSignature("🔴 [gjc-internal] (pid 1) A")).not.toBe(triggerSignature("🔴 [gjc-internal] (pid 1) B"));
	});
});

describe("shouldFire cooldown", () => {
	it("fires once then suppresses within the cooldown, re-fires after it", () => {
		const seen = new Map<string, number>();
		expect(shouldFire("sig", 0, seen, 1000)).toBe(true);
		expect(shouldFire("sig", 500, seen, 1000)).toBe(false);
		expect(shouldFire("sig", 1500, seen, 1000)).toBe(true);
	});
});

describe("gateOpen tower gate", () => {
	it("passes without running tmux when no gate session is configured", () => {
		const calls: string[][] = [];
		const run = (cmd: string[]) => {
			calls.push(cmd);
			return { status: 0, stdout: "" };
		};
		expect(gateOpen("", run)).toBe(true);
		expect(calls.length).toBe(0);
	});

	it("checks the exact-match tmux target and follows its verdict", () => {
		const calls: string[][] = [];
		const open = (cmd: string[]) => {
			calls.push(cmd);
			return { status: 0, stdout: "" };
		};
		expect(gateOpen("horcrux", open)).toBe(true);
		expect(calls[0]).toEqual(["tmux", "has-session", "-t", "=horcrux"]);
		expect(gateOpen("horcrux", () => ({ status: 1, stdout: "" }))).toBe(false);
	});
});

describe("dailyDigestPrompt", () => {
	it("returns null when every candidate is stale or resolved", () => {
		expect(
			dailyDigestPrompt([
				{ severity: "high", category: "gjc-internal", message: "x", count: 3, stale: true },
				{ severity: "high", category: "gjc-internal", message: "y", count: 1, resolved: true },
			]),
		).toBeNull();
		expect(dailyDigestPrompt([])).toBeNull();
	});
	it("summarizes only the fresh candidates", () => {
		const p = dailyDigestPrompt([
			{ severity: "high", category: "gjc-internal", message: "boom", count: 5, stale: false, resolved: false },
			{ severity: "low", category: "warn", message: "meh", count: 2, stale: true },
		]);
		expect(p).toContain("새 fresh 후보 1건");
		expect(p).toContain('high/gjc-internal "boom" (5x)');
		expect(p).not.toContain("meh");
	});
	it("drops fresh low-severity warns (env/auth noise) below the medium floor", () => {
		expect(
			dailyDigestPrompt([
				{ severity: "low", category: "warn", message: "Claude usage fetch failed", count: 168, stale: false, resolved: false },
			]),
		).toBeNull();
	});
	it("keeps a fresh medium candidate", () => {
		const p = dailyDigestPrompt([
			{ severity: "medium", category: "error", message: "Subagent prompt failed", count: 7, stale: false, resolved: false },
		]);
		expect(p).toContain('medium/error "Subagent prompt failed" (7x)');
	});
});

const LONG_KO =
	"[심장박동 발주순찰] 발주 순찰을 수행하라. 쿼타 게이트를 확인하고 " +
	"관제 큐의 최우선 발주를 이어서 처리하라. ".repeat(30);
const SHORT_KO = "다음 발주를 즉시 처리하고 결과를 관제탑에 보고하라";

function inputFixture(content: string): string {
	return [
		"old transcript line",
		"╭────────────────────────╮",
		`│ > ${content}`,
		"╰────────────────────────╯",
	].join("\n");
}

describe("arrived/residue pane fixtures", () => {
	it("accepts literal and wrapped Korean tail tokens", () => {
		expect(arrived(inputFixture(SHORT_KO), SHORT_KO)).toBe(true);
		expect(
			arrived(
				inputFixture(`${SHORT_KO.slice(0, -6)}\n│ ${SHORT_KO.slice(-6)}`),
				SHORT_KO,
			),
		).toBe(true);
	});
	it("accepts gjc 0.11.1 chars folds using character or UTF-8 byte counts", () => {
		expect(arrived(inputFixture(`[paste #1 ${[...LONG_KO].length} chars]`), LONG_KO)).toBe(
			true,
		);
		expect(
			arrived(inputFixture(`[paste #1 ${Buffer.byteLength(LONG_KO)} chars]`), LONG_KO),
		).toBe(true);
	});
	it("accepts legacy and split fold variants", () => {
		const lines = Array.from({ length: 20 }, (_, index) => `${index}번째 지시 줄`).join(
			"\n",
		);
		expect(arrived(inputFixture("paste #2 20 lines"), lines)).toBe(true);
		expect(arrived(inputFixture("#2 20 lines"), lines)).toBe(true);
		expect(
			arrived(
				"╭────────────╮\n│ > [paste #1 47\n│ 32 chars]\n╰────────────╯",
				LONG_KO,
			),
		).toBe(true);
	});
	it("rejects truncated folds and corrupted tails", () => {
		expect(
			arrived(
				inputFixture(`[paste #1 ${Math.floor([...LONG_KO].length / 4)} chars]`),
				LONG_KO,
			),
		).toBe(false);
		const corrupted = `${SHORT_KO.slice(0, -2)}괴${SHORT_KO.slice(-1)}`;
		expect(arrived(inputFixture(corrupted), SHORT_KO)).toBe(false);
	});
	it("treats tail tokens and every fold placeholder as residue", () => {
		expect(residue(inputFixture(SHORT_KO), SHORT_KO)).toBe(true);
		expect(
			residue(inputFixture(`[paste #1 ${[...LONG_KO].length} chars]`), LONG_KO),
		).toBe(true);
		expect(residue(inputFixture(""), LONG_KO)).toBe(false);
	});
});

describe("no-tilde rule", () => {
	it("live and daily prompts never contain a tilde", () => {
		expect(liveTriagePrompt("🔴 [gjc-internal] (pid 1) boom")).not.toContain("~");
		const p = dailyDigestPrompt([{ severity: "high", category: "gjc-internal", message: "b", count: 1 }]);
		expect(p).not.toContain("~");
	});
	it("injectTmux rejects a payload containing a tilde as delivery failure", () => {
		let calls = 0;
		expect(
			injectTmux(
				"cat ~/secret",
				"s",
				() => {
					calls += 1;
					return { status: 0, stdout: "" };
				},
				() => {},
			),
		).toBe(false);
		expect(calls).toBe(0);
	});
});

describe("injectTmux verified delivery", () => {
	const result = (stdout = "", status = 0) => ({ status, stdout });

	it("verifies arrival before Enter and clean input after Enter", () => {
		const calls: string[][] = [];
		const captures = [inputFixture("hello world"), inputFixture("")];
		const ok = injectTmux(
			"hello world",
			"gjc-pr",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(true);
		expect(calls[0]).toEqual([
			"tmux",
			"send-keys",
			"-t",
			"gjc-pr",
			"-l",
			"--",
			"hello world",
		]);
		expect(calls.filter((call) => call.at(-1) === "Enter")).toHaveLength(1);
	});
	it("ignores an identical submitted transcript when the input frame is clean", () => {
		const captures = [
			inputFixture("hello world"),
			`[user]\nhello world\n✶ Musing…\n${inputFixture("")}`,
		];
		const calls: string[][] = [];
		const ok = injectTmux(
			"hello world",
			"gjc-pr",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(true);
		expect(calls.filter((call) => call.at(-1) === "Enter")).toHaveLength(1);
	});
	it("does not accept a fold that appears only in transcript history", () => {
		const folded = `[paste #1 ${[...LONG_KO].length} chars]`;
		const captures = [
			`[user]\n${folded}\n${inputFixture("")}`,
			inputFixture(""),
			inputFixture(folded),
			inputFixture(""),
		];
		const calls: string[][] = [];
		const ok = injectTmux(
			LONG_KO,
			"s",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(true);
		expect(
			calls.filter((call) => call.includes("-l") && call.at(-1) === LONG_KO),
		).toHaveLength(2);
	});
	it("re-sends Enter when the folded prompt remains after the first Enter", () => {
		const folded = inputFixture(`[paste #1 ${[...LONG_KO].length} chars]`);
		const captures = [folded, folded, inputFixture("")];
		const calls: string[][] = [];
		const ok = injectTmux(
			LONG_KO,
			"gjc-pr",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(true);
		expect(calls.filter((call) => call.at(-1) === "Enter")).toHaveLength(2);
		expect(calls).toContainEqual(["tmux", "send-keys", "-t", "gjc-pr", "Escape"]);
	});
	it("clears and verifies residue before a second paste attempt", () => {
		const captures = [
			inputFixture("truncated"),
			inputFixture(""),
			inputFixture(SHORT_KO),
			inputFixture(""),
		];
		const calls: string[][] = [];
		const ok = injectTmux(
			SHORT_KO,
			"s",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(true);
		expect(
			calls.filter(
				(call) => call.includes("-l") && call.at(-1) === SHORT_KO,
			),
		).toHaveLength(2);
	});
	it("fails closed when clearing leaves a paste placeholder", () => {
		const folded = inputFixture(`[paste #1 ${[...LONG_KO].length} chars]`);
		const captures = [inputFixture("truncated"), folded, folded];
		const calls: string[][] = [];
		const ok = injectTmux(
			LONG_KO,
			"s",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(false);
		expect(
			calls.filter((call) => call.includes("-l") && call.at(-1) === LONG_KO),
		).toHaveLength(1);
		expect(calls).toContainEqual(["tmux", "send-keys", "-t", "s", "C-u"]);
	});
	it("does not retry while a truncated literal prefix remains after both clears", () => {
		const prefix = SHORT_KO.slice(0, 12);
		const captures = [
			inputFixture(prefix),
			inputFixture(prefix),
			inputFixture(prefix),
		];
		const calls: string[][] = [];
		const ok = injectTmux(
			SHORT_KO,
			"s",
			(command) => {
				calls.push(command);
				return command[1] === "capture-pane"
					? result(captures.shift())
					: result();
			},
			() => {},
		);
		expect(ok).toBe(false);
		expect(
			calls.filter(
				(call) => call.includes("-l") && call.at(-1) === SHORT_KO,
			),
		).toHaveLength(1);
	});
	it("fails closed when post-Enter pane capture stays unavailable", () => {
		let captures = 0;
		const calls: string[][] = [];
		const ok = injectTmux(
			"hello world",
			"s",
			(command) => {
				calls.push(command);
				if (command[1] !== "capture-pane") return result();
				captures += 1;
				return captures === 1
					? result(inputFixture("hello world"))
					: result("", 1);
			},
			() => {},
		);
		expect(ok).toBe(false);
		expect(captures).toBe(4);
		expect(calls.filter((call) => call.at(-1) === "Enter")).toHaveLength(1);
	});
	it("fails before verification when the literal send fails", () => {
		const calls: string[][] = [];
		const ok = injectTmux(
			"x",
			"s",
			(command) => {
				calls.push(command);
				return result("", 1);
			},
			() => {},
		);
		expect(ok).toBe(false);
		expect(calls).toHaveLength(1);
	});
});

import { SESSION } from "../trigger.ts";

describe("SESSION default", () => {
	it("defaults to gjc-pr when GJC_BUGWATCH_SESSION is unset (관제탑 정정 발주 2026-07-13)", () => {
		if (!process.env.GJC_BUGWATCH_SESSION) {
			expect(SESSION).toBe("gjc-pr");
		}
	});
});
