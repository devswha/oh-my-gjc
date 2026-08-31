import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

const pluginRoot = resolve(import.meta.dir, "..");
const canonicalPluginRoot = realpathSync(pluginRoot);
const canonicalTmpDir = realpathSync(tmpdir());
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
  const root = mkdtempSync(join(canonicalTmpDir, "omg-suite-root-"));
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
    ? join(sandbox.home, ".gjc/agent/runtimes/oh-my-gjc/root")
    : join(sandbox.project, ".gjc/runtimes/oh-my-gjc/root");
}

function legacyBindingPath(sandbox: Sandbox, scope: Scope): string {
  return scope === "user"
    ? join(sandbox.home, ".gjc/agent/runtimes/oh-my-gajae-code/root")
    : join(sandbox.project, ".gjc/runtimes/oh-my-gajae-code/root");
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
      ".gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___99.0.0",
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
  test.each(["user", "project"] as const)("installs exactly the five %s skills and commands", (scope) => {
    const sandbox = createSandbox();
    const nativeRoot =
      scope === "user" ? join(sandbox.home, ".gjc/agent") : join(sandbox.project, ".gjc");
    const result = run(sandbox, ["all", scope]);

    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(join(nativeRoot, "skills")).sort()).toEqual([
      "extragoal",
      "gpt-image",
      "insane-review",
      "insane-search",
      "no-english",
    ]);
    expect(readdirSync(join(nativeRoot, "commands")).sort()).toEqual([
      "omg.md",
      "omg:gpt-image.md",
      "omg:insane-review.md",
      "omg:no-english.md",
      "omg:setup.md",
    ]);
  });
  test.each(["user", "project"] as const)("binds a single native %s capability to the suite root", (scope) => {
    const sandbox = createSandbox();
    const result = run(sandbox, ["no-english", scope]);
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
    const retiredOuroborosSkill = join(nativeRoot, "skills/ouroboros/SKILL.md");
    const retiredOuroborosCommand = join(nativeRoot, "commands/omg:ouroboros-setup.md");
    const userRetiredRuntime = join(sandbox.home, ".gjc/agent/runtimes/lazycodex-gjc/binding");
    const userRetiredRunner = join(sandbox.home, ".gjc/agent/runtimes/lazycodex-gjc/runner.mjs");
    const userMultiHarnessRuntime = join(sandbox.home, ".gjc/agent/runtimes/multi-harness-research");
    const xdgResearchArtifact = join(sandbox.home, ".local/share/oh-my-gjc/multi-harness/keep.json");
    const externalOuroborosFiles = new Map<string, string>([
      [join(sandbox.home, ".local/lib/python3.12/site-packages/ouroboros/__init__.py"), "external package"],
      [join(sandbox.home, ".ouroboros/state.json"), "external Ouroboros state"],
      [join(sandbox.home, ".ouroboros/config.json"), "external Ouroboros config"],
      [join(sandbox.home, ".ouroboros/credentials.json"), "external Ouroboros credential"],
      [join(sandbox.home, ".gjc/agent/extensions/ouroboros-ooo-bridge/index.ts"), "upstream GJC bridge extension"],
      [join(sandbox.home, ".gjc/mcp/ouroboros/state.json"), "external MCP state"],
      [join(sandbox.home, ".gjc/plugins/installed_plugins.json"), "upstream GJC plugin state"],
      [join(sandbox.home, ".ouroboros/seeds/approved-seed.json"), "external Seed"],
      [join(sandbox.home, ".ouroboros/executions/run-1.json"), "external execution data"],
      [join(nativeRoot, "commands/oh-my-gjc:ouroboros-setup.md"), "never-owned legacy setup alias"],
    ]);
    const models = join(sandbox.home, ".gjc/agent/models.yml");
    const expectedSkills = ["no-english", "extragoal", "insane-review", "insane-search", "gpt-image"].map((name) =>
      join(nativeRoot, `skills/${name}/SKILL.md`),
    );
    const expectedCommands = [
      "omg.md",
      "omg:setup.md",
      "omg:no-english.md",
      "omg:insane-review.md",
      "omg:gpt-image.md",
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
    mkdirSync(dirname(retiredOuroborosSkill), { recursive: true });
    writeFileSync(retiredOuroborosSkill, "retired OMG wrapper skill");
    writeFileSync(retiredOuroborosCommand, "retired OMG wrapper command");
    mkdirSync(dirname(userRetiredRuntime), { recursive: true, mode: 0o700 });
    chmodSync(dirname(userRetiredRuntime), 0o700);
    writeFileSync(userRetiredRuntime, `lazycodex-gjc-binding-v1\n${sandbox.home}\n`, { mode: 0o600 });
    chmodSync(userRetiredRuntime, 0o600);
    writeFileSync(userRetiredRunner, "retired runner", { mode: 0o700 });
    chmodSync(userRetiredRunner, 0o700);
    mkdirSync(userMultiHarnessRuntime, { recursive: true, mode: 0o700 });
    chmodSync(userMultiHarnessRuntime, 0o700);
    writeFileSync(join(userMultiHarnessRuntime, "binding"), "multi-harness-research-binding-v1\n", { mode: 0o600 });
    chmodSync(join(userMultiHarnessRuntime, "binding"), 0o600);
    writeFileSync(join(userMultiHarnessRuntime, "runner.mjs"), "multi-harness runtime", { mode: 0o700 });
    chmodSync(join(userMultiHarnessRuntime, "runner.mjs"), 0o700);
    mkdirSync(dirname(xdgResearchArtifact), { recursive: true });
    writeFileSync(xdgResearchArtifact, "XDG research remains");
    for (const [path, content] of externalOuroborosFiles) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    mkdirSync(dirname(models), { recursive: true });
    writeFileSync(models, "profiles:\n  user-owned: {}\n");

    const result = run(sandbox, ["all", "uninstall", scope]);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(binding)).toBe(false);
    expect(readFileSync(suiteSibling, "utf8")).toBe("suite sibling remains");
    expect(readFileSync(otherSuiteBinding, "utf8")).toBe("other suite remains");
    expect(readFileSync(legacyBinding, "utf8")).toBe("/legacy/suite/root\n");
    expect(existsSync(retiredCommand)).toBe(false);
    expect(existsSync(retiredOuroborosSkill)).toBe(false);
    expect(existsSync(retiredOuroborosCommand)).toBe(false);
    for (const path of [...expectedSkills, ...expectedCommands]) {
      expect(existsSync(path)).toBe(false);
    }
    if (scope === "user") expect(existsSync(userRetiredRuntime)).toBe(false);
    else {
      expect(readFileSync(userRetiredRuntime, "utf8")).toBe(`lazycodex-gjc-binding-v1\n${sandbox.home}\n`);
      expect(readFileSync(userRetiredRunner, "utf8")).toBe("retired runner");
    }
    if (scope === "user") expect(existsSync(userMultiHarnessRuntime)).toBe(false);
    else expect(readFileSync(join(userMultiHarnessRuntime, "binding"), "utf8")).toBe("multi-harness-research-binding-v1\n");
    expect(readFileSync(xdgResearchArtifact, "utf8")).toBe("XDG research remains");
    for (const [path, content] of externalOuroborosFiles) {
      expect(readFileSync(path, "utf8")).toBe(content);
    }
    expect(readFileSync(models, "utf8")).toBe("profiles:\n  user-owned: {}\n");
  });

  test("fails closed when a user binding path component is symlinked", () => {
    const sandbox = createSandbox();
    const linkedParent = join(sandbox.home, ".gjc/agent/runtimes/oh-my-gjc");
    const external = join(sandbox.root, "external-runtime");
    mkdirSync(dirname(linkedParent), { recursive: true });
    mkdirSync(external);
    symlinkSync(external, linkedParent);

    const result = run(sandbox, ["all", "user"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("suite runtime binding path contains a symlink");
    expect(existsSync(join(external, "root"))).toBe(false);
  });

  test("backs up and removes only well-formed retired gate-always marker blocks", () => {
    const sandbox = createSandbox();
    const system = join(sandbox.home, ".gjc/agent/SYSTEM.md");
    mkdirSync(dirname(system), { recursive: true });
    writeFileSync(
      system,
      "keep-before\n<!-- BEGIN oh-my-gjc:gate-always -->\nretired\n<!-- END oh-my-gjc:gate-always -->\nkeep-after",
    );

    const result = run(sandbox, ["all", "user"]);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(system, "utf8")).toBe("keep-before\nkeep-after");
    expect(
      readdirSync(dirname(system)).some((name) => name.startsWith("SYSTEM.md.bak-")),
    ).toBe(true);

    const malformed = createSandbox();
    const malformedSystem = join(malformed.home, ".gjc/agent/SYSTEM.md");
    mkdirSync(dirname(malformedSystem), { recursive: true });
    const malformedContent = "keep\n<!-- BEGIN oh-my-gjc:gate-always -->\nunterminated\n";
    writeFileSync(malformedSystem, malformedContent);

    const malformedResult = run(malformed, ["all", "user"]);

    expect(malformedResult.status, malformedResult.stderr).toBe(0);
    expect(readFileSync(malformedSystem, "utf8")).toBe(malformedContent);
    expect(malformedResult.stderr).toContain("gate-always marker cleanup skipped (malformed markers)");
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
