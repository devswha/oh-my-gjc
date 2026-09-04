import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const suite = resolve(import.meta.dir, "..");
const cases = [
  ["references/council-setup.md", "IR", "bin/pack_and_ask.py", true],
  ["skills/insane-search/SKILL.md", "IS_ENGINE", "bin/insane_search.py", true],
  ["skills/gpt-image/SKILL.md", "GI", "bin/gpt_image_web.py", false],
  ["skills/insane-review/SKILL.md", "IR", "bin/pack_and_ask.py", true],
  ["templates/insane-review.md", "IR", "bin/pack_and_ask.py", true],
] as const;

for (const [file, variable, asset, legacy] of cases) {
  describe(`executable binding resolver: ${file}`, () => {
    const body = readFileSync(join(suite, file), "utf8");
    const block = body.match(/```bash\n([\s\S]*?)\n```/)![1];
    function fixture() {
      const root = mkdtempSync(join(resolve(tmpdir()), "omg-resolver-"));
      const home = join(root, "home"), cwd = join(root, "project");
      mkdirSync(home); mkdirSync(cwd);
      function makeAsset(name: string) {
        const path = join(root, name);
        mkdirSync(dirname(join(path, asset)), { recursive: true });
        writeFileSync(join(path, asset), "fixture\n");
        return path;
      }
      function bind(path: string, value: string, mode = 0o600) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, value); chmodSync(path, mode);
      }
      const projectBinding = join(cwd, ".gjc/runtimes/oh-my-gjc/root");
      const userBinding = join(home, ".gjc/agent/runtimes/oh-my-gjc/root");
      const run = () => spawnSync("bash", ["-c", `${block}\nprintf '%s\\n' "$${variable}"`], {
        cwd, encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH, HOME: home },
      });
      return { root, home, cwd, makeAsset, bind, projectBinding, userBinding, run };
    }
    test("uses the valid project root before user and reads exact paths with spaces", () => {
      const f = fixture();
      try {
        const project = f.makeAsset("project payload"), user = f.makeAsset("user payload");
        f.bind(f.projectBinding, project + "\n"); f.bind(f.userBinding, user + "\n");
        const r = f.run(); expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.trim().split("\n").at(-1)).toBe(join(project, asset));
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
    test.each(["multiline", "relative", "del", "missing-asset", "permissions", "symlink-binding", "symlink-parent", "symlink-asset"])(
      "rejects %s in project scope without falling back to a good user binding", (failure) => {
        const f = fixture();
        try {
          const project = f.makeAsset("project-payload"), user = f.makeAsset("user-payload");
          f.bind(f.userBinding, user + "\n");
          const value = failure === "multiline" ? `${project}\n${user}\n` : failure === "relative" ? "relative\n"
            : failure === "del" ? project + "\x7f\n" : failure === "missing-asset" ? f.root + "\n" : project + "\n";
          f.bind(f.projectBinding, value, failure === "permissions" ? 0o644 : 0o600);
          if (failure === "symlink-binding") { rmSync(f.projectBinding); symlinkSync(f.userBinding, f.projectBinding); }
          if (failure === "symlink-parent") {
            rmSync(dirname(f.projectBinding), { recursive: true });
            symlinkSync(dirname(f.userBinding), dirname(f.projectBinding));
          }
          if (failure === "symlink-asset") { rmSync(join(project, asset)); symlinkSync(join(user, asset), join(project, asset)); }
          const r = f.run(); expect(r.status, r.stdout + r.stderr).toBe(1);
          expect(r.stderr).toContain("Invalid OMG runtime binding");
        } finally { rmSync(f.root, { recursive: true, force: true }); }
      },
    );
    test("applies the documented legacy boundary", () => {
      const f = fixture();
      try {
        const old = f.makeAsset("legacy-payload");
        f.bind(join(f.home, ".gjc/agent/runtimes/oh-my-gajae-code/root"), old + "\n");
        const r = f.run(); expect(r.status).toBe(legacy ? 0 : 1);
        if (legacy) expect(r.stdout.trim().split("\n").at(-1)).toBe(join(old, asset));
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
    test("uses checkout assets only when no eligible binding exists", () => {
      const f = fixture();
      try {
        const checkout = join(f.cwd, "plugins/oh-my-gjc", asset);
        mkdirSync(dirname(checkout), { recursive: true }); writeFileSync(checkout, "fixture\n");
        const r = f.run(); expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.trim().split("\n").at(-1)).toBe(checkout);
      } finally { rmSync(f.root, { recursive: true, force: true }); }
    });
  });
}
