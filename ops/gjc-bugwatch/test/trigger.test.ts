import { describe, expect, it } from "bun:test";
import {
	dailyDigestPrompt,
	injectTmux,
	isHighTrigger,
	liveTriagePrompt,
	shouldFire,
	triggerSignature,
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

describe("no-tilde rule", () => {
	it("live and daily prompts never contain a tilde", () => {
		expect(liveTriagePrompt("🔴 [gjc-internal] (pid 1) boom")).not.toContain("~");
		const p = dailyDigestPrompt([{ severity: "high", category: "gjc-internal", message: "b", count: 1 }]);
		expect(p).not.toContain("~");
	});
	it("injectTmux refuses a payload containing a tilde", () => {
		expect(() => injectTmux("cat ~/secret", "s", () => 0)).toThrow(/tilde/);
	});
});

describe("injectTmux", () => {
	it("sends a literal line then Enter, both to the target session", () => {
		const calls: string[][] = [];
		const ok = injectTmux("hello world", "gjc-pr", cmd => {
			calls.push(cmd);
			return 0;
		});
		expect(ok).toBe(true);
		expect(calls[0]).toEqual(["tmux", "send-keys", "-t", "gjc-pr", "-l", "--", "hello world"]);
		expect(calls[1]).toEqual(["tmux", "send-keys", "-t", "gjc-pr", "Enter"]);
	});
	it("reports failure when the literal send fails (no Enter sent)", () => {
		const calls: string[][] = [];
		const ok = injectTmux("x", "s", cmd => {
			calls.push(cmd);
			return 1;
		});
		expect(ok).toBe(false);
		expect(calls).toHaveLength(1);
	});
});

import { SESSION } from "../trigger.ts";

describe("SESSION default", () => {
	it("defaults to omg when GJC_BUGWATCH_SESSION is unset (관제탑 재배선 2026-07-12)", () => {
		if (!process.env.GJC_BUGWATCH_SESSION) {
			expect(SESSION).toBe("omg");
		}
	});
});
