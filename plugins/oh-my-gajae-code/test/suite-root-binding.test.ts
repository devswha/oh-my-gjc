import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

const pluginRoot = resolve(import.meta.dir, "..");
const canonicalPluginRoot = realpathSync(pluginRoot);
const installer = join(pluginRoot, "bin", "install-skill.sh");
const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true });
});

type Scope = "user" | "project";

interface Sandbox {
  root: string;
  home: string;
  project: string;
  bin: string;
}

function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "omg-suite-root-"));
  sandboxes.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const bin = join(root, "bin");
  mkdirSync(home);
  mkdirSync(project);
  mkdirSync(bin);
  writeFileSync(join(bin, "gjc"), ["#!/bin/sh", "exit 1", ""].join("\n"), { mode: 0o755 });
  return { root, home, project, bin };
}

function bindingPath(sandbox: Sandbox, scope: Scope): string {
  return scope === "user"
    ? join(sandbox.home, ".gjc/agent/runtimes/oh-my-gajae-code/root")
    : join(sandbox.project, ".gjc/runtimes/oh-my-gajae-code/root");
}

function legacyBindingPath(sandbox: Sandbox, scope: Scope): string {
  return scope === "user"
    ? join(sandbox.home, ".gjc/agent/runtimes/oh-my-gjc/root")
    : join(sandbox.project, ".gjc/runtimes/oh-my-gjc/root");
}

function run(sandbox: Sandbox, args: string[]) {
  return spawnSync("bash", [installer, ...args], {
    cwd: sandbox.project,
    env: {
      ...process.env,
      CODEX_HOME: join(sandbox.root, "absent-codex-home"),
      HOME: sandbox.home,
      PATH: `${sandbox.bin}:/usr/bin:/bin`,
    },
    encoding: "utf8",
  });
}

