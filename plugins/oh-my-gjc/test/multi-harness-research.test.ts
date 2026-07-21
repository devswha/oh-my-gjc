import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runner = join(import.meta.dir, "../bin/multi-harness-research.mjs");
const fixtures: string[] = [];

type Lane = "gjc-opus" | "gjc-sol" | "codex-sol" | "claude-ultracode";
type Fixture = {
  root: string;
  home: string;
  target: string;
  binding: string;
  runner: string;
  record: string;
  modes: string;
  artifactRoot: string;
  env: Record<string, string>;
};

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function privateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function privateFile(path: string, value: string, mode = 0o600): void {
  writeFileSync(path, value, { mode });
  chmodSync(path, mode);
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "multi-harness-research-"));
  fixtures.push(root);
  const home = join(root, "home");
  const target = join(root, "target");
  const runtime = join(root, "runtime");
  const record = join(root, "records");
  const modes = join(root, "modes.json");
  privateDirectory(home);
  privateDirectory(target);
  privateDirectory(runtime);
  privateDirectory(record);
  privateDirectory(join(home, ".local/share/gjc"));
  privateDirectory(join(home, ".codex"));
  privateDirectory(join(home, ".claude"));
  privateFile(join(home, ".local/share/gjc/auth.json"), JSON.stringify({ token: "gjc-canary-75ddc0" }));
  privateFile(join(home, ".codex/auth.json"), JSON.stringify({ token: "codex-canary-75ddc0" }));
  privateFile(join(home, ".claude/.credentials.json"), JSON.stringify({ token: "claude-canary-75ddc0" }));
  privateFile(join(target, "evidence.txt"), "line one\nline two\n");
  privateDirectory(join(target, ".git"));
  privateDirectory(join(target, ".gjc"));
  privateFile(join(target, ".git/sentinel"), "git sentinel");
  privateFile(join(target, ".gjc/sentinel"), "gjc sentinel");
  privateFile(modes, "{}");

  const model = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const own = path.basename(process.argv[1]);
