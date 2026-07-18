import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pluginRoot = join(import.meta.dir, "..");
const skillPath = join(pluginRoot, "skills/orchestrator/SKILL.md");
const commandPath = join(pluginRoot, "templates/orchestrator.md");
const installerPath = join(pluginRoot, "bin/install-skill.sh");
const policyInstallerPath = join(pluginRoot, "bin/install-orchestrator.sh");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("orchestrator skill contract", () => {
  test("activates only through the explicit session command", () => {
    const skill = read(skillPath);
    expect(skill).toMatch(/^---\nname: orchestrator\ndescription: .*오케스트레이터 모드/m);
    expect(skill).toContain("`/omg:orchestrator` 명령이 명시적으로 요청했을 때만");
    expect(skill).toContain("자동 활성화하지 않는다");
    const command = read(commandPath);
    expect(command).toContain("# /omg:orchestrator");
    expect(command).toContain("[on|install [dir]|user|status]");
    expect(command).toContain("새 세션에 상태를 넘기지 않는다");
    const description = skill.split("---", 3)[1];
    expect(description).not.toContain("위임해줘");
    expect(description).not.toContain("토큰 아껴줘");
  });

  test("keeps the threshold policy and the verification non-negotiable", () => {
    const skill = read(skillPath);
    for (const anchor of [
      "2개 이상 파일",
      "~50줄 초과",
      "병렬 가능한 슬라이스",
      "`executor`에 위임",
      "`planner`(순서 설계), `architect`(아키텍처·코드 리뷰)",
      "`critic`(계획 비평)",
      "모든 최종 검증",
      "정확한 파일 경로",
      "완료 조건",
      "범위 밖 목록",
      "산문 중복 금지",
    ]) {
      expect(skill).toContain(anchor);
    }
    expect(skill).toContain("정확성·검증 의무·승인 경계를 낮추지 않는다");
  });

  test("documents the verified GJC mechanics and sub-agent exemption", () => {
    const skill = read(skillPath);
    expect(skill).toContain("기본 시스템 프롬프트는 rules의 `alwaysApply`를 렌더링하지 않으므로");
    expect(skill).toContain("`AGENTS.md`(context file)");
    expect(skill).toContain("TTSR 트립와이어");
    expect(skill).toContain("`rule://orchestration`");
    expect(skill).toContain("git 저장소 루트에서 멈추므로");
    expect(skill).toContain("rules와 AGENTS.md를 상속하지");
  });

  test("write boundaries: only install/user write, with marker and backup", () => {
    const skill = read(skillPath);
    expect(skill).toContain("`on`/`status`는 읽기 전용");
    expect(skill).toContain("타임스탬프 백업");
    expect(skill).toContain("`models.yml`");
    const command = read(commandPath);
    expect(command).toContain(".gjc/runtimes/oh-my-gjc/root");
    expect(command).toContain("install-orchestrator.sh");
    expect(command).toContain("백업 후");
    const policyInstaller = read(policyInstallerPath);
    expect(policyInstaller).toContain("MARKER='## Orchestration policy'");
    expect(policyInstaller).toContain("omg-orchestrator.bak");
    expect(policyInstaller).toContain("alwaysApply: true");
    expect(policyInstaller).toContain('condition: ".*"');
    expect(policyInstaller).toContain('"tool:edit"');
    expect(policyInstaller).toContain('"tool:write"');
  });

  test("project install is idempotent and preserves existing AGENTS.md bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "omg-orchestrator-"));
    try {
      const existing = "# Agent instructions\n\nExisting project notes.\n";
      writeFileSync(join(dir, "AGENTS.md"), existing);
      const run = () =>
        Bun.spawnSync(["bash", policyInstallerPath, "--project", dir], { stdout: "pipe", stderr: "pipe" });
      const first = run();
      expect(first.exitCode).toBe(0);
      const firstOut = first.stdout.toString();
      expect(firstOut).toContain("appended:");
      expect(firstOut).toContain("backup:");
      const merged = read(join(dir, "AGENTS.md"));
      expect(merged.startsWith(existing)).toBe(true);
      expect(merged).toContain("## Orchestration policy (top-level agent only)");
      expect(existsSync(join(dir, ".agents/rules/orchestration.md"))).toBe(true);
      expect(existsSync(join(dir, ".agents/rules/orchestration-tripwire.md"))).toBe(true);
      const second = run();
      expect(second.exitCode).toBe(0);
      expect(second.stdout.toString()).toContain("skipped:");
      expect(read(join(dir, "AGENTS.md"))).toBe(merged);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("is part of the exact native manifest", () => {
    const installer = read(installerPath);
    expect(installer).toContain(
      "EXPECTED_SKILLS=(adaptive-response no-english time-left extragoal insane-review lazycodex-gjc deep-onboarding session-observer orchestrator)",
    );
    expect(installer).toContain(
      "EXPECTED_COMMANDS=(omg setup gate gate-always no-english time-left fable insane-review lazycodex-gjc deep-onboarding session-observer orchestrator)",
    );
  });
});
