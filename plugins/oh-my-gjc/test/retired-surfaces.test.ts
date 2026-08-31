import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Retired-surface gate (adopted 2026-09-01, ported in spirit from patina's
// scripts/check-retired-concepts.mjs): a retired capability must never come back
// through the install surface.
//
// Boundary:
// - The retirement lists are SOURCED from bin/install-skill.sh (REMOVED_SKILLS /
//   REMOVED_COMMANDS arrays), so every future removal automatically widens this gate.
// - bin/install-skill.sh itself is NOT term-scanned: its cleanup_removed duty is to
//   name retired artifacts so it can delete them. It is covered by its own tests.
// - Human-facing docs (README, docs/) are not scanned; only install-bearing surfaces.
//
// Substring false positives are avoided by matching the precise `omg:<command>`
// token and `skills/<skill>/` path forms, never bare short names like "release".

const pluginRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(pluginRoot, "../..");

const installer = readFileSync(join(pluginRoot, "bin/install-skill.sh"), "utf8");

function bashArray(name: string): string[] {
  const match = installer.match(new RegExp(`${name}=\\(([^)]*)\\)`));
  expect(match, `bin/install-skill.sh must define ${name}()`).toBeTruthy();
  return (match![1] ?? "").split(/[\s'"\\]+/).filter(Boolean);
}
// Install-bearing surfaces scanned for retired tokens.
const scannedFiles: Array<{ label: string; text: string }> = [];
function scanDir(root: string, labelPrefix: string): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const label = `${labelPrefix}${entry.name}`;
    if (entry.isDirectory()) {
      scanDir(path, `${label}/`);
      continue;
    }
    if (/\.(md|json|py|ts|mjs|sh|yml|yaml|txt)$/.test(entry.name)) {
      scannedFiles.push({ label, text: readFileSync(path, "utf8") });
    }
  }
}
for (const dir of ["templates", "skills", "references"]) {
  scanDir(join(pluginRoot, dir), `${dir}/`);
}
for (const manifest of [
  join(pluginRoot, ".claude-plugin/plugin.json"),
  join(repoRoot, ".claude-plugin/marketplace.json"),
  join(repoRoot, "install.sh"),
]) {
  scannedFiles.push({
    label: manifest.replace(`${repoRoot}/`, ""),
    text: readFileSync(manifest, "utf8"),
  });
}
const removedSkills = bashArray("REMOVED_SKILLS");
const removedCommands = bashArray("REMOVED_COMMANDS");
const legacyNamespaced = bashArray("LEGACY_COMMANDS");

describe("retired capabilities stay retired", () => {
  test("retirement lists are sourced and non-trivial", () => {
    expect(removedSkills.length).toBeGreaterThan(10);
    expect(removedCommands.length).toBeGreaterThan(10);
    expect(legacyNamespaced.length).toBeGreaterThan(0);
  });

  test("no retired omg: command token appears in install surfaces", () => {
    const violations: string[] = [];
    for (const command of removedCommands) {
      const token = `omg:${command}`;
      for (const { label, text } of scannedFiles) {
        if (text.includes(token)) violations.push(`${label} mentions ${token}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("no legacy namespaced command appears in install surfaces", () => {
    const violations: string[] = [];
    for (const command of legacyNamespaced) {
      for (const { label, text } of scannedFiles) {
        if (text.includes(command)) violations.push(`${label} mentions ${command}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("no retired skill is referenced as a skills/ path in install surfaces", () => {
    const violations: string[] = [];
    for (const skill of removedSkills) {
      const token = `skills/${skill}`;
      for (const { label, text } of scannedFiles) {
        if (text.includes(token)) violations.push(`${label} references ${token}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("skills/ contains exactly the canonical five skills", () => {
    expect(
      readdirSync(join(pluginRoot, "skills")).sort(),
    ).toEqual(["extragoal", "gpt-image", "insane-review", "insane-search", "no-english"]);
  });

  test("templates/ contains exactly the canonical five commands", () => {
    expect(readdirSync(join(pluginRoot, "templates")).sort()).toEqual([
      "gpt-image.md",
      "insane-review.md",
      "no-english.md",
      "omg.md",
      "setup.md",
    ]);
  });
});