describe("suite root runtime binding", () => {
  test.each(["user", "project"] as const)("binds the exact native %s payload root privately", (scope) => {
    const sandbox = createSandbox();
    const staleHigherCache = join(
      sandbox.home,
      ".gjc/plugins/cache/plugins/oh-my-gajae-code___oh-my-gajae-code___99.0.0",
    );
    mkdirSync(staleHigherCache, { recursive: true });
    writeFileSync(join(staleHigherCache, "root"), "/stale/higher/cache");

    const result = run(sandbox, ["all", scope]);
    const binding = bindingPath(sandbox, scope);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(binding, "utf8")).toBe(`${canonicalPluginRoot}\n`);
    expect(readFileSync(binding, "utf8")).not.toBe(`${staleHigherCache}\n`);
    expect(statSync(binding).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(binding)).mode & 0o777).toBe(0o700);
  });
  test.each(["user", "project"] as const)("binds a single native %s capability to the suite root", (scope) => {
    const sandbox = createSandbox();
    const result = run(sandbox, ["adaptive-response", scope]);
    const binding = bindingPath(sandbox, scope);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(binding, "utf8")).toBe(`${canonicalPluginRoot}\n`);
    expect(statSync(binding).mode & 0o777).toBe(0o600);
  });

  test.each(["user", "project"] as const)("%s uninstall removes only this suite binding", (scope) => {
    const sandbox = createSandbox();
    const binding = bindingPath(sandbox, scope);
    const legacyBinding = legacyBindingPath(sandbox, scope);
    const suiteSibling = join(dirname(binding), "keep");
    const runtimes = dirname(dirname(binding));
    const otherSuiteBinding = join(runtimes, "another-suite/root");
    const nativeRoot =
      scope === "user" ? join(sandbox.home, ".gjc/agent") : join(sandbox.project, ".gjc");
    const retiredCommand = join(nativeRoot, "commands/omg:easy.md");
    const userRetiredRuntime = join(sandbox.home, ".gjc/agent/runtimes/lazycodex-gjc/binding");
    const userRetiredRunner = join(sandbox.home, ".gjc/agent/runtimes/lazycodex-gjc/runner.mjs");
    const userMultiHarnessRuntime = join(sandbox.home, ".gjc/agent/runtimes/multi-harness-research");
    const models = join(sandbox.home, ".gjc/agent/models.yml");
    const expectedSkills = ["adaptive-response", "no-english", "extragoal", "insane-review", "deep-onboarding", "preset-pack", "multi-harness-research"].map((name) =>
      join(nativeRoot, `skills/${name}/SKILL.md`),
    );
    const expectedCommands = [
      "omg.md",
      "omg:setup.md",
      "omg:gate.md",
      "omg:gate-always.md",
      "omg:no-english.md",
      "omg:insane-review.md",
      "omg:deep-onboarding.md",
      "omg:preset-pack.md",
      "omg:multi-harness.md",
    ].map((name) => join(nativeRoot, `commands/${name}`));
    mkdirSync(dirname(legacyBinding), { recursive: true, mode: 0o700 });
    chmodSync(dirname(legacyBinding), 0o700);
    writeFileSync(legacyBinding, "/legacy/suite/root\n", { mode: 0o600 });
    chmodSync(legacyBinding, 0o600);

    expect(run(sandbox, ["all", scope]).status).toBe(0);
    writeFileSync(suiteSibling, "suite sibling remains");
    mkdirSync(dirname(otherSuiteBinding), { recursive: true });
    writeFileSync(otherSuiteBinding, "other suite remains");
    mkdirSync(dirname(retiredCommand), { recursive: true });
    writeFileSync(retiredCommand, "retired command");
    mkdirSync(dirname(userRetiredRuntime), { recursive: true, mode: 0o700 });
    chmodSync(dirname(userRetiredRuntime), 0o700);
    writeFileSync(userRetiredRuntime, `lazycodex-gjc-binding-v1\n${sandbox.home}\n`, { mode: 0o600 });
    chmodSync(userRetiredRuntime, 0o600);
    writeFileSync(userRetiredRunner, "retired runner", { mode: 0o700 });
    chmodSync(userRetiredRunner, 0o700);
    mkdirSync(userMultiHarnessRuntime, { recursive: true });
    writeFileSync(join(userMultiHarnessRuntime, "binding"), "multi-harness runtime");
    mkdirSync(dirname(models), { recursive: true });
    writeFileSync(models, "profiles:\n  user-owned: {}\n");

    const result = run(sandbox, ["all", "uninstall", scope]);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(binding)).toBe(false);
    expect(readFileSync(suiteSibling, "utf8")).toBe("suite sibling remains");
    expect(readFileSync(otherSuiteBinding, "utf8")).toBe("other suite remains");
    expect(readFileSync(legacyBinding, "utf8")).toBe("/legacy/suite/root\n");
    expect(existsSync(retiredCommand)).toBe(false);
    for (const path of [...expectedSkills, ...expectedCommands]) {
      expect(existsSync(path)).toBe(false);
    }
    if (scope === "user") expect(existsSync(userRetiredRuntime)).toBe(false);
    else {
      expect(readFileSync(userRetiredRuntime, "utf8")).toBe(`lazycodex-gjc-binding-v1\n${sandbox.home}\n`);
      expect(readFileSync(userRetiredRunner, "utf8")).toBe("retired runner");
    }
    if (scope === "user") expect(existsSync(userMultiHarnessRuntime)).toBe(false);
    else expect(readFileSync(join(userMultiHarnessRuntime, "binding"), "utf8")).toBe("multi-harness runtime");
    expect(readFileSync(models, "utf8")).toBe("profiles:\n  user-owned: {}\n");
  });

  test("fails closed when a user binding path component is symlinked", () => {
    const sandbox = createSandbox();
    const linkedParent = join(sandbox.home, ".gjc/agent/runtimes/oh-my-gajae-code");
    const external = join(sandbox.root, "external-runtime");
    mkdirSync(dirname(linkedParent), { recursive: true });
    mkdirSync(external);
    symlinkSync(external, linkedParent);

    const result = run(sandbox, ["all", "user"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("suite runtime binding path contains a symlink");
    expect(existsSync(join(external, "root"))).toBe(false);
  });
  test("preserves malformed and symlinked legacy bindings for bounded read fallback", () => {
    const malformed = createSandbox();
    const malformedBinding = legacyBindingPath(malformed, "user");
    mkdirSync(dirname(malformedBinding), { recursive: true, mode: 0o700 });
    chmodSync(dirname(malformedBinding), 0o700);
    writeFileSync(malformedBinding, "malformed legacy binding\n", { mode: 0o600 });
    chmodSync(malformedBinding, 0o600);

    const malformedInstall = run(malformed, ["all", "user"]);

    expect(malformedInstall.status, malformedInstall.stderr).toBe(0);
    expect(readFileSync(malformedBinding, "utf8")).toBe("malformed legacy binding\n");
    expect(readFileSync(bindingPath(malformed, "user"), "utf8")).toBe(`${canonicalPluginRoot}\n`);

    const linked = createSandbox();
    const linkedParent = dirname(legacyBindingPath(linked, "user"));
    const external = join(linked.root, "legacy-runtime");
    mkdirSync(dirname(linkedParent), { recursive: true });
    mkdirSync(external);
    symlinkSync(external, linkedParent);

    const linkedInstall = run(linked, ["all", "user"]);

    expect(linkedInstall.status, linkedInstall.stderr).toBe(0);
    expect(lstatSync(linkedParent).isSymbolicLink()).toBe(true);
    expect(existsSync(join(external, "root"))).toBe(false);
    expect(readFileSync(bindingPath(linked, "user"), "utf8")).toBe(`${canonicalPluginRoot}\n`);
  });
  test("fails closed when the new binding is malformed", () => {
    const sandbox = createSandbox();
    const binding = bindingPath(sandbox, "user");
    mkdirSync(binding, { recursive: true });

    const result = run(sandbox, ["all", "user"]);

    expect(result.status).not.toBe(0);
    expect(statSync(binding).isDirectory()).toBe(true);
  });
});
