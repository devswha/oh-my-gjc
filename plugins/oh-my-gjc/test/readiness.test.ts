import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const bin = resolve(import.meta.dir, "../bin");
function run(module: string, body: string) {
  const script = `import sys\nsys.path.insert(0, ${JSON.stringify(bin)})\nimport ${module} as m\n${body}`;
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8", timeout: 20000 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout;
}

describe("review readiness", () => {
  test("distinguishes an actual login wall from unknown and authenticated UI", () => {
    run("pack_and_ask", `
m.time.sleep = lambda _: None
class Wall:
 def __init__(self, visible): self.visible = visible
 def is_visible(self): return self.visible
class Page:
 def __init__(self, wall=None, composer=False, evidence=False):
  self.wall, self.composer, self.evidence = wall, composer, evidence
 def query_selector(self, selector):
  if selector in m.LOGIN_WALL_SELECTORS: return self.wall
  if selector == 'button.__composer-pill': return object() if self.evidence else None
  return None
m.find_input = lambda page: object() if page.composer else None
assert m.login_state(Page(wall=Wall(True))) == 'no'
assert m.login_state(Page()) == 'unknown'
assert m.login_state(Page(composer=True)) == 'unknown'
assert m.login_state(Page(wall=Wall(False), composer=True, evidence=True)) == 'ok'
assert not m.looks_logged_in(Page())
`);
  });
  test("unknown login makes prerequisite check fail closed", () => {
    run("pack_and_ask", `
import importlib.util
importlib.util.find_spec = lambda _: object()
m.shutil.which = lambda _: '/bin/fixture'
m.is_port_open = lambda *_: True
m.cdp_browser_ok = lambda: True
m._cdp_matches_dedicated_profile = lambda: True
m._load_config = lambda: {}
m.detect_browsers = lambda: []
m.probe_login = lambda: 'unknown'
assert m.check_env() > 0
m.probe_login = lambda: 'ok'
assert m.check_env() == 0
`);
  });
  test("model matching preserves exact family and variant after GPT prefix normalization", () => {
    run("pack_and_ask", `
assert m._model_name_matches('6 Astra', 'GPT-6 Astra')
assert m._model_name_matches('GPT 6 Astra', '6 Astra')
assert m._model_name_matches('5.6 Sol', 'GPT-5.6 Sol')
for observed, expected in [('6 Astra Mini', 'GPT-6 Astra'), ('6', 'GPT-6 Astra'), ('GPT-6 Astra', 'GPT-6'), ('5.6 Sol', '6 Astra'), ('', '6 Astra')]:
 assert not m._model_name_matches(observed, expected), (observed, expected)
`);
  });
  test("current mode requires selected evidence and freezes that model before effort selection", () => {
    run("pack_and_ask", `
class Keyboard:
 def press(self, _): pass
class Page:
 keyboard = Keyboard()
m._exact_effort_pill = lambda *args: 'Pro'
m._open_switcher = lambda page: True
m.selected_model_in_open_menu = lambda page: '6 Astra'
seen = []
def advanced(page, effort, model):
 seen.append((effort, model)); return True, model + ' (Pro)'
m._select_advanced_model_and_effort = advanced
assert m.select_model(Page(), 'pro', 'current') == (True, '6 Astra (Pro)')
assert seen == [('pro', '6 Astra')]
m.selected_model_in_open_menu = lambda page: None
assert m.select_model(Page(), 'pro', 'current') == (False, None)
assert len(seen) == 1
`);
  });
  test("inspection does not connect to an unbound browser", () => {
    run("pack_and_ask", `
m.is_port_open = lambda *_: True
m.cdp_browser_ok = lambda: True
m._cdp_matches_dedicated_profile = lambda: False
m.sync_playwright = lambda: (_ for _ in ()).throw(AssertionError('must not connect'))
assert m.inspect_session() == {'ok': False, 'browser': 'wrong', 'login': 'unknown', 'model': None, 'effort': None}
`);
  });
});

describe("review conversation and model identity", () => {
  test("accepts one conversation ID across project routes but refuses a different valid chat", () => {
    run("pack_and_ask", `
a = 'https://chatgpt.com/c/11111111-1111'
assert m.same_conversation(a, 'https://chatgpt.com/g/project/c/11111111-1111?x=1')
assert not m.same_conversation(a, 'https://chatgpt.com/c/22222222-2222')
assert not m.same_conversation(a, 'https://example.com/c/11111111-1111')
assert not m.same_conversation(a, 'https://chatgpt.com/')
`);
  });
  test("refuses conflicting checked models", () => {
    run("pack_and_ask", `
class Item:
 def __init__(self, text): self.text = text
 def get_attribute(self, name): return 'true' if name == 'aria-checked' else None
 def inner_text(self): return self.text
class Page:
 def query_selector_all(self, selector): return [Item('6 Astra'), Item('5.6 Sol')]
state = m.read_menu_state(Page())
assert state['model'] is None and state['model_source'] == 'ambiguous'
`);
  });
});

describe("search runtime", () => {
  test("missing dependencies stop once before engine import with no browser/login advice", () => {
    run("insane_search", `
import json, io, contextlib
m.managed_python = lambda: None
m.module_status = lambda: {name: {'ok': name != 'curl_cffi', 'package': package, 'version': ''} for name, package in m.CORE_MODULES.items()}
sys.argv = ['insane_search.py', 'https://example.com/']
stderr = io.StringIO()
with contextlib.redirect_stderr(stderr): assert m.main() == 1
report = json.loads(stderr.getvalue())
assert report['missing'] == ['curl_cffi>=0.15.0']
assert report['browser'] == 'not_used' and report['authentication'] == 'not_required'
assert report['setup'][-1] == '--install'
assert 'engine.__main__' not in sys.modules
`);
  });
  test("explicit setup help never installs packages or creates an environment", () => {
    run("setup_insane_search", `
m.subprocess.run = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('must not install'))
m.managed_venv = lambda: (_ for _ in ()).throw(AssertionError('must not create'))
sys.argv = ['setup_insane_search.py']
assert m.main() == 0
`);
  });
  test("rejects linked and permissive managed environments", () => {
    run("insane_search", `
import os, tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as temp:
 os.environ['XDG_DATA_HOME'] = str(Path(temp).resolve())
 path = m.managed_venv()
 assert m.managed_python() is None
 path.parent.mkdir(parents=True, mode=0o700)
 outside = Path(temp).resolve() / 'outside'; outside.mkdir()
 path.symlink_to(outside, target_is_directory=True)
 try: m.managed_python()
 except ValueError: pass
 else: raise AssertionError('symlink accepted')
 path.unlink(); path.mkdir(mode=0o755)
 try: m.managed_python()
 except ValueError: pass
 else: raise AssertionError('public permissions accepted')
`);
  });
});
