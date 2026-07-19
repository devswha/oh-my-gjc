import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const pluginRoot = join(import.meta.dir, "..");
const installerPath = join(pluginRoot, "bin/install-skill.sh");
const skillPath = join(pluginRoot, "skills/lazycodex-gjc/SKILL.md");
const commandPath = join(pluginRoot, "templates/lazycodex-gjc.md");
const provenancePath = join(pluginRoot, "../../ops/verify/record_provenance.py");
const sandboxes: string[] = [];

type Scope = "user" | "project";

type Fixture = {
  readonly root: string;
  readonly home: string;
  readonly project: string;
  readonly nativeRoot: string;
  readonly scope: Scope;
};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function parseManifest(name: string): readonly string[] {
  const match = read(installerPath).match(new RegExp(`^${name}=\\(([^)]*)\\)`, "m"));
  if (match === null || match[1] === undefined) throw new TypeError(`missing ${name}`);
  return match[1].replace(/\\\s*\n/g, " ").trim().split(/\s+/).filter(Boolean);
}

function fixture(scope: Scope): Fixture {
  const root = mkdtempSync(join(tmpdir(), `omg-lazycodex-surface-${scope}-`));
  sandboxes.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  mkdirSync(home);
  mkdirSync(project);
  return {
    root,
    home,
    project,
    scope,
    nativeRoot: scope === "user" ? join(home, ".gjc/agent") : join(project, ".gjc"),
  };
}

