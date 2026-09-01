import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const pluginRoot = resolve(import.meta.dir, "..");
const engine = join(pluginRoot, "bin/pack_and_ask.py");
const extragoal = join(pluginRoot, "skills/extragoal/SKILL.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function runAdvancedMenuFixture(
  modelLabel: string,
  reasoningLabel: string,
  selectedModel = "GPT-5.6 Sol",
  requiredModel = "GPT-5.6 Sol",
): string {
  const script = `
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda _: None

class Row:
    def __init__(self, label, text=None, expanded=None, checked=False):
        self.label = label
        self.text = text if text is not None else label
        self.expanded = expanded
        self.checked = checked
        self.clicked = False
    def get_attribute(self, name):
        if name == "aria-label": return self.label
        if name == "aria-expanded": return self.expanded
        if name == "aria-checked": return "true" if self.checked else "false"
        return None
    def inner_text(self): return self.text
    def click(self, **kwargs):
        self.clicked = True
        self.checked = True

class Locator:
    def __init__(self, items): self.items = items
    def count(self): return len(self.items)
    @property
    def first(self): return self.items[0]

class Keyboard:
    def press(self, key): pass

class Page:
    def __init__(self):
        self.advanced = Row("Advanced", "Advanced", "true")
        self.model = Row(${JSON.stringify(modelLabel)}, ${JSON.stringify(`${modelLabel}\n${selectedModel}`)})
        self.reasoning = Row(${JSON.stringify(reasoningLabel)}, ${JSON.stringify(`${reasoningLabel}\nPro`)})
        self.radios = [Row(${JSON.stringify(requiredModel)}), Row("Pro")]
        self.keyboard = Keyboard()
    def query_selector_all(self, selector):
        if selector == '[role="menuitem"]': return [self.advanced, self.model, self.reasoning]
        if selector == '[role="menuitemradio"], [role="option"]': return self.radios
        return []
    def query_selector(self, selector):
        return object() if selector == '[role="menu"]' else None
    def get_by_role(self, role, name=None, exact=None):
        items = self.radios
        if name is not None:
            if exact:
                items = [r for r in items if (r.inner_text() or "").strip() == name]
            else:
                items = [r for r in items if name in (r.inner_text() or "")]
        return Locator(items)
result = module._select_advanced_model_and_effort(Page(), "Pro", ${JSON.stringify(requiredModel)})
print(repr(result))
`;
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

describe("pack_and_ask security and advanced-menu contracts", () => {
  test("streams live response output for session relay", () => {
    const source = read(engine);
    const skill = read(join(pluginRoot, "skills/insane-review/SKILL.md"));
    const command = read(join(pluginRoot, "templates/insane-review.md"));
    expect(source).toContain('ap.add_argument("--stream"');
    expect(source).toContain("reconfigure(line_buffering=True)");
    expect(source).toContain("── 실시간 응답(생성 중) ──");
    expect(source).toContain("base_copy=base_copy, stream=args.stream");
    expect(source).toContain("not (stream and stream_header)");
    expect(skill).toContain("### 3.2) 장기 실행 중계");
    expect(skill).toContain("--stream");
    expect(command).toContain("--stream");
    expect(command).toContain("live.log");
  });

  test("uses the verified isolated GJC reviewer selector", () => {
    const contract = read(extragoal);
    expect(contract).toContain("env -u GJC_SESSION_ID GJC_NOTIFICATIONS=0 GJC_SDK_DISABLE=1 gjc -p --no-session --model openai-codex/gpt-5.6-sol:max --tools read,search,find");
    expect(contract).toContain("- `openai-codex/gpt-5.6-sol:max` (네이티브, 기본 ON)");
    expect(contract).not.toContain("withfox/gpt-5.6-sol:max");
  });

  test("does not override native credential storage or close browsers", () => {
    const source = read(engine);
    for (const forbidden of ["--password-store=basic", "--use-mock-keychain", "Browser.close", "atexit", "close_started_browser", "_kill_profile_browsers", "pkill"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("keeps the browser profile private and CDP localhost-bound", () => {
    const source = read(engine);
    expect(source).toContain('"--remote-debugging-address=127.0.0.1"');
    expect(source).toContain('os.chmod(current, 0o700)');
    expect(source).toContain('if os.name != "nt":');
    expect(source).toContain('popen_kwargs["start_new_session"] = True');
  });

  test("fails before browser launch when private profile setup fails", () => {
    const script = `
import importlib.util
import pathlib
import tempfile
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.BROWSER_PROFILE_DIR = pathlib.Path(tempfile.mkdtemp()) / "profile"
module.BROWSER_PROFILE_INPUT = module.BROWSER_PROFILE_DIR
module.os.chmod = lambda *_: (_ for _ in ()).throw(PermissionError("denied"))
called = []
module.subprocess.Popen = lambda *_args, **_kwargs: called.append(True)
print(module.launch_browser_exe("/browser"), bool(called))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n").at(-1)).toBe("False False");
  });

  test("accepts CDP only when the private-profile receipt or listener argv binds", () => {
    const script = `
import importlib.util
import io
import json
import os
import pathlib
import shutil
import tempfile
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
base = pathlib.Path(tempfile.mkdtemp(dir=pathlib.Path.home()))
module.BROWSER_PROFILE_DIR = base / "profile"
module.BROWSER_PROFILE_INPUT = module.BROWSER_PROFILE_DIR
module.BROWSER_PROFILE_DIR.mkdir(mode=0o700)
fake = {"Browser": "Chrome/145.0.0.0", "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/browser/owned"}
module.urllib.request.urlopen = lambda *_args, **_kwargs: io.BytesIO(json.dumps(fake).encode())
me = str(module.BROWSER_PROFILE_DIR)
try:
    receipt = module.BROWSER_PROFILE_DIR / "DevToolsActivePort"
    receipt.write_text("9222\\n/devtools/browser/owned\\n")
    os.chmod(receipt, 0o644)
    print("legacy receipt binds:", module._cdp_matches_dedicated_profile())
    receipt.unlink()
    module._cdp_listener_cmdlines = lambda port=9222: []
    print("no evidence fails closed:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=" + me], "chrome")]
    print("listener argv binds:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=" + me], "firefox")]
    print("non-chromium exe rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=/tmp/somewhere-else"], "chrome")]
    print("wrong profile rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9333", "--user-data-dir=" + me], "chrome")]
    print("wrong port rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port", "9222", "--user-data-dir", me], "google-chrome")]
    print("space form rejected (Chromium takes = only):", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--", "--user-data-dir=" + me], "chrome")]
    print("post-dashinator rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--user-data-dir=/tmp/first", "--remote-debugging-port=9222", "--user-data-dir=" + me], "chrome")]
    print("last flag value wins:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=" + me, "--user-data-dir=/tmp/last"], "chrome")]
    print("trailing conflicting flag rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=relative/path"], "chrome")]
    print("relative path rejected:", module._cdp_matches_dedicated_profile())
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=" + me, "--user-data-dir"], "chrome")]
    print("trailing valueless flag rejected:", module._cdp_matches_dedicated_profile())
    os.chmod(module.BROWSER_PROFILE_DIR, 0o755)
    module._cdp_listener_cmdlines = lambda port=9222: [(["chrome", "--remote-debugging-port=9222", "--user-data-dir=" + me], "chrome")]
    print("loose profile dir rejected:", module._cdp_matches_dedicated_profile())
