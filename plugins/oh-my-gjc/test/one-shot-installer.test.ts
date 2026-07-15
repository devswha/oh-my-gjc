import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const installer = resolve(import.meta.dir, "../../..", "install.sh");
const sandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true });
});

function runInstaller(updateFails = false) {
  const sandbox = mkdtempSync(join(tmpdir(), "omg-one-shot-"));
  sandboxes.push(sandbox);
  const home = join(sandbox, "home");
  const bin = join(sandbox, "bin");
  const log = join(sandbox, "gjc.log");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });

  const gjc = join(bin, "gjc");
  writeFileSync(
    gjc,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GJC_TEST_LOG"
case "$*" in
  "plugin marketplace add devswha/oh-my-gjc") exit 1 ;;
  "plugin marketplace update oh-my-gjc") ${updateFails ? "exit 9" : "exit 0"} ;;
  "plugin install oh-my-gjc@oh-my-gjc --force")
    root="$HOME/.gjc/plugins/cache/plugins/oh-my-gjc___oh-my-gjc___9.9.9/bin"
    mkdir -p "$root"
    printf '#!/usr/bin/env bash\\nexit 0\\n' > "$root/install-skill.sh"
    chmod +x "$root/install-skill.sh"
    ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(gjc, 0o755);

  const result = spawnSync("bash", [installer], {
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, GJC_TEST_LOG: log },
    encoding: "utf8",
  });
  return { result, calls: readFileSync(log, "utf8").trim().split("\n") };
}

describe("one-shot marketplace refresh", () => {
  test("refreshes an existing marketplace before forced install", () => {
    const { result, calls } = runInstaller();
    expect(result.status, result.stderr).toBe(0);
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gjc",
      "plugin marketplace update oh-my-gjc",
      "plugin install oh-my-gjc@oh-my-gjc --force",
    ]);
  });

  test("fails closed when marketplace refresh fails", () => {
    const { result, calls } = runInstaller(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to install from a possibly-stale catalog");
    expect(calls).toEqual([
      "plugin marketplace add devswha/oh-my-gjc",
      "plugin marketplace update oh-my-gjc",
    ]);
  });
});
