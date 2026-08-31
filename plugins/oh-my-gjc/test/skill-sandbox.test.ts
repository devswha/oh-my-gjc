import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const harness = resolve(import.meta.dir, "../bin/skill_sandbox.py");
const expectedSkills = ["extragoal", "gpt-image", "insane-review", "insane-search", "no-english"];
// The harness drives the real local `gjc` binary inside a bubblewrap sandbox
// (see bin/skill_sandbox.py: require_binary("bwrap") / require_binary("gjc")).
// Environments without a local GJC install — e.g. CI runners — cannot run it;
// skip explicitly instead of failing on missing prerequisites.
const harnessAvailable = ["gjc", "bwrap"].every((binary) => spawnSync("which", [binary]).status === 0);

describe("real OMG skill sandbox", () => {
  test.skipIf(!harnessAvailable)("loads every shipped skill through isolated GJC and a local model stub", () => {
    const result = spawnSync("python3", [harness, "--json"], {
      cwd: resolve(import.meta.dir, "../../.."),
      encoding: "utf8",
      timeout: 120_000,
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        GJC_NOTIFICATIONS: "0",
        GJC_SDK_DISABLE: "1",
      },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(true);
    expect(report.skills.map((skill: { name: string }) => skill.name)).toEqual(expectedSkills);
    expect(report.skills.every((skill: { request_chars: number }) => skill.request_chars > 1_000)).toBe(true);
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
  }, 120_000);
});
