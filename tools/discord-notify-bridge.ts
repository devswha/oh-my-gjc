#!/usr/bin/env bun
/**
 * gjc → Discord notification bridge.
 *
 * Connects to a running GJC session's loopback Notifications SDK endpoint
 * (ws://127.0.0.1:<port>/?token=…, discovered from
 * <repo>/.gjc/state/notifications/<sessionId>.json) and forwards
 * `action_needed` / `action_resolved` / `reply_rejected` events to a Discord
 * channel via an incoming webhook.
 *
 * NOTE: a Discord *webhook* is push-only, so this bridge is notify-only — it
 * cannot send replies back into the session. Interactive replies need a Discord
 * bot (gateway), not a webhook.
 *
 * Secret handling: the webhook URL is read from $DISCORD_WEBHOOK_URL or a
 * gitignored file ($DISCORD_WEBHOOK_FILE, default .gjc/secrets/discord-webhook).
 * It is never logged (the WS token is redacted from logs too).
 *
 * Usage:
 *   DISCORD_WEBHOOK_URL=… bun tools/discord-notify-bridge.ts
 *   # or put the URL in .gjc/secrets/discord-webhook and just:
 *   bun tools/discord-notify-bridge.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface NotifyEndpoint {
	url: string;
	token: string;
	sessionId?: string;
	stale?: boolean;
	updatedAt?: number;
}

/** Render an internal notification frame into a Discord message, or null to skip. */
export function formatEvent(msg: Record<string, unknown>): string | null {
	switch (msg?.type) {
		case "action_needed": {
			if (msg.kind === "ask") {
				const options = Array.isArray(msg.options) && msg.options.length
					? `\n${msg.options.map((o, i) => `  ${i}. ${o}`).join("\n")}`
					: "";
				return `🟡 **Action needed** \`${msg.sessionId ?? "?"}\`\n> ${msg.question ?? "(no question)"}${options}`;
			}
			if (msg.kind === "idle") {
				return `💤 **Idle** \`${msg.sessionId ?? "?"}\`\n> ${msg.summary ?? "awaiting next step"}`;
			}
			return null;
		}
		case "action_resolved":
			return `✅ Resolved \`${msg.id}\` (${msg.resolvedBy ?? "?"})`;
		case "reply_rejected":
			return `⚠️ Reply rejected \`${msg.id}\`: ${msg.reason ?? "?"}`;
		default:
			// hello / context_update / turn_stream / activity / image_attachment / pong …
			return null;
	}
}

/** POST a message to a Discord incoming webhook. Returns the HTTP status. */
export async function postDiscord(webhook: string, content: string): Promise<number> {
	const res = await fetch(webhook, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
	});
	return res.status;
}

/** Pick the freshest non-stale endpoint discovery file in a directory. */
export function discoverEndpoint(dir = join(process.cwd(), ".gjc", "state", "notifications")): NotifyEndpoint {
	const eps = readdirSync(dir)
		.filter(f => f.endsWith(".json"))
		.map(f => {
			try {
				const e = JSON.parse(readFileSync(join(dir, f), "utf8")) as NotifyEndpoint & { __m?: number };
				e.__m = statSync(join(dir, f)).mtimeMs;
				return e;
			} catch {
				return null;
			}
		})
		.filter((e): e is NotifyEndpoint & { __m: number } => Boolean(e && !e.stale && e.url && e.token));
	if (eps.length === 0) throw new Error(`No live notification endpoint in ${dir} (is notifications enabled for a running session?)`);
	eps.sort((a, b) => (b.updatedAt ?? b.__m) - (a.updatedAt ?? a.__m));
	return eps[0];
}

export interface BridgeHandle {
	close(): void;
}

/** Connect to a GJC notification endpoint and forward events to a Discord webhook. */
export function runBridge(opts: {
	endpoint: NotifyEndpoint;
	webhook: string;
	log?: (m: string) => void;
	onForward?: (type: string, status: number) => void;
}): BridgeHandle {
	const log = opts.log ?? (() => {});
	const wsUrl = `${opts.endpoint.url}/?token=${encodeURIComponent(opts.endpoint.token)}`;
	let closed = false;
	let ws: WebSocket | null = null;
	const connect = () => {
		if (closed) return;
		ws = new WebSocket(wsUrl);
		ws.addEventListener("open", () => log("[bridge] connected"));
		ws.addEventListener("message", async (ev: MessageEvent) => {
			let msg: Record<string, unknown>;
			try {
				msg = JSON.parse(String(ev.data));
			} catch {
				return;
			}
			const content = formatEvent(msg);
			if (!content) return;
			try {
				const status = await postDiscord(opts.webhook, content);
				log(`[bridge] ${msg.type} → Discord (HTTP ${status})`);
				opts.onForward?.(String(msg.type), status);
			} catch (e) {
				log(`[bridge] Discord POST failed: ${(e as Error).message}`);
			}
		});
		ws.addEventListener("close", () => {
			if (!closed) {
				log("[bridge] connection closed; reconnecting in 2s");
				setTimeout(connect, 2000);
			}
		});
		ws.addEventListener("error", () => {
			/* a close event follows */
		});
	};
	connect();
	return {
		close() {
			closed = true;
			ws?.close();
		},
	};
}

function resolveWebhook(): string {
	const fromEnv = process.env.DISCORD_WEBHOOK_URL?.trim();
	if (fromEnv) return fromEnv;
	const file = process.env.DISCORD_WEBHOOK_FILE?.trim() || join(process.cwd(), ".gjc", "secrets", "discord-webhook");
	try {
		const v = readFileSync(file, "utf8").trim();
		if (v) return v;
	} catch {
		/* fall through */
	}
	throw new Error("No Discord webhook: set $DISCORD_WEBHOOK_URL or write it to .gjc/secrets/discord-webhook");
}

if (import.meta.main) {
	const webhook = resolveWebhook();
	const endpoint: NotifyEndpoint = process.env.GJC_NOTIFY_ENDPOINT
		? JSON.parse(readFileSync(process.env.GJC_NOTIFY_ENDPOINT, "utf8"))
		: discoverEndpoint(process.env.GJC_NOTIFY_DIR || undefined);
	const redact = (u: string) => u.replace(/token=[^&]+/, "token=***");
	console.log(`[bridge] session ${endpoint.sessionId ?? "?"} @ ${redact(`${endpoint.url}/?token=${endpoint.token}`)}`);
	runBridge({ endpoint, webhook, log: m => console.log(m) });
}
