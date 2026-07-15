import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const pluginRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(pluginRoot, "../..");
const quietHarnessPrefix = "GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("GJC 0.11 SDK compatibility", () => {
  test("disables notifications and SDK hosting in disposable GJC launches", () => {
    const launchContracts = [
      join(pluginRoot, "skills/extragoal/SKILL.md"),
      join(pluginRoot, "templates/fable.md"),
      join(repositoryRoot, "AGENTS.md"),
    ];

    for (const path of launchContracts) {
      expect(read(path)).toContain(quietHarnessPrefix);
    }
  });

  test("does not ship the retired webhook-only Discord bridge", () => {
    for (const path of [
      join(repositoryRoot, "tools/discord-notify-bridge.ts"),
      join(repositoryRoot, "tools/test/e2e-bridge.test.ts"),
      join(repositoryRoot, "tools/test/mock-notify-endpoint.ts"),
    ]) {
      expect(existsSync(path)).toBe(false);
    }
  });
});