function writeSentinel(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function runInstaller(f: Fixture, action: "install" | "uninstall", path = installerPath) {
  const args = action === "install" ? [path, "all", f.scope] : [path, "all", "uninstall", f.scope];
  return spawnSync("bash", args, {
    cwd: f.project,
    env: { ...process.env, HOME: f.home, CODEX_HOME: process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex"), OMG_TIME_LEFT_RUNTIME: "0" },
    encoding: "utf8",
  });
}
function runTargetedInstaller(f: Fixture, path = installerPath, target = "preset-pack") {
  return spawnSync("bash", [path, target, f.scope], {
    cwd: f.project,
    env: { ...process.env, HOME: f.home, CODEX_HOME: join(f.root, "absent-codex-home"), OMG_TIME_LEFT_RUNTIME: "0" },
    encoding: "utf8",
  });
}

function ownedCommands(): readonly string[] {
  return parseManifest("EXPECTED_COMMANDS").map((name) => name === "omg" ? "omg.md" : `omg:${name}.md`);
}

function shellBlocks(text: string): string {
  return [...text.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)].map((match) => match[1] ?? "").join("\n");
}

afterEach(() => {
  for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("lazycodex-gjc skill and command contract", () => {
  test("packages the native runner as an executable", () => {
    // Working-tree modes are umask-dependent (git only tracks the +x bit), so assert
    // the tracked index mode and the executable bits — not an exact 0o755 snapshot.
    const indexMode = spawnSync("git", ["ls-files", "-s", "bin/lazycodex-gjc.mjs"], { cwd: pluginRoot, encoding: "utf8" });
    expect(indexMode.stdout).toStartWith("100755 ");
    expect(statSync(join(pluginRoot, "bin/lazycodex-gjc.mjs")).mode & 0o111).toBe(0o111);
  });

  test("pins every executable bridge surface in release provenance", () => {
    const match = read(provenancePath).match(/^MARKERS = \[([\s\S]*?)^\]/m);
    if (match === null || match[1] === undefined) throw new TypeError("missing provenance MARKERS");
    const markers = [...match[1].matchAll(/"([^"]+)"/g)]
      .map((marker) => marker[1] ?? "")
      .filter((marker) => marker.includes("lazycodex-gjc"))
      .sort();

    expect(markers).toEqual([
      "bin/lazycodex-gjc.mjs",
      "skills/lazycodex-gjc/SKILL.md",
      "templates/lazycodex-gjc.md",
    ]);
  });

  test("exposes one native bridge with safe synchronous task transport", () => {
    const skill = read(skillPath);
    const command = read(commandPath);
    const executable = shellBlocks(`${skill}\n${command}`);
    expect(skill).toMatch(/^---\nname: lazycodex-gjc\ndescription: .*(?:LazyCodex|lazycodex).*(?:GJC|gjc)/m);
    expect(command).toMatch(/^---\ndescription: /m);
    for (const text of [skill, command]) {
      expect(text).toContain(".gjc/agent/runtimes/lazycodex-gjc");
      expect(text).toContain("lazycodex-gjc-binding-v1");
      expect(text).toContain("/usr/bin/getent passwd");
      expect(text).toContain("/usr/bin/sha256sum");
      expect(text).not.toContain("./.gjc/plugins/cache/plugins/");
      expect(text).not.toContain("plugins/oh-my-gjc/bin/lazycodex-gjc.mjs");
      expect(text).toMatch(/danger-full-access.*금지|금지.*danger-full-access/);
    }
    expect(executable).toContain(`printf '%s' "$LAZYCODEX_GJC_TASK" > "$TASK_FILE"`);
    expect(executable).toContain('"${BINDING_LINES[5]}" "$RUNNER" "${RUNNER_ARGS[@]}" --binding "$BINDING" < "$TASK_FILE"');
    expect(executable).toContain("trap cleanup EXIT HUP INT TERM");
    expect(executable).not.toContain("$ARGUMENTS");
    expect(executable).not.toMatch(/^\s*gjc\s+(?:task|team|ultragoal|session|config|update|setup)\b/m);
    expect(executable).not.toMatch(/\b(?:npx|lazycodex-ai)\b/);
    expect(executable).not.toContain("danger-full-access");
    expect(executable).toContain("secure_file");
    expect(executable).not.toMatch(/^\s*(?:node|mktemp|ls|sort|tail)\b/m);
  });

  test("executes only a private snapshot matching the canonical account runtime binding", () => {
    const f = fixture("user");
    const runtime = join(f.home, ".gjc/agent/runtimes/lazycodex-gjc");
    const runner = join(runtime, "runner.mjs");
    const binding = join(runtime, "binding");
    const marker = join(f.root, "runner-executed");
    writeSentinel(runner, `import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.MARKER, "yes");\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write("trusted-result"));\n`);
    chmodSync(runtime, 0o700);
    chmodSync(runner, 0o700);
    const digest = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
    const node = process.execPath;
    const systemdRun = "/usr/bin/systemd-run";
    const systemctl = "/usr/bin/systemctl";
    const envBinary = "/usr/bin/env";
    writeSentinel(binding, ["lazycodex-gjc-binding-v1", f.home, digest(runner), runner, digest(node), node, digest(node), node, join(node, ".."), process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex"), digest(systemdRun), systemdRun, digest(systemctl), systemctl, digest(envBinary), envBinary].join("\n") + "\n");
    chmodSync(binding, 0o600);
    const script = shellBlocks(read(commandPath)).replace('ACCOUNT_HOME="$(/usr/bin/getent passwd "$(/usr/bin/id -u)" | /usr/bin/cut -d: -f6)"', 'ACCOUNT_HOME="$OH_MY_GJC_TEST_ACCOUNT_HOME"');
    const env = { ...process.env, HOME: join(f.root, "attacker-home"), OH_MY_GJC_TEST_ACCOUNT_HOME: f.home, LAZYCODEX_GJC_TASK: "read only", TARGET_CWD: f.project, SANDBOX: "read-only", MARKER: marker };

    const trusted = spawnSync("bash", ["-c", script], { cwd: f.project, env, encoding: "utf8" });
    expect(trusted.status, trusted.stderr).toBe(0);
    expect(trusted.stdout).toBe("trusted-result");
    expect(read(marker)).toBe("yes");

    rmSync(marker);
    writeFileSync(runner, `${read(runner)}\n// tampered\n`);
    const rejected = spawnSync("bash", ["-c", script], { cwd: f.project, env, encoding: "utf8" });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toBe("lazycodex-gjc runtime verification failed; rerun native user install\n");
    expect(existsSync(marker)).toBe(false);

    writeFileSync(runner, read(runner).replace("\n// tampered\n", "\n"), { mode: 0o700 });
    const maliciousMarker = join(f.root, "replacement-executed");
    const replacement = join(f.root, "replacement.mjs");
    writeFileSync(replacement, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(maliciousMarker)}, "bad");\n`);
    const raceScript = script.replace(
      '/bin/cp -- "$SOURCE_BINDING" "$BINDING" && /bin/cp -- "$SOURCE_RUNNER" "$RUNNER"',
      '/bin/cp -- "$SOURCE_BINDING" "$BINDING" && /bin/cp -- "$OH_MY_GJC_TEST_REPLACEMENT" "$SOURCE_RUNNER" && /bin/cp -- "$SOURCE_RUNNER" "$RUNNER"',
    );
    const raced = spawnSync("bash", ["-c", raceScript], { cwd: f.project, env: { ...env, OH_MY_GJC_TEST_REPLACEMENT: replacement }, encoding: "utf8" });
    expect(raced.status).toBe(1);
    expect(raced.stderr).toBe("lazycodex-gjc runtime verification failed; rerun native user install\n");
    expect(existsSync(maliciousMarker)).toBe(false);

    writeFileSync(runner, `import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.MARKER, "yes");\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write("trusted-result"));\n`, { mode: 0o700 });
    chmodSync(runtime, 0o775);
    const unsafe = spawnSync("bash", ["-c", script], { cwd: f.project, env, encoding: "utf8" });
    expect(unsafe.status).toBe(1);
    expect(unsafe.stderr).toBe("lazycodex-gjc runtime permissions are unsafe; rerun native user install\n");

    chmodSync(runtime, 0o700);
    const writableInterp = join(f.root, "writable-node");
    writeFileSync(writableInterp, "#!/bin/sh\nexit 99\n");
    chmodSync(writableInterp, 0o770); // explicit: writeFileSync mode is umask-masked
    writeSentinel(binding, ["lazycodex-gjc-binding-v1", f.home, digest(runner), runner, digest(writableInterp), writableInterp, digest(node), node, join(node, ".."), process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex"), digest(systemdRun), systemdRun, digest(systemctl), systemctl, digest(envBinary), envBinary].join("\n") + "\n");
    chmodSync(binding, 0o600);
    const writableNode = spawnSync("bash", ["-c", script], { cwd: f.project, env, encoding: "utf8" });
    expect(writableNode.status).toBe(1);
    expect(writableNode.stderr).toBe("lazycodex-gjc runtime verification failed; rerun native user install\n");
  });
});

describe("lazycodex-gjc isolated native install", () => {
  test.each(["user", "project"] as const)("installs exactly 8 skills and 11 commands in %s scope", (scope) => {
    const f = fixture(scope);
    writeSentinel(join(f.nativeRoot, "skills/sentinel/SKILL.md"), "keep skill");
    writeSentinel(join(f.nativeRoot, "commands/sentinel.md"), "keep command");
    writeSentinel(join(f.nativeRoot, "skills/lazycodex/SKILL.md"), "remove legacy skill");
    writeSentinel(join(f.nativeRoot, "commands/omg:lazycodex-work.md"), "remove legacy command");
    writeSentinel(join(f.nativeRoot, "commands/omg:lazycodex-setup.md"), "remove legacy command");

    const result = runInstaller(f, "install");

    expect(result.status, result.stderr).toBe(0);
    const expectedSkills = parseManifest("EXPECTED_SKILLS");
    const expectedCommands = ownedCommands();
    expect(expectedSkills).toHaveLength(8);
    expect(expectedCommands).toHaveLength(11);
    expect(expectedSkills).toContain("lazycodex-gjc");
    expect(expectedSkills).toContain("deep-onboarding");
    expect(expectedSkills).not.toContain("session-observer");
    expect(expectedCommands).toContain("omg:lazycodex-gjc.md");
    expect(expectedCommands).toContain("omg:deep-onboarding.md");
    expect(expectedCommands).not.toContain("omg:session-observer.md");
    expect(readdirSync(join(f.nativeRoot, "skills")).sort()).toEqual([...expectedSkills, "sentinel"].sort());
    expect(readdirSync(join(f.nativeRoot, "commands")).sort()).toEqual([...expectedCommands, "sentinel.md"].sort());
    expect(existsSync(join(f.nativeRoot, "skills/lazycodex"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg:lazycodex-work.md"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg:lazycodex-setup.md"))).toBe(false);
    expect(readdirSync(join(f.nativeRoot, "commands")).some((name) => name.startsWith("oh-my-gjc:"))).toBe(false);
    if (scope === "user") {
      const runtime = join(f.nativeRoot, "runtimes/lazycodex-gjc");
      const binding = join(runtime, "binding");
      expect(statSync(runtime).mode & 0o777).toBe(0o700);
      expect(statSync(join(runtime, "runner.mjs")).mode & 0o777).toBe(0o700);
      expect(statSync(binding).mode & 0o777).toBe(0o600);
      expect(read(binding)).toContain("lazycodex-gjc-binding-v1");
      expect(read(binding).trimEnd().split("\n")).toHaveLength(16);
    } else {
      expect(existsSync(join(f.nativeRoot, "runtimes/lazycodex-gjc"))).toBe(false);
    }
  });
  test.each(["user", "project"] as const)("installs only preset-pack's native surfaces and suite binding in %s scope", (scope) => {
    const f = fixture(scope);

    const result = runTargetedInstaller(f);

    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(join(f.nativeRoot, "skills"))).toEqual(["preset-pack"]);
    expect(readdirSync(join(f.nativeRoot, "commands"))).toEqual(["omg:preset-pack.md"]);
    expect(read(join(f.nativeRoot, "skills/preset-pack/SKILL.md"))).toBe(read(join(pluginRoot, "skills/preset-pack/SKILL.md")));
    expect(read(join(f.nativeRoot, "commands/omg:preset-pack.md"))).toBe(read(join(pluginRoot, "templates/preset-pack.md")));
    expect(read(join(f.nativeRoot, "runtimes/oh-my-gjc/root"))).toBe(`${pluginRoot}\n`);
  });

  test.each(["user", "project"] as const)(
    "rejects a %s targeted lazycodex-gjc install when its runner is missing or symlinked before native mutation",
    (scope) => {
      for (const kind of ["missing", "symlink"] as const) {
        const f = fixture(scope);
        const candidate = join(f.root, `candidate-${kind}`);
        const runner = join(candidate, "bin/lazycodex-gjc.mjs");
        cpSync(pluginRoot, candidate, { recursive: true });
        rmSync(runner);
        if (kind === "symlink") {
          const outsideRunner = join(f.root, "outside-runner");
          writeFileSync(outsideRunner, "not a runner");
          symlinkSync(outsideRunner, runner);
        }

        const result = runTargetedInstaller(f, join(candidate, "bin/install-skill.sh"), "lazycodex-gjc");

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("bin/lazycodex-gjc.mjs");
        expect(existsSync(join(f.nativeRoot, "skills"))).toBe(false);
        expect(existsSync(join(f.nativeRoot, "commands"))).toBe(false);
        expect(existsSync(join(f.nativeRoot, "runtimes/oh-my-gjc/root"))).toBe(false);
      }
    },
  );

  test("fails preflight before partial install when the runner is missing", () => {
    const f = fixture("project");
    const candidate = join(f.root, "candidate");
    cpSync(pluginRoot, candidate, { recursive: true });
    rmSync(join(candidate, "bin/lazycodex-gjc.mjs"));
    const result = runInstaller(f, "install", join(candidate, "bin/install-skill.sh"));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bin/lazycodex-gjc.mjs");
    expect(existsSync(join(f.nativeRoot, "skills/adaptive-response/SKILL.md"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg.md"))).toBe(false);
  });
  test.each(["non-regular", "symlink"] as const)("fails preflight before partial install when the lazycodex runner is %s", (kind) => {
    const f = fixture("project");
    const candidate = join(f.root, "candidate");
    const runner = join(candidate, "bin/lazycodex-gjc.mjs");
    cpSync(pluginRoot, candidate, { recursive: true });
    rmSync(runner, { force: true });

    if (kind === "non-regular") mkdirSync(runner);
    if (kind === "symlink") {
      const outsideRunner = join(f.root, "outside-runner");
      writeFileSync(outsideRunner, "not a runner");
      symlinkSync(outsideRunner, runner);
    }

    const result = runInstaller(f, "install", join(candidate, "bin/install-skill.sh"));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bin/lazycodex-gjc.mjs");
    expect(existsSync(join(f.nativeRoot, "skills/adaptive-response/SKILL.md"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg.md"))).toBe(false);
  });

  test("preserves an existing runtime when digest generation fails", () => {
    const f = fixture("user");
    const runtime = join(f.nativeRoot, "runtimes/lazycodex-gjc");
    const binding = join(runtime, "binding");
    const fakeBin = join(f.root, "fake-bin");
    writeSentinel(binding, "existing trusted binding");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "sha256sum"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });

    const result = spawnSync("bash", [installerPath, "lazycodex-gjc", "user"], {
      cwd: f.project,
      env: {
        ...process.env,
        HOME: f.home,
        CODEX_HOME: process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex"),
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(read(binding)).toBe("existing trusted binding");
    expect(result.stdout).not.toContain("bound runtime");
  });
  test.each([
    ["absent-prerequisite cleanup", ["all", "user"]],
    ["targeted uninstall", ["lazycodex-gjc", "uninstall", "user"]],
  ] as const)("rejects a symlinked runtime ancestor during %s", (_label, args) => {
    const f = fixture("user");
    const runtimeParent = join(f.home, ".gjc/agent/runtimes");
    const external = join(f.root, "external-runtimes");
    const sentinel = join(external, "lazycodex-gjc/sentinel");
    mkdirSync(dirname(runtimeParent), { recursive: true });
    writeSentinel(sentinel, "must survive");
    symlinkSync(external, runtimeParent);

    const result = spawnSync("bash", [installerPath, ...args], {
      cwd: f.project,
      env: { ...process.env, HOME: f.home, CODEX_HOME: join(f.home, ".codex-absent") },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("contains a symlink");
    expect(lstatSync(runtimeParent).isSymbolicLink()).toBe(true);
    expect(read(sentinel)).toBe("must survive");
  });
  test("all-user install without a Codex home skips AND removes the runtime binding", () => {
    const f = fixture("user");
    writeSentinel(join(f.nativeRoot, "runtimes/lazycodex-gjc/binding"), "stale binding from a previous install");
    const result = spawnSync("bash", [installerPath, "all", "user"], {
      cwd: f.project,
      env: { ...process.env, HOME: f.home, CODEX_HOME: join(f.home, ".codex-absent"), OMG_TIME_LEFT_RUNTIME: "0" },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("lazycodex-gjc runtime not bound");
    expect(readdirSync(join(f.nativeRoot, "skills")).sort()).toEqual([...parseManifest("EXPECTED_SKILLS")].sort());
    expect(readdirSync(join(f.nativeRoot, "commands")).sort()).toEqual([...ownedCommands()].sort());
    expect(existsSync(join(f.nativeRoot, "runtimes/lazycodex-gjc"))).toBe(false);
    expect(result.stdout + result.stderr).toContain("removed runtime binding");
  });

  test("normalizes group-writable trusted runtime paths during user install", () => {
    const f = fixture("user");
    const fakeInstall = join(f.root, "codex-install");
    const fakeBin = join(fakeInstall, "bin");
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(join(fakeBin, "codex"), "#!/bin/sh\nexit 0\n");
    const codexHome = join(f.home, ".codex");
    mkdirSync(codexHome);
    writeFileSync(join(codexHome, "auth.json"), "{}");
    // Worst-case umask-002 modes, pinned explicitly so the test is umask-independent.
    for (const [path, mode] of [[fakeInstall, 0o775], [fakeBin, 0o775], [join(fakeBin, "codex"), 0o775], [f.home, 0o775], [codexHome, 0o775], [join(codexHome, "auth.json"), 0o664]] as const) chmodSync(path, mode);

    const result = spawnSync("bash", [installerPath, "lazycodex-gjc", "user"], {
      cwd: f.project,
      env: { ...process.env, HOME: f.home, CODEX_HOME: codexHome, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    for (const path of [fakeInstall, fakeBin, join(fakeBin, "codex"), f.home, codexHome]) {
      expect(statSync(path).mode & 0o022, path).toBe(0);
    }
    expect(statSync(join(codexHome, "auth.json")).mode & 0o777).toBe(0o600);
    expect(read(join(f.home, ".gjc/agent/runtimes/lazycodex-gjc/binding"))).toContain(join(fakeBin, "codex"));
  });

  test.each(["user", "project"] as const)("uninstalls owned %s entries and preserves neighbors", (scope) => {
    const f = fixture(scope);
    expect(runInstaller(f, "install").status).toBe(0);
    writeSentinel(join(f.nativeRoot, "skills/sentinel/SKILL.md"), "keep skill");
    writeSentinel(join(f.nativeRoot, "commands/sentinel.md"), "keep command");

    const result = runInstaller(f, "uninstall");

    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(join(f.nativeRoot, "skills"))).toEqual(["sentinel"]);
    expect(readdirSync(join(f.nativeRoot, "commands"))).toEqual(["sentinel.md"]);
    expect(read(join(f.nativeRoot, "skills/sentinel/SKILL.md"))).toBe("keep skill");
    expect(read(join(f.nativeRoot, "commands/sentinel.md"))).toBe("keep command");
  });

  test("fails before copying when the new skill source is missing", () => {
    const f = fixture("user");
    const pluginCopy = join(f.root, "plugin-copy");
    cpSync(pluginRoot, pluginCopy, { recursive: true });
    rmSync(join(pluginCopy, "skills/lazycodex-gjc"), { recursive: true, force: true });

    const result = runInstaller(f, "install", join(pluginCopy, "bin/install-skill.sh"));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("skills/lazycodex-gjc/SKILL.md");
    expect(existsSync(join(f.nativeRoot, "skills"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands"))).toBe(false);
  });

  test("fails before copying when the sensitive runtime runner is missing", () => {
    const f = fixture("user");
    const pluginCopy = join(f.root, "plugin-copy");
    cpSync(pluginRoot, pluginCopy, { recursive: true });
    rmSync(join(pluginCopy, "bin/lazycodex-gjc.mjs"));

    const result = runInstaller(f, "install", join(pluginCopy, "bin/install-skill.sh"));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("bin/lazycodex-gjc.mjs");
    expect(existsSync(join(f.nativeRoot, "skills"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "receipts"))).toBe(false);
  });
});
