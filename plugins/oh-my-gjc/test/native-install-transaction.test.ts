import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

const suite = resolve(import.meta.dir, "..");
const sandboxes: string[] = [];
afterEach(() => sandboxes.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));
const skills = ["no-english", "extragoal", "insane-review", "insane-search", "gpt-image"];
const commands = ["omg", "setup", "no-english", "insane-review", "gpt-image"];

function fixture(scope = "user", existing = true) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "omg-native-txn-"));
  sandboxes.push(root);
  const home = join(root, "home");
  const project = join(root, "project");
  const bin = join(root, "bin");
  for (const dir of [home, project, bin]) mkdirSync(dir);
  const native = scope === "user" ? join(home, ".gjc/agent") : join(project, ".gjc");
  const binding = join(native, "runtimes/oh-my-gjc/root");
  const journal = join(dirname(binding), ".native-install");
  const payloads = new Map<string, string>([
    ...skills.map((name) => [join(native, `skills/${name}/SKILL.md`), join(suite, `skills/${name}/SKILL.md`)] as [string, string]),
    ...commands.map((name) => [join(native, `commands/${name === "omg" ? "omg" : `omg:${name}`}.md`), join(suite, `templates/${name}.md`)] as [string, string]),
  ]);
  const old = new Map<string, string>();
  if (existing) {
    for (const path of [...payloads.keys(), binding]) {
      mkdirSync(dirname(path), { recursive: true });
      const content = path === binding ? "/previous/suite\n" : `old native bytes: ${path}\n`;
      writeFileSync(path, content, { mode: 0o600 });
      old.set(path, content);
    }
  }
  const unowned = new Map([
    [join(native, "skills/no-english/custom.md"), "custom skill attachment"],
    [join(native, "commands/custom.md"), "custom command"],
    [join(native, "runtimes/oh-my-gajae-code/root"), "/legacy/identity\n"],
    [join(home, ".gjc/agent/models.yml"), "custom model settings"],
    [join(home, ".gjc/agent/auth.json"), "fixture credential sentinel"],
    [join(home, ".local/share/oh-my-gajae-code/keep"), "legacy state"],
  ]);
  for (const [path, value] of unowned) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
  const retired = join(native, "commands/omg:easy.md");
  mkdirSync(dirname(retired), { recursive: true });
  writeFileSync(retired, "owned retired command");
  for (const tool of ["cp", "mv"]) {
    writeFileSync(join(bin, tool), `#!/bin/bash
set -eu
src="\${@: -2:1}"
dest="\${@: -1}"
case "\${FAULT:-}:$(basename "$0"):$src:$dest" in
  stage:cp:*templates/setup.md:*) printf partial > "$dest"; exit 71 ;;
  backup:cp:*/commands/omg:setup.md:*/old/c-setup) printf partial > "$dest"; exit 71 ;;
  publish:cp:*/.native-install/new/c-setup:*) printf partial > "$dest"; exit 71 ;;
  restore:cp:*/.native-install/new/c-setup:*) exit 71 ;;
  restore:cp:*/.native-install/old/s-no-english:*) exit 72 ;;
  rename:mv:*/.native-install/publish/c-setup:*) exit 71 ;;
  single:mv:*/.native-install/publish/c-no-english:*) exit 71 ;;
  binding:mv:*/.native-install/publish/root:*)
    if [ ! -f "$FAULT_ONCE" ]; then touch "$FAULT_ONCE"; exit 71; fi ;;
  terminate:mv:*/.native-install/publish/c-setup:*) kill -TERM "$PPID"; exit 71 ;;
  kill:mv:*/.native-install/publish/c-setup:*) kill -KILL "$PPID"; exit 71 ;;
  kill-binding:mv:*/.native-install/publish/root:*)
    /bin/mv "$@"; kill -KILL "$PPID"; exit 71 ;;
esac
if [ "$(basename "$0")" = mv ] && [[ "$src" == */.native-install/publish/* ]]; then
  printf '%s\\n' "$dest" >> "$PUBLISH_LOG"
  if [ -n "\${PROBE_LOCK:-}" ] && [ ! -f "$FAULT_ONCE" ]; then
    touch "$FAULT_ONCE"
    bash "$PROBE_LOCK" all "$NATIVE_TEST_SCOPE" > "$LOCK_PROBE_LOG" 2>&1 && exit 99
  fi
fi
exec /bin/$(basename "$0") "$@"
`, { mode: 0o755 });
  }
  function run(fault = "", source = suite, extra: Record<string, string> = {}, target = "all") {
    return spawnSync("/bin/bash", [join(source, "bin/install-skill.sh"), target, scope], {
      cwd: project, encoding: "utf8", timeout: 15000,
      env: { ...process.env, HOME: home, XDG_STATE_HOME: join(root, "state"), XDG_CONFIG_HOME: join(root, "config"), PATH: `${bin}:/usr/bin:/bin`, FAULT: fault, FAULT_ONCE: join(root, "once"), PUBLISH_LOG: join(root, "published"), LOCK_PROBE_LOG: join(root, "lock-probe"), NATIVE_TEST_SCOPE: scope, ...extra },
    });
  }
  function assertUnowned() { for (const [p, value] of unowned) expect(readFileSync(p, "utf8")).toBe(value); }
  function assertOld() {
    for (const p of [...payloads.keys(), binding]) {
      if (old.has(p)) { expect(readFileSync(p, "utf8"), p).toBe(old.get(p)!); expect(statSync(p).mode & 0o777).toBe(0o600); }
      else expect(existsSync(p), p).toBe(false);
    }
    assertUnowned();
    expect(existsSync(retired)).toBe(true);
  }
  return { root, home, bin, binding, journal, native, retired, payloads, run, assertOld, assertUnowned };
}

