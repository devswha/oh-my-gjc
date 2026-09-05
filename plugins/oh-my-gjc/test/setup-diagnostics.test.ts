import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const suite = resolve(import.meta.dir, "..");
const template = readFileSync(join(suite, "templates/setup.md"), "utf8");
const code = template.match(/```bash\n([\s\S]*?)\n```/)![1];
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(resolve(tmpdir()), "omg-static-setup-")); roots.push(root);
  const home = join(root, "home"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  const native = { user: join(home, ".gjc/agent"), project: join(project, ".gjc") };
  function write(path: string, text: string, mode = 0o600) {
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); chmodSync(path, mode);
  }
  function install(scope: "user" | "project") {
    for (const skill of ["no-english", "extragoal", "insane-review", "insane-search", "gpt-image"]) {
      write(join(native[scope], "skills", skill, "SKILL.md"), readFileSync(join(suite, "skills", skill, "SKILL.md"), "utf8"));
    }
    for (const command of ["omg", "setup", "no-english", "insane-review", "gpt-image"]) {
      write(join(native[scope], "commands", command === "omg" ? "omg.md" : `omg:${command}.md`), readFileSync(join(suite, "templates", `${command}.md`), "utf8"));
    }
    write(join(native[scope], "runtimes/oh-my-gjc/root"), suite + "\n");
  }
  function run() {
    const result = spawnSync("bash", ["-c", code], {
      cwd: project, encoding: "utf8", timeout: 10000,
      env: { HOME: home, PATH: process.env.PATH, INSANE_REVIEW_PROFILE: join(home, ".insane-review/browser-profile") },
    });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    return { rc: result.status, report: JSON.parse(result.stdout) };
  }
  return { root, home, project, native, write, install, run };
}

function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (item.isFile()) {
      const path = join(item.parentPath, item.name);
      result[path] = readFileSync(path).toString("base64");
    }
  }
  return result;
}

describe("/omg:setup aggregate static diagnostic", () => {
  test("reports all 11 missing user surfaces and ignores absent project installation", () => {
    const f = fixture();
    const { rc, report } = f.run();
    expect(rc).toBe(1);
    expect(report.error_count).toBe(11);
    expect(report.checks.filter((r: any) => r.scope === "project").every((r: any) => r.status === "not_installed")).toBe(true);
    expect(report.live_readiness).toBe("unverified");
  });

  test.each(["user", "project"] as const)("accepts complete %s install but never claims browser login or dependency readiness", (scope) => {
    const f = fixture(); f.install(scope);
    const profile = join(f.home, ".insane-review/browser-profile");
    mkdirSync(profile, { recursive: true, mode: 0o700 }); chmodSync(profile, 0o700);
    f.write(join(profile, "Cookies"), "credential-never-read");
    f.write(join(f.native.user, "models.yml"), "private-user-models");
    const before = snapshot(f.root);
    const { rc, report } = f.run();
    expect(rc).toBe(0);
    expect(report.static_ok).toBe(true);
    expect(report.checks.some((r: any) => r.scope === "browser" && r.status === "ok")).toBe(true);
    expect(report.checks.some((r: any) => r.scope === "browser" && r.status === "unverified")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("credential-never-read");
    expect(JSON.stringify(report)).not.toContain("private-user-models");
    expect(snapshot(f.root)).toEqual(before);
  });

  test("aggregates invalid bindings, missing files, modified copies, both marker kinds and shadowing without writes", () => {
    const f = fixture(); f.install("user"); f.install("project");
    const removed = join(f.native.user, "skills/gpt-image/SKILL.md"); rmSync(removed);
    const modified = join(f.native.user, "commands/omg.md"); f.write(modified, readFileSync(modified, "utf8") + "\nCustom text\n");
    f.write(join(f.native.project, "runtimes/oh-my-gjc/root"), "relative-path\n");
    f.write(join(f.native.user, "runtimes/oh-my-gajae-code/root"), "/preserved-missing-old-root\n");
    f.write(join(f.native.user, "SYSTEM.md"), "private text\n<!-- BEGIN oh-my-gjc:gate-always -->\nold\n<!-- END oh-my-gjc:gate-always -->\n");
    f.write(join(f.native.project, "AGENTS.md"), "<!-- BEGIN my-workflows:easy-always -->\nunterminated\n");
    const before = snapshot(f.root), { rc, report } = f.run();
    expect(rc).toBe(1);
    const checks = report.checks as any[];
    expect(checks.find(r => r.path === removed).status).toBe("missing");
    expect(checks.some(r => r.path === modified && r.status === "warning")).toBe(true);
    expect(checks.filter(r => r.scope === "markers").map(r => r.status)).toEqual(["warning", "invalid"]);
    expect(checks.some(r => r.scope === "project" && r.detail.includes("shadow"))).toBe(true);
    expect(checks.filter(r => r.status === "invalid").length).toBeGreaterThanOrEqual(3);
    expect(snapshot(f.root)).toEqual(before);
  });

  test("reports corrupt skill fields and ignores marker text quoted in ordinary prose", () => {
    const f = fixture(); f.install("user");
    const corrupt = join(f.native.user, "skills/no-english/SKILL.md");
    f.write(corrupt, "---\nname: another-skill\ndescription: broken\n---\ntext\n");
    f.write(join(f.project, "AGENTS.md"), 'Example marker: `<!-- BEGIN oh-my-gjc:gate-always -->` is preserved.\n');
    const { rc, report } = f.run();
    expect(rc).toBe(1);
    expect(report.checks.find((r: any) => r.path === corrupt).status).toBe("invalid");
    expect(report.checks.find((r: any) => r.scope === "markers").status).toBe("ok");
  });

  test.each(["symlink-file", "symlink-parent", "fifo", "mode", "multiline", "invalid-utf8"])("reports %s binding and continues checking remaining files", (kind) => {
    const f = fixture(); f.install("user");
    const path = join(f.native.user, "runtimes/oh-my-gjc/root");
    if (kind === "symlink-file") { rmSync(path); symlinkSync(join(f.home, "not-a-binding"), path); }
    if (kind === "symlink-parent") { rmSync(dirname(path), { recursive: true }); symlinkSync(f.project, dirname(path)); }
    if (kind === "fifo") {
      rmSync(path);
      expect(spawnSync("mkfifo", [path]).status).toBe(0);
    }
    if (kind === "mode") chmodSync(path, 0o644);
    if (kind === "multiline") f.write(path, `${suite}\n${suite}\n`);
    if (kind === "invalid-utf8") writeFileSync(path, Buffer.from([255, 10]));
    const { rc, report } = f.run();
    expect(rc).toBe(1);
    expect(report.checks.find((r: any) => r.path === path).status).toBe("invalid");
    expect(report.checks.filter((r: any) => r.scope === "user" && r.status === "ok")).toHaveLength(10);
  });

  test("runs no provider, runtime, process, network, or third-party imports", () => {
    const result = spawnSync("python3", ["-c", `import ast, sys\nt=ast.parse(sys.stdin.read())\nmods={n.names[0].name for n in ast.walk(t) if isinstance(n, ast.Import)} | {n.module for n in ast.walk(t) if isinstance(n, ast.ImportFrom)}\nassert mods <= {'hashlib','json','os','pathlib','re','stat','sys'}, mods\nassert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('system','popen','spawn','execv','execve') for n in ast.walk(t))`], {
      input: code.split("\n").slice(1, -1).join("\n"), encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
