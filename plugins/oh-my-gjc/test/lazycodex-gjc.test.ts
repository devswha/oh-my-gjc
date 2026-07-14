import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const runner = join(import.meta.dir, "../bin/lazycodex-gjc.mjs");
const sandboxes: string[] = [];

type Mode = "success" | "nonzero" | "empty" | "invalid" | "oversized" | "stdout" | "timeout";

type Fixture = {
  readonly root: string;
  readonly cwd: string;
  readonly home: string;
  readonly record: string;
  readonly env: Readonly<Record<string, string>>;
};

function fixture(mode: Mode = "success"): Fixture {
  const root = mkdtempSync(join(tmpdir(), "lazycodex-gjc-test-"));
  sandboxes.push(root);
  const bin = join(root, "bin");
  const cwd = join(root, "workspace");
  const home = join(root, "home");
  const record = join(root, "record");
  mkdirSync(bin);
  mkdirSync(cwd);
  mkdirSync(home);
  mkdirSync(record);
  const fake = `#!${process.execPath}
const fs = require("node:fs");
const cp = require("node:child_process");
const path = require("node:path");
const args = process.argv.slice(2);
const outIndex = args.indexOf("-o");
const out = outIndex >= 0 ? args[outIndex + 1] : "";
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(join(record, "args.json"))}, JSON.stringify(args));
  fs.writeFileSync(${JSON.stringify(join(record, "executable"))}, process.argv[1]);
  fs.writeFileSync(${JSON.stringify(join(record, "env.json"))}, JSON.stringify(process.env));
  fs.writeFileSync(${JSON.stringify(join(record, "stdin"))}, input);
  fs.writeFileSync(${JSON.stringify(join(record, "mode"))}, String(fs.statSync(out).mode & 0o777));
  fs.writeFileSync(${JSON.stringify(join(record, "temp"))}, path.dirname(out));
  if (${JSON.stringify(mode)} === "nonzero") process.exit(23);
  if (${JSON.stringify(mode)} === "invalid") fs.writeFileSync(out, Buffer.from([0xff]));
  else if (${JSON.stringify(mode)} === "oversized") fs.writeFileSync(out, Buffer.alloc(1024 * 1024 + 1, 65));
  else if (${JSON.stringify(mode)} === "success") fs.writeFileSync(out, "worker-result");
  else if (${JSON.stringify(mode)} === "stdout") {
    fs.writeFileSync(out, "must-not-succeed");
    for (let index = 0; index < 2049; index += 1) process.stdout.write(Buffer.alloc(512, 65));
  }
  if (${JSON.stringify(mode)} === "timeout") {
    const child = cp.spawn("/bin/sleep", ["30"]);
    fs.writeFileSync(${JSON.stringify(join(record, "descendant"))}, String(child.pid));
    setInterval(() => {}, 1000);
  }
});
`;
  const codex = join(bin, "codex");
  writeFileSync(codex, fake, { mode: 0o755 });
  const sentinel = join(home, ".gjc/session/sentinel");
  mkdirSync(join(home, ".gjc/session"), { recursive: true });
  writeFileSync(sentinel, "unchanged");
  return {
    root,
    cwd,
    home,
    record,
    env: {
      PATH: bin,
      HOME: home,
      CODEX_HOME: join(home, ".codex"),
      SHELL: "/bin/zsh",
      USER: "tester",
      LOGNAME: "tester",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      TERM: "xterm",
      TMPDIR: join(root, "tmp"),
      GJC_SESSION_ID: "must-not-leak",
      OPENAI_API_KEY: "must-not-leak",
      PROVIDER_API_TOKEN_CANARY: "must-not-leak",
      SSH_AUTH_SOCK: "must-not-leak",
      HTTPS_PROXY: "must-not-leak",
    },
  };
}

function run(f: Fixture, args: readonly string[] = [], input: string | Uint8Array = "ship it") {
  mkdirSync(f.env.TMPDIR, { recursive: true });
  return spawnSync(process.execPath, [runner, "--cwd", f.cwd, ...args], {
    env: f.env,
    input,
    encoding: "utf8",
    timeout: 5_000,
  });
}

