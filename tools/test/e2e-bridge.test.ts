import { describe, expect, it } from "bun:test";
import { type BridgeHandle, formatEvent, runBridge } from "../discord-notify-bridge";

describe("discord-notify-bridge", () => {
	it("formats an ask action into a Discord message body", () => {
		const c = formatEvent({
			type: "action_needed",
			kind: "ask",
			sessionId: "s1",
			question: "Proceed?",
			options: ["Yes", "No"],
		});
		expect(c).toContain("Action needed");
		expect(c).toContain("Proceed?");
		expect(c).toContain("0. Yes");
		expect(c).toContain("1. No");
	});

	it("ignores non-actionable frames (hello / streaming context)", () => {
		expect(formatEvent({ type: "hello" })).toBeNull();
		expect(formatEvent({ type: "turn_stream", chunk: "x" })).toBeNull();
		expect(formatEvent({ type: "context_update" })).toBeNull();
	});

	it("end-to-end: mock GJC endpoint → bridge → Discord webhook receiver", async () => {
		const received: Array<{ content?: string; allowed_mentions?: unknown }> = [];
		const discord = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			async fetch(req) {
				received.push(await req.json());
				return new Response(null, { status: 204 });
			},
		});

		const token = "tok-test";
		const gjc = Bun.serve({
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
					ws.send(JSON.stringify({ type: "hello" }));
					ws.send(
						JSON.stringify({
							type: "action_needed",
							id: "a1",
							kind: "ask",
							sessionId: "sess",
							question: "Deploy?",
							options: ["Yes", "No"],
						}),
					);
				},
				message() {},
			},
		});

		let resolveForward!: () => void;
		const forwarded = new Promise<void>(r => {
			resolveForward = r;
		});
		const handle: BridgeHandle = runBridge({
			endpoint: { url: `ws://127.0.0.1:${gjc.port}`, token, sessionId: "sess" },
			webhook: `http://127.0.0.1:${discord.port}/webhook`,
			onForward: () => resolveForward(),
		});

		await Promise.race([forwarded, Bun.sleep(5000)]);
		handle.close();
		gjc.stop(true);
		discord.stop(true);

		expect(received.length).toBeGreaterThan(0);
		expect(received[0]?.content).toContain("Deploy?");
		expect(received[0]?.allowed_mentions).toEqual({ parse: [] });
	});
});