const lane = own === "gjc" ? (args[args.indexOf("--model") + 1] === "anthropic/claude-opus-4-8" ? "gjc-opus" : "gjc-sol") : own === "codex" ? "codex-sol" : "claude-ultracode";
const modes = JSON.parse(fs.readFileSync(${JSON.stringify(modes)}, "utf8"));
let stdin = "";
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(path.join(${JSON.stringify(record)}, lane + ".json"), JSON.stringify({ lane, args, stdin, env: process.env }));
  const mode = modes[lane] || "success";
  if (mode === "nonzero") { process.stderr.write("fixture command failure\\n"); process.exit(23); return; }
  if (mode === "auth401") { process.stderr.write("HTTP 401 unauthorized\\n"); process.exit(1); return; }
  if (mode === "invalid") { process.stdout.write("not a report"); return; }
  if (mode === "taskEcho") { process.stdout.write("## Conclusion\\n" + stdin + "\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "taskEchoCrLf") { process.stdout.write(("## Conclusion\\n" + stdin + "\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n").replace(/\\n/g, "\\r\\n")); return; }
  if (mode === "secret") { process.stdout.write("## Conclusion\\nsecret\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\ngjc-canary-75ddc0\\n"); return; }
  if (mode === "escapedSecret") { process.stdout.write("## Conclusion\\n\\\\u0061bc\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "shortSecret") { process.stdout.write("## Conclusion\\nabc\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "manySecret") { process.stdout.write("## Conclusion\\nsecret-064\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "recommendation") { process.stdout.write("## Conclusion\\nThis is the recommendation.\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "extraHeading") { process.stdout.write("## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Extra\\nno\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "h1Heading") { process.stdout.write("# Preface\\ntext\\n## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "setextHeading") { process.stdout.write("Preface\\n=======\\n## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "recommendVerb") { process.stdout.write("## Conclusion\\nI recommend this.\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "rankVerb") { process.stdout.write("## Conclusion\\nA ranks first.\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "indentedHeading") { process.stdout.write("   ## Preface\\ntext\\n## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "indentedSetext") { process.stdout.write("   Preface\\n   =======\\n## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "htmlHeading") { process.stdout.write("<h2>Preface</h2>\\n## Conclusion\\nok\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "pluralGovernance") { process.stdout.write("## Conclusion\\nThese have different majorities and consensuses.\\n## Evidence\\nsrc/a.ts:7\\n## Uncertainties\\nnone\\n"); return; }
  if (mode === "oversized") { process.stdout.write(Buffer.alloc(1024 * 1024 + 1, 65)); return; }
  if (mode === "overflow") { process.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1, 65)); return; }
  if (mode === "timeout") { setInterval(() => {}, 1000); return; }
  process.stdout.write("## Conclusion\\nIndependent result for " + lane + "\\n## Evidence\\nsrc/evidence.ts:2\\n## Uncertainties\\nFixture-only limitations.\\n");
});
`;
  const bwrap = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const args = process.argv.slice(2);
const modes = JSON.parse(fs.readFileSync(${JSON.stringify(modes)}, "utf8"));
const divider = args.indexOf("--");
if (divider < 0) process.exit(126);
const adapter = args[divider + 1];
const adapterArgs = args.slice(divider + 2);
const own = path.basename(adapter);
const lane = own === "gjc" ? (adapterArgs[adapterArgs.indexOf("--model") + 1] === "anthropic/claude-opus-4-8" ? "gjc-opus" : "gjc-sol") : own === "codex" ? "codex-sol" : "claude-ultracode";
const masks = [];
const credentials = [];
for (let index = 0; index < args.length - 2; index += 1) {
  if (args[index] !== "--ro-bind") continue;
  const [source, destination] = [args[index + 1], args[index + 2]];
  if (destination === ${JSON.stringify(join(target, ".git"))} || destination === ${JSON.stringify(join(target, ".gjc"))}) {
    masks.push({ source, destination, source_type: fs.lstatSync(source).isDirectory() ? "directory" : "file" });
  }
  if (destination.endsWith("/auth.json") || destination.endsWith("/.credentials.json")) {
    credentials.push({ source, destination, bytes: fs.readFileSync(source, "utf8") });
  }
}
if (modes.credentialRace) {
  fs.writeFileSync(${JSON.stringify(join(home, ".local/share/gjc/auth.json"))}, JSON.stringify({ token: "changed-after-scan" }), { mode: 0o600 });
}
const bwrapRecord = ${JSON.stringify(join(record, "bwrap.json"))};
fs.writeFileSync(bwrapRecord + "." + process.pid, JSON.stringify(args));
fs.renameSync(bwrapRecord + "." + process.pid, bwrapRecord);
fs.writeFileSync(path.join(${JSON.stringify(record)}, "bwrap-" + lane + ".json"), JSON.stringify({ args, masks, credentials }));
const child = cp.spawnSync(adapter, adapterArgs, { input: fs.readFileSync(0), env: process.env, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
if (child.stdout) fs.writeSync(1, child.stdout);
if (child.stderr) fs.writeSync(2, child.stderr);
process.exit(child.status ?? 127);
`;
  for (const name of ["gjc", "codex", "claude"]) privateFile(join(runtime, name), model, 0o700);
  privateFile(join(runtime, "bwrap"), bwrap, 0o700);
  const runtimeRunner = join(runtime, "multi-harness-research.mjs");
  copyFileSync(runner, runtimeRunner);
  chmodSync(runtimeRunner, 0o700);
  const binding = join(runtime, "binding");
  const node = realpathSync(process.execPath);
  const lines = [
    "multi-harness-research-binding-v1",
    home,
    digest(runtimeRunner),
    runtimeRunner,
    digest(node),
    node,
    digest(join(runtime, "gjc")),
    join(runtime, "gjc"),
    digest(join(runtime, "codex")),
    join(runtime, "codex"),
    runtime,
    digest(join(runtime, "claude")),
    join(runtime, "claude"),
    digest(join(runtime, "bwrap")),
    join(runtime, "bwrap"),
    "multi-harness-credential-schema-v1",
    join(home, ".local/share/gjc/auth.json"),
    join(home, ".codex/auth.json"),
    join(home, ".claude/.credentials.json"),
  ];
  privateFile(binding, `${lines.join("\n")}\n`);
  return {
    root,
    home,
    target,
    binding,
    runner: runtimeRunner,
    record,
    modes,
    artifactRoot: join(home, ".local/share"),
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      XDG_DATA_HOME: join(home, ".local/share"),
      CODEX_HOME: join(home, ".codex"),
      LANG: "C.UTF-8",
    },
  };
}

function invoke(f: Fixture, task: string | Uint8Array = "Compare the repository behavior.", extra: Record<string, string> = {}) {
  const child = spawnSync(process.execPath, [f.runner, "run", "--target", f.target, "--binding", f.binding], {
    env: { ...f.env, ...extra },
    input: task,
    encoding: "utf8",
    timeout: 12_000,
  });
  return { child };
}

function result(child: ReturnType<typeof spawnSync>): Record<string, unknown> {
  expect(child.stdout).not.toBe("");
  return JSON.parse(String(child.stdout).trim()) as Record<string, unknown>;
}

function lanes(f: Fixture): Record<string, { lane: Lane; args: string[]; stdin: string; env: Record<string, string> }> {
  return Object.fromEntries(["gjc-opus", "gjc-sol", "codex-sol", "claude-ultracode"].map((lane) => [lane, JSON.parse(readFileSync(join(f.record, `${lane}.json`), "utf8"))]));
}

