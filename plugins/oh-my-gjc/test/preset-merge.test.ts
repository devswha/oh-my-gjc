import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Behavioral coverage for merge_sol_preset (v0.17.0 cross-review r1 finding 7):
// the REAL installer runs against an isolated HOME with a FAKE `gjc` on PATH that
// emulates the profile-registry probe by actually reading models.yml — so these
// tests exercise fresh-create / append / replace / rollback / non-fatal end to end.

const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const installer = join(pluginRoot, "bin/install-skill.sh");

/** fake gjc: probe error lists `sol` only when models.yml really parses-ish and has it */
const FAKE_GJC_OK = `#!/usr/bin/env bash
if [ -f "$HOME/.gjc/agent/models.yml" ] && grep -Eq '^  sol:' "$HOME/.gjc/agent/models.yml"; then
  echo 'Error: Unknown model profile "__omg_probe__". Available profiles: codex-pro, sol' >&2
else
  echo 'Error: Unknown model profile "__omg_probe__". Available profiles: codex-pro' >&2
fi
exit 1
`;
/** fake gjc that never registers sol — forces the rollback path */
const FAKE_GJC_NO_SOL = `#!/usr/bin/env bash
echo 'Error: Unknown model profile "__omg_probe__". Available profiles: codex-pro' >&2
exit 1
`;

function run(fakeGjc: string, seedModelsYml?: string, extraEnv: Record<string, string> = {}) {
	const home = mkdtempSync(join(tmpdir(), "omg-merge-"));
	const bin = join(home, "fakebin");
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, "gjc"), fakeGjc);
	chmodSync(join(bin, "gjc"), 0o755);
	const models = join(home, ".gjc/agent/models.yml");
	if (seedModelsYml !== undefined) {
		mkdirSync(join(home, ".gjc/agent"), { recursive: true });
		writeFileSync(models, seedModelsYml);
	}
	const result = spawnSync("bash", [installer, "multivendor-presets", "user"], {
		encoding: "utf8",
		env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, ...extraEnv },
	});
	return { home, models, result, out: result.stdout + result.stderr };
}

function parseProfiles(models: string): Record<string, { model_mapping: Record<string, string> }> {
	return (Bun.YAML.parse(readFileSync(models, "utf8")) as { profiles: Record<string, { model_mapping: Record<string, string> }> }).profiles;
}

describe("merge_sol_preset behavioral", () => {
	test("fresh HOME: creates models.yml with the canonical sol block", () => {
		const { models, result, out } = run(FAKE_GJC_OK);
		expect(result.status, out).toBe(0);
		expect(out).toContain("merged `sol`");
		const profiles = parseProfiles(models);
		expect(Object.keys(profiles)).toEqual(["sol"]);
		expect(profiles.sol.model_mapping.planner).toBe("openai-codex/gpt-5.6-sol:high");
	});

	test("append: inserts sol under profiles: even when another top-level key follows", () => {
		const seed = "profiles:\n  myown:\n    display_name: myown\n    required_providers: [anthropic]\n    model_mapping:\n      default: anthropic/claude-opus-4-8:low\nmodelBindings:\n  keep: me\n";
		const { models, result, out } = run(FAKE_GJC_OK, seed);
		expect(result.status, out).toBe(0);
		expect(out).toContain("merged `sol`");
		const doc = Bun.YAML.parse(readFileSync(models, "utf8")) as Record<string, unknown>;
		const profiles = (doc as { profiles: Record<string, { model_mapping: Record<string, string> }> }).profiles;
		expect(Object.keys(profiles).sort()).toEqual(["myown", "sol"]);
		expect(profiles.myown.model_mapping.default).toBe("anthropic/claude-opus-4-8:low");
		// the trailing top-level key must survive AND sol must NOT be nested under it
		expect((doc.modelBindings as Record<string, string>).keep).toBe("me");
	});

	test("replace: swaps an old sol block (inline comment + internal blank) without touching neighbors", () => {
		const seed = [
			"profiles:",
			"  # my precious custom",
			"  myown:",
			"    display_name: myown",
			"    required_providers: [anthropic]",
			"    model_mapping:",
			"      default: anthropic/claude-opus-4-8:low",
			"",
			"  # stale sol comment",
			"  sol: # inline comment variant",
			"    display_name: sol",
			"    required_providers: [openai-codex, anthropic]",
			"    model_mapping:",
			"      default:   openai-codex/gpt-5.6-sol:low",
			"",
			"      planner:   openai-codex/gpt-5.6-sol:xhigh",
			"",
			"  after:",
			"    display_name: after",
			"    required_providers: [anthropic]",
			"    model_mapping:",
			"      default: anthropic/claude-opus-4-8:low",
			"",
		].join("\n");
		const { models, result, out } = run(FAKE_GJC_OK, seed);
		expect(result.status, out).toBe(0);
		expect(out).toContain("merged `sol`");
		const raw = readFileSync(models, "utf8");
		const profiles = parseProfiles(models);
		expect(Object.keys(profiles).sort()).toEqual(["after", "myown", "sol"]);
		expect(profiles.sol.model_mapping.planner).toBe("openai-codex/gpt-5.6-sol:high"); // replaced, not duplicated
		expect(raw.match(/^  sol:/gm)?.length).toBe(1);
		expect(raw).toContain("my precious custom"); // neighbor comment kept
		expect(raw).not.toContain("stale sol comment"); // old sol comment replaced
		expect(raw).not.toContain("sol:xhigh"); // no leftover old field
	});

	test("rollback: restores the pre-merge file byte-for-byte when the registry never lists sol", () => {
		const seed = "profiles:\n  sol:\n    display_name: sol\n    required_providers: [openai-codex, anthropic]\n    model_mapping:\n      default: openai-codex/gpt-5.6-sol:low\n";
		const { models, result, out } = run(FAKE_GJC_NO_SOL, seed);
		expect(result.status, out).toBe(0); // NON-FATAL: install still succeeds
		expect(out).toContain("preset merge rolled back");
		expect(readFileSync(models, "utf8")).toBe(seed);
	});

	test("rollback on fresh HOME removes the created file instead of leaving a rejected one", () => {
		const { models, result, out } = run(FAKE_GJC_NO_SOL);
		expect(result.status, out).toBe(0);
		expect(out).toContain("preset merge rolled back");
		expect(existsSync(models)).toBe(false);
	});
});

