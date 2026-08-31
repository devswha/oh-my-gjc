import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "..");
const enginePath = join(root, "bin", "gpt_image_web.py");
const skillPath = join(root, "skills", "gpt-image", "SKILL.md");
const commandPath = join(root, "templates", "gpt-image.md");
const engine = () => readFileSync(enginePath, "utf8");

describe("gpt-image web contract", () => {
  test("ships exactly the explicit Images-web surface", () => {
    expect(existsSync(enginePath)).toBe(true);
    expect(readFileSync(skillPath, "utf8")).toMatch(/^---\nname: gpt-image\ndescription: "`\/omg:gpt-image` explicit-only/m);
    expect(readFileSync(commandPath, "utf8")).toContain("/omg:gpt-image");
    expect(readFileSync(commandPath, "utf8")).toContain("$ARGUMENTS");
  });

  test("uses the Images route and verified composer selectors, never generic chat UI", () => {
    const source = engine();
    expect(source).toContain('IMAGES_URL = "https://chatgpt.com/images/"');
    expect(source).toContain('KOREAN_PLACEHOLDER = "새 이미지를 설명하세요"');
    expect(source).toContain('PROMPT_SELECTOR = "#prompt-textarea"');
    expect(source).toContain('ASSISTANT_SELECTOR = \'[data-turn="assistant"]\'');
    expect(source).toContain("page.keyboard.insert_text(prompt)");
    expect(source).toContain('parsed.path.startswith("/c/")');
    expect(source).toContain("[data-testid=\"send-button\"]");
    expect(source).not.toMatch(/plus-menu|attachment|\/backend\/|api\.openai\.com/i);
  });

  test("is local-CDP-only and fails closed on default-profile or concurrent automation", () => {
    const source = engine();
    const reviewEngine = readFileSync(join(root, "bin", "pack_and_ask.py"), "utf8");
    const sharedLease = readFileSync(join(root, "bin", "cdp_lock.py"), "utf8");
    expect(source).toContain('http://127.0.0.1:{port}/json/version');
    expect(source).toContain("DevToolsActivePort");
    expect(source).toContain("dedicated insane-review browser profile binding proof");
    expect(source).toContain("from cdp_lock import CdpLease");
    expect(source).toContain("from pack_and_ask import cdp_binds_dedicated_profile");
    expect(reviewEngine).toContain("DevToolsActivePort");
    expect(reviewEngine).toContain("from cdp_lock import CdpLease");
    expect(sharedLease).toContain("oh-my-gjc-chatgpt-cdp-");
    expect(sharedLease).toContain("another OMG ChatGPT CDP automation is running");
    expect(sharedLease).toContain("fcntl.flock");
    expect(source).not.toMatch(/subprocess|pip install|playwright install|launch_browser|auto-login/i);
  });

  test("gets only the original through the Images fullscreen Save action", () => {
    const source = engine();
    expect(source).toContain('aria-label="이 이미지 공유"');
    expect(source).toContain('aria-label="저장"');
    expect(source).toContain("page.expect_download");
    expect(source).not.toContain("Browser.setDownloadBehavior");
    expect(source).toContain("Expected exactly one unique generated image asset");
    expect(source).not.toMatch(/screenshot\(|requests\.get|urllib\.request\.urlretrieve/i);
  });

  test("enforces PNG validation, exclusive atomic saves, secure modes, and provenance", () => {
    const source = engine();
    expect(source).toContain('b"\\x89PNG\\r\\n\\x1a\\n"');
    expect(source).toContain("MAX_SIZE = 50 * 1024 * 1024");
    expect(source).toContain("os.O_EXCL");
    expect(source).toContain("os.link(tmp, target)");
    expect(source).toContain("0o700");
    expect(source).toContain("0o600");
    expect(source).toContain('"conversation_url"');
    expect(source).toContain('"sha256"');
    expect(source).toContain('"engine_route"');
  });

  test("keeps the command explicit and binding-resolved without Claude variables", () => {
    const skill = readFileSync(skillPath, "utf8");
    const command = readFileSync(commandPath, "utf8");
    expect(skill).toContain(".gjc/runtimes/oh-my-gjc/root");
    expect(skill).not.toContain("oh-my-gajae-code");
    expect(skill).toContain('asset = Path("bin/gpt_image_web.py")');
    expect(command).toContain("--check-env");
    expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
    expect(`${skill}\n${command}`).not.toMatch(/\/plugin\b/);
  });

  test("is import and CLI-help safe offline", () => {
    const check = spawnSync("python3", ["-m", "py_compile", enginePath], { encoding: "utf8" });
    expect(check.status, check.stderr).toBe(0);
    const help = spawnSync("python3", [enginePath, "--help"], { encoding: "utf8" });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("--check-env");
  });
});