function receipt(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
}
function handoff(child: ReturnType<typeof spawnSync>): Record<string, string> {
  const report = result(child);
  const receiptPath = report.finalization_receipt_path;
  expect(typeof receiptPath).toBe("string");
  return receipt(receiptPath as string);
}

function bwrapLane(f: Fixture, lane: Lane): { args: string[]; masks: Array<{ source: string; destination: string; source_type: string }>; credentials: Array<{ source: string; destination: string; bytes: string }> } {
  return JSON.parse(readFileSync(join(f.record, `bwrap-${lane}.json`), "utf8"));
}
function runFrom(f: Fixture, executable = f.runner, env = f.env) {
  return spawnSync(process.execPath, [executable, "run", "--target", f.target, "--binding", f.binding], {
    env,
    input: "task",
    encoding: "utf8",
    timeout: 12_000,
  });
}

function replaceBindingCredential(f: Fixture, index: number, path: string): void {
  const lines = readFileSync(f.binding, "utf8").trimEnd().split("\n");
  lines[index] = path;
  privateFile(f.binding, `${lines.join("\n")}\n`);
}
const standardComparison = "## Commonalities\nAll lanes inspected the same task.\n\n## Differences\nDifferences are descriptive only.\n\n## Uncertainty\nNo result is authoritative.";

function finalizedSummary(base: string, comparison = standardComparison): Buffer {
  return Buffer.from(base.replace("comparison_status: pending", "comparison_status: finalized").replace("<!-- OMG_MULTI_HARNESS_COMPARISON_PENDING -->", comparison.trimEnd()), "utf8");
}

