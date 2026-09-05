import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
    expect(source).toContain("base_ids=base_ids, conv_url=conv_url,");
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

  test("verifies an Astra family selection without requiring a Sol label", () => {
    expect(runAdvancedMenuFixture("Model", "Reasoning", "6 Astra", "GPT-6 Astra")).toContain("(True, '6 Astra (Pro)')");
    expect(runAdvancedMenuFixture("모델", "추론", "Astra", "Astra")).toContain("(True, 'Astra (Pro)')");
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

  test("preserves upstream MIT provenance at the audited fork point", () => {
    const references = join(pluginRoot, "skills/insane-review/references");
    const provenance = read(join(references, "upstream.md"));
    const licensePath = join(references, "upstream-LICENSE");

    expect(provenance).toContain("fivetaku/insane-review");
    expect(provenance).toContain("0.5.3");
    expect(provenance).toContain("2b3c926737031600e166dbce7dbd8d15b17be9eb");
    expect(existsSync(licensePath)).toBe(true);
    expect(read(licensePath)).toMatch(/\bMIT License\b/);
    expect(read(licensePath)).toContain("Copyright (c) 2026 fivetaku");

    expect(read(join(pluginRoot, "skills/insane-review/SKILL.md"))).toContain(
      "references/upstream.md",
    );
    expect(read(join(pluginRoot, "bin/install-skill.sh"))).toContain(
      "skills/insane-review/references/upstream-LICENSE",
    );
  });

  test("resolves a followup anchor from a URL or a prior response artifact", () => {
    const script = `
import importlib.util, tempfile, pathlib
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

plain = "https://chatgpt.com/c/6a96c4f0-38a0-83e8-8b19-64a1192f24e8"
project = "https://chatgpt.com/g/g-p-abc123-proj/c/6a96c4f0-38a0-83e8-8b19-64a1192f24e8"
print(module.resolve_followup_target(plain) == plain)
print(module.resolve_followup_target(project) == project)

# an artifact carries the conversation in its header, so answers chain
tmp = pathlib.Path(tempfile.mkdtemp()) / "response_x.md"
tmp.write_text(chr(10).join(["# x", "- 대화: " + project, "", "---", "", "body"]), encoding="utf-8")
print(module.resolve_followup_target(str(tmp)) == project)

# a look-alike host must never be accepted as a chatgpt conversation
print(module.CONV_URL_RE.fullmatch("https://evil.com/c/6a96c4f0-38a0") is None)
print(module.CONV_URL_RE.fullmatch("https://chatgpt.com/") is None)
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["True", "True", "True", "True", "True"]);
  });

  test("refuses a followup that cannot name one existing conversation", () => {
    const cases: [string[], string][] = [
      [["--followup", "https://chatgpt.com/c/6a96c4f0-38a0-83e8-8b19-64a1192f24e8",
        "--target", ".", "--prompt", "x"], "--target"],
      [["--followup", "/nonexistent/none.md", "--prompt", "x"], "존재하는 응답 파일도 아님"],
    ];
    for (const [args, expected] of cases) {
      const result = spawnSync("python3", [engine, ...args], {
        cwd: pluginRoot,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain(expected);
    }
  });

  test("skips packing, project grouping, and model reselection on a followup", () => {
    // The point of a followup is that the code is already attached to that
    // conversation: re-packing wastes tokens and re-driving the model menu can
    // only break a conversation that is already on the verified model.
    const source = read(engine);
    expect(source).toContain("if not args.no_project and not followup_url:");
    expect(source).toContain("if followup_url:");
    expect(source).toContain("entry_url = followup_url or CHATGPT_URL");
    // landing on the wrong conversation must abort, not leak the question there
    expect(source).toContain("후속 대상 대화에 진입 실패");
    // and the artifact records the conversation so answers can be chained
    expect(source).toContain('conv_line = f"- 대화: {conv_url}');
  });

  test("identifies the answered turn by message-id, not a global copy-button delta", () => {
    // Regression: a user turn also carries a copy button, so a global count delta
    // reported "complete" while the fresh assistant node was still empty — the run
    // then saved the PREVIOUS answer as this run's result (sol-lane 0.6.5 P0).
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda _: None

class Node:
    def __init__(self, mid, text, role="assistant"):
        self.mid, self.text, self.role = mid, text, role
    def get_attribute(self, n): return self.mid if n == "data-message-id" else None
    def inner_text(self): return self.text
    def evaluate_handle(self, js, sel): return Btn()
class Btn:
    def as_element(self): return self
    def click(self, **k): pass
    def is_enabled(self): return True
class Page:
    def __init__(self, nodes): self.nodes = nodes
    def query_selector(self, sel): return None
    def query_selector_all(self, sel):
        if "dialog" in sel or "alert" in sel: return []
        if "assistant" in sel: return [n for n in self.nodes if n.role == "assistant"]
        if "user" in sel: return [n for n in self.nodes if n.role == "user"]
        return []
    def eval_on_selector_all(self, sel, js): return [n.mid for n in self.nodes]

old = Node("m1", "previous answer")
user = Node("m2", "question", role="user")
base = {"m1", "m2"}
stale = Page([old, user])
print(module.last_turn_complete(stale, base_assistant=1, base_ids=base))
print(module.new_assistant_target(stale, base) is None)
fresh = Page([old, user, Node("m3", "this run's answer")])
print(module.last_turn_complete(fresh, base_assistant=1, base_ids=base))
print(module.new_assistant_target(fresh, base).inner_text())
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "False",              // no fresh turn yet -> never "complete"
      "True",               // and nothing is offered for harvest
      "True",               // fresh turn present -> complete
      "this run's answer",  // and it is the fresh one, not the previous answer
    ]);
  });

  test("recovers a lost render stream by reloading the bound conversation", () => {
    // Reproduced live 2026-09-01: the assistant turn stayed empty with no streaming
    // indicator while the answer already existed server-side. Recovery is a reload of
    // the bound conversation, never a resend (a resend burns another Pro message).
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda _: None
module.STALL_RELOAD_SECS = 0
module.MIN_WAIT_SECS = 0

class Node:
    def __init__(self, mid, text): self.mid, self.text, self.role = mid, text, "assistant"
    def get_attribute(self, n): return self.mid if n == "data-message-id" else None
    def inner_text(self): return self.text
    def evaluate_handle(self, js, sel): return None
class Page:
    def __init__(self): self.goto_calls = []
    def query_selector(self, sel): return None
    def query_selector_all(self, sel):
        if "dialog" in sel or "alert" in sel: return []
        if "assistant" in sel: return [Node("m9", "")]
        if "user" in sel: return [1, 2]
        return []
    def eval_on_selector_all(self, s, j): return ["m9"]
    def evaluate(self, js): return "https://chatgpt.com/c/xyz"
    def goto(self, url, **k): self.goto_calls.append(url)

bound = Page()
status, _ = module.wait_for_turn_response(bound, max_wait=1, base_user=1,
                                          base_assistant=0, base_ids=set(),
                                          conv_url="https://chatgpt.com/c/xyz")
print(len(bound.goto_calls))
print(status)
unbound = Page()
module.wait_for_turn_response(unbound, max_wait=1, base_user=1, base_assistant=0,
                              base_ids=set(), conv_url=None)
print(len(unbound.goto_calls))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    // engine progress lines are indented; the assertions print at column 0
    const emitted = result.stdout.split("\n").filter((l) => /^\S/.test(l.trimEnd()) && l.trim());
    expect(emitted).toEqual([
      "3",         // reloads are capped at STALL_MAX_RELOADS
      "timeout",   // an unrecovered stall still fails closed, never a partial save
      "0",         // without a bound conversation there is nothing safe to reload
    ]);
    // recovery reloads the bound conversation; it never resends (that burns a message)
    expect(result.stdout).toContain("결속 대화 재로드 3/3");
  });

  test("reads the live SPA location instead of the cached page.url", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.time.sleep = lambda _: None

class Page:
    url = "https://chatgpt.com/"   # stale Playwright cache after pushState
    def evaluate(self, js): return "https://chatgpt.com/c/abc12345-def6"
class Fresh:
    def evaluate(self, js): return "https://chatgpt.com/"

print(module.current_url(Page()))
print(module.capture_conv_url(Page(), timeout_secs=1))
print(module.capture_conv_url(Fresh(), timeout_secs=1) is None)
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "https://chatgpt.com/c/abc12345-def6",
      "https://chatgpt.com/c/abc12345-def6",
      "True",
    ]);
    // the stale cache must not survive as executable code (prose may still cite it)
    const codeUses = read(engine)
      .split("\n")
      .filter((line) => /(?:^|[\s(=,])page\.url\b/.test(line))
      .filter((line) => !/^\s*#/.test(line) && !line.includes("`page.url`"));
    expect(codeUses).toEqual([]);
  });

  test("detects a quota block from dialog surfaces without scanning answer prose", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Node:
    def __init__(self, text): self.text = text
    def inner_text(self): return self.text
class Page:
    def __init__(self, dialogs=(), body=""): self.dialogs, self.body = dialogs, body
    def query_selector_all(self, sel):
        if "dialog" in sel or "alert" in sel: return [Node(d) for d in self.dialogs]
        return [Node(self.body)] if self.body else []

print(bool(module.detect_quota_block(Page(dialogs=["You've reached your limit. Try again later."]))))
print(module.detect_quota_block(Page(dialogs=["\u{C0AC}\u{C6A9}\u{B7C9} \u{D55C}\u{B3C4}\u{C5D0} \u{B3C4}\u{B2EC}"])) is not None)
print(module.detect_quota_block(Page(body="the usage limit handling in this module")) is None)
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["True", "True", "True"]);
  });

  test("survives a removed primary selector via the fallback list", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Page:
    def query_selector_all(self, sel):
        if sel == '[data-message-author-role="assistant"]':
            raise RuntimeError("selector removed by a UI change")
        if sel == 'article[data-turn="assistant"]':
            return [object()]
        return []

print(module.count_msgs(Page(), module.ASSISTANT_MSG_SELECTORS))
print(len(module.COPY_BTN_SELECTORS) > 1 and len(module.STREAMING_BTN_SELECTORS) > 1)
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["1", "True"]);
  });

  test("rejects a clipboard that raced against the harvested turn", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("pack_and_ask", ${JSON.stringify(engine)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

print(module.clipboard_matches("something the user copied", "the short answer"))
print(module.clipboard_matches("the short answer", "the short answer"))
long_answer = "finding " * 40
print(module.clipboard_matches(long_answer, long_answer))
print(module.clipboard_matches("", "the short answer"))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual(["False", "True", "True", "False"]);
  });

  test("resolves the optional sol-lane path without a personal checkout hardcode", () => {
    const distributed = [
      join(pluginRoot, "skills/insane-review/SKILL.md"),
      join(pluginRoot, "templates/insane-review.md"),
    ];

    for (const path of distributed) {
      const body = read(path);
      // lane is optional; when referenced it must resolve, never assume one checkout.
      expect(body).toContain("SOL_LANE_ROOT");
      expect(body).not.toContain("uv run --project ~/workspace/sol-lane");
      expect(body).not.toContain("test -x ~/workspace/sol-lane");
      // the $IR fallback must survive as the public default path.
      expect(body).toContain("$IR");
    }
  });

  test("lane resolution honours PATH, the override, and absence", () => {
    const skill = read(join(pluginRoot, "skills/insane-review/SKILL.md"));
    const block = skill.match(/```bash\n(lane_cmd\(\)[\s\S]*?)```/);
    expect(block, "lane_cmd block missing from SKILL.md").not.toBeNull();
    const script = `set -u\n${block![1]}\necho "LANE=[$LANE]"\n`;

    const run = (env: Record<string, string>) =>
      spawnSync("bash", ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, ...env },
      });

    const syntax = spawnSync("bash", ["-n", "-c", script], { encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);

    const absent = run({ HOME: "/nonexistent-home", SOL_LANE_ROOT: "/nonexistent-lane" });
    expect(absent.status, absent.stderr).toBe(0);
    expect(absent.stdout.trim()).toBe("LANE=[]");

    const onPath = run({ HOME: "/nonexistent-home", PATH: `${pluginRoot}/test/fixtures-lane:${process.env.PATH}` });
    expect(onPath.status, onPath.stderr).toBe(0);
    expect(onPath.stdout.trim()).toBe("LANE=[lane]");
  });
});
