import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

const repo = resolve(import.meta.dir, "../../..");
const native = "plugins/oh-my-gjc";
const sandboxes: string[] = [];
afterEach(() => sandboxes.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

function fixture(realGjc?: string) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "omg-local-install-"));
  sandboxes.push(root);
  const home = join(root, "home");
  const bin = join(root, "bin");
  const project = join(root, "project");
  for (const dir of [home, bin, project]) mkdirSync(dir);
  const source = join(root, "selected checkout");
  mkdirSync(join(source, ".claude-plugin"), { recursive: true });
  cpSync(join(repo, "install.sh"), join(source, "install.sh"));
  cpSync(join(repo, ".claude-plugin/marketplace.json"), join(source, ".claude-plugin/marketplace.json"));
  cpSync(join(repo, native), join(source, native), { recursive: true });
  const log = join(root, "calls");
  writeFileSync(log, "");
  if (realGjc) symlinkSync(realGjc, join(bin, "gjc"));
  else writeFileSync(join(bin, "gjc"), `#!/usr/bin/python3
import json, os, pathlib, shutil, sys
home = pathlib.Path(os.environ['HOME'])
state = home / 'test-market-source'
args = sys.argv[1:]
with open(os.environ['CALLS'], 'a') as log: log.write(' '.join(args) + '\\n')
if args[:3] == ['plugin', 'marketplace', 'add']:
    source = pathlib.Path(args[3])
    if not source.is_absolute(): sys.exit(90)  # remote source is forbidden
    if state.exists():
        print('Marketplace "oh-my-gjc" already exists', file=sys.stderr); sys.exit(1)
    state.write_text(str(source))
elif args == ['plugin', 'marketplace', 'remove', 'oh-my-gjc']:
    if os.environ.get('FAIL_REMOVE'): sys.exit(72)
    state.unlink()
elif args == ['plugin', 'install', 'oh-my-gjc@oh-my-gjc', '--force']:
    if os.environ.get('FAIL_FORCE'):
        print("error: unknown option '--force'", file=sys.stderr); sys.exit(64)
    source = pathlib.Path(state.read_text()) / 'plugins/oh-my-gjc'
    version = json.loads((source / '.claude-plugin/plugin.json').read_text())['version']
    dest = home / '.gjc/plugins/cache/plugins' / ('oh-my-gjc___oh-my-gjc___' + version)
    if dest.exists(): shutil.rmtree(dest)
    shutil.copytree(source, dest)
    print('✔ Installed oh-my-gjc from oh-my-gjc (' + version + ')')
else: sys.exit(91)  # update/remote or unforced fallback is forbidden
`, { mode: 0o755 });
  for (const tool of ["curl", "wget", "git"]) writeFileSync(join(bin, tool), `#!/bin/sh
case "$*" in '-C '*'/project rev-parse --show-toplevel') exit 1 ;; esac
printf 'BLOCKED %s\\n' "$0 $*" >> "$CALLS"
exit 90
`, { mode: 0o755 });
  const env = { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin`, CALLS: log,
    XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state"), XDG_DATA_HOME: join(root, "data"),
    GJC_NOTIFICATIONS: "0", GJC_SDK_DISABLE: "1", GJC_SESSION_ID: undefined, GJC_HOME: undefined, GJC_AGENT_DIR: undefined };
  const binding = join(home, ".gjc/agent/runtimes/oh-my-gjc/root");
  const saved = new Map([
    [join(home, ".gjc/agent/models.yml"), "fixture model sentinel"],
    [join(home, ".gjc/agent/auth.json"), "{}\n"],
    [join(home, ".gjc/agent/runtimes/oh-my-gajae-code/root"), "/old/identity\n"],
    [join(home, ".local/share/oh-my-gajae-code/keep"), "old XDG state"],
  ]);
  for (const [path, value] of saved) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
  function run(updater = false, extra: Record<string, string> = {}, args = ["--local", source]) {
    const command = updater
      ? ["/bin/bash", join(source, native, "bin/omg-autoupdate.sh"), "run", ...args]
      : ["/bin/bash", join(source, "install.sh"), ...args];
    return spawnSync(realGjc ? "python3" : command[0], realGjc
      ? ["-I", join(import.meta.dir, "fixtures/deny-network.py"), ...command] : command.slice(1), {
      cwd: project, env: { ...env, ...extra }, encoding: "utf8", timeout: 60000,
    });
  }
  function verify(marker: string) {
    const cache = readFileSync(binding, "utf8").trim();
    for (const path of [join(cache, "templates/setup.md"), join(home, ".gjc/agent/commands/omg:setup.md")]) {
      expect(readFileSync(path, "utf8")).toContain(marker);
      expect(readFileSync(path)).toEqual(readFileSync(join(source, native, "templates/setup.md")));
    }
    for (const [path, value] of saved) expect(readFileSync(path, "utf8")).toBe(value);
    expect(readFileSync(log, "utf8")).not.toContain("BLOCKED");
    expect(existsSync(join(root, "config/systemd/user/omg-autoupdate.timer"))).toBe(false);
  }
  function mark(value: string) { writeFileSync(join(source, native, "templates/setup.md"), `---\ndescription: fixture\n---\n${value}\n`); }
  return { root, home, bin, source, run, mark, verify, log, binding };
}

function cycle(realGjc?: string) {
  const f = fixture(realGjc);
  f.mark("LOCAL FIRST");
  let r = f.run();
  expect(r.status, r.stdout + r.stderr).toBe(0);
  f.verify("LOCAL FIRST");
  const firstBinding = readFileSync(f.binding, "utf8");
  f.mark("LOCAL SAME VERSION UPDATE");
  r = f.run(true);
  expect(r.status, r.stdout + r.stderr + (existsSync(join(f.root, "state/oh-my-gjc/autoupdate.log")) ? readFileSync(join(f.root, "state/oh-my-gjc/autoupdate.log"), "utf8") : "")).toBe(0);
  f.verify("LOCAL SAME VERSION UPDATE");
  expect(readFileSync(f.binding, "utf8")).toBe(firstBinding);
  const manifestPath = join(f.source, native, ".claude-plugin/plugin.json");
  const catalogPath = join(f.source, ".claude-plugin/marketplace.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  manifest.version = catalog.plugins[0].version = "98.7.6"; // fixture only
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(catalogPath, JSON.stringify(catalog));
  f.mark("LOCAL UPGRADE");
  r = f.run(true);
  expect(r.status, r.stdout + r.stderr + readFileSync(join(f.root, "state/oh-my-gjc/autoupdate.log"), "utf8")).toBe(0);
  f.verify("LOCAL UPGRADE");
  expect(readFileSync(f.binding, "utf8")).toContain("___98.7.6");
}

describe("explicit local payload installer", () => {
  test("root and updater accept relative local paths with exported CDPATH", () => {
    const f = fixture();
    f.mark("RELATIVE LOCAL PAYLOAD");
    cpSync(f.source, join(f.root, "project/checkout"), { recursive: true });
    for (const updater of [false, true]) {
      const result = f.run(updater, { CDPATH: "." }, ["--local", "checkout"]);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      f.verify("RELATIVE LOCAL PAYLOAD");
    }
  });
  test("actual root/native/updater scripts install fresh, repeat changed bytes, and upgrade offline", () => cycle());
  test("existing registration can switch to a different local checkout", () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const other = join(f.root, "other checkout");
    cpSync(f.source, other, { recursive: true });
    writeFileSync(join(other, native, "templates/setup.md"), "OTHER LOCAL CHECKOUT");
    const result = f.run(false, {}, ["--local", other]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(f.home, ".gjc/agent/commands/omg:setup.md"), "utf8")).toBe("OTHER LOCAL CHECKOUT");
  });
  for (const failure of ["FAIL_REMOVE", "FAIL_FORCE"]) test(`local ${failure} fails closed without remote/unforced fallback`, () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const before = readFileSync(f.binding);
    const result = f.run(true, { [failure]: "1" });
    expect(result.status).not.toBe(0);
    expect(readFileSync(f.binding)).toEqual(before);
    const calls = readFileSync(f.log, "utf8");
    expect(calls).not.toContain("update");
    expect(calls).not.toContain("devswha/");
    expect(calls.split("\n")).not.toContain("plugin install oh-my-gjc@oh-my-gjc");
    expect(readFileSync(join(f.root, "state/oh-my-gjc/autoupdate.log"), "utf8")).toContain("result: FAILED");
  });
  test("rejects remote catalog entries before changing an existing registration", () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const before = readFileSync(f.log, "utf8");
    const path = join(f.source, ".claude-plugin/marketplace.json");
    const catalog = JSON.parse(readFileSync(path, "utf8"));
    catalog.plugins[0].source = { repo: "elsewhere/remote" };
    writeFileSync(path, JSON.stringify(catalog));
    expect(f.run().status).not.toBe(0);
    expect(readFileSync(f.log, "utf8")).toBe(before);
  });
  for (const invalid of ["remote", "mismatched-name", "duplicate-entry", "duplicate-key", "malformed", "symlink"]) {
    test(`optimized Python still rejects ${invalid} catalogs before registration mutation`, () => {
      const f = fixture();
      expect(f.run().status).toBe(0);
      const before = readFileSync(f.log, "utf8");
      const path = join(f.source, ".claude-plugin/marketplace.json");
      const catalog = JSON.parse(readFileSync(path, "utf8"));
      switch (invalid) {
        case "remote": catalog.plugins[0].source = { repo: "elsewhere/remote" }; break;
        case "mismatched-name": catalog.name = "different-market"; break;
        case "duplicate-entry": catalog.plugins.push(catalog.plugins[0]); break;
      }
      writeFileSync(path, JSON.stringify(catalog));
      if (invalid === "duplicate-key") writeFileSync(path, `{"name":"oh-my-gjc",${JSON.stringify(catalog).slice(1)}`);
      if (invalid === "malformed") writeFileSync(path, "{broken json");
      if (invalid === "symlink") {
        const external = join(f.root, "catalog.json");
        cpSync(path, external); rmSync(path); symlinkSync(external, path);
      }
      // -I ignores PYTHONOPTIMIZE, while this wrapper enforces -O independently.
      // Neither configuration may disable security validation.
      writeFileSync(join(f.bin, "python3"), '#!/bin/sh\nexec /usr/bin/python3 -O "$@"\n', { mode: 0o755 });
      const result = f.run(false, { PYTHONOPTIMIZE: "2" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("invalid --local suite checkout");
      expect(readFileSync(f.log, "utf8")).toBe(before);
    });
  }
  for (const args of [["--local="], ["--local", "--force"], ["--local", "/missing"], ["--candidate-ref", "/candidate", "--local", repo]]) {
    test(`rejects invalid source flags: ${args.join(" ")}`, () => {
      const f = fixture();
      expect(f.run(false, {}, args).status).not.toBe(0);
      expect(readFileSync(f.log, "utf8")).toBe("");
    });
  }
  // Explicit opt-in: executes the installed GJC binary only in an isolated HOME,
  // with Linux seccomp denying IPv4/IPv6 to every installer child process.
  if (process.env.OMG_REAL_GJC) {
    test("real GJC: blocked-network fresh/repeat/upgrade", () => cycle(process.env.OMG_REAL_GJC), 120000);
  } else {
    console.error('OMG_LOCAL_INSTALL_COVERAGE ' + JSON.stringify({
      status: "not-run", reason: "Set OMG_REAL_GJC for the separate blocked-network real-GJC lane; fixture installs are covered.",
    }));
  }
});
