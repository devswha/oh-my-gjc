import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const runner = join(import.meta.dir, "../bin/lazycodex-gjc.mjs");
const sandboxes: string[] = [];

type Mode = "success" | "nonzero" | "stderr-secret" | "empty" | "invalid" | "oversized" | "stdout" | "stdout-infinite" | "final-infinite" | "timeout";

type OmoMode = "valid" | "missing" | "stale" | "incompatible" | "symlinked";

type Fixture = {
  readonly root: string;
  readonly cwd: string;
  readonly home: string;
  readonly record: string;
  readonly env: Readonly<Record<string, string>>;
};

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
  const codexHome = join(root, "codex-home");
  mkdirSync(codexHome);
  writeFileSync(join(codexHome, "config.toml"), 'sandbox_mode = "danger-full-access"\nweb_search = "live"\n[hooks]\n');
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
    chmodSync(omoRoot, 0o775);
    for (const path of [manifestPath, skillPath, componentPath]) chmodSync(path, 0o664);
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
  if (${JSON.stringify(mode)} === "nonzero") process.exit(23);
  if (${JSON.stringify(mode)} === "stderr-secret") {
    process.stderr.write(input + "\\nFILE-CANARY-7d321\\n");
    process.exit(23);
  }
  if (${JSON.stringify(mode)} === "invalid") fs.writeFileSync(out, Buffer.from([0xff]));
  else if (${JSON.stringify(mode)} === "oversized") fs.writeFileSync(out, Buffer.alloc(1024 * 1024 + 1, 65));
  else if (${JSON.stringify(mode)} === "success") fs.writeFileSync(out, "worker-result");
  else if (${JSON.stringify(mode)} === "stdout") {
    fs.writeFileSync(out, "must-not-succeed");
    for (let index = 0; index < 2049; index += 1) process.stdout.write(Buffer.alloc(512, 65));
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
    },
  };
}

function run(f: Fixture, args: readonly string[] = [], input: string | Uint8Array = "ship it") {
  mkdirSync(f.env.TMPDIR, { recursive: true });
  const runnerArgs = args.includes("--cwd") ? args : ["--cwd", f.cwd, ...args];
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

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("lazycodex-gjc isolated runner", () => {
  test("passes an exact restrictive argv, isolated env, and raw task payload", () => {
    const f = fixture();
    const task = "line one\n$(touch /tmp/nope) --model injected\nline three";
    const result = run(f, ["--model", "gpt-5.6-sol", "--sandbox", "workspace-write"], task);
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
    expect(args).toContain('permissions.lazycodex_gjc.extends=":workspace"');
    expect(args).toContain('permissions.lazycodex_gjc.network.enabled=false');
    expect(filesystem).toContain('":workspace_roots"={"."="write"}');
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
    expect(prompt).toContain("The built-in `file_change` route is broken under this custom permission profile; do not use it.");
    expect(prompt).toContain("through the shell tool, using the existing `apply_patch` command");
    expect(prompt).toContain("Verify every edit before finishing.");
    expect(prompt.split("<lazycodex-gjc-task>\n")[1]?.split("\n</lazycodex-gjc-task>")[0]).toBe(task);
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
    expect(env.CODEX_HOME).toBe(f.env.CODEX_HOME);
    expect(env.SHELL).toBeUndefined();
    expect(env.PATH?.split(":")[0]).toEndWith("/helpers");
    expect(env.PATH).not.toContain(f.cwd);
    expect(env.PATH).not.toContain(".gjc");
    expect(env.GJC_NOTIFICATIONS).toBe("0");
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

  test("returns 127 when codex is unavailable", () => {
    const f = fixture();
    rmSync(join(f.root, "bin/codex"));
    expect(run(f).status).toBe(127);
  });

  test("fails closed when an npm Codex wrapper has no compatible native runtime", () => {
    const f = fixture();
    const codex = join(f.root, "bin/codex");
    const wrapper = join(f.root, "bin/codex.js");
    writeFileSync(wrapper, readFileSync(codex), { mode: 0o755 });
    rmSync(codex);
    symlinkSync("codex.js", codex);
    const result = run(f);
    expect(result.status).toBe(127);
    expect(result.stderr).toBe("lazycodex-gjc: compatible Codex runtime not found\n");
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
    rmSync(join(f.root, "bin/codex"));
    symlinkSync(wrapper, join(f.root, "bin/codex"));
    const nodePath = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" });
    expect(nodePath.status, nodePath.stderr).toBe(0);
    mkdirSync(f.env.TMPDIR, { recursive: true });

    const result = spawnSync(realpathSync(nodePath.stdout.trim()), [runner, "--cwd", f.cwd], {
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

  test("canonicalizes cwd and rejects a repository-local codex executable", () => {
    const f = fixture();
    const linked = join(f.root, "linked-workspace");
    symlinkSync(f.cwd, linked);
    const canonical = run(f, ["--cwd", linked]);
    expect(canonical.status, canonical.stderr).toBe(0);
    expect(stringArray(parsedRecord(join(f.record, "args.json")))).toContain(realpathSync(f.cwd));

    rmSync(join(f.root, "bin/codex"));
    const localCodex = join(f.cwd, "codex");
    writeFileSync(localCodex, `#!${process.execPath}\n`, { mode: 0o755 });
    const rejected = spawnSync(process.execPath, [runner, "--cwd", f.cwd], {
      env: { ...f.env, PATH: f.cwd }, input: "ship it", encoding: "utf8",
    });
    expect(rejected.status).toBe(127);
    expect(rejected.stderr).toBe("lazycodex-gjc: trusted codex executable not found\n");
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

  test.each(["stdout-infinite", "final-infinite"] as const)("kills infinite %s overflow and its descendants promptly", (mode) => {
    const f = fixture(mode);
    const started = Date.now();
    const result = run(f, ["--timeout-seconds", "4"]);
    const pid = Number.parseInt(readFileSync(join(f.record, "descendant"), "utf8"), 10);
    const procState = existsSync(`/proc/${pid}/stat`) ? readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2] : undefined;
    expect(result.status).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result.stderr).toBe("lazycodex-gjc: worker output exceeded limit\n");
    expect(procState === undefined || procState === "Z").toBe(true);
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
