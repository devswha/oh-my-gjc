import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const harness = resolve(import.meta.dir, "../bin/skill_sandbox.py");
const expectedSkills = ["extragoal", "gpt-image", "insane-review", "insane-search", "no-english"];
const expectedCommands = ["omg", "omg:setup", "omg:no-english", "omg:insane-review", "omg:gpt-image"];
const childEnv = {
  PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
  LANG: "C.UTF-8",
  GJC_NOTIFICATIONS: "0",
  GJC_SDK_DISABLE: "1",
};
// Probe namespace support as well as binary presence. Every unavailable run emits
// a machine-readable coverage gap; mandatory integration jobs fail instead of skip.
const probeResult = spawnSync("python3", [harness, "--probe-prerequisites"], {
  encoding: "utf8", timeout: 20_000, env: childEnv,
});
const prerequisites = JSON.parse(probeResult.stdout || "null");
const harnessAvailable = probeResult.status === 0 && prerequisites?.available === true;
const requireSandbox = process.env.OMG_REQUIRE_SKILL_SANDBOX === "1";
if (!harnessAvailable) {
  console.error(`OMG_SANDBOX_COVERAGE ${JSON.stringify(prerequisites ?? {
    status: "unavailable", error: probeResult.error?.message ?? probeResult.stderr,
  })}`);
}

interface CommandReport {
  name: string;
  variant: string;
  invocation: string;
  arguments: string;
  expanded_arguments: string;
  argument_mode: string;
  body_format: string;
  expanded_prompt_sha256: string;
  expanded: boolean;
  arguments_verified: boolean;
}

describe("real OMG skill sandbox", () => {
  test("reports prerequisites without claiming deterministic or activation coverage", () => {
    expect(probeResult.error, probeResult.stderr).toBeUndefined();
    expect(prerequisites.schema_version).toBe(1);
    expect(probeResult.status).toBe(prerequisites.available ? 0 : 1);
    expect(prerequisites.status).toBe(prerequisites.available ? "available" : "unavailable");
    expect(prerequisites.coverage.public_commands.passed).toBe(0);
    expect(prerequisites.coverage.natural_language_activation.status).toBe("not-evaluated");
    expect(prerequisites.python.host.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(prerequisites.python.sandbox).toBeNull();
    expect(prerequisites.python.version_match).toBeNull();
    expect(prerequisites.python.sandbox_observations).toBe(0);
    if (requireSandbox) {
      expect(harnessAvailable, `OMG_REQUIRE_SKILL_SANDBOX=1: ${probeResult.stdout}`).toBe(true);
    }
  });

  test("rejects false expansion evidence and missing prerequisites without requiring GJC", () => {
    const result = spawnSync("python3", [
      "-m", "unittest", "discover", "-s", import.meta.dir, "-p", "skill_sandbox_test.py", "-v",
    ], { encoding: "utf8", timeout: 30_000, env: childEnv });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 30_000);

  test.skipIf(!harnessAvailable)("verifies five skill injections and all public command bodies/arguments through real GJC", () => {
    const result = spawnSync("python3", [harness, "--json"], {
      cwd: resolve(import.meta.dir, "../../.."),
      encoding: "utf8",
      timeout: 240_000,
      env: childEnv,
      // A caller's piped stdin must never become part of the model prompt.
      input: "UNTRUSTED PARENT STDIN: do not inject this into a command\n",
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.status).toBe("passed");
    expect(report.gjc.version.length).toBeGreaterThan(0);
    expect(report.gjc.binary_sha256).toMatch(/^[a-f0-9]{64}$/);
    for (const runtime of [report.python.host, report.python.sandbox]) {
      expect(runtime.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(runtime.implementation.length).toBeGreaterThan(0);
      expect(runtime.executable.startsWith("/")).toBe(true);
    }
    expect(report.python.version_match).toBe(report.python.host.version === report.python.sandbox.version);
    expect(report.python.sandbox_observations).toBe(28);
    expect(report.python.sandbox_source).toBe("actual-stub-process");
    expect(report.skills.map((skill: { name: string }) => skill.name)).toEqual(expectedSkills);
    expect(report.skills.every((skill: { request_chars: number }) => skill.request_chars > 1_000)).toBe(true);
    expect([...new Set(report.commands.map((command: CommandReport) => command.name))]).toEqual(expectedCommands);
    expect(report.commands).toHaveLength(23);
    for (const name of expectedCommands) {
      const commands: CommandReport[] = report.commands.filter((command: CommandReport) => command.name === name);
      expect(commands.map((command) => command.variant)).toEqual([
        "no-args", "arguments", "quoted-args", "literal-args",
        ...(name === "omg:no-english" ? ["on", "off", "status"] : []),
      ]);
      expect(commands[0].invocation).toBe(`/${name}`);
      expect(commands[0].expanded_arguments).toBe("");
      expect(commands[2].expanded_arguments).toBe('two words 한글  공백 "literal quotes" it\'s literal');
      expect(commands[3].expanded_arguments).toBe('"보존" café 🦞 $(touch sandbox-dollar-executed) `touch sandbox-backtick-executed` ; echo $HOME | cat > sandbox-redirection-executed');
      for (const command of commands) {
        expect(command.expanded).toBe(true);
        expect(command.arguments_verified).toBe(true);
        expect(command.argument_mode).toBe("substitution");
        expect(["verbatim", "compact-markdown-tables"]).toContain(command.body_format);
        expect(command.expanded_prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(command.expanded_arguments).not.toContain("$ARGUMENTS");
      }
    }
    expect(report.coverage.skill_injection).toEqual({ status: "passed", expected: 5, passed: 5 });
    expect(report.coverage.public_commands).toEqual({ status: "passed", expected: 23, passed: 23 });
    expect(report.coverage.natural_language_activation.status).toBe("not-evaluated");
    expect(report.coverage.command_behavior.status).toBe("not-evaluated");
    expect(report.sandbox).toEqual({
      bubblewrap: true,
      network_namespace: "isolated-loopback-only",
      host_home_masked: true,
      suite_read_only: true,
      workspace_writable: true,
      provider: "local-responses-stub",
      paid_calls: 0,
    });
    expect(report.live_canaries).toEqual([
      "insane-review CDP/ChatGPT",
      "gpt-image CDP/ChatGPT",
    ]);
    console.error(`OMG_SANDBOX_RUNTIMES ${JSON.stringify(report.python)}`);
  }, 240_000);
});