const FAKE_GJC_HANG = "#!/usr/bin/env bash\nsleep 30\n";

describe("merge_sol_preset failure injection (r2)", () => {
	test("hanging probe is time-bounded: merge resolves and install stays rc=0", () => {
		const seed = "profiles:\n  sol:\n    display_name: sol\n    required_providers: [openai-codex, anthropic]\n    model_mapping:\n      default: openai-codex/gpt-5.6-sol:low\n";
		const started = Date.now();
		const { models, result, out } = run(FAKE_GJC_HANG, seed, { OMG_PROBE_TIMEOUT: "2" });
		expect(result.status, out).toBe(0); // NON-FATAL even when the probe hangs
		expect(Date.now() - started).toBeLessThan(25_000); // bounded well under the 30s hang
		expect(out).toContain("preset merge rolled back");
		expect(readFileSync(models, "utf8")).toBe(seed); // rollback restored the original
	});

	test("internal 2-space comment stays inside the old block; the NEXT section's comment survives", () => {
		const seed = [
			"profiles:",
			"  sol:",
			"    display_name: sol",
			"    required_providers: [openai-codex, anthropic]",
			"    model_mapping:",
			"      default:   openai-codex/gpt-5.6-sol:low",
			"  # internal stale note",
			"      planner:   openai-codex/gpt-5.6-sol:xhigh",
			"",
			"  # belongs to after",
			"  after:",
			"    display_name: after",
			"    required_providers: [anthropic]",
			"    model_mapping:",
			"      default: anthropic/claude-opus-4-8:low",
			"",
		].join("\n");
		const { models, result, out } = run(FAKE_GJC_OK, seed);
		expect(result.status, out).toBe(0);
		expect(out).toContain("merged `sol`");
		const raw = readFileSync(models, "utf8");
		const profiles = parseProfiles(models);
		expect(Object.keys(profiles).sort()).toEqual(["after", "sol"]);
		expect(raw.match(/^  sol:/gm)?.length).toBe(1);
		expect(raw).not.toContain("internal stale note"); // old-block internal comment dropped
		expect(raw).not.toContain("sol:xhigh"); // stale field behind the internal comment dropped too
		expect(raw).toContain("belongs to after"); // next section's comment preserved
	});

	test("unwritable agent dir: merge skips with a warning, install stays rc=0", () => {
		const seed = "profiles:\n  keepme:\n    display_name: keepme\n    required_providers: [anthropic]\n    model_mapping:\n      default: anthropic/claude-opus-4-8:low\n";
		const { home, models, result, out } = run(FAKE_GJC_OK, seed);
		// second run against a read-only dir (mktemp/backup must fail cleanly)
		chmodSync(join(home, ".gjc/agent"), 0o555);
		try {
			const second = spawnSync("bash", [installer, "multivendor-presets", "user"], {
				encoding: "utf8",
				env: { ...process.env, HOME: home, PATH: `${join(home, "fakebin")}:${process.env.PATH}` },
			});
			expect(second.status, second.stdout + second.stderr).toBe(0);
			expect(second.stdout + second.stderr).toMatch(/preset merge skipped/);
		} finally {
			chmodSync(join(home, ".gjc/agent"), 0o755);
		}
		expect(result.status, out).toBe(0);
		expect(readFileSync(models, "utf8")).toContain("keepme");
	});

	test("a sol: key under a DIFFERENT top-level section is never touched (r3 finding 1)", () => {
		const seed = [
			"profiles:",
			"  sol:",
			"    display_name: sol",
			"    required_providers: [openai-codex, anthropic]",
			"    model_mapping:",
			"      default: openai-codex/gpt-5.6-sol:low",
			"      planner: openai-codex/gpt-5.6-sol:xhigh",
			"modelBindings:",
			"  sol:",
			"    keep: exactly-this",
			"",
		].join("\n");
		const { models, result, out } = run(FAKE_GJC_OK, seed);
		expect(result.status, out).toBe(0);
		expect(out).toContain("merged `sol`");
		const doc = Bun.YAML.parse(readFileSync(models, "utf8")) as {
			profiles: Record<string, { model_mapping: Record<string, string> }>;
			modelBindings: Record<string, Record<string, string>>;
		};
		expect(doc.profiles.sol.model_mapping.planner).toBe("openai-codex/gpt-5.6-sol:high"); // profiles.sol replaced
		expect(doc.modelBindings.sol.keep).toBe("exactly-this"); // foreign-section sol untouched
	});
});
