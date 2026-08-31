import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const pluginRoot = join(import.meta.dir, "..");
const skillRoot = join(pluginRoot, "skills", "insane-search");
const skillPath = join(skillRoot, "SKILL.md");
const launcherPath = join(pluginRoot, "bin", "insane_search.py");
const engineRoot = join(skillRoot, "engine");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function runPython(code: string) {
  return spawnSync("python3", ["-c", code], {
    cwd: pluginRoot,
    encoding: "utf8",
  });
}

function pythonImportPath(): string {
  return JSON.stringify(skillRoot);
}

describe("insane-search port contract", () => {
  test("has a blocked-public-web trigger and never activates for ordinary search", () => {
    const skill = read(skillPath);
    expect(skill).toMatch(
      /^---\nname: insane-search\ndescription: >\n[\s\S]*ordinary read\/web access is blocked/m,
    );
    expect(skill).toContain("Do not activate for ordinary searches that");
    expect(skill).toContain("GJC web search or read already handles");
    expect(skill).toContain("private/authenticated content");
    expect(skill).toContain("paywalls, or CAPTCHA bypass");
  });

  test("uses the suite-root binding without Claude setup, star prompts, or a command", () => {
    const skill = read(skillPath);
    const templates = readdirSync(join(pluginRoot, "templates")).sort();

    expect(skill).not.toContain("${CLAUDE_PLUGIN_ROOT}");
    expect(skill).toContain(".gjc/runtimes/oh-my-gjc/root");
    expect(skill).not.toContain("AskUserQuestion");
    expect(skill).not.toMatch(/\b(?:star this|github star|별점|스타)\b/i);
    expect(templates).toEqual(["gpt-image.md", "insane-review.md", "no-english.md", "omg.md", "setup.md"]);
    expect(existsSync(join(pluginRoot, "templates", "insane-search.md"))).toBe(false);
  });

  test("keeps the hardened launcher non-persistent, public-only, dependency-free, and browser-free by default", () => {
    const launcher = read(launcherPath);
    const executor = read(join(engineRoot, "executor.py"));

    expect(existsSync(launcherPath)).toBe(true);
    expect(launcher).toContain('os.environ["INSANE_LEARN"] = "0"');
    expect(launcher).toContain('os.environ.pop("INSANE_OBSERVATIONS_DIR", None)');
    expect(launcher).toContain('os.environ.pop("INSANE_ALLOW_PRIVATE", None)');
    expect(launcher).toContain('os.environ.pop("INSANE_AUTO_INSTALL", None)');
    expect(launcher).toContain('args.append("--no-playwright")');
    expect(launcher).toContain("safe_engine_args");
    expect(launcher).toContain('parsed.scheme not in {"http", "https"}');
    expect(launcher).toContain('"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"');
    expect(executor).toMatch(/def _auto_install\(pkg: str\) -> bool:[\s\S]*?return False/);
    expect(`${launcher}\n${executor}`).not.toMatch(
      /(?:\bpip(?:3)?\s+install\b|["']pip(?:3)?["']\s*,\s*["']install["'])/i,
    );
  });

  test("rejects non-public targets and unsafe engine controls before networking", () => {
    for (const args of [
      ["file:///etc/passwd"],
      ["--max-attempts", "1", "https://example.com/"],
      ["https://user:secret@example.com/"],
    ]) {
      const result = spawnSync("python3", [launcherPath, ...args], {
        cwd: pluginRoot,
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("insane-search:");
    }
  });

  test("preserves upstream MIT provenance at the audited commit", () => {
    const provenance = read(join(skillRoot, "references", "upstream.md"));
    const licensePath = join(skillRoot, "references", "upstream-LICENSE");

    expect(provenance).toContain("fivetaku/insane-search");
    expect(provenance).toContain("0.14.0");
    expect(provenance).toContain("019ee16bbf471595f9b67b164e4a92208183af2d");
    expect(existsSync(licensePath)).toBe(true);
    expect(read(licensePath)).toMatch(/\bMIT License\b/);
  });

  test("Phase 0 recognises only exact supported host boundaries", () => {
    const result = runPython(`
import sys
sys.path.insert(0, ${pythonImportPath()})
from engine.phase0 import _detect

assert _detect("https://www.reddit.com/r/test") == "reddit"
assert _detect("https://reddit.com.evil.test/r/test") is None
assert _detect("https://evil-reddit.com/r/test") is None
assert _detect("https://x.com.evil.test/user") is None
assert _detect("https://youtube.com.evil.test/watch?v=x") is None
`);
    expect(result.status, result.stderr).toBe(0);
  });

  test("fails closed for unsafe DNS results and pins public transport with CurlOpt.RESOLVE", () => {
    const result = runPython(`
import socket
import sys
sys.path.insert(0, ${pythonImportPath()})
from engine import safety

def fake_getaddrinfo(host, port, proto=0):
    if host == "mixed.test":
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]
    if host == "public.test":
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", port))]
    raise socket.gaierror("offline test resolver")

safety.socket.getaddrinfo = fake_getaddrinfo
assert safety.resolve_public("https://mixed.test/")[0] == []
assert safety.resolve_public("https://missing.test/")[0] == []
assert safety.curl_resolve_entries("https://public.test/") == (["public.test:443:93.184.216.34"], "public")
`);
    expect(result.status, result.stderr).toBe(0);
    expect(read(join(engineRoot, "transport.py"))).toContain("CurlOpt.RESOLVE");
  });

  test("prints agent-facing content through the untrusted-text boundary", () => {
    const main = read(join(engineRoot, "__main__.py"));
    expect(main).toContain("print(result.to_untrusted_text(), end=\"\")");
  });

  test("coverage battery rejects unknown selections before any live route runs", () => {
    const battery = join(skillRoot, "tests", "coverage_battery.py");
    const result = spawnSync("python3", [battery, "unknown-platform"], {
      cwd: pluginRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown platform(s): unknown-platform");
  });
});
