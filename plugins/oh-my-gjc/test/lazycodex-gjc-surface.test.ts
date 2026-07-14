import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

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
    env: { ...process.env, HOME: f.home },
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
      expect(text).toContain("oh-my-gjc___oh-my-gjc___*/bin/lazycodex-gjc.mjs");
      expect(text).toContain("sort -V | tail -1");
      expect(text).toContain("./.gjc/plugins/cache/plugins/");
      expect(text).toContain("plugins/oh-my-gjc/bin/lazycodex-gjc.mjs");
      expect(text).toMatch(/danger-full-access.*금지|금지.*danger-full-access/);
    }
    expect(executable).toContain(`printf '%s' "$LAZYCODEX_GJC_TASK" > "$TASK_FILE"`);
    expect(executable).toContain('node "$RUNNER" "${RUNNER_ARGS[@]}" < "$TASK_FILE"');
    expect(executable).toContain("trap cleanup EXIT HUP INT TERM");
    expect(executable).not.toContain("$ARGUMENTS");
    expect(executable).not.toMatch(/^\s*gjc\s+(?:task|team|ultragoal|session|config|update|setup)\b/m);
    expect(executable).not.toMatch(/\b(?:npx|lazycodex-ai)\b/);
    expect(executable).not.toContain("danger-full-access");
  });
});

describe("lazycodex-gjc isolated native install", () => {
  test.each(["user", "project"] as const)("installs exactly 9 skills and 14 commands in %s scope", (scope) => {
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
    expect(expectedSkills).toHaveLength(9);
    expect(expectedCommands).toHaveLength(14);
    expect(expectedSkills).toContain("lazycodex-gjc");
    expect(expectedCommands).toContain("omg:lazycodex-gjc.md");
    expect(readdirSync(join(f.nativeRoot, "skills")).sort()).toEqual([...expectedSkills, "sentinel"].sort());
    expect(readdirSync(join(f.nativeRoot, "commands")).sort()).toEqual([...expectedCommands, "sentinel.md"].sort());
    expect(existsSync(join(f.nativeRoot, "skills/lazycodex"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg:lazycodex-work.md"))).toBe(false);
    expect(existsSync(join(f.nativeRoot, "commands/omg:lazycodex-setup.md"))).toBe(false);
    expect(readdirSync(join(f.nativeRoot, "commands")).some((name) => name.startsWith("oh-my-gjc:"))).toBe(false);
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
});
