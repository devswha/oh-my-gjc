/**
 * plain-layer contract + installer regression (static).
 * Run: bun test plugins/oh-my-gjc/test/plain-layer.test.ts
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, cpSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const pluginRoot = join(import.meta.dir, "..");
const skillPath = join(pluginRoot, "skills/plain-layer/SKILL.md");
const cmdPath = join(pluginRoot, "templates/plain.md");
const gatePath = join(pluginRoot, "skills/gate-briefing/SKILL.md");
const installSh = join(pluginRoot, "bin/install-skill.sh");

function read(p: string) {
  return readFileSync(p, "utf8");
}

describe("plain-layer static contract", () => {
  test("skill frontmatter name", () => {
    const t = read(skillPath);
    expect(t).toMatch(/^---\nname: plain-layer\n/m);
  });

  test("command template exists with off/idea args", () => {
    const t = read(cmdPath);
    expect(t).toContain("argument-hint:");
    expect(t).toContain("off");
    expect(t).toContain("/skill:deep-interview");
  });

  test("native-only boundaries present", () => {
    const t = read(skillPath);
    for (const s of [
      "/skill:deep-interview",
      "/skill:ralplan",
      "/skill:ultragoal",
      "/skill:team",
      "재구현하지 않는다",
      "gjc deep-interview --write",
    ]) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/direct `\.gjc` edit fallback/i);
    expect(t).toContain("direct `.gjc` write/edit/ast_edit는 fallback이 아니다");
    expect(t).toContain("plain-always");
    expect(t).toMatch(/plain-always.*없|없음|금지|Non-goals[\s\S]*plain-always/);
  });

  test("choice translation three fields + option identity", () => {
    const t = read(skillPath);
    expect(t).toContain("**뜻**");
    expect(t).toContain("**선택하면 정해지는 것**");
    expect(t).toContain("**이 선택만으로는 정하지 않는 것**");
    expect(t).toContain("byte-for-byte");
  });

  test("single Phase-5 ask contract", () => {
    const t = read(skillPath);
    expect(t).toContain("정확히 1회");
    expect(t).toContain("대화로 더 다듬기");
    expect(t).toContain("두 번째 wrapper 메뉴 금지");
  });

  test("gate headings match gate-briefing text tokens", () => {
    const gate = read(gatePath);
    const plain = read(skillPath);
    const headings = [
      "① 비전문가 번역",
      "② 승인의 경계",
      "③ 도메인-무지 체크리스트 (원문 근거 필수)",
      "④ 판정",
    ];
    for (const h of headings) {
      expect(gate).toContain(h);
      expect(plain).toContain(h);
    }
    expect(plain).toContain("명시 없음 — 승인 전 확인 요망");
    expect(plain).toMatch(/2개 이상.*보류|보류.*2개 이상/);
    expect(plain).toContain("승인/반려");
    expect(plain).toMatch(/대행 금지|실행 대행 금지/);
  });

  test("session-keyed write strategy documented", () => {
    const t = read(skillPath);
    expect(t).toContain("session-keyed");
    expect(t).toContain("--stage final");
    expect(t).toContain("gate-always de-dup");
  });

  test("sanctioned write snippet exports spec before use, never assigns a literal (static)", () => {
    const t = read(skillPath);
    // regression (v0.14.0 cross-review F1 r1): command-local assignment does not apply to
    // same-command-line "$VAR" argument expansion → empty spec. Must guard + export.
    expect(t).toContain("export GJC_DEEP_INTERVIEW_SPEC");
    expect(t).toContain('[ -n "${GJC_DEEP_INTERVIEW_SPEC:-}" ]');
    expect(t).not.toMatch(/GJC_DEEP_INTERVIEW_SPEC='[^']*' \\\n\s+gjc /);
    // regression (r2): snippet must not assign any literal — that would overwrite the
    // value injected through the tool environment.
    expect(t).not.toMatch(/GJC_DEEP_INTERVIEW_SPEC=[^\n ]/);
  });

  test("sanctioned write snippet passes the injected spec verbatim and fails closed when empty (behavioral, stub gjc)", () => {
    const t = read(skillPath);
    const m = t.match(/### Sanctioned write[\s\S]*?```sh\n([\s\S]*?)```/);
    expect(m).not.toBeNull();
    const snippet = m![1];
    const dir = mkdtempSync(join(tmpdir(), "omg-spec-"));
    try {
      // stub gjc: capture the value following --spec
      writeFileSync(
        join(dir, "gjc"),
        '#!/usr/bin/env bash\nwhile [ $# -gt 0 ]; do if [ "$1" = --spec ]; then printf %s "$2" > "$CAPTURE"; shift; fi; shift; done\n',
        { mode: 0o755 },
      );
      const baseEnv = {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CAPTURE: join(dir, "spec.out"),
        GJC_SESSION_ID: "test-session",
        TARGET_SLUG: "test-slug",
      };
      const SPEC = "# Polished Spec\n\nSPEC-BODY-XYZ-123 한국어 본문";
      const ok = spawnSync("bash", ["-c", snippet], {
        env: { ...baseEnv, GJC_DEEP_INTERVIEW_SPEC: SPEC },
        encoding: "utf8",
      });
      expect(ok.status).toBe(0);
      // exact round-trip: the injected env value — not a placeholder — reaches --spec
      expect(readFileSync(join(dir, "spec.out"), "utf8")).toBe(SPEC);

      rmSync(join(dir, "spec.out"), { force: true });
      const empty = spawnSync("bash", ["-c", snippet], { env: baseEnv, encoding: "utf8" });
      expect(empty.status).not.toBe(0); // guard fails closed
      expect(existsSync(join(dir, "spec.out"))).toBe(false); // gjc never invoked
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("install-skill.sh manifest includes plain-layer", () => {
  test("EXPECTED lists plain-layer and plain", () => {
    const t = read(installSh);
    expect(t).toMatch(/EXPECTED_SKILLS=\([\s\S]*plain-layer/);
    expect(t).toMatch(/EXPECTED_COMMANDS=\([\s\S]*\bplain\b/);
  });
});

describe("isolated HOME install/uninstall", () => {
  test("all install copies 8 skills / 13 omg commands including plain", () => {
    const home = mkdtempSync(join(tmpdir(), "omg-plain-"));
    const env = { ...process.env, HOME: home };
    try {
      const r = spawnSync("bash", [installSh, "all", "user"], { env, encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(existsSync(join(home, ".gjc/agent/skills/plain-layer/SKILL.md"))).toBe(true);
      expect(existsSync(join(home, ".gjc/agent/commands/omg:plain.md"))).toBe(true);
      const skills = spawnSync("bash", ["-lc", `ls -1 "${home}/.gjc/agent/skills" | wc -l`], {
        encoding: "utf8",
      });
      expect(Number(skills.stdout.trim())).toBe(8);
      const cmds = spawnSync(
        "bash",
        ["-lc", `ls -1 "${home}/.gjc/agent/commands" | grep -E '^(omg\\.md|omg:)' | wc -l`],
        { encoding: "utf8" },
      );
      expect(Number(cmds.stdout.trim())).toBe(13);

      const u = spawnSync("bash", [installSh, "all", "uninstall", "user"], { env, encoding: "utf8" });
      expect(u.status).toBe(0);
      expect(existsSync(join(home, ".gjc/agent/skills/plain-layer/SKILL.md"))).toBe(false);
      expect(existsSync(join(home, ".gjc/agent/commands/omg:plain.md"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("missing plain skill fails closed with no partial copy", () => {
    const home = mkdtempSync(join(tmpdir(), "omg-plain-miss-"));
    const pluginCopy = mkdtempSync(join(tmpdir(), "omg-plugin-"));
    try {
      cpSync(pluginRoot, pluginCopy, { recursive: true });
      rmSync(join(pluginCopy, "skills/plain-layer"), { recursive: true, force: true });
      const r = spawnSync("bash", [join(pluginCopy, "bin/install-skill.sh"), "all", "user"], {
        env: { ...process.env, HOME: home },
        encoding: "utf8",
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr + r.stdout).toMatch(/plain-layer|FAILED|missing/i);
      // fail-closed: should not leave a full successful install of other skills only
      // (installer may create dirs but must exit non-zero before accepting partial)
      expect(existsSync(join(home, ".gjc/agent/skills/plain-layer/SKILL.md"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(pluginCopy, { recursive: true, force: true });
    }
  });
});
