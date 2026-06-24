#!/usr/bin/env bun
/**
 * Mock GJC notifications endpoint — for testing the Discord bridge without a
 * fully-configured gjc notification daemon. Mimics the documented Notifications
 * SDK: a loopback WebSocket that requires the token query param (401 otherwise),
 * writes a discovery file, and emits a real-shaped `action_needed` (ask) frame
 * followed by `action_resolved`. Auto-stops after 20s.
 *
 *   bun tools/test/mock-notify-endpoint.ts
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.GJC_NOTIFY_DIR?.trim() || join(process.cwd(), ".gjc", "state", "notifications");
mkdirSync(dir, { recursive: true });

const token = `mock-${Math.random().toString(36).slice(2)}`;
const sessionId = `mock-${Math.random().toString(36).slice(2, 8)}`;

const server = Bun.serve({
	port: 0,
	hostname: "127.0.0.1",
	fetch(req, srv) {
		const u = new URL(req.url);
		if (u.searchParams.get("token") !== token) return new Response("unauthorized", { status: 401 });
		if (srv.upgrade(req)) return undefined;
		return new Response("ws only", { status: 426 });
	},
	websocket: {
		open(ws) {
			ws.send(JSON.stringify({ type: "hello", version: "mock" }));
			setTimeout(() => {
				ws.send(JSON.stringify({
					type: "action_needed",
					id: "mock_ask_1",
					kind: "ask",
					sessionId,
					question: "Mock notification: proceed with the deploy?",
					options: ["Yes", "No"],
				}));
			}, 500);
			setTimeout(() => {
				ws.send(JSON.stringify({ type: "action_resolved", id: "mock_ask_1", resolvedBy: "local" }));
			}, 1500);
		},
		message() {
			/* accept replies, ignore */
		},
	},
});

const file = join(dir, `${sessionId}.json`);
writeFileSync(
	file,
	JSON.stringify(
		{
			version: 1,
			sessionId,
			pid: process.pid,
			host: "127.0.0.1",
			port: server.port,
			url: `ws://127.0.0.1:${server.port}`,
			token,
			startedAt: Date.now(),
			updatedAt: Date.now(),
			stale: false,
		},
		null,
		2,
	),
	{ mode: 0o600 },
);
console.log(`[mock] endpoint up: ws://127.0.0.1:${server.port} (session ${sessionId})`);
console.log(`[mock] wrote discovery file ${file}`);

function cleanup() {
	try {
		rmSync(file);
	} catch {
		/* ignore */
	}
	server.stop(true);
}
process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(0);
});
setTimeout(() => {
	console.log("[mock] auto-stop");
	cleanup();
	process.exit(0);
}, 20_000);
