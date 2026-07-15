import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
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
  test.each(["user", "project"] as const)("binds a single native %s capability to the suite root", (scope) => {
    const sandbox = createSandbox();
    const result = run(sandbox, ["easy-answer", scope]);
    const binding = bindingPath(sandbox, scope);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(binding, "utf8")).toBe(`${canonicalPluginRoot}\n`);
    expect(statSync(binding).mode & 0o777).toBe(0o600);
  });

  test.each(["user", "project"] as const)("%s uninstall removes only this suite binding", (scope) => {
    const sandbox = createSandbox();
    const binding = bindingPath(sandbox, scope);
    const suiteSibling = join(dirname(binding), "keep");
    const runtimes = dirname(dirname(binding));
    const otherSuiteBinding = join(runtimes, "another-suite/root");

    expect(run(sandbox, ["all", scope]).status).toBe(0);
    writeFileSync(suiteSibling, "suite sibling remains");
    mkdirSync(dirname(otherSuiteBinding), { recursive: true });
    writeFileSync(otherSuiteBinding, "other suite remains");

    const result = run(sandbox, ["all", "uninstall", scope]);

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(binding)).toBe(false);
    expect(readFileSync(suiteSibling, "utf8")).toBe("suite sibling remains");
    expect(readFileSync(otherSuiteBinding, "utf8")).toBe("other suite remains");
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
});
