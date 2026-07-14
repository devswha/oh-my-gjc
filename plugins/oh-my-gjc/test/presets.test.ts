import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const source = await Bun.file(new URL("references/presets.yml", root)).text();
const command = await Bun.file(new URL("templates/presets.md", root)).text();
const parsed = Bun.YAML.parse(source) as {
  profiles: Record<string, {
    display_name: string;
    required_providers: string[];
    model_mapping: Record<string, string>;
  }>;
};

test("preset source defines grok, sol and codex", () => {
  expect(Object.keys(parsed.profiles)).toEqual(["grok", "sol", "codex"]);
  expect(parsed.profiles.sol).toEqual({
    display_name: "sol",
    required_providers: ["openai-codex", "anthropic"],
    model_mapping: {
      default: "openai-codex/gpt-5.6-sol:low",
      executor: "openai-codex/gpt-5.6-terra:xhigh",
      architect: "anthropic/claude-opus-4-8:high",
      planner: "openai-codex/gpt-5.6-sol:xhigh",
      critic: "anthropic/claude-opus-4-8:xhigh",
    },
  });
  expect(parsed.profiles.codex).toEqual({
    display_name: "codex",
    required_providers: ["openai-codex"],
    model_mapping: {
      default: "openai-codex/gpt-5.6-sol:medium",
      executor: "openai-codex/gpt-5.6-terra:xhigh",
      architect: "openai-codex/gpt-5.6-sol:xhigh",
      planner: "openai-codex/gpt-5.6-sol:high",
      critic: "openai-codex/gpt-5.6-sol:max",
    },
  });
});

test("benchmark-informed executor seat is terra:xhigh everywhere", () => {
  // gajae-code docs/gpt-5.6-codex-preset-benchmark.md: terra:xhigh 9/12 selected + 8/8 broad,
  // vs terra:high 6/11 — the executor role is the only one the benchmark measures.
  for (const profile of Object.values(parsed.profiles)) {
    expect(profile.model_mapping.executor).toBe("openai-codex/gpt-5.6-terra:xhigh");
  }
});

test("every preset declares exactly the providers used by its seats", () => {
  for (const profile of Object.values(parsed.profiles)) {
    const used = [...new Set(
      Object.values(profile.model_mapping).map((selector) => selector.split("/", 1)[0]),
    )].sort();
    expect([...profile.required_providers].sort()).toEqual(used);
  }
});

test("preset command exposes safe selection semantics", () => {
  expect(command).toContain("[grok|sol|codex|all]");
  expect(command).toContain("비었으면 `grok`");
  expect(command).toContain("`all`이면 셋 다 병합");
  expect(command).toContain("이름 단위 병합만");
  expect(command).toContain("부분 저장 금지");
});
