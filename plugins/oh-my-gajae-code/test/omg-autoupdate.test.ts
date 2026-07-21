/**
 * opt-in auto-updater (bin/omg-autoupdate.sh) contract.
 * Run: bun test plugins/oh-my-gajae-code/test/omg-autoupdate.test.ts
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const pluginRoot = join(import.meta.dir, "..");
const script = join(pluginRoot, "bin/omg-autoupdate.sh");
const repoRoot = join(pluginRoot, "..", "..");

function run(args: string[], stateHome: string, extraEnv: Record<string, string> = {}) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, XDG_STATE_HOME: stateHome, ...extraEnv },
  });
}

// Force the cron fallback deterministically (systemd_user_available needs a
// non-empty XDG_RUNTIME_DIR), so cron-schedule validation is actually exercised.
function runCron(args: string[], stateHome: string) {
  return run(args, stateHome, { XDG_RUNTIME_DIR: "" });
}

describe("omg-autoupdate.sh", () => {
  test("exists, is executable, and parses", () => {
    expect(existsSync(script)).toBe(true);
    expect((statSync(script).mode & 0o111) !== 0).toBe(true);
    const syntax = spawnSync("bash", ["-n", script], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
  });

  test("is opt-in: the one-shot installer never schedules it", () => {
    const installer = readFileSync(join(repoRoot, "install.sh"), "utf8");
    expect(installer).not.toContain("omg-autoupdate.sh enable");
    expect(installer).not.toContain("omg-autoupdate enable");
  });

  test("uninstall (user) best-effort disables the timer", () => {
    const installSkill = readFileSync(join(pluginRoot, "bin/install-skill.sh"), "utf8");
    expect(installSkill).toContain('bin/omg-autoupdate.sh" disable');
  });

  test("run --dry-run targets the canonical installer under a lock", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      const r = run(["run", "--dry-run"], st);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("flock");
      expect(r.stdout).toContain("update from https://raw.githubusercontent.com/devswha/oh-my-gajae-code/main/install.sh");
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });

  test("run --local --dry-run runs the checkout installer instead of the network", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      const r = run(["run", "--local", repoRoot, "--dry-run"], st);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain(`update from local: ${join(repoRoot, "install.sh")}`);
      expect(r.stdout).not.toContain("raw.githubusercontent.com");
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });

  test("enable --dry-run installs a stable copy and schedules a daily job", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      const r = run(["enable", "--dry-run"], st);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("install stable copy");
      expect(r.stdout).toContain(join(st, "oh-my-gajae-code/omg-autoupdate.sh"));
      // systemd OnCalendar=daily OR cron 0 4 * * * fallback — both are "daily".
      expect(r.stdout).toMatch(/OnCalendar=daily|0 4 \* \* \*/);
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });

  test("a real run logs OK on success (rc 0) and propagates FAILED rc on installer error", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    const fake = mkdtempSync(join(tmpdir(), "omgfake-"));
    const log = join(st, "oh-my-gajae-code/autoupdate.log");
    try {
      writeFileSync(join(fake, "install.sh"), "#!/usr/bin/env bash\necho ok\n");
      let r = run(["run", "--local", fake], st);
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(log, "utf8")).toContain("result: OK");

      writeFileSync(join(fake, "install.sh"), "#!/usr/bin/env bash\nexit 3\n");
      r = run(["run", "--local", fake], st);
      // failure must propagate so systemd/cron can detect it
      expect(r.status).toBe(3);
      expect(readFileSync(log, "utf8")).toContain("result: FAILED rc=3");
    } finally {
      rmSync(st, { recursive: true, force: true });
      rmSync(fake, { recursive: true, force: true });
    }
  });

  test("rejects schedule-injection in --interval (cron fallback)", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      // blocked by the charset allowlist (;) and by the newline check
      expect(runCron(["enable", "--interval", "daily; rm -rf /", "--dry-run"], st).status).not.toBe(0);
      expect(runCron(["enable", "--interval", "weekly\nWantedBy=evil", "--dry-run"], st).status).not.toBe(0);
      // passes the charset allowlist but must NOT be usable as a cron schedule
      // (7 fields → would inject a trailing command); the 5-field check rejects it
      expect(runCron(["enable", "--interval", "* * * * * rm -rf /", "--dry-run"], st).status).not.toBe(0);
      // a named alias and a strict 5-field cron spec are accepted
      expect(runCron(["enable", "--interval", "weekly", "--dry-run"], st).status).toBe(0);
      expect(runCron(["enable", "--interval", "0 4 * * *", "--dry-run"], st).status).toBe(0);
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });

  test("disable removes systemd units unconditionally (not gated on the user bus)", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      const r = run(["disable", "--dry-run"], st);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("rm -f");
      expect(r.stdout).toContain("omg-autoupdate.timer");
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });

  test("disable removes owned unit files even when the user bus is unavailable, but reports failure since a loaded timer cannot be confirmed stopped", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    const cfg = mkdtempSync(join(tmpdir(), "omgcfg-"));
    const unitDir = join(cfg, "systemd/user");
    try {
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(join(unitDir, "omg-autoupdate.timer"), "[Timer]\n");
      writeFileSync(join(unitDir, "omg-autoupdate.service"), "[Service]\n");
      const r = run(["disable"], st, { XDG_CONFIG_HOME: cfg, XDG_RUNTIME_DIR: "" });
      // cannot confirm the timer is stopped without the bus → nonzero
      expect(r.status).not.toBe(0);
      // but the owned unit files are still removed (no silent leftover)
      expect(existsSync(join(unitDir, "omg-autoupdate.timer"))).toBe(false);
      expect(existsSync(join(unitDir, "omg-autoupdate.service"))).toBe(false);
    } finally {
      rmSync(st, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  test("disable on a system with nothing scheduled exits 0", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    const cfg = mkdtempSync(join(tmpdir(), "omgcfg-"));
    try {
      const r = run(["disable"], st, { XDG_CONFIG_HOME: cfg, XDG_RUNTIME_DIR: "" });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("nothing to remove");
    } finally {
      rmSync(st, { recursive: true, force: true });
      rmSync(cfg, { recursive: true, force: true });
    }
  });

  test("rejects unknown actions and flags", () => {
    const st = mkdtempSync(join(tmpdir(), "omgau-"));
    try {
      expect(run(["bogus"], st).status).not.toBe(0);
      expect(run(["run", "--nope"], st).status).not.toBe(0);
    } finally {
      rmSync(st, { recursive: true, force: true });
    }
  });
});
