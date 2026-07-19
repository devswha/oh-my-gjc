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
// 관제탑 게이트(2026-07-18 하코 "관제탑 열때만 진행"): 이 tmux 세션이 열려 있을 때만 주입.
// 빈 값이면 게이트 없음. '=' 접두 = tmux exact match(horcrux-dev 접두 오매치 방지).
export const GATE_SESSION = process.env.GJC_BUGWATCH_GATE_SESSION || "";

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

export interface CommandResult {
	status: number;
	stdout: string;
}
type Runner = (cmd: string[]) => CommandResult;
type Waiter = (milliseconds: number) => void;

const TUI_BOX = new Set([..."│╭╰╮╯─"]);
const TAIL_LENGTH = 12;
const FOLD =
	/\[?\s*paste\s*#?\s*(\d+)(?:\s+(\d+))?\s*(chars?|lines?)\s*\]?/gi;
const FOLD_LEGACY = /#(\d+)\s+(\d+)\s+(lines?)/gi;
const FOLD_NORMALIZED = /\[?paste#?\d+(chars?|lines?)\]?/i;

export function normalizePane(text: string): string {
	return [...text]
		.filter((character) => !/\s/u.test(character) && !TUI_BOX.has(character))
		.join("");
}

export function tailToken(message: string, length = TAIL_LENGTH): string {
	return [...normalizePane(message)].slice(-length).join("");
}

interface Fold {
	count?: number;
	unit: "char" | "line" | "?";
}

function folds(pane: string): Fold[] {
	const found: Fold[] = [];
	for (const match of pane.matchAll(FOLD)) {
		const first = Number(match[1]);
		const second = match[2] === undefined ? undefined : Number(match[2]);
		found.push({
			count: second ?? (first >= 10 ? first : undefined),
			unit: match[3]!.toLowerCase().startsWith("char") ? "char" : "line",
		});
	}
	if (!found.length)
		for (const match of pane.matchAll(FOLD_LEGACY))
			found.push({
				count: Number(match[2]),
				unit: "line",
			});
	if (!found.length && FOLD_NORMALIZED.test(normalizePane(pane)))
		found.push({ unit: "?" });
	return found;
}

function foldVerdict(
	fold: Fold,
	message: string,
): "strong" | "weak" | "truncated" {
	if (fold.count === undefined || fold.unit === "?") return "weak";
	if (fold.unit === "line") {
		const expected = message.split("\n").length;
		if (
			Math.abs(fold.count - expected) <=
			Math.max(2, Math.round(expected * 0.2))
		)
			return "strong";
		return expected > 4 && fold.count < expected * 0.5
			? "truncated"
			: "weak";
	}
	const normalizedCharacters = [...normalizePane(message)].length;
	const rawCharacters = [...message].length;
	const bytes = Buffer.byteLength(message, "utf8");
	const low = Math.min(normalizedCharacters, rawCharacters);
	if (low * 0.8 <= fold.count && fold.count <= bytes * 1.1) return "strong";
	return fold.count < low * 0.5 ? "truncated" : "weak";
}

/** Enter 전 입력창 도착: 꼬리 토큰 또는 검증된/해석 불가 paste 접힘 표식. */
export function arrived(pane: string, message: string): boolean {
	const token = tailToken(message);
	if (token && normalizePane(pane).includes(token)) return true;
	const verdicts = new Set(folds(pane).map((fold) => foldVerdict(fold, message)));
	if (!verdicts.size) return false;
	if (verdicts.has("strong")) return true;
	if (verdicts.has("truncated")) return false;
	// Exact port of the proven 0.11.1 policy: uncountable placeholders are accepted
	// to avoid destructive clear/re-paste overlap; materially short counts fail.
	return true;
}

/** Enter/클리어 후 입력창 잔류: 꼬리 토큰 또는 paste 접힘 표식. */
export function residue(pane: string, message: string): boolean {
	const token = tailToken(message);
	return Boolean(
		(token && normalizePane(pane).includes(token)) || folds(pane).length,
	);
}

function inputArea(pane: string): string | undefined {
	const lines = pane.split("\n");
	for (let bottom = lines.length - 1; bottom >= 0; bottom -= 1) {
		if (!lines[bottom]!.trimStart().startsWith("╰")) continue;
		for (let top = bottom - 1; top >= 0; top -= 1) {
			if (!lines[top]!.trimStart().startsWith("╭")) continue;
			const frame = lines.slice(top, bottom + 1);
			return frame.some((line) => /^\s*│\s*>\s?/u.test(line))
				? frame.join("\n")
				: undefined;
		}
	}
	return undefined;
}

function inputIsBlank(frame: string): boolean {
	const lines = frame.split("\n").slice(1, -1);
	const content = lines
		.map((line) =>
			line
				.replace(/^\s*│\s?/u, "")
				.replace(/\s*│\s*$/u, ""),
		)
		.map((line, index) => (index === 0 ? line.replace(/^>\s?/u, "") : line))
		.join("\n")
		.trim();
	return (
		content === "" ||
		content.startsWith("Type your message...") ||
		content.startsWith("Type your message…")
	);
}

function defaultRunner(cmd: string[]): CommandResult {
	if (DRYRUN) {
		process.stdout.write(`[dryrun] ${cmd.join(" ")}\n`);
		return { status: 0, stdout: "" };
	}
	const result = spawnSync(cmd[0], cmd.slice(1), {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

function defaultWait(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function commandOk(run: Runner, cmd: string[]): boolean {
	return run(cmd).status === 0;
}

/** 관제탑 게이트 판정 — gate 세션 미설정이면 항상 통과. */
export function gateOpen(
	session = GATE_SESSION,
	run: Runner = defaultRunner,
): boolean {
	if (!session) return true;
	return commandOk(run, ["tmux", "has-session", "-t", `=${session}`]);
}

function captureInput(session: string, run: Runner): string | undefined {
	const result = run(["tmux", "capture-pane", "-p", "-t", session]);
	return result.status === 0 ? inputArea(result.stdout) : undefined;
}

function sendDryRun(text: string, session: string): void {
	defaultRunner(["tmux", "send-keys", "-t", session, "-l", "--", text]);
	defaultRunner(["tmux", "send-keys", "-t", session, "Enter"]);
}

/**
 * Inject a literal prompt, verify it arrived before Enter, then verify no prompt
 * residue remains after Enter. A retry is allowed only after verified clearing.
 */
export function injectTmux(
	text: string,
	session = SESSION,
	run: Runner = defaultRunner,
	wait: Waiter = defaultWait,
): boolean {
	if (text.includes("~")) return false;
	if (DRYRUN && run === defaultRunner) {
		sendDryRun(text, session);
		return false;
	}
	const sendLiteral = () =>
		commandOk(run, ["tmux", "send-keys", "-t", session, "-l", "--", text]);
	const clearAndVerify = (): boolean => {
		if (!commandOk(run, ["tmux", "send-keys", "-t", session, "Escape"]))
			return false;
		if (!commandOk(run, ["tmux", "send-keys", "-t", session, "C-c"]))
			return false;
		wait(500);
		let pane = captureInput(session, run);
		if (pane === undefined) return false;
		if (inputIsBlank(pane)) return true;
		if (!commandOk(run, ["tmux", "send-keys", "-t", session, "C-u"]))
			return false;
		wait(500);
		pane = captureInput(session, run);
		return pane !== undefined && inputIsBlank(pane);
	};

	let delivered = false;
	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (!sendLiteral()) return false;
		wait(text.length > 1500 ? 1500 : 700);
		const pane = captureInput(session, run);
		if (pane !== undefined && arrived(pane, text)) {
			delivered = true;
			break;
		}
		if (attempt === 1 || !clearAndVerify()) return false;
	}
	if (!delivered) return false;
	if (!commandOk(run, ["tmux", "send-keys", "-t", session, "Enter"]))
		return false;

	for (let attempt = 0; attempt < 3; attempt += 1) {
		wait(1000);
		const pane = captureInput(session, run);
		if (pane === undefined) continue;
		if (inputIsBlank(pane)) return true;
		if (!residue(pane, text)) return false;
		if (!commandOk(run, ["tmux", "send-keys", "-t", session, "Escape"]))
			return false;
		wait(200);
		if (!commandOk(run, ["tmux", "send-keys", "-t", session, "Enter"]))
			return false;
	}
	return false;
}

function attemptInjection(prompt: string): boolean {
	try {
		return injectTmux(prompt);
	} catch {
		return false;
	}
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
			if (!gateOpen()) {
				process.stdout.write(
					`[daily] gated — tower session '${GATE_SESSION}' closed, no injection\n`,
				);
				return;
			}
			const injected = attemptInjection(prompt);
			if (DRYRUN)
				process.stdout.write(
					`[daily] simulated (${prompt.length} chars) -> ${SESSION}\n`,
				);
			else if (injected)
				process.stdout.write(
					`[daily] injected (${prompt.length} chars) -> ${SESSION}\n`,
				);
			else {
				process.stderr.write(`[daily] injection verification failed -> ${SESSION}\n`);
				process.exitCode = 1;
			}
		} else
			process.stdout.write("[daily] no fresh candidates — no injection\n");
		return;
	}

	// live mode: tail follow.ts stdout
	const seen = new Map<string, number>();
	const rl = createInterface({ input: process.stdin });
	rl.on("line", line => {
		if (!isHighTrigger(line)) return;
		if (!gateOpen()) {
			process.stdout.write(
				`[live] gated — tower session '${GATE_SESSION}' closed: skipped\n`,
			);
			return;
		}
		const sig = triggerSignature(line);
		if (!shouldFire(sig, Date.now(), seen)) return;
		const injected = attemptInjection(liveTriagePrompt(line));
		if (DRYRUN)
			process.stdout.write(`[live] simulated -> ${SESSION}: ${sig}\n`);
		else if (injected)
			process.stdout.write(`[live] injected -> ${SESSION}: ${sig}\n`);
		else {
			seen.delete(sig);
			process.stderr.write(
				`[live] injection verification failed -> ${SESSION}: ${sig}\n`,
			);
		}
	});
}

if (import.meta.main) void main();
