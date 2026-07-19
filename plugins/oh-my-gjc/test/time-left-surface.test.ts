import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const pluginRoot = join(import.meta.dir, "..");
const installer = join(pluginRoot, "bin/install-skill.sh");
const skill = join(pluginRoot, "skills/time-left/SKILL.md");
const command = join(pluginRoot, "templates/time-left.md");
const sdkRoot = join(pluginRoot, "tools/sdk-lab");
const sandboxes: string[] = [];

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function write(path: string, content: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, mode === undefined ? undefined : { mode });
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true });
});

describe("time-left public skill", () => {
  test("uses only the fixed read-only SDK and state-read surfaces", () => {
    const content = read(skill);
    expect(content).toMatch(/^---\nname: time-left\ndescription: .*ralplan.*ultragoal/m);
    for (const query of [
      "session.metadata",
      "goal.list/get",
      "todo.list",
      "workflow.gates.list",
      "runtime.jobs.list",
    ]) {
      expect(content).toContain(`\`${query}\``);
    }
    expect(content).not.toContain("context.get");
    expect(content).toContain("아래 두 workflow를 항상");
    expect(content).toContain("gjc state ralplan read --json");
    expect(content).toContain("gjc state ultragoal read --json");
    expect(content).toContain("사용 가능한 스킬 목록이지 활성 workflow 증거가 아니다");
    expect(content).toContain("사용자 응답 후 재산정");
    expect(content).toContain("예상 약 N~M분");
    expect(content).toContain("둘 다 확률 분위수는 아니다");
    expect(content).toContain('--session-id "$SESSION_ID"');
    expect(content).toContain("flock -s -w 5 9");
    expect(content).toContain("user-scope 전용");
    expect(content).not.toContain("PROJECT_RUNTIME");
    for (const forbidden of ["user_message", "reply", "control", "config", "broker"]) {
      expect(content).toMatch(new RegExp(`\\b${forbidden}\\b.*보내지 않는다|보내지 않는다.*\\b${forbidden}\\b`, "s"));
    }
    expect(content).toContain("transcript, private memory, 다른 세션");
    expect(content).toContain("완료 **시각**을 단정하지 않는다");
  });

  test("requires the explicit slash command", () => {
    const skillContent = read(skill);
    const commandContent = read(command);
    expect(skillContent).toContain("`/omg:time-left` 명령이 명시적으로 요청했을 때만");
    expect(skillContent).toContain("다른 입력에서는 자동 활성화하지 않는다");
    expect(commandContent).toContain("# /omg:time-left");
    expect(commandContent).toContain("이 명령이 명시적으로 호출된 경우에만");
    expect(read(installer)).toContain("EXPECTED_COMMANDS=(omg setup gate gate-always no-english time-left fable insane-review lazycodex-gjc deep-onboarding session-observer preset-fit)");
    const description = skillContent.split("---", 3)[1];
    expect(description).not.toContain("언제 끝나?");
    expect(description).not.toContain("얼마나 남았어?");
    expect(description).not.toContain("ETA 보여줘");
    expect(read(join(pluginRoot, "templates/setup.md"))).toContain("/omg:time-left [ralplan\\|ultragoal]");
  });

  test("pins the official bridge client and installer runtime contract", () => {
    const packageJson = JSON.parse(read(join(sdkRoot, "package.json"))) as { dependencies: Record<string, string> };
    const installScript = read(installer);
    expect(packageJson.dependencies["@gajae-code/bridge-client"]).toBe("0.11.0");
    expect(installScript).toContain("EXPECTED_SKILLS=(adaptive-response no-english time-left extragoal insane-review lazycodex-gjc deep-onboarding session-observer preset-fit)");
    expect(installScript).toContain("REMOVED_SKILLS=(gate-briefing ");
    expect(installScript).toContain("bun install --frozen-lockfile --production --ignore-scripts");
    expect(installScript).toContain("OMG_TIME_LEFT_RUNTIME");
  });

  test("never authorizes or executes a project-local SDK runtime", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-time-left-project-"));
    sandboxes.push(sandbox);
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    const malicious = join(project, ".gjc/runtimes/oh-my-gjc/sdk-lab/src/eta.ts");
    mkdirSync(home, { recursive: true });
    mkdirSync(project, { recursive: true });
    write(malicious, "malicious-project-runtime");

    const result = spawnSync("bash", [installer, "time-left", "project"], {
      cwd: project,
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(read(malicious)).toBe("malicious-project-runtime");
    expect(result.stderr).toContain("executable SDK runtime is user-scope only");
    expect(existsSync(join(home, ".gjc/agent/runtimes/oh-my-gjc/sdk-lab"))).toBe(false);
  });

  test("installs a private exact-lock SDK runtime with a compatible Bun", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-time-left-"));
    sandboxes.push(sandbox);
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    const fakeBin = join(sandbox, "bin");
    mkdirSync(home);
    mkdirSync(project);
    mkdirSync(fakeBin);
    const retiredSkill = join(home, ".gjc/agent/skills/workflow-eta");
    mkdirSync(retiredSkill, { recursive: true });
    write(join(retiredSkill, "SKILL.md"), "retired");
    const bun = join(fakeBin, "bun");
    write(
      bun,
      `#!/bin/sh
set -eu
if [ "\${1:-}" = "--version" ]; then printf '1.3.14\\n'; exit 0; fi
if [ "\${1:-}" = "-e" ]; then exit 0; fi
if [ "\${1:-}" = "install" ]; then
  mkdir -p node_modules/@gajae-code/bridge-client
  printf '{"name":"@gajae-code/bridge-client","version":"0.11.0"}\\n' > node_modules/@gajae-code/bridge-client/package.json
  exit 0
fi
exit 64
`,
      0o755,
    );
    chmodSync(bun, 0o755);

    const result = spawnSync("bash", [installer, "time-left", "user"], {
      cwd: project,
      env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    const runtime = join(home, ".gjc/agent/runtimes/oh-my-gjc/sdk-lab");
    expect(statSync(runtime).mode & 0o777).toBe(0o700);
    expect(statSync(join(runtime, "src/eta.ts")).mode & 0o777).toBe(0o600);
    expect(existsSync(join(runtime, "node_modules/@gajae-code/bridge-client/package.json"))).toBe(true);
    expect(statSync(join(home, ".gjc/agent/runtimes/oh-my-gjc/.sdk-lab.lock")).mode & 0o777).toBe(0o600);
    expect(existsSync(join(home, ".gjc/agent/skills/time-left/SKILL.md"))).toBe(true);
    expect(existsSync(retiredSkill)).toBe(false);
  });

  test("fails targeted installation without silently replacing a prior runtime", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-time-left-fail-"));
    sandboxes.push(sandbox);
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    const fakeBin = join(sandbox, "bin");
    const runtime = join(home, ".gjc/agent/runtimes/oh-my-gjc/sdk-lab");
    mkdirSync(project, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    write(join(runtime, "sentinel"), "keep");
    write(join(fakeBin, "bun"), "#!/bin/sh\n[ \"${1:-}\" = --version ] && { echo 1.3.14; exit 0; }\nexit 9\n", 0o755);

    const result = spawnSync("bash", [installer, "time-left", "user"], {
      cwd: project,
      env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(read(join(runtime, "sentinel"))).toBe("keep");
    expect(result.stderr).toContain("SDK dependency install failed");
  });
  test("aborts an upgrade and preserves prior runtime and native surfaces when refresh fails", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "omg-time-left-upgrade-"));
    sandboxes.push(sandbox);
    const home = join(sandbox, "home");
    const project = join(sandbox, "project");
    const fakeBin = join(sandbox, "bin");
    const runtime = join(home, ".gjc/agent/runtimes/oh-my-gjc/sdk-lab");
    const priorSkill = join(home, ".gjc/agent/skills/adaptive-response/SKILL.md");
    mkdirSync(project, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    write(join(runtime, "sentinel"), "prior runtime");
    write(priorSkill, "prior native skill");
    write(join(fakeBin, "bun"), "#!/bin/sh\n[ \"${1:-}\" = --version ] && { echo 1.3.14; exit 0; }\nexit 9\n", 0o755);

    const result = spawnSync("bash", [installer, "all", "user"], {
      cwd: project,
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: join(sandbox, "absent-codex"),
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(read(join(runtime, "sentinel"))).toBe("prior runtime");
    expect(read(priorSkill)).toBe("prior native skill");
    expect(result.stderr).toContain("prior runtime and native surfaces were preserved");
  });
});
