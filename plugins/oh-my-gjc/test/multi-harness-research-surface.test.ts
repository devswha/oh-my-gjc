import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pluginRoot = join(import.meta.dir, "..");
const skillPath = join(pluginRoot, "skills/multi-harness-research/SKILL.md");
const commandPath = join(pluginRoot, "templates/multi-harness.md");
const runnerPath = join(pluginRoot, "bin/multi-harness-research.mjs");

const lockedIntentIds = [
  "artifact:research-docs",
  "surface:explicit-command",
  "integration:four-harnesses",
  "constraint:read-only",
  "constraint:same-task",
  "constraint:single-suite",
] as const;

const lanes = ["gjc-opus", "gjc-sol", "codex-sol", "claude-ultracode"] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function shellBlocks(text: string): string {
  return [...text.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)].map((match) => match[1] ?? "").join("\n");
}

function nativeSkillNames(): string[] {
  const root = join(pluginRoot, "skills");
  return readdirSync(root).filter((name) => existsSync(join(root, name, "SKILL.md"))).sort();
}

function nativeCommandNames(): string[] {
  return readdirSync(join(pluginRoot, "templates"))
    .filter((name) => name.endsWith(".md"))
    .sort();
}

describe("multi-harness research surface", () => {
  test("is an explicit-only native skill and retains every locked intent", () => {
    const skill = read(skillPath);
    const command = read(commandPath);

    expect(skill).toMatch(/^---\nname: multi-harness-research\ndescription: .*explicit.*`\/omg:multi-harness`/ms);
    expect(command).toMatch(/^---\ndescription: /m);
    expect(command).toContain("# /omg:multi-harness");
    for (const id of lockedIntentIds) {
      expect(skill).toContain(`\`${id}\``);
    }
    expect(skill).toContain("ordinary research, review, comparison, or model-delegation requests never auto-activate");
    expect(skill).toContain("Without one, preview a one-sentence goal, the\nresearch questions, and expected output; obtain confirmation before running.");
    expect(command).toContain("An explicit argument is the canonical task");
    expect(command).toContain("obtain confirmation before any\nrunner invocation");
  });

  test("uses the exact four fixed selectors with no direct-team or fifth-model path", () => {
    const skill = read(skillPath);
    const command = read(commandPath);
    const shell = shellBlocks(command);

    expect(lanes.map((lane) => skill.indexOf(`\`${lane}\``))).toEqual([...lanes.map((lane) => skill.indexOf(`\`${lane}\``))].sort((a, b) => a - b));
    expect(skill).toContain("`--model anthropic/claude-opus-4-8 --thinking max`");
    expect(skill).toContain("`--model openai-codex/gpt-5.6-sol --thinking xhigh`");
    expect(skill).toContain("`--model gpt-5.6-sol`");
    expect(skill).toContain("`-c 'model_reasoning_effort=\"xhigh\"'`");
    expect(skill).toContain("`exec --ephemeral`");
    expect(skill).toContain("`-p --no-session-persistence --effort ultracode`");
    expect(command).toContain("not `gjc team`");
    expect(shell).not.toMatch(/^\s*gjc\s+team\b/m);
    expect(skill).toContain("never adds a\nfifth model");
    expect(skill).toContain("never adds a\nfifth model, substitutes a selector, retries through a fallback provider");
    expect(skill).toContain("winner,\nmajority, vote, consensus, ranking, recommendation, or final verdict");
  });

  test("keeps task and comparison transport out of shell source and argv", () => {
    const command = read(commandPath);
    const shell = shellBlocks(command);

    expect(command).toContain("through the Bash tool `env` field");
    expect(command.replace(/\s+/g, " ")).toContain("Do not interpolate task, comparison, receipt path, credential, or token into shell source or argv.");
    expect(shell).toContain("printf '%s' \"$OMG_MULTI_HARNESS_TASK\" > \"$PAYLOAD_FILE\"");
    expect(shell).toContain("printf '%s' \"$OMG_MULTI_HARNESS_FINALIZE_ENVELOPE\" > \"$PAYLOAD_FILE\"");
    expect(shell).toContain("unset OMG_MULTI_HARNESS_TASK");
    expect(shell).toContain("unset OMG_MULTI_HARNESS_FINALIZE_ENVELOPE");
    expect(shell).toContain("\"$RUNNER\" \"$RUNNER_MODE\" --cwd \"$TARGET_CWD\" --binding \"$BINDING\" < \"$PAYLOAD_FILE\"");
    expect(shell).not.toContain("$ARGUMENTS");
    expect(shell).not.toMatch(/\b(?:task|comparison|nonce|receipt)\s*=.*(?:--|argv)/i);
    expect(command).toContain("do not read, copy, show, or retain\nits nonce in chat, argv, logs");
  });

  test("uses only the trusted user runtime and a private mode-0600 launch snapshot", () => {
    const command = read(commandPath);
    const skill = read(skillPath);
    const shell = shellBlocks(command);

    expect(skill).toContain("`~/.gjc/agent/runtimes/multi-harness-research/`");
    expect(skill).toContain("A project-scope installation or a\nproject-local runner never authorizes execution");
    expect(shell).toContain("RUNTIME_ROOT=\"$ACCOUNT_HOME/.gjc/agent/runtimes/multi-harness-research\"");
    expect(shell).toContain("multi-harness-research-binding-v1");
    expect(shell).toContain("[ \"$(/usr/bin/stat -c %a \"$RUNTIME_ROOT\")\" = 700 ]");
    expect(shell).toContain("[ \"$(/usr/bin/stat -c %a \"$SOURCE_BINDING\")\" = 600 ]");
    expect(shell).toContain("[ \"$(/usr/bin/stat -c %a \"$SOURCE_RUNNER\")\" = 700 ]");
    expect(shell).toContain("/usr/bin/chmod 600 \"$PAYLOAD_FILE\" \"$BINDING\" \"$RUNNER\" \"$OUTPUT_FILE\" \"$STDERR_FILE\"");
    expect(shell).toContain(': > "$OUTPUT_FILE"');
    expect(shell).toContain(': > "$STDERR_FILE"');
    expect(shell).toContain("secure_runtime_file");
    expect(shell).toContain("trap cleanup EXIT HUP INT TERM");
  });
  test("allows immutable root-owned executables without allowing root-owned state", () => {
    const runner = read(runnerPath);
    for (const expression of [
      "trustedFile(nodePath, Infinity, true)",
      "trustedFile(gjcPath, Infinity, true)",
      "trustedFile(codexPath, Infinity, true)",
      "trustedFile(claudePath, Infinity, true)",
      "trustedFile(bwrapPath, Infinity, true)",
      'trustedPath(codexRuntime, "directory", 0o022, true)',
    ]) expect(runner).toContain(expression);
    expect(runner).toContain("const binding = trustedFile(input, 16 * 1024);");
    expect(runner).toContain("const leaf = trustedFile(path, 1024 * 1024);");
    expect(runner).toContain('const home = trustedPath(accountHome, "directory");');
    expect(runner).toContain("constants.O_RDONLY | constants.O_NOFOLLOW");
    expect(runner).toContain("held.dev !== leaf.stats.dev");
    expect(runner).toContain("held.ino !== leaf.stats.ino");
  });

  test("states exact worker isolation, credentials, XDG artifacts, and bounded outputs", () => {
    const skill = read(skillPath);

    expect(skill).toContain("They have no built-in Bash, write, or edit capability.");
    expect(skill).toContain("`Read,Grep,Glob,WebSearch,WebFetch`");
    expect(skill).toContain("no Bash, Write, Edit, Notebook");
    expect(skill).toContain("`shell_network=false`");
    expect(skill).toContain("provider-native web search only");
    expect(skill.replace(/\s+/g, " ")).toContain("Codex receives no OMO prompt or resolution");
    expect(skill).toContain("Current Codex OAuth 401 is **pending-environment**");
    expect(skill).not.toContain("Codex OAuth 401 passed");
    expect(skill).toContain("`${XDG_DATA_HOME:-$HOME/.local/share}/gjc/auth.json`");
    expect(skill).toContain("`${CODEX_HOME:-$HOME/.codex}/auth.json`");
    expect(skill).toContain("`$HOME/.claude/.credentials.json`");
    expect(skill).toContain("`${XDG_DATA_HOME:-$HOME/.local/share}/oh-my-gjc/multi-harness/<repo-id>/<run-id>/`");
    expect(skill).toContain("Artifact directories are mode `0700`, files are mode `0600`");
    expect(skill).toContain("no more than 1 MiB");
    expect(skill).toContain("Raw stdout and stderr each stop at 8 MiB");
    expect(skill).toContain("`preflight`, `spawn`, `timeout`, `nonzero_exit`,\n`invalid_output`, and `contract_breach`");
  });

  test("seals factual lane truth before the bounded non-authoritative finalization", () => {
    const skill = read(skillPath);
    const command = read(commandPath);

    expect(skill).toContain("After all four lanes reach terminal state, phase 1 seals the factual base summary.");
    expect(skill).toContain("`COMPLETE` with runner exit `0`");
    expect(skill).toContain("`INCOMPLETE` with\nexit `10`");
    expect(skill).toContain("exit `1`");
    expect(skill).toContain("current GJC leader read successful lane documents and author a bounded, explicitly\nnon-authoritative list of commonalities, differences, and uncertainties");
    expect(skill).toContain("The leader does not\nchange lane facts and is not a fifth synthesis model.");
    expect(skill).toContain("Finalizer exit `0` is `FINALIZED`.");
    expect(skill).toContain("exit `20` is `FINALIZATION_FAILED`");
    expect(skill).toContain("`leader_input_invalid`, `authorization_failed`, `base_changed`, or\n`publication_failed`");
    expect(command.replace(/\s+/g, " ")).toContain("Never turn exit `20` into a lane failure.");
    expect(command.replace(/\s+/g, " ")).toContain("full lane documents, task bytes, raw stdout/stderr, credentials, auth state, or finalization receipt");
  });

  test("has exactly seven skills and ten native command templates at this surface", () => {
    expect(nativeSkillNames()).toEqual([
      "adaptive-response",
      "deep-onboarding",
      "extragoal",
      "insane-review",
      "multi-harness-research",
      "no-english",
      "preset-pack",
    ]);
    expect(nativeCommandNames()).toEqual([
      "deep-onboarding.md",
      "fable.md",
      "gate-always.md",
      "gate.md",
      "insane-review.md",
      "multi-harness.md",
      "no-english.md",
      "omg.md",
      "preset-pack.md",
      "setup.md",
    ]);
  });
});