finally:
    shutil.rmtree(base, ignore_errors=True)
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split("\n");
    expect(lines).toEqual([
      "legacy receipt binds: True",
      "no evidence fails closed: False",
      "listener argv binds: True",
      "non-chromium exe rejected: False",
      "wrong profile rejected: False",
      "wrong port rejected: False",
      "space form rejected (Chromium takes = only): False",
      "post-dashinator rejected: False",
      "last flag value wins: True",
      "trailing conflicting flag rejected: False",
      "relative path rejected: False",
      "trailing valueless flag rejected: False",
      "loose profile dir rejected: False",
    ]);
  });

  test("rejects fixed refusal pages and long prompt echoes", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prompt = "evidence " * 30
print(module.rejection_reason("Trusted Access", prompt))
print(module.rejection_reason(prompt + " copied", prompt))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("모델 거부 응답 감지: Trusted Access");
    expect(result.stdout).toContain("프롬프트 앞부분이 응답에 그대로 반복됨");
  });

  test("allows legitimate short quoted responses below the echo threshold", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prompt = "short quoted question " * 5
print(repr(module.rejection_reason("The question says: " + prompt, prompt)))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("None");
  });

  test("allows substantive answers that quote a marker or a long prompt", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
prompt = "evidence " * 30
print(repr(module.rejection_reason("Analysis: the page contained Trusted Access, but the code defect is at src/a.py:4.", prompt)))
print(repr(module.rejection_reason(prompt + " " + ("substantive analysis " * 20), prompt)))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["None", "None"]);
  });

  test("writes new response artifacts as 0600 without replacing existing files", () => {
    const script = `
import importlib.util
import pathlib
import stat
import tempfile
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
path = pathlib.Path(tempfile.mkdtemp()) / "response.md"
module.write_response_artifact(path, "first")
print(oct(stat.S_IMODE(path.stat().st_mode)), path.read_text())
try:
    module.write_response_artifact(path, "second")
except FileExistsError:
    pass
print(path.read_text())
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["0o600 first", "first"]);
  });

  test("closes and removes its response artifact when private setup fails", () => {
    const script = `
import importlib.util
import pathlib
import tempfile
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
path = pathlib.Path(tempfile.mkdtemp()) / "response.md"
module.os.fchmod = lambda *_: (_ for _ in ()).throw(OSError("denied"))
try:
    module.write_response_artifact(path, "secret")
except OSError:
    pass
print(path.exists())
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("False");
  });

  test("selects and verifies Korean advanced model and reasoning rows", () => {
    expect(runAdvancedMenuFixture("모델", "추론 강도")).toContain("(True, 'GPT-5.6 Sol (Pro)')");
  });

  test("selects and verifies English advanced model and reasoning rows", () => {
    expect(runAdvancedMenuFixture("Model", "Reasoning effort")).toContain("(True, 'GPT-5.6 Sol (Pro)')");
  });

  test("fails closed when advanced rows are absent", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Page:
    def query_selector_all(self, selector): return []
print(repr(module._select_advanced_model_and_effort(Page(), "Pro", "GPT-5.6 Sol")))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("None");
  });

  test("rejects a different GPT-5.6 model variant", () => {
    expect(
      runAdvancedMenuFixture("Model", "Reasoning effort", "GPT-5.6 Thinking"),
    ).toContain("(False, None)");
  });

  test("drives the August effort slider to Pro and fails closed on a miss", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda _: None
class Slider:
    def __init__(self, maximum): self.value, self.maximum = 2, maximum
    def click(self, force=False): pass
    def get_attribute(self, name):
        return {"aria-valuenow": str(self.value), "aria-valuemin": "0", "aria-valuemax": str(self.maximum)}[name]
class Pill:
    def __init__(self, text): self.text = text
    def inner_text(self): return self.text() if callable(self.text) else self.text
class Keyboard:
    def __init__(self, slider): self.slider = slider
    def press(self, key):
        if key == "ArrowLeft": self.slider.value = max(0, self.slider.value - 1)
        if key == "ArrowRight": self.slider.value = min(self.slider.maximum, self.slider.value + 1)
class Page:
    def __init__(self, pro, maximum):
        self.slider = Slider(maximum)
        self.keyboard = Keyboard(self.slider)
        self.pills = [
            Pill("GPT-5.6 Sol Pro"),
            Pill(lambda: "Pro" if pro and self.slider.value == 4 else "High"),
        ]
    def query_selector_all(self, selector): return self.pills if selector == 'button.__composer-pill' else []
    def query_selector(self, selector): return self.slider if selector == '[role="slider"]' else None
success = Page(True, 4)
miss = Page(False, 3)
print(repr(module._drive_effort_slider(success, success.slider, "pro")))
print(repr(module._drive_effort_slider(miss, miss.slider, "pro")))
print(module._slider_effort_verified(success, "pro"))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["'Pro'", "None", "True"]);
  });

  test("records the verified pre-menu effort pill instead of Default", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module.verified_effort_label(slider_label=None, slider_used=False, checked_label=None, pill_label_before="최대"))
print(module.verified_effort_label(slider_label="Pro", slider_used=True, checked_label=None, pill_label_before=None))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["최대", "Pro"]);
  });

  test("fails closed when an explicit include file is missing from the pack", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module.missing_explicit_include_paths("package.json,package-lock.json,src/**", ["package.json", "src/app.ts"]))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("['package-lock.json']");
    const source = read(engine);
    expect(source).toContain('cmd.append("--no-default-patterns")');
    expect(source).toContain('cmd.append("--no-gitignore")');
  });
});
