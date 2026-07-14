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

test("canonical source defines exactly the single custom preset sol (v0.10)", () => {
	expect(Object.keys(parsed.profiles)).toEqual(["sol"]);
	expect(parsed.profiles.sol).toEqual({
		display_name: "sol",
		required_providers: ["openai-codex", "anthropic"],
		model_mapping: {
			default: "openai-codex/gpt-5.6-sol:low",
			executor: "openai-codex/gpt-5.6-terra:xhigh",
			architect: "anthropic/claude-opus-4-8:medium",
			planner: "openai-codex/gpt-5.6-sol:high",
			critic: "anthropic/claude-opus-4-8:high",
		},
	});
});

test("benchmark-informed executor seat is terra:xhigh", () => {
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

test("preset command exposes safe selection semantics and builtin lanes", () => {
	expect(command).toContain("[sol|all]");
	expect(command).toContain("이름 단위 병합만");
	expect(command).toContain("부분 저장 금지");
	// quality/emergency/safety lanes are gjc BUILT-INS — never re-shipped as custom copies
	// (local copies rot: the stale `daily` incident, 2026-07-14). All FOUR builtin names
	// must appear on every user surface (v0.16.0 cross-review r1: codex-medium was dropped
	// from half the surfaces).
	for (const builtin of ["opus-codex", "codex-medium", "codex-pro", "fable-opus-codex"]) {
		expect(command).toContain(builtin);
	}
});

const RETIRED = [
	"ultimate", "ultimate-f5", "daily", "fast", "ideal",
	"escalate-surgical", "monorepo", "reviewer", "fable-sol", "grok-main",
	"grok", "codex", "fable-codex",
];

test("legacy cleanup is consent-gated, an exact closed retired list, never an active preset", () => {
	// v0.14.0 cross-review F2 (r1+r2): the sole merge-contract exception is consent-gated
	// removal of the EXACT retired list — open-ended wording ("등"/"비활성 옛 프리셋") is banned.
	const seg = command.match(/구버전 정리:[\s\S]*?않는다\)\./)?.[0];
	expect(seg).toBeDefined();
	expect(seg!).toMatch(/동의/);
	expect(seg!).toMatch(/닫힌 목록/);
	expect(seg!).toContain("이 목록에 없는 프로파일은 이름이 무엇이든 절대 제거 대상이 아니다");
	expect(seg!).not.toMatch(/ 등[)이]/);
	const named = [...seg!.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]);
	expect([...new Set(named)].sort()).toEqual([...RETIRED].sort());
	for (const active of Object.keys(parsed.profiles)) {
		expect(RETIRED).not.toContain(active);
		expect(named).not.toContain(active);
	}
});

test("retired names never collide with recommended builtin lane names", () => {
	// `codex` (retired custom) vs `codex-pro`/`codex-medium` (builtins) must stay distinct:
	// cleanup must never be able to target a builtin-recommended name.
	for (const builtin of ["opus-codex", "codex-pro", "codex-medium", "fable-opus-codex"]) {
		expect(RETIRED).not.toContain(builtin);
	}
});

test("skill and setup cleanup wording carry the same closed retired list", async () => {
	const skill = await Bun.file(new URL("skills/multivendor-presets/SKILL.md", root)).text();
	const setup = await Bun.file(new URL("templates/setup.md", root)).text();
	for (const text of [skill, setup]) {
		expect(text).toMatch(/닫힌 목록/);
		for (const name of RETIRED) expect(text).toContain("`" + name + "`");
		expect(text).not.toMatch(/비활성 옛 프리셋/);
	}
});

test("retired cleanup guards the persisted startup default (v0.16.0 cross-review r2)", async () => {
	// Removing a retired block that is still config.yml `modelProfile.default` (e.g. the
	// previously recommended `grok --default`) would break the next gjc startup with
	// "Unknown model profile". Every cleanup surface must require default migration first.
	const skill = await Bun.file(new URL("skills/multivendor-presets/SKILL.md", root)).text();
	const setup = await Bun.file(new URL("templates/setup.md", root)).text();
	for (const text of [command, skill, setup]) {
		expect(text).toContain("modelProfile.default");
		expect(text).toMatch(/이전[^\n]*(뒤에만|후에만)[^\n]*삭제/);
		expect(text).toMatch(/이전 없이[^\n]*삭제[^\n]*금지/);
	}
	// the command spells out the concrete migration mapping to builtins
	expect(command).toContain("`grok`→`opus-codex`");
	expect(command).toContain("`fable-codex`→`fable-opus-codex`");
});
