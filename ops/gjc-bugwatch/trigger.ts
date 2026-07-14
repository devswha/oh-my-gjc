#!/usr/bin/env bun
/**
 * gjc-bugwatch automation trigger — the glue that lives OUTSIDE the plugin.
 *
 * The plugin (plugins/oh-my-gjc) keeps its safety contract intact: drafts-only,
 * read-only, redaction, no fabrication. This file is repo tooling that promotes the
 * manual lane to an automatic cadence WITHOUT weakening that contract — it never
 * submits anything; it only *injects a triage instruction* into the operator's tmux
 * session so the agent picks up the work on its next turn.
 *
 * Two modes (chosen by argv):
 *   live  (default): read follow.ts stdout line-by-line; on a HIGH(gjc-internal)
 *                    signal, dedupe within a cooldown and inject a triage prompt.
 *   --daily        : read `collect.ts --json` on stdin; if there are fresh (non-stale,
 *                    non-resolved) candidates, inject a digest triage prompt.
 *
 * tmux send-keys rule: injected payloads use ABSOLUTE paths only and NEVER contain a
 * tilde (`~`) — the shell in the target pane must not be relied on to expand it.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

// 표적 세션: env로 설정, 기본 gjc-pr (관제탑 정정 발주 2026-07-13 — 하코가 PR 전담 세션 신설).
export const SESSION = process.env.GJC_BUGWATCH_SESSION || "gjc-pr";
const COOLDOWN_MS = Number(process.env.GJC_BUGWATCH_COOLDOWN_MS || 30 * 60_000);
const DRYRUN = !!process.env.GJC_BUGWATCH_DRYRUN;

/** follow.ts emits `🔴 [gjc-internal] ...` for high severity. HIGH trigger = 🔴 or gjc-internal. */
export function isHighTrigger(line: string): boolean {
	const t = line.trim();
	if (!t) return false;
	return t.startsWith("🔴") || t.includes("[gjc-internal]");
}

/** Stable dedup signature: drop the volatile pid and any line:col so the same bug collapses. */
export function triggerSignature(line: string): string {
	return line
		.replace(/\(pid \d+\)/g, "")
		.replace(/:\d+:\d+/g, ":L:C")
		.replace(/\s+/g, " ")
		.trim();
}

/** True at most once per `cooldownMs` per signature; records the fire time as a side effect. */
export function shouldFire(sig: string, now: number, seen: Map<string, number>, cooldownMs = COOLDOWN_MS): boolean {
	const last = seen.get(sig);
	if (last != null && now - last < cooldownMs) return false;
	seen.set(sig, now);
	return true;
}

/** Live-mode triage instruction. Absolute paths only — NO tilde (tmux send-keys rule). */
export function liveTriagePrompt(alert: string): string {
	return [
		"[gjc-bugwatch:auto] HIGH(gjc-internal) 신호 감지 —",
		`${alert.replace(/^🔴\s*/, "").trim()}.`,
		"gjc-bugwatch scan 절차로 트리아지하라: collect.ts로 fingerprint 확인 →",
		"resolved.jsonl/drafts 중복 체크 → upstream 이슈/PR 검색 →",
		"/tmp의 gajae-code dev 클론에서 근거 확인 → 새 버그면 초안 작성.",
		"자동 제출 금지(초안만). 검증 통과 시 ops/gjc-bugwatch/enqueue-pr.sh로 관제 큐 적재.",
	].join(" ");
}

/**
 * Daily-mode digest from a `collect --json` array. Returns null when there is nothing
 * actionable. Mirrors the live daemon's `--min medium` floor: low-severity `warn`s
 * (env/auth noise, e.g. HTTP 401 usage fetch) are informational, not bug candidates,
 * so they never trigger a daily triage injection.
 */
export function dailyDigestPrompt(candidates: Array<Record<string, unknown>>): string | null {
	const fresh = candidates.filter(c => !c.stale && !c.resolved && (c.severity === "high" || c.severity === "medium"));
	if (fresh.length === 0) return null;
	const items = fresh.map(c => `${c.severity}/${c.category} "${c.message}" (${c.count}x)`).join("; ");
	return [
		`[gjc-bugwatch:daily] 새 fresh 후보 ${fresh.length}건 —`,
		`${items}.`,
		"gjc-bugwatch scan 절차로 트리아지하라(재현·근거 확인). 자동 제출 금지(초안만).",
		"검증 통과 초안은 ops/gjc-bugwatch/enqueue-pr.sh로 관제 큐 적재.",
	].join(" ");
}

type Runner = (cmd: string[]) => number;

function defaultRunner(cmd: string[]): number {
	if (DRYRUN) {
		process.stdout.write(`[dryrun] ${cmd.join(" ")}\n`);
		return 0;
	}
	const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "ignore" });
	return r.status ?? 1;
}

/**
 * Inject `text` into the tmux session as a literal line followed by Enter.
 * `-l` sends the bytes literally and `--` ends option parsing, so leading `-` is safe.
 * NEVER pass a `~`; callers build absolute paths.
 */
export function injectTmux(text: string, session = SESSION, run: Runner = defaultRunner): boolean {
	if (text.includes("~")) throw new Error("refusing to inject a tilde into tmux send-keys");
	if (run(["tmux", "send-keys", "-t", session, "-l", "--", text]) !== 0) return false;
	return run(["tmux", "send-keys", "-t", session, "Enter"]) === 0;
}

async function readStdin(): Promise<string> {
	let buf = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) buf += chunk;
	return buf;
}

async function main(): Promise<void> {
	if (process.argv.includes("--daily")) {
		let arr: unknown = [];
		try {
			arr = JSON.parse((await readStdin()) || "[]");
		} catch {
			arr = [];
		}
		const prompt = dailyDigestPrompt(Array.isArray(arr) ? (arr as Array<Record<string, unknown>>) : []);
		if (prompt) {
			injectTmux(prompt);
			process.stdout.write(`[daily] injected (${prompt.length} chars) -> ${SESSION}\n`);
		} else {
			process.stdout.write("[daily] no fresh candidates — no injection\n");
		}
		return;
	}

	// live mode: tail follow.ts stdout
	const seen = new Map<string, number>();
	const rl = createInterface({ input: process.stdin });
	rl.on("line", line => {
		if (!isHighTrigger(line)) return;
		const sig = triggerSignature(line);
		if (!shouldFire(sig, Date.now(), seen)) return;
		injectTmux(liveTriagePrompt(line));
		process.stdout.write(`[live] injected -> ${SESSION}: ${sig}\n`);
	});
}

if (import.meta.main) void main();