function parsedRecord(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new TypeError("invalid fixture array");
  return value;
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid fixture record");
  return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string"));
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("lazycodex-gjc isolated runner", () => {
  test("passes an exact restrictive argv, isolated env, and raw task payload", () => {
    const f = fixture();
    const task = "line one\n$(touch /tmp/nope) --model injected\nline three";
    const result = run(f, ["--model", "gpt-5.6-sol", "--sandbox", "workspace-write"], task);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const outputPath = args[args.indexOf("-o") + 1];
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(args).toEqual(["exec", "--ephemeral", "--color", "never", "--sandbox", "workspace-write", "-C", f.cwd, "-c", 'approval_policy="never"', "-c", 'network_access="disabled"', "-o", outputPath, "--model", "gpt-5.6-sol", "-"]);
    expect(readFileSync(join(f.record, "executable"), "utf8")).toBe(join(f.root, "bin/codex"));
    expect(readFileSync(join(f.record, "stdin"), "utf8")).toStartWith("$omo:ultrawork\n");
    expect(readFileSync(join(f.record, "stdin"), "utf8").split("<lazycodex-gjc-task>\n")[1]?.split("\n</lazycodex-gjc-task>")[0]).toBe(task);
    expect(args).not.toContain(task);
    expect(readFileSync(join(f.record, "mode"), "utf8")).toBe("384");
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
    expect(readFileSync(join(f.home, ".gjc/session/sentinel"), "utf8")).toBe("unchanged");
  });

  test("uses read-only defaults and an allowlisted child environment", () => {
    const f = fixture();
    const result = run(f);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const env = stringRecord(parsedRecord(join(f.record, "env.json")));
    expect(result.status, result.stderr).toBe(0);
    expect(args.slice(0, 8)).toEqual(["exec", "--ephemeral", "--color", "never", "--sandbox", "read-only", "-C", f.cwd]);
    expect(env.GJC_SESSION_ID).toBeUndefined();
    expect(env.OPENAI_API_KEY).not.toBe("must-not-leak");
    expect(env.PROVIDER_API_TOKEN_CANARY).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.GJC_NOTIFICATIONS).toBe("0");
    expect(env.LAZYCODEX_AUTO_UPDATE_DISABLED).toBe("1");
    expect(env.LAZYCODEX_CONFIG_MIGRATION_DISABLED).toBe("1");
    expect(env.OMO_CODEX_DISABLE_POSTHOG).toBe("1");
    expect(env.CODEX_CODEGRAPH_ENABLED).toBe("0");
  });

  test.each([
    [["--wat"], "ship it"],
    [["--cwd", "/missing"], "ship it"],
    [["--cwd", "."], "ship it"],
    [["--sandbox", "danger-full-access"], "ship it"],
    [["--sandbox", "read-only", "--sandbox", "read-only"], "ship it"],
    [["--model", "bad model"], "ship it"],
    [["--model", "vendor:model"], "ship it"],
    [["--timeout-seconds", "0"], "ship it"],
    [[], "   \n"],
    [[], "nul\0task"],
    [[], "x".repeat(256 * 1024 + 1)],
  ])("rejects malformed arguments or task input", (args, input) => {
    const f = fixture();
    const result = run(f, args, input);
    expect(result.status).toBe(2);
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });

  test("returns 127 when codex is unavailable", () => {
    const f = fixture();
    rmSync(join(f.root, "bin/codex"));
    expect(run(f).status).toBe(127);
  });

  test.each([["nonzero", 23], ["empty", 1], ["invalid", 1], ["oversized", 1], ["stdout", 1]] as const)("fails closed for %s child output", (mode, status) => {
    const f = fixture(mode);
    const result = run(f);
    expect(result.status).toBe(status);
    expect(result.stdout).toBe("");
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
  });

  test("kills the process group and cleans temporary output on timeout", () => {
    const f = fixture("timeout");
    const result = run(f, ["--timeout-seconds", "1"]);
    const pid = Number.parseInt(readFileSync(join(f.record, "descendant"), "utf8"), 10);
    const procState = existsSync(`/proc/${pid}/stat`) ? readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] : undefined;
    expect(result.status).toBe(124);
    expect(procState === undefined || procState === "Z").toBe(true);
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
  });

  test("rejects invalid UTF-8 task bytes and exposes help without invoking codex", () => {
    const f = fixture();
    expect(run(f, [], Uint8Array.from([0xff])).status).toBe(2);
    const help = spawnSync(process.execPath, [runner, "--help"], { env: f.env, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--sandbox read-only|workspace-write");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });
});