function finalize(f: Fixture, handoff: Record<string, string>, comparison = standardComparison) {
  const receiptPath = join(handoff.run_dir, "finalization-receipt.json");
  return spawnSync(process.execPath, [f.runner, "finalize-comparison", "--run-dir", handoff.run_dir, "--binding", f.binding], {
    env: f.env,
    input: JSON.stringify({ version: "multi-harness-finalize-v1", receipt_path: receiptPath, comparison }),
    encoding: "utf8",
    timeout: 12_000,
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("multi-harness-research runner", () => {
  test("fans exactly four fixed selectors one byte-identical task and suffix", () => {
    const f = fixture();
    const { child } = invoke(f, "Line one\r\nLine two");
    expect(child.status).toBe(0);
    const report = result(child);
    expect(report.lane_status).toBe("COMPLETE");
    const observed = lanes(f);
    expect(Object.keys(observed)).toEqual(["gjc-opus", "gjc-sol", "codex-sol", "claude-ultracode"]);
    const prompts = Object.values(observed).map((entry) => entry.stdin);
    expect(new Set(prompts).size).toBe(1);
    expect(prompts[0]).toContain("Line one\nLine two\n");
    expect(prompts[0]).toContain("four independent read-only research harnesses");
    expect(observed["gjc-opus"].args).toEqual(expect.arrayContaining(["--model", "anthropic/claude-opus-4-8", "--thinking", "max", "--no-session", "--no-extensions", "--no-skills", "--no-rules"]));
    expect(observed["gjc-sol"].args).toEqual(expect.arrayContaining(["--model", "openai-codex/gpt-5.6-sol", "--thinking", "xhigh"]));
    expect(observed["codex-sol"].args).toEqual(expect.arrayContaining(["exec", "--ephemeral", "--model", "gpt-5.6-sol", "-c", 'model_reasoning_effort="xhigh"', "--ignore-user-config", "--ignore-rules"]));
    expect(observed["claude-ultracode"].args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--effort", "ultracode", "--allowedTools", "Read,Grep,Glob,WebSearch,WebFetch"]));
    for (const entry of Object.values(observed)) expect(entry.args.join(" ")).not.toMatch(/\b(?:Bash|Write|Edit|Notebook|team|omo)\b/i);
  });

  test("records task digest, XDG-only artifacts, private modes, and no raw task", () => {
    const f = fixture();
    const task = "Research unique-task-canary-3a70d2.";
    const { child } = invoke(f, task);
    expect(child.status).toBe(0);
    const sealed = handoff(child);
    const summary = readFileSync(join(sealed.run_dir, "summary.md"), "utf8");
    expect(summary).toContain(`task_sha256: ${createHash("sha256").update(`${task}\n`).digest("hex")}`);
    expect(summary).toContain(`task_bytes: ${Buffer.byteLength(`${task}\n`, "utf8")}`);
    expect(summary).not.toContain(task);
    expect(summary).toContain("comparison_status: pending");
    expect(sealed.nonce).not.toBe("");
    expect(String(child.stdout)).not.toContain(sealed.nonce);
    expect(statSync(sealed.run_dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(sealed.run_dir, "finalization-receipt.json")).mode & 0o777).toBe(0o600);
    expect(String(result(child).finalization_receipt_path)).toBe(join(sealed.run_dir, "finalization-receipt.json"));
    expect(sealed.run_dir).toStartWith(join(f.artifactRoot, "oh-my-gjc/multi-harness"));
    for (const name of ["summary.md", "finalization-control.json", "finalization-receipt.json", "lanes/01-gjc-opus.md", "lanes/02-gjc-sol.md", "lanes/03-codex-sol.md", "lanes/04-claude-ultracode.md"]) {
      expect(readFileSync(join(sealed.run_dir, name), "utf8")).not.toContain("unique-task-canary");
    }
  });

  test("uses COMPLETE/INCOMPLETE/FATAL exits and preserves successful peers", () => {
    const complete = fixture();
    expect(invoke(complete).child.status).toBe(0);
    const partial = fixture();
    privateFile(partial.modes, JSON.stringify({ "codex-sol": "nonzero" }));
    const partialRun = invoke(partial);
    expect(partialRun.child.status).toBe(10);
    const partialReceipt = handoff(partialRun.child);
    const partialSummary = readFileSync(join(partialReceipt.run_dir, "summary.md"), "utf8");
    expect(partialSummary).toContain("lane_status: INCOMPLETE");
    expect(partialSummary).toContain("codex-sol: FAILED (nonzero_exit)");
    expect(existsSync(join(partialReceipt.run_dir, "lanes/01-gjc-opus.md"))).toBe(true);
    expect(readFileSync(join(partialReceipt.run_dir, "lanes/03-codex-sol.md"), "utf8")).toContain("status: FAILED");
    const failed = fixture();
    privateFile(failed.modes, JSON.stringify({ "gjc-opus": "invalid", "gjc-sol": "invalid", "codex-sol": "invalid", "claude-ultracode": "invalid" }));
    const failedRun = invoke(failed);
    expect(failedRun.child.status).toBe(1);
    expect(readFileSync(join(handoff(failedRun.child).run_dir, "summary.md"), "utf8")).toContain("lane_status: FATAL");
  });

  test("fails malformed range and task inputs before spawning a lane", () => {
    const f = fixture();
    const range = invoke(f, "valid", { OMG_MULTI_HARNESS_CONCURRENCY: "0" });
    expect(range.child.status).toBe(1);
    expect(readdirSync(f.record)).toEqual([]);
    const nul = invoke(f, Buffer.from([0x61, 0x00, 0x62]));
    expect(nul.child.status).toBe(1);
    expect(readdirSync(f.record)).toEqual([]);
    const timeout = invoke(f, "valid", { OMG_MULTI_HARNESS_TIMEOUT_MINUTES: "121" });
    expect(timeout.child.status).toBe(1);
    expect(readdirSync(f.record)).toEqual([]);
  });

  test("maps invalid output, credential canaries, 401 preflight, and stream limits to closed lane classes", () => {
    for (const [mode, expected] of [["invalid", "invalid_output"], ["taskEcho", "contract_breach"], ["taskEchoCrLf", "contract_breach"], ["secret", "contract_breach"], ["recommendation", "contract_breach"], ["recommendVerb", "contract_breach"], ["rankVerb", "contract_breach"], ["pluralGovernance", "contract_breach"], ["extraHeading", "invalid_output"], ["h1Heading", "invalid_output"], ["setextHeading", "invalid_output"], ["indentedHeading", "invalid_output"], ["indentedSetext", "invalid_output"], ["htmlHeading", "invalid_output"], ["oversized", "invalid_output"], ["overflow", "contract_breach"], ["auth401", "preflight"]] as const) {
      const f = fixture();
      privateFile(f.modes, JSON.stringify({ "gjc-opus": mode }));
      const run = invoke(f, "canary task");
      expect(run.child.status).toBe(10);
      const sealed = handoff(run.child);
      const text = readFileSync(join(sealed.run_dir, "summary.md"), "utf8");
      expect(text).toContain(`gjc-opus: FAILED (${expected})`);
      expect(text).not.toContain("gjc-canary-75ddc0");
      expect(readFileSync(join(sealed.run_dir, "lanes/01-gjc-opus.md"), "utf8")).toContain(`error_class: ${expected}`);
    }
  }, 15_000);
  test("scans short credential strings and values beyond the former cap", () => {
    const short = fixture();
    privateFile(join(short.home, ".local/share/gjc/auth.json"), JSON.stringify({ token: "abc" }));
    privateFile(short.modes, JSON.stringify({ "gjc-opus": "shortSecret" }));
    const shortRun = invoke(short);
    expect(shortRun.child.status).toBe(10);
    expect(readFileSync(join(handoff(shortRun.child).run_dir, "summary.md"), "utf8")).toContain("gjc-opus: FAILED (contract_breach)");

    const many = fixture();
    privateFile(join(many.home, ".local/share/gjc/auth.json"), JSON.stringify({ tokens: Array.from({ length: 65 }, (_, index) => `secret-${String(index).padStart(3, "0")}`) }));
    privateFile(many.modes, JSON.stringify({ "gjc-opus": "manySecret" }));
    const manyRun = invoke(many);
    expect(manyRun.child.status).toBe(10);
    expect(readFileSync(join(handoff(manyRun.child).run_dir, "summary.md"), "utf8")).toContain("gjc-opus: FAILED (contract_breach)");
    const escaped = fixture();
    privateFile(join(escaped.home, ".local/share/gjc/auth.json"), '{"opaque":"\\u0061bc"}');
    privateFile(escaped.modes, JSON.stringify({ "gjc-opus": "escapedSecret" }));
    const escapedRun = invoke(escaped);
    expect(escapedRun.child.status).toBe(10);
    expect(readFileSync(join(handoff(escapedRun.child).run_dir, "summary.md"), "utf8")).toContain("gjc-opus: FAILED (contract_breach)");
  });
  test("interrupt reaps active lanes into the closed timeout state", async () => {
    const f = fixture();
    privateFile(f.modes, JSON.stringify({ "gjc-opus": "timeout" }));
    const child = spawn(process.execPath, [f.runner, "run", "--target", f.target, "--binding", f.binding], {
      env: f.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.end("interrupt canary");
    for (let attempt = 0; attempt < 40 && !existsSync(join(f.record, "bwrap.json")); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    child.kill("SIGINT");
    const code = await new Promise<number | null>((resolve) => child.once("close", resolve));
    expect(code).toBe(1);
    const report = JSON.parse(stdout.trim()) as Record<string, string>;
    const sealed = receipt(report.finalization_receipt_path);
    expect(stdout).not.toContain(sealed.nonce);
    expect(readFileSync(join(sealed.run_dir, "summary.md"), "utf8")).toContain("gjc-opus: FAILED (timeout)");
  });

  test("does not inherit credential, proxy, or shell-token environment variables into adapters", () => {
    const f = fixture();
    const { child } = invoke(f, "read only", { OPENAI_API_KEY: "env-canary", HTTPS_PROXY: "https://proxy.invalid", SSH_AUTH_SOCK: "sock-canary" });
    expect(child.status).toBe(0);
    for (const entry of Object.values(lanes(f))) {
      expect(entry.env.OPENAI_API_KEY ?? "").toBe("");
      expect(entry.env.HTTPS_PROXY ?? "").toBe("");
      expect(entry.env.SSH_AUTH_SOCK ?? "").toBe("");
      expect(entry.env.HOME).not.toBe(f.home);
    }
  });

  test("rejects symlinked/writable credential leaves and a target inside protected state", () => {
    const auth = fixture();
    const real = join(auth.root, "outside-auth");
    privateFile(real, "token");
    rmSync(join(auth.home, ".codex/auth.json"));
    symlinkSync(real, join(auth.home, ".codex/auth.json"));
    const authRun = invoke(auth);
    expect(authRun.child.status).toBe(1);
    expect(readdirSync(auth.record)).toEqual([]);
    const protectedTarget = fixture();
    const child = spawnSync(process.execPath, [protectedTarget.runner, "run", "--target", protectedTarget.home, "--binding", protectedTarget.binding], { env: protectedTarget.env, input: "task", encoding: "utf8" });
    expect(child.status).toBe(1);
    expect(readdirSync(protectedTarget.record)).toEqual([]);
  });
  test("rejects alternate default credential leaves before any lane starts", () => {
    const xdg = fixture();
    const alternateXdg = join(xdg.home, "alternate-xdg");
    privateDirectory(join(alternateXdg, "gjc"));
    privateFile(join(alternateXdg, "gjc/auth.json"), JSON.stringify({ token: "alternate-gjc" }));
    replaceBindingCredential(xdg, 16, join(alternateXdg, "gjc/auth.json"));
    const xdgEnv = { ...xdg.env };
    delete xdgEnv.XDG_DATA_HOME;
    expect(runFrom(xdg, xdg.runner, xdgEnv).status).toBe(1);
    expect(readdirSync(xdg.record)).toEqual([]);

    const codex = fixture();
    const alternateCodex = join(codex.home, "alternate-codex");
    privateDirectory(alternateCodex);
    privateFile(join(alternateCodex, "auth.json"), JSON.stringify({ token: "alternate-codex" }));
    replaceBindingCredential(codex, 17, join(alternateCodex, "auth.json"));
    const codexEnv = { ...codex.env };
    delete codexEnv.CODEX_HOME;
    expect(runFrom(codex, codex.runner, codexEnv).status).toBe(1);
    expect(readdirSync(codex.record)).toEqual([]);
  });
  test("rejects targets and runtime roots that overlap protected state", () => {
    const ancestor = fixture();
    const ancestorRun = spawnSync(process.execPath, [ancestor.runner, "run", "--target", ancestor.root, "--binding", ancestor.binding], { env: ancestor.env, input: "task", encoding: "utf8" });
    expect(ancestorRun.status).toBe(1);
    expect(readdirSync(ancestor.record)).toEqual([]);

    const credentialTarget = fixture();
    const credentialRun = spawnSync(process.execPath, [credentialTarget.runner, "run", "--target", join(credentialTarget.home, ".codex"), "--binding", credentialTarget.binding], { env: credentialTarget.env, input: "task", encoding: "utf8" });
    expect(credentialRun.status).toBe(1);
    expect(readdirSync(credentialTarget.record)).toEqual([]);

    const artifactTarget = fixture();
    const artifactPath = join(artifactTarget.artifactRoot, "oh-my-gjc", "multi-harness");
    privateDirectory(join(artifactTarget.artifactRoot, "oh-my-gjc"));
    privateDirectory(artifactPath);
    const artifactRun = spawnSync(process.execPath, [artifactTarget.runner, "run", "--target", artifactPath, "--binding", artifactTarget.binding], { env: artifactTarget.env, input: "task", encoding: "utf8" });
    expect(artifactRun.status).toBe(1);
    expect(readdirSync(artifactTarget.record)).toEqual([]);

    const runtimeRoot = fixture();
    const lines = readFileSync(runtimeRoot.binding, "utf8").trimEnd().split("\n");
    lines[10] = "/";
    privateFile(runtimeRoot.binding, `${lines.join("\n")}\n`);
    const runtimeRun = invoke(runtimeRoot);
    expect(runtimeRun.child.status).toBe(10);
    const runtimeSealed = handoff(runtimeRun.child);
    expect(readFileSync(join(runtimeSealed.run_dir, "lanes/03-codex-sol.md"), "utf8")).toContain("error_class: preflight");
    expect(existsSync(join(runtimeRoot.record, "codex-sol.json"))).toBe(false);
  });

  test("authorizes only the bound runner or a private launch snapshot", () => {
    const arbitrary = fixture();
    const copy = join(arbitrary.root, "arbitrary-runner.mjs");
    copyFileSync(arbitrary.runner, copy);
    chmodSync(copy, 0o700);
    expect(runFrom(arbitrary, copy).status).toBe(1);
    expect(readdirSync(arbitrary.record)).toEqual([]);

    const launch = fixture();
    const launchDirectory = join(launch.home, ".cache", "oh-my-gjc", "multi-harness-research", "launch-test-7a2d");
    privateDirectory(launchDirectory);
    const launchRunner = join(launchDirectory, "runner.mjs");
    copyFileSync(launch.runner, launchRunner);
    chmodSync(launchRunner, 0o700);
    expect(runFrom(launch, launchRunner).status).toBe(0);
    const protectedLaunchRun = spawnSync(process.execPath, [launchRunner, "run", "--target", launchDirectory, "--binding", launch.binding], { env: launch.env, input: "task", encoding: "utf8" });
    expect(protectedLaunchRun.status).toBe(1);
  });

  test("binds immutable credential snapshots rather than mutable credential leaves", () => {
    const f = fixture();
    privateFile(f.modes, JSON.stringify({ credentialRace: true }));
    expect(invoke(f).child.status).toBe(0);
    const expected = {
      "gjc-opus": JSON.stringify({ token: "gjc-canary-75ddc0" }),
      "gjc-sol": JSON.stringify({ token: "gjc-canary-75ddc0" }),
      "codex-sol": JSON.stringify({ token: "codex-canary-75ddc0" }),
      "claude-ultracode": JSON.stringify({ token: "claude-canary-75ddc0" }),
    };
    for (const lane of ["gjc-opus", "gjc-sol", "codex-sol", "claude-ultracode"] as Lane[]) {
      const observed = bwrapLane(f, lane);
      expect(observed.credentials).toHaveLength(1);
      expect(observed.credentials[0].bytes).toBe(expected[lane]);
      expect(observed.credentials[0].source).toContain(".lane-");
      expect(observed.credentials[0].source).toEndWith("credential-snapshot");
      expect(observed.args.some((value, index) => value === "--bind" && observed.args[index + 1] === observed.credentials[0].source)).toBe(false);
    }
    expect(readFileSync(join(f.home, ".local/share/gjc/auth.json"), "utf8")).toContain("changed-after-scan");
  });

  test("rejects phase-two normalized task windows and current credential secrets", () => {
    const task = "phase-two-task-canary\r\nsecond line";
    const taskRun = fixture();
    const run = invoke(taskRun, task);
    expect(run.child.status).toBe(0);
    expect(finalize(taskRun, handoff(run.child), `${standardComparison}\n\n${task.replace(/\r\n?/g, "\n")}`)).toHaveProperty("status", 20);

    const credentialRun = fixture();
    const credentialPhase = invoke(credentialRun);
    expect(credentialPhase.child.status).toBe(0);
    expect(finalize(credentialRun, handoff(credentialPhase.child), `${standardComparison}\n\ngjc-canary-75ddc0`)).toHaveProperty("status", 20);
  });

  test("rejects external receipt export arguments before artifact creation", () => {
    const f = fixture();
    const external = join(f.root, "external-receipt.json");
    const child = spawnSync(process.execPath, [f.runner, "run", "--target", f.target, "--binding", f.binding, "--receipt-out", external], { env: f.env, input: "task", encoding: "utf8" });
    expect(child.status).toBe(1);
    expect(existsSync(external)).toBe(false);
    expect(readdirSync(f.record)).toEqual([]);
  });
  test("enforces the 12 KiB comparison cap and canonical receipt provenance", () => {
    const oversized = fixture();
    const oversizedRun = invoke(oversized);
    expect(oversizedRun.child.status).toBe(0);
    expect(finalize(oversized, handoff(oversizedRun.child), "x".repeat(12 * 1024 + 1)).status).toBe(20);

    const forged = fixture();
    const forgedRun = invoke(forged);
    expect(forgedRun.child.status).toBe(0);
    const sealed = handoff(forgedRun.child);
    const receiptPath = join(sealed.run_dir, "finalization-receipt.json");
    privateFile(receiptPath, JSON.stringify({ ...sealed, repo_id: "forged-repo" }));
    expect(finalize(forged, sealed).status).toBe(20);
  });

  test("finalizes comparison once without changing immutable facts", () => {
    const f = fixture();
    const run = invoke(f);
    expect(run.child.status).toBe(0);
    const sealed = handoff(run.child);
    const base = readFileSync(join(sealed.run_dir, "summary.md"), "utf8");
    const baseFacts = /<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(base)?.[1];
    const finalized = finalize(f, sealed);
    expect(finalized.status).toBe(0);
    expect(result(finalized).finalization_status).toBe("FINALIZED");
    const after = readFileSync(join(sealed.run_dir, "summary.md"), "utf8");
    expect(after).toContain("comparison_status: finalized");
    expect(after).toContain("All lanes inspected the same task.");
    expect(/<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(after)?.[1]).toBe(baseFacts);
    expect(finalize(f, sealed).status).toBe(20);
  });

  test("recovers a pending finalized summary once without changing immutable facts", () => {
    const f = fixture();
    const run = invoke(f);
    expect(run.child.status).toBe(0);
    const sealed = handoff(run.child);
    const summaryPath = join(sealed.run_dir, "summary.md");
    const controlPath = join(sealed.run_dir, "finalization-control.json");
    const base = readFileSync(summaryPath, "utf8");
    const baseFacts = /<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(base)?.[1];
    const final = finalizedSummary(base);
    const control = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
    privateFile(controlPath, `${JSON.stringify({ ...control, consumed: false, pending_final_sha256: createHash("sha256").update(final).digest("hex") })}\n`);
    privateFile(summaryPath, final.toString("utf8"));

    const recovered = finalize(f, sealed);
    expect(recovered.status).toBe(0);
    expect(result(recovered).finalization_status).toBe("FINALIZED");
    const recoveredControl = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
    expect(recoveredControl.consumed).toBe(true);
    expect(recoveredControl).not.toHaveProperty("pending_final_sha256");
    expect(recoveredControl.immutable_facts_sha256).toBe(control.immutable_facts_sha256);
    expect(/<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(readFileSync(summaryPath, "utf8"))?.[1]).toBe(baseFacts);
    expect(finalize(f, sealed).status).toBe(20);
  });

  test("rejects a mismatched pending finalized summary without accepting facts", () => {
    const f = fixture();
    const run = invoke(f);
    expect(run.child.status).toBe(0);
    const sealed = handoff(run.child);
    const summaryPath = join(sealed.run_dir, "summary.md");
    const controlPath = join(sealed.run_dir, "finalization-control.json");
    const base = readFileSync(summaryPath, "utf8");
    const baseFacts = /<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(base)?.[1];
    const final = finalizedSummary(base);
    const mismatchedDigest = createHash("sha256").update(Buffer.concat([final, Buffer.from("\n")])).digest("hex");
    const control = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
    privateFile(controlPath, `${JSON.stringify({ ...control, consumed: false, pending_final_sha256: mismatchedDigest })}\n`);
    privateFile(summaryPath, final.toString("utf8"));

    const rejected = finalize(f, sealed);
    expect(rejected.status).toBe(20);
    expect(result(rejected).finalization_status).toBe("FINALIZATION_FAILED");
    const pendingControl = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
    expect(pendingControl.consumed).toBe(false);
    expect(pendingControl.pending_final_sha256).toBe(mismatchedDigest);
    expect(/<!-- OMG_MULTI_HARNESS_FACTS_BEGIN -->\n([^\n]+)/.exec(readFileSync(summaryPath, "utf8"))?.[1]).toBe(baseFacts);
  });

  test("rejects finalizer receipt tampering, forbidden conclusion claims, and base replacement", () => {
    const badInput = fixture();
    const badRun = invoke(badInput);
    const badHandoff = handoff(badRun.child);
    privateFile(join(badHandoff.run_dir, "finalization-receipt.json"), JSON.stringify({ ...badHandoff, nonce: "0".repeat(64) }));
    expect(finalize(badInput, badHandoff).status).toBe(20);
    const forbidden = fixture();
    const forbiddenRun = invoke(forbidden);
    const forbiddenHandoff = handoff(forbiddenRun.child);
    expect(finalize(forbidden, forbiddenHandoff, "This is the consensus winner.").status).toBe(20);
    const race = fixture();
    const raceRun = invoke(race);
    const raceHandoff = handoff(raceRun.child);
    const summary = join(raceHandoff.run_dir, "summary.md");
    const original = readFileSync(summary, "utf8");
    writeFileSync(summary, `${original}\nchanged`, { mode: 0o600 });
    expect(finalize(race, raceHandoff).status).toBe(20);
    expect(readFileSync(summary, "utf8")).toContain("comparison_status: pending");
    const controlRace = fixture();
    const controlRun = invoke(controlRace);
    const controlHandoff = handoff(controlRun.child);
    writeFileSync(join(controlHandoff.run_dir, "finalization-control.json"), "{\"consumed\":false}\n", { mode: 0o600 });
    expect(finalize(controlRace, controlHandoff).status).toBe(20);
    const symlinkRace = fixture();
    const symlinkRun = invoke(symlinkRace);
    const symlinkHandoff = handoff(symlinkRun.child);
    const symlinkSummary = join(symlinkHandoff.run_dir, "summary.md");
    rmSync(symlinkSummary);
    symlinkSync(join(symlinkRace.root, "outside-summary"), symlinkSummary);
    expect(finalize(symlinkRace, symlinkHandoff).status).toBe(20);
  });

  test("masks target Git and GJC state after every target bind without a broad home bind", () => {
    const directory = fixture();
    const gitFile = fixture();
    rmSync(join(gitFile.target, ".git"), { recursive: true });
    privateFile(join(gitFile.target, ".git"), "gitdir: elsewhere\n");
    const absent = fixture();
    rmSync(join(absent.target, ".git"), { recursive: true });
    rmSync(join(absent.target, ".gjc"), { recursive: true });
    for (const [f, types] of [[directory, { ".git": "directory", ".gjc": "directory" }], [gitFile, { ".git": "file", ".gjc": "directory" }], [absent, {}]] as const) {
      expect(invoke(f).child.status).toBe(0);
      for (const lane of ["gjc-opus", "gjc-sol", "codex-sol", "claude-ultracode"] as Lane[]) {
        const observed = bwrapLane(f, lane);
        const targetBind = observed.args.findIndex((value, index) => value === "--ro-bind" && observed.args[index + 1] === f.target && observed.args[index + 2] === f.target);
        expect(targetBind).toBeGreaterThanOrEqual(0);
        expect(observed.args).toContain("--die-with-parent");
        expect(observed.args).toContain("--new-session");
        expect(observed.args.some((value, index) => value === "--bind" && observed.args[index + 1] === f.home && observed.args[index + 2] === f.home)).toBe(false);
        expect(observed.args.join(" ")).not.toContain(`--ro-bind ${f.home} ${f.home}`);
        expect(observed.args.some((value, index) => value === "--dir" && ["/etc/hosts", "/etc/resolv.conf"].includes(observed.args[index + 1]))).toBe(false);
        const codexRuntime = readFileSync(f.binding, "utf8").trimEnd().split("\n")[10];
        const mountsCodexRuntime = observed.args.some((value, index) => value === "--ro-bind" && observed.args[index + 1] === codexRuntime && observed.args[index + 2] === codexRuntime);
        expect(mountsCodexRuntime).toBe(lane === "codex-sol");
        expect(Object.fromEntries(observed.masks.map((mask) => [mask.destination, mask.source_type]))).toEqual(
          f === absent ? {} : {
            [join(f.target, ".git")]: types[".git"],
            [join(f.target, ".gjc")]: types[".gjc"],
          },
        );
        for (const mask of observed.masks) {
          const maskBind = observed.args.findIndex((value, index) => value === "--ro-bind" && observed.args[index + 1] === mask.source && observed.args[index + 2] === mask.destination);
          expect(maskBind).toBeGreaterThan(targetBind);
          expect(mask.source).not.toBe(mask.destination);
        }
        if (f === absent) {
          for (const destination of [join(f.target, ".git"), join(f.target, ".gjc")]) {
            expect(observed.args.some((value, index) => value === "--dir" && observed.args[index + 1] === destination)).toBe(false);
          }
        }
      }
    }
  });
});
