import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Version-sync gate (adopted 2026-09-01 from patina's scripts/check-release-metadata.mjs
// idea): the suite version is embedded in three JSON fields and must never drift.
// Release flow bumps all of them together BEFORE tagging, so the gate compares the
// fields against each other — not against the git tag (which only exists after release).

const pluginRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(pluginRoot, "../..");

const plugin = JSON.parse(
  readFileSync(join(pluginRoot, ".claude-plugin/plugin.json"), "utf8"),
) as { name: string; version: string };
const marketplace = JSON.parse(
  readFileSync(join(repoRoot, ".claude-plugin/marketplace.json"), "utf8"),
) as {
  metadata?: { version?: string };
  plugins: Array<{ name: string; source: string; version?: string }>;
};

describe("version sync across manifests", () => {
  test("plugin.json version is plain semver", () => {
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("marketplace metadata.version matches plugin.json", () => {
    expect(marketplace.metadata?.version).toBe(plugin.version);
  });

  test("marketplace plugins[oh-my-gjc].version matches plugin.json", () => {
    expect(marketplace.plugins[0]?.version).toBe(plugin.version);
  });

  test("name parity and source path match the single-suite policy", () => {
    expect(plugin.name).toBe("oh-my-gjc");
    expect(marketplace.plugins.map((entry) => entry.name)).toEqual(["oh-my-gjc"]);
    expect(marketplace.plugins[0]?.source).toBe("./plugins/oh-my-gjc");
  });
});
