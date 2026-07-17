/**
 * gajae-app ownership-transfer regression.
 * Run: bun test plugins/oh-my-gjc/test/gajae-app-removal.test.ts
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { spawnSync } from "child_process";

const pluginRoot = join(import.meta.dir, "..");
const installSh = join(pluginRoot, "bin/install-skill.sh");
const installer = readFileSync(installSh, "utf8");
const sdkRuntimeDisabled = { OMG_TIME_LEFT_RUNTIME: "0" };

function parseManifest(name: string): string[] {
  const match = installer.match(new RegExp(`^${name}=\\(([^)]*)\\)`, "m"));
  expect(match, `missing ${name}`).not.toBeNull();
  return match![1]
    .replace(/\\\s*\n/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function writeSentinel(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function intersection(left: string[], right: string[]): string[] {
  return left.filter((value) => right.includes(value));
}

const retiredSkills = [
  "gate-briefing",
  "korean-first",
  "workflow-eta",
  "gajae-app",
  "multivendor-presets",
  "release-gate",
  "easy-answer",
  "plain-layer",
  "branch-flow",
  "worktree",
  "gjc-bugwatch",
];

const retiredCommands = [
  "gajae-app",
  "presets",
  "release",
  "easy",
  "easy-always",
  "plain",
  "branchflow-always",
  "worktree",
  "bugwatch-scan",
];

describe("removed capability manifests", () => {
  test("transitions ownership atomically across the four manifests", () => {
    const expectedSkills = parseManifest("EXPECTED_SKILLS");
    const expectedCommands = parseManifest("EXPECTED_COMMANDS");
    const removedSkills = parseManifest("REMOVED_SKILLS");
    const removedCommands = parseManifest("REMOVED_COMMANDS");
    expect(expectedSkills).toHaveLength(8);
    expect(expectedCommands).toHaveLength(11);
    expect(expectedSkills).not.toContain("gajae-app");
    expect(expectedCommands).not.toContain("gajae-app");

    expect(expectedSkills).toEqual([
      "adaptive-response",
      "no-english",
      "time-left",
      "extragoal",
      "insane-review",
      "lazycodex-gjc",
      "deep-onboarding",
      "session-observer",
    ]);
    expect(expectedCommands).toEqual([
      "omg",
      "setup",
      "gate",
      "gate-always",
      "no-english",
      "time-left",
      "fable",
      "insane-review",
      "lazycodex-gjc",
      "deep-onboarding",
      "session-observer",
    ]);
    for (const skill of retiredSkills) expect(removedSkills).toContain(skill);
    for (const command of retiredCommands) expect(removedCommands).toContain(command);
    expect(intersection(expectedSkills, removedSkills)).toEqual([]);
    expect(intersection(expectedCommands, removedCommands)).toEqual([]);
    expect(existsSync(join(pluginRoot, "skills/gajae-app/SKILL.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "templates/gajae-app.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "skills/multivendor-presets/SKILL.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "templates/presets.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "references/presets.yml"))).toBe(false);
    expect(existsSync(join(pluginRoot, "skills/release-gate/SKILL.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "templates/release.md"))).toBe(false);
    for (const skill of retiredSkills) {
      expect(existsSync(join(pluginRoot, `skills/${skill}/SKILL.md`))).toBe(false);
    }
    for (const command of retiredCommands) {
      expect(existsSync(join(pluginRoot, `templates/${command}.md`))).toBe(false);
    }
    expect(existsSync(join(pluginRoot, "bin/lazycodex-gjc.mjs"))).toBe(true);
    expect(existsSync(join(pluginRoot, "skills/lazycodex-gjc/SKILL.md"))).toBe(true);
    expect(existsSync(join(pluginRoot, "templates/lazycodex-gjc.md"))).toBe(true);
    expect(existsSync(join(pluginRoot, "bin/session-observer.ts"))).toBe(true);
    expect(existsSync(join(pluginRoot, "skills/session-observer/SKILL.md"))).toBe(true);
    expect(existsSync(join(pluginRoot, "templates/session-observer.md"))).toBe(true);
    expect(readFileSync(join(pluginRoot, "skills/extragoal/SKILL.md"), "utf8")).not.toContain("--mpreset reviewer");
  });
});

describe("removed capability upgrade cleanup", () => {
  test.each(["user", "project"] as const)("sweeps only native %s entries", (scope) => {
    const sandbox = mkdtempSync(join(tmpdir(), `omg-gajae-app-${scope}-`));
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });

    const nativeRoot =
      scope === "user" ? join(home, ".gjc/agent") : join(project, ".gjc");
    const removedSkillPaths = retiredSkills.map((name) =>
      join(nativeRoot, `skills/${name}/SKILL.md`),
    );
    const removedCommandPaths = retiredCommands.map((name) =>
      join(nativeRoot, `commands/omg:${name}.md`),
    );
    const legacyCommand = join(nativeRoot, "commands/oh-my-gjc:gajae-app.md");
    const nativeSibling = join(nativeRoot, "skills/gajae-app-sentinel/SKILL.md");
    const commandSibling = join(nativeRoot, "commands/omg:gajae-app-sentinel.md");
    const removedRuntime = join(home, ".gjc/agent/runtimes/lazycodex-gjc/binding");
    const removedReceipt = join(home, ".gjc/agent/receipts/lazycodex-gjc-runner.sha256");
    const systemFile = join(home, ".gjc/agent/SYSTEM.md");
    const agentsFile = join(home, ".gjc/agent/AGENTS.md");
    const markerFixture = [
      "user content before",
      "<!-- BEGIN oh-my-gjc:easy-always -->",
      "retired easy rule",
      "<!-- END oh-my-gjc:easy-always -->",
      "<!-- BEGIN oh-my-gjc:gate-always -->",
      "preserved gate rule",
      "<!-- END oh-my-gjc:gate-always -->",
      "user content after",
      "",
    ].join("\n");
    const sentinels = new Map<string, string>([
      [join(sandbox, "claudecodeui-checkout/.git/HEAD"), "checkout remains"],
      [join(sandbox, "systemd/user/cloudcli.service"), "service remains"],
      [join(sandbox, "app-data/state.sqlite"), "data remains"],
      [join(sandbox, "environment/gajae-app.env"), "environment remains"],
      [join(sandbox, "logs/gajae-app.log"), "logs remain"],
      [join(sandbox, "tailscale/state.json"), "Tailscale state remains"],
      [join(home, ".gjc/agent/models.yml"), "profiles:\n  sol:\n    display_name: user-owned\n"],
    ]);

    try {
      for (const path of removedSkillPaths) writeSentinel(path, "removed skill");
      for (const path of removedCommandPaths) writeSentinel(path, "removed command");
      writeSentinel(legacyCommand, "legacy command to remove");
      rmSync(removedSkillPaths[0]);
      symlinkSync(join(sandbox, "missing-retired-skill"), removedSkillPaths[0]);
      rmSync(removedCommandPaths[0]);
      symlinkSync(join(sandbox, "missing-retired-command"), removedCommandPaths[0]);
      expect(lstatSync(removedSkillPaths[0]).isSymbolicLink()).toBe(true);
      expect(lstatSync(removedCommandPaths[0]).isSymbolicLink()).toBe(true);

      writeSentinel(removedRuntime, "retired binding");
      if (scope === "user") {
        mkdirSync(dirname(removedReceipt), { recursive: true });
        symlinkSync(join(sandbox, "missing-retired-receipt"), removedReceipt);
      } else {
        writeSentinel(removedReceipt, "retired receipt");
      }
      writeSentinel(systemFile, markerFixture);
      writeSentinel(agentsFile, markerFixture.replaceAll("oh-my-gjc:easy-always", "my-workflows:easy-always"));
      chmodSync(systemFile, 0o600);
      chmodSync(agentsFile, 0o600);
      writeSentinel(nativeSibling, "native sibling remains");
      writeSentinel(commandSibling, "command sibling remains");
      for (const [path, content] of sentinels) writeSentinel(path, content);

      const result = spawnSync("bash", [installSh, "all", scope], {
        cwd: scope === "project" ? project : sandbox,
        env: { ...process.env, ...sdkRuntimeDisabled, HOME: home, CODEX_HOME: join(sandbox, "absent-codex-home") },
        encoding: "utf8",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("removed-capability native file");
      for (const path of removedSkillPaths) expect(existsSync(path)).toBe(false);
      for (const path of removedCommandPaths) expect(existsSync(path)).toBe(false);
      expect(existsSync(legacyCommand)).toBe(false);
      expect(() => lstatSync(removedSkillPaths[0])).toThrow();
      expect(() => lstatSync(removedCommandPaths[0])).toThrow();
      if (scope === "user") {
        expect(existsSync(removedRuntime)).toBe(false);
        expect(() => lstatSync(removedReceipt)).toThrow();
        for (const file of [systemFile, agentsFile]) {
          const original =
            file === systemFile
              ? markerFixture
              : markerFixture.replaceAll("oh-my-gjc:easy-always", "my-workflows:easy-always");
          const content = readFileSync(file, "utf8");
          expect(content).toContain("user content before");
          expect(content).toContain("preserved gate rule");
          expect(content).toContain("user content after");
          expect(content).not.toContain("easy-always");
          expect(statSync(file).mode & 0o777).toBe(0o600);
          const backupName = readdirSync(dirname(file)).find((name) =>
            name.startsWith(`${basename(file)}.bak-`),
          );
          expect(backupName).toBeDefined();
          expect(readFileSync(join(dirname(file), backupName!), "utf8")).toBe(original);
          expect(statSync(join(dirname(file), backupName!)).mode & 0o777).toBe(0o600);
        }
      } else {
        expect(readFileSync(removedRuntime, "utf8")).toBe("retired binding");
        expect(readFileSync(removedReceipt, "utf8")).toBe("retired receipt");
        expect(readFileSync(systemFile, "utf8")).toBe(markerFixture);
        expect(readFileSync(agentsFile, "utf8")).toBe(
          markerFixture.replaceAll("oh-my-gjc:easy-always", "my-workflows:easy-always"),
        );
      }
      expect(readFileSync(nativeSibling, "utf8")).toBe("native sibling remains");
      expect(readFileSync(commandSibling, "utf8")).toBe("command sibling remains");
      for (const [path, content] of sentinels) {
        expect(readFileSync(path, "utf8")).toBe(content);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
  test("rejects an invalid uninstall scope before mutation", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-invalid-scope-"));
    const home = join(sandbox, "home");
    const skill = join(home, ".gjc/agent/skills/adaptive-response/SKILL.md");
    try {
      writeSentinel(skill, "must remain");
      const result = spawnSync("bash", [installSh, "all", "uninstall", "projects"], {
        cwd: sandbox,
        env: { ...process.env, HOME: home },
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(readFileSync(skill, "utf8")).toBe("must remain");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("refuses a symlinked user policy file", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-policy-symlink-"));
    const home = join(sandbox, "home");
    const external = join(sandbox, "external-system.md");
    const systemFile = join(home, ".gjc/agent/SYSTEM.md");
    const content = [
      "external content",
      "<!-- BEGIN oh-my-gjc:easy-always -->",
      "retired easy rule",
      "<!-- END oh-my-gjc:easy-always -->",
      "",
    ].join("\n");
    try {
      writeSentinel(external, content);
      mkdirSync(dirname(systemFile), { recursive: true });
      symlinkSync(external, systemFile);
      const result = spawnSync("bash", [installSh, "all", "user"], {
        cwd: sandbox,
        env: { ...process.env, ...sdkRuntimeDisabled, HOME: home },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("not a regular file");
      expect(lstatSync(systemFile).isSymbolicLink()).toBe(true);
      expect(readFileSync(external, "utf8")).toBe(content);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test.each([
    ["content temp creation", "mktemp", 1],
    ["backup temp creation", "mktemp", 2],
    ["replacement temp creation", "mktemp", 3],
    ["backup copy", "cp", 1],
    ["replacement metadata copy", "cp", 2],
    ["replacement content copy", "cp", 3],
    ["atomic rename", "mv", 1],
  ] as const)("preserves policy when %s fails", (_label, command, failAt) => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-policy-io-failure-"));
    const home = join(sandbox, "home");
    const fakeBin = join(sandbox, "bin");
    const state = join(sandbox, `${command}-count`);
    const systemFile = join(home, ".gjc/agent/SYSTEM.md");
    const content = [
      "user content",
      "<!-- BEGIN oh-my-gjc:easy-always -->",
      "retired easy rule",
      "<!-- END oh-my-gjc:easy-always -->",
      "",
    ].join("\n");
    try {
      writeSentinel(systemFile, content);
      chmodSync(systemFile, 0o600);
      mkdirSync(fakeBin, { recursive: true });
      writeSentinel(
        join(fakeBin, command),
        [
          "#!/bin/sh",
          "n=0",
          `if [ -f '${state}' ]; then IFS= read -r n < '${state}'; fi`,
          "n=$((n + 1))",
          `printf '%s\\n' "$n" > '${state}'`,
          `if [ "$n" -eq ${failAt} ]; then exit 1; fi`,
          `exec /usr/bin/${command} "$@"`,
          "",
        ].join("\n"),
      );
      chmodSync(join(fakeBin, command), 0o755);
      const result = spawnSync("bash", [installSh, "all", "uninstall", "user"], {
        cwd: sandbox,
        env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("failed");
      expect(readFileSync(systemFile, "utf8")).toBe(content);
      expect(statSync(systemFile).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
  test("fails marker cleanup closed on malformed ordering", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-malformed-marker-"));
    const home = join(sandbox, "home");
    const systemFile = join(home, ".gjc/agent/SYSTEM.md");
    const malformed = [
      "user content before",
      "<!-- END oh-my-gjc:easy-always -->",
      "<!-- BEGIN oh-my-gjc:easy-always -->",
      "retired easy rule",
      "<!-- END oh-my-gjc:easy-always -->",
      "user content after",
      "",
    ].join("\n");
    try {
      writeSentinel(systemFile, malformed);
      chmodSync(systemFile, 0o600);
      const result = spawnSync("bash", [installSh, "all", "user"], {
        cwd: sandbox,
        env: { ...process.env, ...sdkRuntimeDisabled, HOME: home },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("malformed markers");
      expect(readFileSync(systemFile, "utf8")).toBe(malformed);
      expect(statSync(systemFile).mode & 0o777).toBe(0o600);
      expect(
        readdirSync(dirname(systemFile)).filter((name) =>
          name.startsWith(`${basename(systemFile)}.`),
        ),
      ).toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe("retired branchflow marker cleanup", () => {
  function fixture(name: string) {
    const sandbox = mkdtempSync(join(tmpdir(), `omg-${name}-`));
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    mkdirSync(home);
    mkdirSync(project);
    expect(spawnSync("git", ["init", "-q"], { cwd: project }).status).toBe(0);
    return { sandbox, home, project, agents: join(project, "AGENTS.md") };
  }

  function install(home: string, project: string) {
    return spawnSync("bash", [installSh, "all", "user"], {
      cwd: project,
      env: { ...process.env, ...sdkRuntimeDisabled, HOME: home, CODEX_HOME: join(home, "absent-codex-home") },
      encoding: "utf8",
    });
  }

  test("removes one well-formed marker and preserves outside bytes with backup", () => {
    const f = fixture("branchflow-marker");
    const original = [
      "before",
      "<!-- BEGIN oh-my-gjc:branchflow -->",
      "retired policy",
      "<!-- END oh-my-gjc:branchflow -->",
      "after",
      "",
    ].join("\n");
    try {
      writeSentinel(f.agents, original);
      chmodSync(f.agents, 0o640);

      const result = install(f.home, f.project);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("removed retired branchflow marker");
      expect(readFileSync(f.agents, "utf8")).toBe("before\nafter\n");
      expect(statSync(f.agents).mode & 0o777).toBe(0o640);
      const backup = readdirSync(f.project).find((name) => name.startsWith("AGENTS.md.bak-"));
      expect(backup).toBeDefined();
      expect(readFileSync(join(f.project, backup!), "utf8")).toBe(original);
      expect(statSync(join(f.project, backup!)).mode & 0o777).toBe(0o640);
    } finally {
      rmSync(f.sandbox, { recursive: true, force: true });
    }
  });

  test("preserves malformed markers without creating a backup", () => {
    const f = fixture("branchflow-malformed");
    const malformed = [
      "before",
      "<!-- BEGIN oh-my-gjc:branchflow -->",
      "retired policy",
      "after",
      "",
    ].join("\n");
    try {
      writeSentinel(f.agents, malformed);

      const result = install(f.home, f.project);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toContain("branchflow marker cleanup skipped (malformed markers)");
      expect(readFileSync(f.agents, "utf8")).toBe(malformed);
      expect(readdirSync(f.project).filter((name) => name.startsWith("AGENTS.md."))).toEqual([]);
    } finally {
      rmSync(f.sandbox, { recursive: true, force: true });
    }
  });

  test("leaves an unmarked repository untouched", () => {
    const f = fixture("branchflow-absent");
    try {
      writeSentinel(f.agents, "repository policy\n");

      const result = install(f.home, f.project);

      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(f.agents, "utf8")).toBe("repository policy\n");
      expect(readdirSync(f.project).filter((name) => name.startsWith("AGENTS.md."))).toEqual([]);
    } finally {
      rmSync(f.sandbox, { recursive: true, force: true });
    }
  });
});