describe("native install restoration", () => {
  for (const scope of ["user", "project"]) {
    for (const fault of ["stage", "backup", "publish", "rename", "binding", "terminate"]) {
      test(`${scope}: ${fault} failure preserves/restores the complete previous set`, () => {
        const f = fixture(scope);
        const result = f.run(fault);
        expect(result.status).not.toBe(0);
        expect(result.stderr).not.toContain("native recovery incomplete");
        f.assertOld();
        expect(existsSync(f.journal)).toBe(false);
      });
    }
    test(`${scope}: failed fresh install removes newly published files only`, () => {
      const f = fixture(scope, false);
      expect(f.run("publish").status).toBe(71);
      f.assertOld();
    });
    for (const fault of ["kill", "kill-binding"]) {
      test(`${scope}: next run recovers ${fault} before even checking a broken new source`, () => {
        const f = fixture(scope);
        expect(f.run(fault).signal).toBe("SIGKILL");
        expect(existsSync(f.journal)).toBe(true);
        const broken = join(f.root, "broken-suite");
        cpSync(suite, broken, { recursive: true });
        rmSync(join(broken, "templates/setup.md"));
        const result = f.run("", broken);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("restored previous native files");
        f.assertOld();
        expect(existsSync(f.journal)).toBe(false);
        expect(f.run().status).toBe(0);
      });
    }
  }

  test("successful publication binds last, preserves custom data, and keeps cleanup", () => {
    const f = fixture();
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    for (const [dest, src] of f.payloads) expect(readFileSync(dest)).toEqual(readFileSync(src));
    expect(readFileSync(f.binding, "utf8")).toBe(`${suite}\n`);
    expect(statSync(f.binding).mode & 0o777).toBe(0o600);
    const published = readFileSync(join(f.root, "published"), "utf8").trim().split("\n");
    expect(published).toEqual([...f.payloads.keys(), f.binding]);
    expect(existsSync(f.journal)).toBe(false);
    expect(existsSync(f.retired)).toBe(false);
    f.assertUnowned();
  });

  test("recovery refuses to overwrite user edits made after interruption", () => {
    const f = fixture();
    expect(f.run("kill").signal).toBe("SIGKILL");
    const changed = join(f.native, "skills/no-english/SKILL.md");
    writeFileSync(changed, "user edited after kill");
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("native recovery conflict");
    expect(readFileSync(changed, "utf8")).toBe("user edited after kill");
    expect(existsSync(f.journal)).toBe(true);
    f.assertUnowned();
  });

  test("a failed restoration retains backups and can be retried", () => {
    const f = fixture();
    const result = f.run("restore");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("native recovery incomplete");
    expect(existsSync(f.journal)).toBe(true);
    const broken = join(f.root, "broken-suite");
    cpSync(suite, broken, { recursive: true });
    rmSync(join(broken, "templates/setup.md"));
    expect(f.run("", broken).status).not.toBe(0);
    f.assertOld();
    expect(existsSync(f.journal)).toBe(false);
  });

  test("restoration restores permissions even when old and new bytes are identical", () => {
    const f = fixture();
    const path = join(f.native, "skills/no-english/SKILL.md");
    writeFileSync(path, readFileSync(join(suite, "skills/no-english/SKILL.md")));
    chmodSync(path, 0o600);
    expect(f.run("publish").status).toBe(71);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    f.assertUnowned();
  });

  test("rejects a symlink inside an owned skill directory before publication", () => {
    const f = fixture();
    const path = join(f.native, "skills/no-english/SKILL.md");
    const outside = join(f.root, "outside");
    writeFileSync(outside, "outside bytes");
    rmSync(path);
    symlinkSync(outside, path);
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(readFileSync(outside, "utf8")).toBe("outside bytes");
    expect(existsSync(join(f.root, "published"))).toBe(false);
  });

  test("a second installer cannot recover the active install's journal", () => {
    const f = fixture();
    const result = f.run("", suite, { PROBE_LOCK: join(suite, "bin/install-skill.sh") });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(f.root, "lock-probe"), "utf8")).toContain("another native install holds the scope lock");
  });

  for (const scope of ["user", "project"]) {
    test(`${scope}: single capability failure restores its files and binding`, () => {
      const f = fixture(scope);
      const result = f.run("single", suite, {}, "no-english");
      expect(result.status, result.stderr).toBe(71);
      f.assertOld();
    });
    test(`${scope}: single capability success leaves unrelated native versions untouched`, () => {
      const f = fixture(scope);
      const before = new Map([...f.payloads.keys()].map((p) => [p, readFileSync(p)]));
      const result = f.run("", suite, {}, "no-english");
      expect(result.status, result.stderr).toBe(0);
      for (const [dest, src] of f.payloads) {
        expect(readFileSync(dest)).toEqual(dest.includes("no-english") ? readFileSync(src) : before.get(dest)!);
      }
      expect(readFileSync(f.binding, "utf8")).toBe(`${suite}\n`);
      expect(existsSync(f.retired)).toBe(true); // single installs do not run all-suite cleanup
      f.assertUnowned();
    });
  }

  test("without a flock executable the stdlib lock excludes competitors and recovers SIGKILL", () => {
    const f = fixture();
    for (const tool of ["bash", "python3", "mkdir", "mktemp", "chmod", "stat", "id", "dirname", "basename", "cmp", "rm", "touch", "git", "grep", "date", "rmdir"]) {
      symlinkSync(`/usr/bin/${tool}`, join(f.bin, tool));
    }
    // Deliberately no flock on PATH: Python fcntl must retain the scope lock in fd 8.
    let result = f.run("", suite, { PATH: f.bin, PROBE_LOCK: join(suite, "bin/install-skill.sh") });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(f.root, "lock-probe"), "utf8")).toContain("another native install holds the scope lock");
    result = f.run("kill", suite, { PATH: f.bin });
    expect(result.signal).toBe("SIGKILL");
    result = f.run("", suite, { PATH: f.bin });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("restored previous native files");
    expect(existsSync(f.journal)).toBe(false);
  });
});
