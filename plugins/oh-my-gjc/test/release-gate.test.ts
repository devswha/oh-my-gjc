import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const skill = await Bun.file(new URL("skills/release-gate/SKILL.md", root)).text();
const command = await Bun.file(new URL("templates/release.md", root)).text();
const installer = await Bun.file(new URL("bin/install-skill.sh", root)).text();

test("release-gate ships in the installer manifests", () => {
	expect(installer).toMatch(/EXPECTED_SKILLS=\([\s\S]*?release-gate/);
	expect(installer).toMatch(/EXPECTED_COMMANDS=\([\s\S]*?\brelease\)/);
});

test("release-gate carries the non-weakenable gate contract", () => {
	for (const text of [skill, command]) {
		// machine-parsable verdict, fail-closed
		expect(text).toContain("VERDICT: APPROVE");
		expect(text).toContain("VERDICT: REQUEST_CHANGES");
		expect(text).toMatch(/fail-closed|Fail-closed/);
		// the agent can never approve its own release
		expect(text).toMatch(/자기 승인 금지/);
		// bounded re-sign rounds
		expect(text).toMatch(/2라운드/);
		// evidence recording location
		expect(text).toContain("docs/verification/");
	}
	// secret scan precedes any diff egress; rollback is fix-forward only
	expect(skill).toContain("시크릿 스캔");
	expect(skill).toMatch(/fix-forward/);
	// gate 2 reuses the extragoal review lane instead of reinventing it
	expect(skill).toContain("extragoal");
	expect(skill).toContain("--no-session");
});

test("install-time sol preset merge is name-scoped, validated, and non-fatal", () => {
	// v0.17.0 (하코 지시): fresh installs must surface `sol` in the CUSTOM picker without
	// running /omg:presets — but a merge failure must never break the suite install.
	expect(installer).toContain("merge_sol_preset()");
	// user scope only, wired into the `all` lane and the multivendor-presets single lane
	expect(installer).toMatch(/\[ "\$mode" = "user" \]; then merge_sol_preset/);
	expect(installer).toMatch(/"multivendor-presets" \] && \[ "\$mode" = "user" \]; then merge_sol_preset/);
	// safety contract: backup before write, registry validation probe, rollback on failure
	expect(installer).toMatch(/bak-\$\(date \+%s\)/);
	expect(installer).toContain("__omg_probe__");
	expect(installer).toMatch(/preset merge rolled back/);
	// never deletes anything (retired cleanup stays consent-gated in /omg:presets)
	expect(installer).toMatch(/this function never deletes anything/);
});
