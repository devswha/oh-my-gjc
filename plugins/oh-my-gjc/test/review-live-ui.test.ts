import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const bin = resolve(import.meta.dir, "../bin");
function run(body: string) {
  const result = spawnSync("python3", ["-c", `import sys\nsys.path.insert(0, ${JSON.stringify(bin)})\nimport pack_and_ask as m\n${body}`], { encoding: "utf8", timeout: 20000 });
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

describe("hydrated session readiness", () => {
  test("waits through hydration but stops immediately on a real login wall", () => {
    run(`
m.time.sleep = lambda _: None
states = iter(['unknown', 'unknown', 'ok'])
m.login_state = lambda page: next(states)
assert m.wait_for_login_state(object()) == 'ok'
states = iter(['no'])
assert m.wait_for_login_state(object()) == 'no'
m.login_state = lambda page: 'unknown'
assert m.wait_for_login_state(object(), timeout_secs=0) == 'unknown'
`);
  });
});

describe("owned display discovery", () => {
  test("uses one owned X11 socket without changing the parent environment", () => {
    run(`
import os, socket, tempfile
from pathlib import Path
from unittest.mock import patch
m.host_os = lambda: 'linux'
with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {}, clear=True):
 m.X11_SOCKET_DIR = Path(temp)
 sock = socket.socket(socket.AF_UNIX)
 try:
  sock.bind(str(Path(temp) / 'X0'))
  assert m.browser_launch_env() == {'DISPLAY': ':0'}
  assert 'DISPLAY' not in os.environ
  with patch.object(m.os, 'getuid', return_value=os.getuid()+1):
   assert m.browser_launch_env() is None
 finally: sock.close()
`);
  });
  test("rejects ambiguous, symlinked and non-socket candidates; honors explicit displays", () => {
    run(`
import os, socket, tempfile
from pathlib import Path
from unittest.mock import patch
m.host_os = lambda: 'linux'
with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {}, clear=True):
 m.X11_SOCKET_DIR = Path(temp)
 (Path(temp) / 'X2').write_text('not a socket')
 assert m.browser_launch_env() is None
 a, b = socket.socket(socket.AF_UNIX), socket.socket(socket.AF_UNIX)
 try:
  a.bind(str(Path(temp) / 'X0')); b.bind(str(Path(temp) / 'X1'))
  assert m.browser_launch_env() is None
  os.environ['DISPLAY'] = ':88'
  assert m.browser_launch_env()['DISPLAY'] == ':88'
  os.environ.pop('DISPLAY')
  link = Path(temp) / 'linked'; link.symlink_to(temp, target_is_directory=True)
  m.X11_SOCKET_DIR = link
  assert m.browser_launch_env() is None
 finally: a.close(); b.close()
`);
  });
});

const picker = `
m.time.sleep = lambda _: None
class Keyboard:
 def press(self, key): pass
class Item:
 def __init__(self, page, label): self.page, self.label = page, label
 def inner_text(self): return self.label
 def is_visible(self): return True
 def get_attribute(self, key):
  if key == 'aria-checked': return 'true' if self.page.active == self.label else 'false'
  return None
 def dispatch_event(self, event): self.page.active = self.label; self.page.clicks += 1
class Page:
 def __init__(self, labels):
  self.active = 'GPT-5.6 Sol'; self.clicks = 0; self.keyboard = Keyboard()
  self.items = [Item(self, label) for label in labels]
 def query_selector_all(self, selector): return self.items
 def query_selector(self, selector): return None
m._ensure_switcher_menu = lambda page: True
m._open_switcher = lambda page: True
m._select_advanced_model_and_effort = lambda *args: None
`;

describe("direct model picker", () => {
  test("selects only one exact visible model and verifies its checked state", () => {
    run(picker + `
p = Page(['GPT-5.6 Sol', 'GPT-6 Astra', 'GPT-6 Astra Mini'])
state = m.select_listed_model(p, '6 Astra')
assert state['model'] == 'GPT-6 Astra' and state['model_source'] == 'checked'
assert p.clicks == 1
p = Page(['GPT-6 Astra', 'GPT-6 Astra'])
assert m.select_listed_model(p, 'GPT-6 Astra') is None
assert p.clicks == 0
p = Page(['GPT-5.6 Sol', 'GPT-6 Astra Mini'])
assert m.select_listed_model(p, 'GPT-6 Astra') is None and p.clicks == 0
`);
  });
  test("does not reuse Sol's Pro pill when Astra has no Pro evidence", () => {
    run(picker + `
p = Page(['GPT-5.6 Sol', 'GPT-6 Astra'])
m.read_model_pills = lambda page: [page.active + chr(10) + ('최대' if page.active == 'GPT-5.6 Sol' else '높음')]
assert m.select_model(p, 'pro', 'GPT-6 Astra')[0] is False
assert p.active == 'GPT-6 Astra' and p.clicks == 1
`);
  });
  test("rejects an old Sol pill that lingers after Astra becomes checked", () => {
    run(picker + `
p = Page(['GPT-5.6 Sol', 'GPT-6 Astra'])
m.read_model_pills = lambda page: ['GPT-5.6 Sol' + chr(10) + '최대']
assert m.select_model(p, 'pro', 'GPT-6 Astra')[0] is False
assert p.active == 'GPT-6 Astra'
`);
  });
  test("rejects a stale initial Sol pill when Astra is already checked, including current mode", () => {
    run(picker + `
for required in ['GPT-6 Astra', 'current']:
 p = Page(['GPT-5.6 Sol', 'GPT-6 Astra'])
 p.active = 'GPT-6 Astra'
 m.selected_model_in_open_menu = lambda page: m.read_menu_state(page)['model']
 m.read_model_pills = lambda page: ['GPT-5.6 Sol' + chr(10) + '최대']
 assert m.select_model(p, 'pro', required)[0] is False
 assert p.clicks == 0
`);
  });
  test("binds slider evidence to the requested family", () => {
    run(`
class Slider:
 def get_attribute(self, name): return '4' if name in ['aria-valuenow','aria-valuemax'] else '0'
class Page:
 def query_selector(self, selector): return Slider()
m.read_model_pills = lambda page: ['GPT-5.6 Sol' + chr(10) + '최대']
assert not m._slider_effort_verified(Page(), 'pro', require_model='GPT-6 Astra')
assert m._slider_effort_verified(Page(), 'pro', require_model='GPT-5.6 Sol')
`);
  });
  test("accepts Astra only with fresh model and Pro evidence after switching", () => {
    run(picker + `
p = Page(['GPT-5.6 Sol', 'GPT-6 Astra'])
m.read_model_pills = lambda page: [page.active + chr(10) + '최대']
assert m.select_model(p, 'pro', 'GPT-6 Astra') == (True, 'GPT-6 Astra (최대)')
assert p.clicks == 1
`);
  });
});
