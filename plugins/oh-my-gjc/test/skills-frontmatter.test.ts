import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Regression guard for the 2026-07 defect where explicit-command skill descriptions
// started with a backtick (`/omg:...`). A backtick is a YAML reserved indicator, so
// a plain scalar may not begin with it; gjc silently dropped affected skills when
// their frontmatter could not be parsed.
// Bun.YAML enforces the same rule as gjc's loader (verified: identical error).

const pluginRoot = join(import.meta.dir, "..");
const YAML = (Bun as unknown as { YAML: { parse(text: string): unknown } }).YAML;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function frontmatter(path: string): string {
  const match = read(path).match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`no frontmatter block in ${path}`);
  return match[1];
}

const skillNames = readdirSync(join(pluginRoot, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(pluginRoot, "skills", entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();

const templateNames = readdirSync(join(pluginRoot, "templates"))
  .filter((name) => name.endsWith(".md"))
  .sort();

describe("skill frontmatter is valid YAML", () => {
  test.each(skillNames)("skills/%s/SKILL.md parses with name + description", (name) => {
    const fm = frontmatter(join(pluginRoot, "skills", name, "SKILL.md"));
    const doc = YAML.parse(fm) as Record<string, unknown>;
    expect(doc.name).toBe(name);
    expect(typeof doc.description).toBe("string");
    expect((doc.description as string).length).toBeGreaterThan(0);
  });
});

describe("command template frontmatter is valid YAML", () => {
  test.each(templateNames)("templates/%s parses to an object", (name) => {
    const fm = frontmatter(join(pluginRoot, "templates", name));
    const doc = YAML.parse(fm);
    expect(doc).toBeInstanceOf(Object);
  });
});

describe("backtick-leading descriptions stay quoted", () => {
  // These descriptions intentionally lead with an `/omg:...` command in backticks; the
  // value MUST be quoted so it is not parsed as a plain scalar (reserved char).
  test.each(["no-english", "adaptive-response"])(
    "%s description is quoted and still leads with the command backtick",
    (name) => {
      const fm = frontmatter(join(pluginRoot, "skills", name, "SKILL.md"));
      const doc = YAML.parse(fm) as Record<string, unknown>;
      expect((doc.description as string).startsWith("`/omg:")).toBe(true);
    },
  );
});
