/**
 * gajae-app ownership-transfer regression.
 * Run: bun test plugins/oh-my-gjc/test/gajae-app-removal.test.ts
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const pluginRoot = join(import.meta.dir, "..");
const installSh = join(pluginRoot, "bin/install-skill.sh");
const installer = readFileSync(installSh, "utf8");

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

describe("gajae-app removal manifest", () => {
  test("transitions ownership atomically across the four manifests", () => {
    const expectedSkills = parseManifest("EXPECTED_SKILLS");
    const expectedCommands = parseManifest("EXPECTED_COMMANDS");
    const removedSkills = parseManifest("REMOVED_SKILLS");
    const removedCommands = parseManifest("REMOVED_COMMANDS");
    expect(expectedSkills).toHaveLength(9);
    expect(expectedCommands).toHaveLength(14);
    expect(expectedSkills).not.toContain("gajae-app");
    expect(expectedCommands).not.toContain("gajae-app");

    expect(expectedSkills).toEqual([
      "easy-answer",
      "gate-briefing",
      "multivendor-presets",
      "branch-flow",
      "extragoal",
      "insane-review",
      "gjc-bugwatch",
      "plain-layer",
      "lazycodex-gjc",
    ]);
    expect(expectedCommands).toEqual([
      "omg",
      "setup",
      "easy",
      "easy-always",
      "gate",
      "gate-always",
      "presets",
      "fable",
      "branchflow-always",
      "insane-review",
      "bugwatch-scan",
      "worktree",
      "plain",
      "lazycodex-gjc",
    ]);
    expect(removedSkills).toContain("gajae-app");
    expect(removedCommands).toContain("gajae-app");
    expect(intersection(expectedSkills, removedSkills)).toEqual([]);
    expect(intersection(expectedCommands, removedCommands)).toEqual([]);
    expect(existsSync(join(pluginRoot, "skills/gajae-app/SKILL.md"))).toBe(false);
    expect(existsSync(join(pluginRoot, "templates/gajae-app.md"))).toBe(false);
  });
});

describe("gajae-app upgrade cleanup", () => {
  test.each(["user", "project"] as const)("sweeps only native %s entries", (scope) => {
    const sandbox = mkdtempSync(join(tmpdir(), `omg-gajae-app-${scope}-`));
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });

    const nativeRoot =
      scope === "user" ? join(home, ".gjc/agent") : join(project, ".gjc");
    const nativeSkill = join(nativeRoot, "skills/gajae-app/SKILL.md");
    const canonicalCommand = join(nativeRoot, "commands/omg:gajae-app.md");
    const legacyCommand = join(nativeRoot, "commands/oh-my-gjc:gajae-app.md");
    const nativeSibling = join(nativeRoot, "skills/gajae-app-sentinel/SKILL.md");
    const commandSibling = join(nativeRoot, "commands/omg:gajae-app-sentinel.md");
    const sentinels = new Map<string, string>([
      [join(sandbox, "claudecodeui-checkout/.git/HEAD"), "checkout remains"],
      [join(sandbox, "systemd/user/cloudcli.service"), "service remains"],
      [join(sandbox, "app-data/state.sqlite"), "data remains"],
      [join(sandbox, "environment/gajae-app.env"), "environment remains"],
      [join(sandbox, "logs/gajae-app.log"), "logs remain"],
      [join(sandbox, "tailscale/state.json"), "Tailscale state remains"],
    ]);

    try {
      writeSentinel(nativeSkill, "native skill to remove");
      writeSentinel(canonicalCommand, "canonical command to remove");
      writeSentinel(legacyCommand, "legacy command to remove");
      writeSentinel(nativeSibling, "native sibling remains");
      writeSentinel(commandSibling, "command sibling remains");
      for (const [path, content] of sentinels) writeSentinel(path, content);

      const result = spawnSync("bash", [installSh, "all", scope], {
        cwd: scope === "project" ? project : sandbox,
        env: { ...process.env, HOME: home, CODEX_HOME: process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex") },
        encoding: "utf8",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("gajae-app ownership transfer 0.14.0");
      expect(existsSync(nativeSkill)).toBe(false);
      expect(existsSync(canonicalCommand)).toBe(false);
      expect(existsSync(legacyCommand)).toBe(false);
      expect(readFileSync(nativeSibling, "utf8")).toBe("native sibling remains");
      expect(readFileSync(commandSibling, "utf8")).toBe("command sibling remains");
      for (const [path, content] of sentinels) {
        expect(readFileSync(path, "utf8")).toBe(content);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
