import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const runner = join(import.meta.dir, "../bin/lazycodex-gjc.mjs");
const sandboxes: string[] = [];

type Mode = "success" | "success-write" | "success-descendant" | "create-gjc" | "create-gjc-nonzero" | "create-gjc-symlink" | "nonzero" | "symlink-mutate" | "stderr-secret" | "empty" | "invalid" | "oversized" | "oversized-write" | "hard-oversized" | "stdout" | "stdout-infinite" | "final-infinite" | "timeout" | "observe-tokens";

type OmoMode = "valid" | "missing" | "stale" | "incompatible" | "symlinked" | "writable";

type Fixture = {
  readonly root: string;
  readonly cwd: string;
  readonly home: string;
  readonly codexHome: string;
  readonly core: string;
  readonly binding: string;
  readonly record: string;
  readonly env: Readonly<Record<string, string>>;
};

// The runner's trust walk rejects group/other-writable path components, so fixture
// modes must be deterministic regardless of the host umask (e.g. Ubuntu UPG 0002).
function clearWritableBits(path: string): void {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) return;
  chmodSync(path, entry.mode & 0o777 & ~0o022);
  if (entry.isDirectory()) for (const name of readdirSync(path)) clearWritableBits(join(path, name));
}

function fixture(mode: Mode = "success", omoMode: OmoMode = "valid"): Fixture {
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
  mkdirSync(join(cwd, ".gjc"));
  mkdirSync(join(cwd, "nested/repository/.gjc"), { recursive: true });
  mkdirSync(join(home, ".codex"));
  const codexHome = join(home, ".codex-explicit");
  mkdirSync(codexHome);
  writeFileSync(join(codexHome, "config.toml"), 'sandbox_mode = "danger-full-access"\nweb_search = "live"\n[hooks]\n');
  writeFileSync(join(codexHome, "auth.json"), '{"fixture":"auth-canary"}', { mode: 0o600 });
  if (omoMode !== "missing") {
    const version = omoMode === "stale" ? "4.17.1" : "4.18.0";
    const omoRoot = join(codexHome, "plugins/cache/sisyphuslabs/omo", version);
    mkdirSync(join(omoRoot, ".codex-plugin"), { recursive: true });
    mkdirSync(join(omoRoot, "skills/ultrawork"), { recursive: true });
    mkdirSync(join(omoRoot, "components/ultrawork"), { recursive: true });
    const manifestPath = join(omoRoot, ".codex-plugin/plugin.json");
    const skillPath = join(omoRoot, "skills/ultrawork/SKILL.md");
    const componentPath = join(omoRoot, "components/ultrawork/package.json");
    writeFileSync(manifestPath, JSON.stringify({ name: "omo", version }));
    const skill = omoMode === "incompatible"
      ? "---\nname: something-else\ndescription: incompatible\n---\n"
      : "---\nname: ultrawork\ndescription: Binding ultrawork mode directive for omo on Codex.\n---\n<ultrawork-mode>\nULTRAWORK MODE ENABLED!\n</ultrawork-mode>\n";
    if (omoMode === "symlinked") {
      const outside = join(root, "outside-omo-skill.md");
      writeFileSync(outside, skill);
      symlinkSync(outside, skillPath);
    } else {
      writeFileSync(skillPath, skill);
    }
    writeFileSync(componentPath, JSON.stringify({ name: "@code-yeongyu/codex-ultrawork", version }));
    chmodSync(omoRoot, 0o755);
    for (const path of [manifestPath, skillPath, componentPath]) chmodSync(path, 0o644);
  }
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
  fs.writeFileSync(${JSON.stringify(join(record, "codex-home"))}, process.env.CODEX_HOME);
  fs.writeFileSync(${JSON.stringify(join(record, "codex-home-mode"))}, String(fs.statSync(process.env.CODEX_HOME).mode & 0o777));
  const childAuth = path.join(process.env.CODEX_HOME, "auth.json");
  fs.writeFileSync(${JSON.stringify(join(record, "auth-is-symlink"))}, String(fs.lstatSync(childAuth).isSymbolicLink()));
  fs.writeFileSync(${JSON.stringify(join(record, "auth-target"))}, fs.realpathSync(childAuth));
  const workspaceWrite = args.some(value => value.includes('":workspace_roots"={"."="write"}'));
  if (workspaceWrite && ["nonzero", "stderr-secret", "empty", "invalid", "oversized", "oversized-write", "hard-oversized", "stdout", "stdout-infinite", "final-infinite", "timeout"].includes(${JSON.stringify(mode)})) {
    fs.writeFileSync(path.join(${JSON.stringify(cwd)}, "worker-change.txt"), "created");
    const modified = path.join(${JSON.stringify(cwd)}, "modified-by-worker.txt");
    const deleted = path.join(${JSON.stringify(cwd)}, "deleted-by-worker.txt");
    if (fs.existsSync(modified)) fs.writeFileSync(modified, "worker-modified");
    if (fs.existsSync(deleted)) fs.rmSync(deleted);
  }
  if (${JSON.stringify(mode)} === "nonzero") process.exit(23);
  if (${JSON.stringify(mode)} === "symlink-mutate") {
    fs.chmodSync(path.join(${JSON.stringify(cwd)}, "mode-target.txt"), 0o600);
    const link = path.join(${JSON.stringify(cwd)}, "external-link");
    fs.rmSync(link);
    fs.symlinkSync(path.join(${JSON.stringify(root)}, "replacement-target"), link);
    process.exit(23);
  }
  if (${JSON.stringify(mode)} === "stderr-secret") {
    process.stderr.write(input + "\\nFILE-CANARY-7d321\\n");
    process.exit(23);
  }
  if (${JSON.stringify(mode)} === "invalid") fs.writeFileSync(out, Buffer.from([0xff]));
  else if (["oversized", "oversized-write"].includes(${JSON.stringify(mode)})) {
    if (${JSON.stringify(mode)} === "oversized-write") fs.writeFileSync(path.join(${JSON.stringify(cwd)}, "worker-change.txt"), "preserved");
    fs.writeFileSync(out, Buffer.alloc(1024 * 1024 + 1, 65));
  }
  else if (${JSON.stringify(mode)} === "hard-oversized") fs.writeFileSync(out, Buffer.alloc(8 * 1024 * 1024 + 1, 65));
  else if (["success", "success-write", "success-descendant", "create-gjc", "create-gjc-symlink"].includes(${JSON.stringify(mode)})) {
    if (${JSON.stringify(mode)} === "success-write") fs.writeFileSync(path.join(${JSON.stringify(cwd)}, "worker-change.txt"), "persisted");
    fs.writeFileSync(out, "worker-result");
  }
  else if (${JSON.stringify(mode)} === "stdout") {
    fs.writeFileSync(out, "must-not-succeed");
    for (let index = 0; index < 2049; index += 1) process.stdout.write(Buffer.alloc(512, 65));
  }
  else if (${JSON.stringify(mode)} === "observe-tokens") {
    process.stdout.write("event: Authorization: Bearer bearer-canary-raw\\n");
    process.stdout.write("progress token=ghp_ABCDEFGHIJ0123456789 step ok\\n");
    process.stdout.write("plain progress line survives\\n");
    fs.writeFileSync(out, "worker-result");
  }
  if (${JSON.stringify(mode)} === "stdout-infinite") {
    const child = cp.spawn("/bin/sleep", ["30"]);
    fs.writeFileSync(${JSON.stringify(join(record, "descendant"))}, String(child.pid));
    setInterval(() => process.stdout.write(Buffer.alloc(65536, 65)), 1);
  }
  if (${JSON.stringify(mode)} === "final-infinite") {
    const child = cp.spawn("/bin/sleep", ["30"]);
    fs.writeFileSync(${JSON.stringify(join(record, "descendant"))}, String(child.pid));
    setInterval(() => fs.appendFileSync(out, Buffer.alloc(65536, 65)), 1);
  }
  if (${JSON.stringify(mode)} === "timeout") {
    const child = cp.spawn("/bin/sleep", ["30"]);
    fs.writeFileSync(${JSON.stringify(join(record, "descendant"))}, String(child.pid));
    setInterval(() => {}, 1000);
  }
  if (${JSON.stringify(mode)} === "success-descendant") {
    const child = cp.spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" });
    child.unref();
    fs.writeFileSync(${JSON.stringify(join(record, "descendant"))}, String(child.pid));
  }
  if (["create-gjc", "create-gjc-nonzero"].includes(${JSON.stringify(mode)})) {
    const state = path.join(${JSON.stringify(cwd)}, "new/subtree/.gjc");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, "config.toml"), "malicious = true\\n");
  }
  if (${JSON.stringify(mode)} === "create-gjc-nonzero") process.exit(23);
  if (${JSON.stringify(mode)} === "create-gjc-symlink") {
    const state = path.join(${JSON.stringify(root)}, "victim/.gjc");
    const link = path.join(${JSON.stringify(cwd)}, "x/.gjc");
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(state, link);
  }
});
`;
  const codex = join(bin, "codex");
  writeFileSync(codex, fake, { mode: 0o755 });
  const sentinel = join(home, ".gjc/session/sentinel");
  mkdirSync(join(home, ".gjc/session"), { recursive: true });
  writeFileSync(sentinel, "unchanged");
  const binding = join(root, "binding");
  const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
  const systemdRun = "/usr/bin/systemd-run";
  const systemctl = "/usr/bin/systemctl";
  const envBinary = "/usr/bin/env";
  writeFileSync(binding, [
    "lazycodex-gjc-binding-v1",
    home,
    digest(runner),
    runner,
    digest(process.execPath),
    process.execPath,
    digest(codex),
    codex,
    bin,
    codexHome,
    digest(systemdRun),
    systemdRun,
    digest(systemctl),
    systemctl,
    digest(envBinary),
    envBinary,
  ].join("\n") + "\n", { mode: 0o600 });
  clearWritableBits(root);
  if (omoMode === "writable") {
    const omoRoot = join(codexHome, "plugins/cache/sisyphuslabs/omo/4.18.0");
    chmodSync(omoRoot, 0o775);
    for (const path of [".codex-plugin/plugin.json", "skills/ultrawork/SKILL.md", "components/ultrawork/package.json"]) chmodSync(join(omoRoot, path), 0o664);
  }
  return {
    root,
    cwd,
    home,
    codexHome,
    core: codex,
    binding,
    record,
    env: {
      PATH: bin,
      HOME: home,
      CODEX_HOME: codexHome,
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
      ...(process.env.XDG_RUNTIME_DIR ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR } : {}),
      ...(process.env.DBUS_SESSION_BUS_ADDRESS ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS } : {}),
    },
  };
}

function run(f: Fixture, args: readonly string[] = [], input: string | Uint8Array = "ship it") {
  mkdirSync(f.env.TMPDIR, { recursive: true });
  const withCwd = args.includes("--cwd") ? [...args] : ["--cwd", f.cwd, ...args];
  const runnerArgs = withCwd.includes("--binding") ? withCwd : [...withCwd, "--binding", f.binding];
  return spawnSync(process.execPath, [runner, ...runnerArgs], {
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

function updateBinding(f: Fixture, updates: Readonly<Record<number, string>>): void {
  const lines = readFileSync(f.binding, "utf8").trimEnd().split("\n");
  for (const [index, value] of Object.entries(updates)) lines[Number.parseInt(index, 10)] = value;
  writeFileSync(f.binding, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("lazycodex-gjc isolated runner", () => {
  test("uses the standard account .codex when CODEX_HOME is unset", () => {
    const f = fixture();
    rmSync(join(f.home, ".codex"), { recursive: true, force: true });
    renameSync(f.env.CODEX_HOME, join(f.home, ".codex"));
    updateBinding(f, { 9: join(f.home, ".codex") });
    mkdirSync(f.env.TMPDIR, { recursive: true });
    const { CODEX_HOME: _omitted, ...env } = f.env;
    const result = spawnSync(process.execPath, [runner, "--cwd", f.cwd, "--binding", f.binding], {
      env,
      input: "ship it",
      encoding: "utf8",
      timeout: 5_000,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
  });

  test("stays trusted when fixtures are created under a group-writable umask", () => {
    const previous = process.umask(0o002);
    try {
      const f = fixture();
      const result = run(f);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("worker-result");
    } finally {
      process.umask(previous);
    }
  });

  test("isolates child CODEX_HOME while keeping real auth and Codex state protected", () => {
    const f = fixture();
    const result = run(f);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const env = stringRecord(parsedRecord(join(f.record, "env.json")));
    const childCodexHome = readFileSync(join(f.record, "codex-home"), "utf8");
    const filesystem = args.find((value) => value.startsWith("permissions.lazycodex_gjc.filesystem=")) ?? "";

    expect(result.status, result.stderr).toBe(0);
    expect(env.CODEX_HOME).toBe(childCodexHome);
    expect(childCodexHome).not.toBe(f.env.CODEX_HOME);
    expect(childCodexHome).toStartWith(join(f.home, ".cache/oh-my-gjc/lazycodex-gjc"));
    expect(childCodexHome).not.toStartWith(env.TMPDIR ?? "missing-tmpdir");
    expect(readFileSync(join(f.record, "codex-home-mode"), "utf8")).toBe("448");
    expect(readFileSync(join(f.record, "auth-is-symlink"), "utf8")).toBe("true");
    expect(readFileSync(join(f.record, "auth-target"), "utf8")).toBe(realpathSync(join(f.env.CODEX_HOME, "auth.json")));
    expect(args).toContain('cli_auth_credentials_store="file"');
    expect(filesystem).toContain(`${JSON.stringify(childCodexHome)}="read"`);
    expect(filesystem).not.toContain(`${JSON.stringify(join(childCodexHome, "auth.json"))}="deny"`);
    expect(filesystem).toContain(`${JSON.stringify(realpathSync(f.env.CODEX_HOME))}="deny"`);
    expect(readFileSync(join(f.env.CODEX_HOME, "config.toml"), "utf8")).toContain('sandbox_mode = "danger-full-access"');
    expect(readFileSync(join(f.env.CODEX_HOME, "auth.json"), "utf8")).toBe('{"fixture":"auth-canary"}');
    expect(existsSync(childCodexHome)).toBe(false);
  });

  test("passes an exact restrictive argv, isolated env, and raw task payload", () => {
    const f = fixture();
    const task = "line one\n$(touch /tmp/nope) --model injected\nline three";
    const result = run(f, ["--model", "gpt-5.6-sol"], task);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const env = stringRecord(parsedRecord(join(f.record, "env.json")));
    const outputPath = args[args.indexOf("-o") + 1];
    const filesystem = args.find((value) => value.startsWith("permissions.lazycodex_gjc.filesystem=")) ?? "";
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--ignore-rules");
    expect(args).toContain("--strict-config");
    expect(args).not.toContain("--sandbox");
    expect(args).not.toContain('sandbox_workspace_write.network_access=false');
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('default_permissions="lazycodex_gjc"');
    expect(args).toContain('permissions.lazycodex_gjc.extends=":read-only"');
    expect(args).toContain('permissions.lazycodex_gjc.network.enabled=false');
    expect(filesystem).toContain('":workspace_roots"={"."="read"}');
    expect(filesystem).toContain('":tmpdir"="write"');
    for (const path of [join(f.cwd, ".gjc"), join(f.home, ".gjc"), join(f.home, ".codex"), f.env.CODEX_HOME]) {
      expect(filesystem).toContain(JSON.stringify(realpathSync(path)) + '="deny"');
    }
    expect(filesystem).toContain(JSON.stringify(realpathSync(join(f.cwd, "nested/repository/.gjc"))) + '="deny"');
    expect(filesystem).not.toContain(JSON.stringify(realpathSync(f.home)) + '="deny"');
    expect(filesystem).toContain(`${JSON.stringify(env.HOME)}="deny"`);
    expect(filesystem).toContain(`${JSON.stringify(realpathSync(join(f.root, "bin/codex")))}="read"`);
    expect(filesystem).toContain('helpers"="read"');
    expect(args).toContain('shell_environment_policy.inherit="none"');
    expect(args.find((arg) => arg.startsWith("shell_environment_policy.set="))).toContain('GJC_NOTIFICATIONS="0"');
    expect(args.find((arg) => arg.startsWith("shell_environment_policy.set="))).toContain('GJC_SDK_DISABLE="1"');
    expect(args).toContain("mcp_servers={}");
    expect(args).toContain("apps={}");
    expect(args).toContain("hooks={}");
    for (const feature of ["apps", "enable_mcp_apps", "hooks", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "in_app_browser", "remote_plugin", "skill_mcp_dependency_install", "plugins"]) {
      expect(args).toContain(feature);
    }
    expect(args.slice(-3)).toEqual(["--model", "gpt-5.6-sol", "-"]);
    expect(readFileSync(join(f.record, "executable"), "utf8")).toBe(realpathSync(join(f.root, "bin/codex")));
    const prompt = readFileSync(join(f.record, "stdin"), "utf8");
    expect(prompt).toStartWith("$omo:ultrawork\n");
    expect(prompt).toContain("<validated-omo-ultrawork");
    expect(prompt).toContain("This worker is read-only; do not create, edit, delete, rename, or move files.");
    expect(prompt.split("<lazycodex-gjc-task>\n")[1]?.split("\n</lazycodex-gjc-task>")[0]).toBe(task);
    expect(args).not.toContain(task);
    expect(readFileSync(join(f.record, "mode"), "utf8")).toBe("384");
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
    expect(readFileSync(join(f.home, ".gjc/session/sentinel"), "utf8")).toBe("unchanged");
  });

  test("uses read-only defaults and an allowlisted child environment", () => {
    const f = fixture();
    const result = run(f);
    expect(result.status, result.stderr).toBe(0);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const env = stringRecord(parsedRecord(join(f.record, "env.json")));
    const filesystem = args.find((value) => value.startsWith("permissions.lazycodex_gjc.filesystem=")) ?? "";
    expect(result.status, result.stderr).toBe(0);
    expect(filesystem).toContain('":workspace_roots"={"."="read"}');
    expect(args).toContain('permissions.lazycodex_gjc.extends=":read-only"');
    for (const path of [join(f.cwd, ".gjc"), join(f.home, ".gjc"), join(f.home, ".codex"), f.env.CODEX_HOME]) {
      expect(filesystem).toContain(JSON.stringify(realpathSync(path)) + '="deny"');
    }
    expect(args).not.toContain("--sandbox");
    expect(env.GJC_SESSION_ID).toBeUndefined();
    expect(env.OPENAI_API_KEY).not.toBe("must-not-leak");
    expect(env.PROVIDER_API_TOKEN_CANARY).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.HOME).not.toBe(f.home);
    expect(env.HOME).toStartWith(env.TMPDIR ?? "missing-tmpdir");
    expect(env.CODEX_HOME).not.toBe(f.env.CODEX_HOME);
    expect(env.CODEX_HOME).toStartWith(join(f.home, ".cache/oh-my-gjc/lazycodex-gjc"));
    expect(env.SHELL).toBeUndefined();
    expect(env.PATH?.split(":")[0]).toEndWith("/helpers");
    expect(env.PATH).not.toContain(f.cwd);
    expect(env.PATH).not.toContain(".gjc");
    expect(env.GJC_NOTIFICATIONS).toBe("0");
    expect(env.GJC_SDK_DISABLE).toBe("1");
    expect(env.LAZYCODEX_AUTO_UPDATE_DISABLED).toBe("1");
    expect(env.LAZYCODEX_CONFIG_MIGRATION_DISABLED).toBe("1");
    expect(env.OMO_CODEX_DISABLE_POSTHOG).toBe("1");
    expect(env.CODEX_CODEGRAPH_ENABLED).toBe("0");
    expect(readFileSync(join(f.record, "stdin"), "utf8")).toContain("This worker is read-only; do not create, edit, delete, rename, or move files.");
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

  test.each([
    ["user GJC state", (f: Fixture) => join(f.home, ".gjc/session")],
    ["default Codex state", (f: Fixture) => join(f.home, ".codex")],
    ["explicit CODEX_HOME", (f: Fixture) => join(f.env.CODEX_HOME, "plugins")],
  ])("rejects cwd inside protected %s before spawning", (_label, protectedCwd) => {
    const f = fixture();
    const result = run(f, ["--cwd", protectedCwd(f)]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("lazycodex-gjc: --cwd cannot be inside protected GJC or Codex state\n");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });

  test("fails closed when the pinned Codex core is unavailable", () => {
    const f = fixture();
    rmSync(join(f.root, "bin/codex"));
    const result = run(f);
    expect(result.status).toBe(78);
    expect(result.stderr).toBe("lazycodex-gjc: trusted runtime binding mismatch\n");
  });

  test("fails closed when the pinned Codex core path is replaced by a wrapper", () => {
    const f = fixture();
    rmSync(join(f.env.CODEX_HOME, "auth.json"));
    const codex = join(f.root, "bin/codex");
    const wrapper = join(f.root, "bin/codex.js");
    writeFileSync(wrapper, readFileSync(codex), { mode: 0o755 });
    rmSync(codex);
    symlinkSync("codex.js", codex);
    const result = run(f);
    expect(result.status).toBe(78);
    expect(result.stderr).toBe("lazycodex-gjc: trusted runtime binding mismatch\n");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });

  test("executes the derived native core instead of the npm wrapper interpreter", () => {
    const f = fixture();
    const packageNames: Readonly<Record<string, string>> = {
      "linux:x64": "codex-linux-x64", "linux:arm64": "codex-linux-arm64",
      "darwin:x64": "codex-darwin-x64", "darwin:arm64": "codex-darwin-arm64",
      "win32:x64": "codex-win32-x64", "win32:arm64": "codex-win32-arm64",
    };
    const packageName = packageNames[`${process.platform}:${process.arch}`];
    if (packageName === undefined) throw new TypeError("unsupported test platform");
    const packageRoot = join(f.root, "npm/@openai/codex");
    const wrapper = join(packageRoot, "bin/codex.js");
    const vendorRoot = join(packageRoot, "node_modules/@openai", packageName, "vendor/test-target");
    const core = join(vendorRoot, "bin/codex");
    const wrapperMarker = join(f.record, "wrapper-executed");
    const coreMarker = join(f.record, "core-executed");
    const coreArgs = join(f.record, "core-args");
    mkdirSync(join(packageRoot, "bin"), { recursive: true });
    mkdirSync(join(vendorRoot, "bin"), { recursive: true });
    mkdirSync(join(vendorRoot, "codex-path"));
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(wrapper, `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nawait Promise.resolve();\nwriteFileSync(${JSON.stringify(wrapperMarker)}, process.execPath);\n`, { mode: 0o755 });
    writeFileSync(core, `#!/bin/sh\nprintf '%s\\n' "$@" > ${coreArgs}\nprintf '%s' "$0" > ${coreMarker}\nout=''\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = '-o' ]; then shift; out="$1"; fi\n  shift\ndone\ncat >/dev/null\nprintf '%s' 'worker-result' > "$out"\n`, { mode: 0o755 });
    clearWritableBits(join(f.root, "npm"));
    rmSync(join(f.root, "bin/codex"));
    symlinkSync(wrapper, join(f.root, "bin/codex"));
    updateBinding(f, { 6: digest(core), 7: core, 8: join(vendorRoot, "codex-path") });
    const nodePath = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" });
    expect(nodePath.status, nodePath.stderr).toBe(0);
    mkdirSync(f.env.TMPDIR, { recursive: true });

    const result = spawnSync(realpathSync(nodePath.stdout.trim()), [runner, "--cwd", f.cwd, "--binding", f.binding], {
      env: f.env, input: "ship it", encoding: "utf8", timeout: 5_000,
    });

    const evidence = [wrapperMarker, coreMarker, coreArgs]
      .map((path) => `${path}:${existsSync(path) ? readFileSync(path, "utf8") : "missing"}`)
      .join("\n");
    expect(result.status, `${result.stderr}${evidence}`).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(existsSync(wrapperMarker)).toBe(false);
    expect(readFileSync(coreMarker, "utf8")).toBe(realpathSync(core));
    expect(readFileSync(coreArgs, "utf8").split("\n")).toContain("--ephemeral");
  });

  test.each(["missing", "stale", "incompatible", "symlinked"] as const)("fails before spawning when OMO ultrawork is %s", (omoMode) => {
    const f = fixture("success", omoMode);
    const result = run(f);
    expect(result.status).toBe(78);
    expect(result.stderr).toBe("lazycodex-gjc: compatible OMO ultrawork capability not found\n");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });

  test("rejects writable OMO supply-chain files before spawning", () => {
    const f = fixture("success", "writable");
    const result = run(f);
    expect(result.status).toBe(78);
    expect(result.stderr).toBe("lazycodex-gjc: compatible OMO ultrawork capability not found\n");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });

  test("canonicalizes cwd and ignores a repository-local codex executable", () => {
    const f = fixture();
    const linked = join(f.root, "linked-workspace");
    symlinkSync(f.cwd, linked);
    const canonical = run(f, ["--cwd", linked]);
    expect(canonical.status, canonical.stderr).toBe(0);
    expect(stringArray(parsedRecord(join(f.record, "args.json")))).toContain(realpathSync(f.cwd));

    const localCodex = join(f.cwd, "codex");
    writeFileSync(localCodex, `#!${process.execPath}\nprocess.exit(99);\n`, { mode: 0o755 });
    const pinned = spawnSync(process.execPath, [runner, "--cwd", f.cwd, "--binding", f.binding], {
      env: { ...f.env, PATH: f.cwd }, input: "ship it", encoding: "utf8",
    });
    expect(pinned.status, pinned.stderr).toBe(0);
    expect(pinned.stdout).toBe("worker-result");
  });

  test("ignores an external directory symlink while enumerating workspace state", () => {
    const f = fixture();
    const outside = join(f.root, "outside-workspace");
    mkdirSync(outside);
    symlinkSync(outside, join(f.cwd, "outside-link"));
    const result = run(f);
    const args = stringArray(parsedRecord(join(f.record, "args.json")));
    const filesystem = args.find((value) => value.startsWith("permissions.lazycodex_gjc.filesystem=")) ?? "";
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(filesystem).not.toContain(JSON.stringify(realpathSync(outside)));
  });

  test("ignores a dangling non-state symlink while enumerating workspace state", () => {
    const f = fixture();
    symlinkSync("missing-target", join(f.cwd, "dangling-link"));
    const result = run(f);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
  });

  test("preserves concurrently created .gjc state after a read-only worker failure", () => {
    const f = fixture("create-gjc-nonzero");
    const state = join(f.cwd, "new/subtree/.gjc");

    const result = run(f);

    expect(result.status).toBe(23);
    expect(result.stderr).toBe("lazycodex-gjc: worker exited with code 23\n");
    expect(readFileSync(join(state, "config.toml"), "utf8")).toBe("malicious = true\n");
  });
  test("preserves a concurrently created external .gjc symlink and its target", () => {
    const f = fixture("create-gjc-symlink");
    const victim = join(f.root, "victim/.gjc");
    const sentinel = join(victim, "sentinel");
    const link = join(f.cwd, "x/.gjc");
    mkdirSync(victim, { recursive: true });
    writeFileSync(sentinel, "must-survive");

    const result = run(f);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(realpathSync(link)).toBe(realpathSync(victim));
    expect(readFileSync(sentinel, "utf8")).toBe("must-survive");
  });

  test("never relays child stderr, task text, or file canaries", () => {
    const f = fixture("stderr-secret");
    const task = "TASK-CANARY-a83fb";
    const result = run(f, [], task);
    expect(result.status).toBe(23);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("lazycodex-gjc: worker exited with code 23\n");
    expect(`${result.stdout}${result.stderr}`).not.toContain(task);
    expect(`${result.stdout}${result.stderr}`).not.toContain("FILE-CANARY-7d321");
  });

  test.each([["nonzero", 23], ["empty", 1], ["invalid", 1], ["stdout", 1]] as const)("fails closed for %s child output", (mode, status) => {
    const f = fixture(mode);
    const result = run(f);
    expect(result.status).toBe(status);
    expect(result.stdout).toBe("");
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
    expect(existsSync(readFileSync(join(f.record, "codex-home"), "utf8"))).toBe(false);
  });

  test("relays a bounded summary when a completed worker's final output exceeds the relay limit", () => {
    const f = fixture("oversized");
    const result = run(f);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("exceeded the 1 MiB relay limit");
    expect(result.stdout).toContain("read-only");
    expect(result.stdout.length).toBeLessThan(1024);
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
    expect(existsSync(readFileSync(join(f.record, "codex-home"), "utf8"))).toBe(false);
  });

  test("still fails closed when the final output exceeds the hard limit", () => {
    const f = fixture("hard-oversized");
    const result = run(f);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("lazycodex-gjc: worker output exceeded hard limit\n");
  });

  test("tees a redacted event stream to a new private observe log without touching the relay", () => {
    const f = fixture("observe-tokens");
    const log = join(f.root, "observe.log");
    const result = run(f, ["--observe-log", log]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("worker-result");
    expect(statSync(log).mode & 0o777).toBe(0o600);
    const observed = readFileSync(log, "utf8");
    expect(observed).toContain("[observe] unit=lazycodex-gjc-");
    expect(observed).toContain('stop-command="systemctl --user stop lazycodex-gjc-');
    expect(observed).toContain("[observe] worker closed failure=none code=0");
    expect(observed).toContain("plain progress line survives");
    expect(observed).toContain("[redacted]");
    expect(observed).not.toContain("bearer-canary-raw");
    expect(observed).not.toContain("ghp_ABCDEFGHIJ0123456789");
  });

  test("observes child stderr in the log while never relaying it to the launcher stdio", () => {
    const f = fixture("stderr-secret");
    const log = join(f.root, "observe.log");
    const result = run(f, ["--observe-log", log], "TASK-CANARY-a83fb");
    expect(result.status).toBe(23);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("lazycodex-gjc: worker exited with code 23\n");
    expect(`${result.stdout}${result.stderr}`).not.toContain("FILE-CANARY-7d321");
    expect(readFileSync(log, "utf8")).toContain("FILE-CANARY-7d321");
  });

  test.each([
    ["an existing file", (f: Fixture) => { const log = join(f.root, "observe.log"); writeFileSync(log, "stale"); return log; }],
    ["a relative path", () => "observe.log"],
    ["a missing parent directory", (f: Fixture) => join(f.root, "missing-parent/observe.log")],
    ["protected GJC state", (f: Fixture) => join(f.cwd, ".gjc/observe.log")],
  ])("fails closed before spawning when the observe log is %s", (_label, logPath) => {
    const f = fixture();
    const result = run(f, ["--observe-log", logPath(f)]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });
  test("rejects workspace-write before spawning a worker", () => {
    const f = fixture();
    const result = run(f, ["--sandbox", "workspace-write"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("lazycodex-gjc: invalid --sandbox\n");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
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


  test("kills detached descendants after a successful worker result", () => {
    const f = fixture("success-descendant");
    const result = run(f);
    const pid = Number.parseInt(readFileSync(join(f.record, "descendant"), "utf8"), 10);
    const procState = existsSync(`/proc/${pid}/stat`) ? readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] : undefined;
    expect(result.status, result.stderr).toBe(0);
    expect(procState === undefined || procState === "Z").toBe(true);
  });

  test("terminates the systemd-contained worker and cleans state on SIGTERM", async () => {
    const f = fixture("timeout");
    mkdirSync(f.env.TMPDIR, { recursive: true });
    const child = spawn(process.execPath, [runner, "--cwd", f.cwd, "--binding", f.binding, "--timeout-seconds", "30"], {
      env: f.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.stdin.end("ship it");
    for (let attempt = 0; attempt < 100 && !existsSync(join(f.record, "descendant")); attempt += 1) await Bun.sleep(20);
    expect(existsSync(join(f.record, "descendant"))).toBe(true);
    child.kill("SIGTERM");
    const code = await new Promise<number | null>((resolveClose) => child.once("close", resolveClose));
    const pid = Number.parseInt(readFileSync(join(f.record, "descendant"), "utf8"), 10);
    const procState = existsSync(`/proc/${pid}/stat`) ? readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] : undefined;
    expect(code).toBe(130);
    expect(stderr).toBe("lazycodex-gjc: worker interrupted\n");
    expect(procState === undefined || procState === "Z").toBe(true);
    expect(existsSync(readFileSync(join(f.record, "temp"), "utf8"))).toBe(false);
  });

  test.each(["stdout-infinite", "final-infinite"] as const)("kills infinite %s overflow and its descendants promptly", (mode) => {
    const f = fixture(mode);
    const started = Date.now();
    const result = run(f, ["--timeout-seconds", "4"]);
    const pid = Number.parseInt(readFileSync(join(f.record, "descendant"), "utf8"), 10);
    const procState = existsSync(`/proc/${pid}/stat`) ? readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] : undefined;
    expect(result.status).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.stderr).toBe("lazycodex-gjc: worker output exceeded hard limit\n");
    expect(procState === undefined || procState === "Z").toBe(true);
  });

  test("rejects invalid UTF-8 task bytes and exposes help without invoking codex", () => {
    const f = fixture();
    expect(run(f, [], Uint8Array.from([0xff])).status).toBe(2);
    const help = spawnSync(process.execPath, [runner, "--help"], { env: f.env, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--sandbox read-only");
    expect(help.stdout).toContain("write mode disabled");
    expect(existsSync(join(f.record, "args.json"))).toBe(false);
  });
});
