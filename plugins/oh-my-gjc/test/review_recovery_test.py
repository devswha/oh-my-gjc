"""Offline request delivery/restart regressions. Never connects to a live CDP port."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bin'))
import pack_and_ask as m
from review_journal import RunJournal, source_identity, text_hash

URL = 'https://chatgpt.com/c/12345678-1234-1234-1234-123456789abc'
TAG = '20260905_120000_123_ab12cd'


class Clock:
    def __init__(self): self.now = 1.0
    def sleep(self, n): self.now += n
    def monotonic(self): return self.now


class Lease:
    def acquire(self): return self
    def release(self): pass
    def still_binding(self): return True
    def __enter__(self): return self
    def __exit__(self, *args): pass


class Node:
    def __init__(self, row): self.row = row
    def inner_text(self): return self.row['text']


class Composer:
    def click(self, **kwargs): pass


class Keyboard:
    """Composer fixture; production put_text/clear/readback remain in use."""
    def __init__(self, page):
        self.page = page
        self.selected = False
    def press(self, key):
        if key in ('Control+a', 'Meta+a'):
            self.selected = True
        elif key == 'Backspace':
            self.page.prompt = '' if self.selected else self.page.prompt[:-1]
            self.selected = False
        elif key == 'Enter':
            if self.page.prompt:
                self.page.env.sends += 1
                self.page.prompt = ''
        else:
            raise AssertionError('unexpected composer key: ' + key)
    def insert_text(self, message):
        env = self.page.env
        env.insert_calls += 1
        if env.insert_errors:
            env.insert_errors -= 1
            if env.insert_before_error:
                self.page.prompt += message
            raise RuntimeError('insert_text transport failure')
        self.page.prompt += message
    def type(self, message):
        self.page.env.type_calls += 1
        # Playwright's US keyboard layout maps both newline characters to Enter.
        for char in message:
            if char in '\r\n':
                self.press('Enter')
            else:
                self.page.prompt += char


class Page:
    def __init__(self, env):
        self.env = env
        self.url = URL
        self.rows = []
        self.prompt = ''
        self.composer = Composer()
        self.keyboard = Keyboard(self)
    def goto(self, url, **kwargs): self.url = url
    def close(self): pass
    def evaluate(self, js):
        if js == '() => location.href': return self.url
        if 'el.innerText || el.textContent' in js: return self.prompt
        if 'window.scrollTo' in js or 'el.focus()' in js: return None
        raise AssertionError('unexpected page evaluation')
    def eval_on_selector_all(self, *args):
        if self.env.dom_error and self.env.sends:
            raise RuntimeError('CDP DOM transport lost')
        return copy.deepcopy(self.rows)
    def query_selector_all(self, sel):
        if sel.startswith('[data-message-id='):
            return [Node(r) for r in self.rows if r['id'] == sel.split('"')[1]]
        role = 'assistant' if 'assistant' in sel else 'user' if 'user' in sel else None
        return [Node(r) for r in self.rows if r['role'] == role] if role else []
    def query_selector(self, sel):
        if sel in m.INPUT_SELECTORS: return self.composer
        return self if sel in m.SEND_BTN_SELECTORS else None
    def is_visible(self): return True
    def is_enabled(self): return not (self.env.pre_failure and self.env.pages == 1)
    def click(self):
        self.env.sends += 1
        receipt = RunJournal.read(max(self.env.out.glob('runs/run_*.json'), key=lambda p: p.stat().st_mtime_ns))
        assert receipt.attempted and receipt.data['send_state'] == 'unknown', 'must fsync before click'
        self.url = URL
        if not self.env.invisible_request:
            answer = self.env.answer(self.prompt) if self.env.answer else 'A complete audited response.'
            self.rows = [dict(id='user-1', role='user', text=self.prompt),
                         dict(id='assistant-1', role='assistant', text=answer)]
        if self.env.click_error:
            raise RuntimeError('input accepted then CDP transport lost')


class Harness:
    def __init__(self, out):
        self.out = out
        self.sends = self.pages = 0
        self.dom_error = self.click_error = self.invisible_request = self.pre_failure = False
        self.insert_calls = self.type_calls = self.insert_errors = 0
        self.insert_before_error = False
        self.answer = None
        self.page = None
    def new_page(self):
        self.pages += 1
        self.page = Page(self)
        return self.page
    def connect_over_cdp(self, url): return self
    def __enter__(self): return SimpleNamespace(chromium=self)
    def __exit__(self, *args): pass
    @contextlib.contextmanager
    def patches(self):
        clock = Clock()
        with contextlib.ExitStack() as stack:
            replacements = dict(sync_playwright=lambda: self, CdpLease=lambda _: Lease(),
                pick_context=lambda _: self, _guard_dialogs=lambda *args: None,
                login_state=lambda _: 'ok',
                wait_for_login_state=lambda _: 'ok', read_model_pills=lambda _: [],
                resolve_browser=lambda _: None, ensure_browser=lambda _: True,
                _cdp_matches_dedicated_profile=lambda: True,
                select_model=lambda *args, **kwargs: (True, 'Verified Model (Pro)'),
                detect_quota_block=lambda _: None, turn_terminal=lambda *args: True,
                copy_turn=lambda *args, **kwargs: None,
                MIN_WAIT_SECS=0, STABLE_CHECK_SECS=1)
            for key, value in replacements.items(): stack.enter_context(patch.object(m, key, value))
            stack.enter_context(patch.object(m.time, 'sleep', clock.sleep))
            stack.enter_context(patch.object(m.time, 'monotonic', clock.monotonic))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            yield
    def run(self, *extra):
        with self.patches(), patch.object(sys, 'argv', ['pack_and_ask.py', '--prompt', 'Review this',
                '--no-project', '--out-dir', str(self.out), '--max-wait', '8', *extra]):
            try: m.main()
            except SystemExit as exc: return exc.code
        return 0


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.out = self.root / 'output'
        self.out.mkdir(mode=0o700)

    def make_journal(self, source=False):
        identity = pack = None
        if source:
            src = self.root / 'src'
            src.mkdir()
            (src / 'main.py').write_text('original code\n')
            identity = source_identity(src, ['main.py'])
            pack = self.out / 'pack.md'
            pack.write_text('original packed code\n')
            pack.chmod(0o600)
        journal = RunJournal.create(self.out, TAG, 'fixture', 'Review this', identity, pack)
        prompt = f'Review this\n\n[insane-review request: {TAG}]'
        journal.update(request_sha256=text_hash(prompt), verified_model='Verified Model (Pro)')
        journal.begin_send()
        env = Harness(self.out)
        page = Page(env)
        page.rows = [dict(id='user-1', role='user', text=prompt),
                     dict(id='assistant-1', role='assistant', text='A complete audited response.')]
        m.observe_bound_turn(page, journal)
        return journal, page, env

    def harvest(self, journal, page, env, **changes):
        args = SimpleNamespace(harvest_only=str(journal.path), max_wait=8, stream=False, council=False)
        for key, value in changes.items(): setattr(args, key, value)
        with env.patches(), patch.object(env, 'new_page', return_value=page):
            # Every message-capable path and every repack/model/bootstrap path must stay unused.
            with contextlib.ExitStack() as stack:
                for name in ('click_send', 'put_text', 'clear_composer', 'attach_file', 'pack_repo',
                             'select_model', 'ensure_project', 'ensure_browser', 'click_answer_now'):
                    stack.enter_context(patch.object(m, name, side_effect=AssertionError(name + ' forbidden during harvest')))
                m.harvest_run(args)
        self.assertEqual(env.sends, 0)

    def run_request_fixture(self, env, mode, *extra):
        """Run the real request/pack/input paths with only external repomix faked."""
        if mode == 'prompt':
            return env.run(*extra)
        src = env.out.parent / 'src'
        src.mkdir()
        (src / 'main.py').write_text('print("audited source")\n')
        def repomix(cmd, **kwargs):
            output = Path(cmd[cmd.index('-o') + 1])
            output.write_text('## File: main.py\n```python\n1: print("audited source")\n```\n')
            return SimpleNamespace(returncode=0, stdout='Total Files: 1\nTotal Tokens: 10\n', stderr='')
        with patch.object(m.shutil, 'which', return_value='/fake/npx'), \
                patch.object(m.subprocess, 'run', repomix), \
                patch.object(m, 'attach_file', return_value=mode == 'attached'):
            result = env.run('--target', str(src), *extra)
        self.assertEqual('<repomix_pack ' in env.page.prompt, mode == 'inline')
        return result

    def test_input_transport_failure_never_types_or_sends(self):
        for accepted in (False, True):
            with self.subTest(insert_accepted=accepted), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                env = Harness(Path(tmp))
                env.insert_errors = 3
                env.insert_before_error = accepted
                self.assertNotEqual(env.run('--retries', '2'), 0)
                self.assertEqual((env.pages, env.insert_calls), (3, 3))
                self.assertEqual((env.type_calls, env.sends), (0, 0))
                journal = RunJournal.read(next(env.out.glob('runs/*.json')))
                self.assertFalse(journal.attempted)
                self.assertEqual(journal.data['send_state'], 'prepared')
                self.assertFalse(list(env.out.glob('response_*.md')))

    def test_input_transport_failure_can_retry_then_send_once(self):
        for accepted in (False, True):
            with self.subTest(insert_accepted=accepted), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                env = Harness(Path(tmp))
                env.insert_errors = 1
                env.insert_before_error = accepted
                self.assertEqual(env.run('--retries', '4'), 0)
                self.assertEqual((env.pages, env.insert_calls, env.type_calls, env.sends), (2, 2, 0, 1))
                journal = RunJournal.read(next(env.out.glob('runs/*.json')))
                self.assertEqual(journal.data['send_state'], 'complete')
                self.assertEqual(journal.data['request_sha256'], text_hash(env.page.prompt))
                self.assertEqual(env.page.prompt.count('[insane-review request:'), 1)

    def test_actual_request_echo_never_published_by_normal_run(self):
        for mode in ('prompt', 'attached', 'inline'):
            for suffix in ('', ' copied', ' x' * 20):
                with self.subTest(mode=mode, suffix=suffix), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                    env = Harness(Path(tmp) / 'output')
                    env.answer = lambda request: ' \n'.join(request.split()) + suffix
                    result = self.run_request_fixture(env, mode, '--prompt', 'evidence ' * 30, '--retries', '4')
                    self.assertNotEqual(result, 0)
                    self.assertIn('전송한 요청', str(result))
                    self.assertEqual((env.sends, env.pages), (1, 1))
                    journal = RunJournal.read(next(env.out.glob('runs/*.json')))
                    self.assertEqual(journal.data['send_state'], 'observed')
                    self.assertIsNone(journal.data['response_sha256'])
                    self.assertFalse(list(env.out.glob('response_*.md')))

    def test_actual_request_echo_never_published_after_restart(self):
        for mode in ('prompt', 'attached', 'inline'):
            for suffix in ('', ' copied', ' x' * 20):
                with self.subTest(mode=mode, suffix=suffix), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                    env = Harness(Path(tmp) / 'output')
                    env.answer = lambda request: ' \n'.join(request.split()) + suffix
                    result = self.run_request_fixture(env, mode, '--prompt', 'evidence ' * 30, '--max-wait', '0')
                    self.assertNotEqual(result, 0)
                    self.assertEqual(env.sends, 1)
                    journal = RunJournal.read(next(env.out.glob('runs/*.json')))
                    self.assertEqual(journal.data['schema'], 1)
                    self.assertEqual(journal.data['request_sha256'], text_hash(env.page.prompt))
                    recovered = Harness(env.out)
                    env.page.env = recovered
                    with self.assertRaisesRegex(RuntimeError, '전송한 요청'):
                        self.harvest(journal, env.page, recovered)
                    self.assertEqual(recovered.sends, 0)
                    self.assertEqual(RunJournal.read(journal.path).data['send_state'], 'observed')
                    self.assertFalse(list(env.out.glob('response_*.md')))

    def test_substantive_answer_quoting_request_survives_normal_and_harvest(self):
        for mode in ('prompt', 'attached', 'inline'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                env = Harness(Path(tmp) / 'output')
                env.answer = lambda request: request + '\n' + 'Substantive source analysis. ' * 20
                self.assertEqual(self.run_request_fixture(env, mode, '--prompt', 'evidence ' * 30), 0)
                journal = RunJournal.read(next(env.out.glob('runs/*.json')))
                original_hash = journal.data['response_sha256']
                recovered = Harness(env.out)
                env.page.env = recovered
                self.harvest(journal, env.page, recovered)
                self.assertEqual(recovered.sends, 0)
                self.assertEqual(RunJournal.read(journal.path).data['response_sha256'], original_hash)

    def test_post_send_statuses_never_retry(self):
        for status in ('timeout', 'unknown', 'not_sent', 'quota', 'empty'):
            with self.subTest(status=status), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                env = Harness(Path(tmp))
                with patch.object(m, 'wait_for_turn_response', return_value=(status, '')):
                    self.assertNotEqual(env.run('--retries', '5'), 0)
                self.assertEqual((env.sends, env.pages), (1, 1))
                self.assertEqual((env.insert_calls, env.type_calls), (1, 0))
                self.assertFalse(list(Path(tmp).glob('response_*.md')))

    def test_wait_exception_never_retries(self):
        env = Harness(self.out)
        with patch.object(m, 'wait_for_turn_response', side_effect=RuntimeError('DOM error')):
            self.assertNotEqual(env.run('--retries', '8'), 0)
        self.assertEqual((env.sends, env.pages), (1, 1))
        self.assertEqual((env.insert_calls, env.type_calls), (1, 0))

    def test_click_error_does_not_try_second_selector_or_enter(self):
        env = Harness(self.out)
        env.click_error = True
        self.assertNotEqual(env.run('--retries', '8'), 0)
        self.assertEqual((env.sends, env.pages), (1, 1))
        self.assertEqual((env.insert_calls, env.type_calls), (1, 0))
        journal = RunJournal.read(next(self.out.glob('runs/run_*.json')))
        journal.require_recovery()  # acceptance was observed despite input transport failure

    def test_real_dom_error_after_send_is_unknown_and_terminal(self):
        env = Harness(self.out)
        env.dom_error = True
        self.assertNotEqual(env.run('--retries', '8'), 0)
        self.assertEqual((env.sends, env.pages), (1, 1))
        journal = RunJournal.read(next(self.out.glob('runs/run_*.json')))
        self.assertEqual(journal.data['send_state'], 'unknown')
        journal.require_recovery()  # bound URL/request hash survive the DOM failure

    def test_user_prompt_snapshot_excludes_attachment_chip_text(self):
        captured = []
        page = SimpleNamespace(eval_on_selector_all=lambda selector, js: captured.append(js) or [])
        m.strict_turn_snapshot(page)
        # Execute the production browser callback against the observed DOM shape.
        script = r'''
const snapshot = eval(process.argv[1]);
const prompt = 'Review this\n\n[insane-review request: fixture]';
function turn(bodies) {
  return {matches: () => true, getAttribute: key => key === 'data-message-id' ? 'u1' : 'user',
    innerText: 'pack.md\n파일\n' + prompt,
    querySelectorAll: selector => selector === '.whitespace-pre-wrap' ? bodies : []};
}
const assert = require('node:assert/strict');
assert.equal(snapshot([turn([{innerText: prompt}])])[0].text, prompt);
assert.notEqual(snapshot([turn([])])[0].text, prompt);
assert.notEqual(snapshot([turn([{innerText: prompt}, {innerText: 'extra'}])])[0].text, prompt);
'''
        result = subprocess.run(['node', '-e', script, captured[0]], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_absence_of_request_is_unknown_not_unsent(self):
        env = Harness(self.out)
        env.invisible_request = True
        self.assertNotEqual(env.run('--retries', '8'), 0)
        self.assertEqual((env.sends, env.pages), (1, 1))

    def test_definitely_pre_send_failure_can_retry(self):
        env = Harness(self.out)
        env.pre_failure = True
        self.assertEqual(env.run(), 0)
        self.assertEqual((env.sends, env.pages), (1, 2))
        self.assertEqual(len(list(self.out.glob('response_*.md'))), 1)

    def test_invalid_shared_lease_stops_before_send(self):
        env = Harness(self.out)
        with patch.object(Lease, 'still_binding', return_value=False):
            self.assertNotEqual(env.run(), 0)
        self.assertEqual(env.sends, 0)

    def test_journal_failure_at_send_boundary_latches_without_click(self):
        env = Harness(self.out)
        original = RunJournal.save
        def fail_at_boundary(journal, **kwargs):
            if journal.data['send_state'] == 'unknown':
                raise OSError('fsync boundary failure')
            return original(journal, **kwargs)
        with patch.object(RunJournal, 'save', fail_at_boundary):
            self.assertNotEqual(env.run('--retries', '5'), 0)
        self.assertEqual((env.sends, env.pages), (0, 1))

    def test_pre_send_journal_failure_sends_zero(self):
        env = Harness(self.out)
        with patch('review_journal.os.fsync', side_effect=OSError('disk full')):
            with self.assertRaises(OSError): env.run()
        self.assertEqual(env.sends, 0)

    def test_restart_latch_survives_process_and_never_sends(self):
        journal, _, _ = self.make_journal()
        script = """import sys
sys.path.insert(0, sys.argv[1])
from review_journal import RunJournal
from pathlib import Path
j = RunJournal.read(Path(sys.argv[2]))
try: j.begin_send()
except ValueError: raise SystemExit(0)
raise SystemExit(7)
"""
        result = subprocess.run([sys.executable, '-c', script, str(m.BIN_DIR), str(journal.path)], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_harvest_after_restart_sends_zero_and_uses_original_tag(self):
        journal, page, env = self.make_journal(source=True)
        restored = RunJournal.read(journal.path)
        self.harvest(restored, page, env)
        path = self.out / f'response_fixture_{TAG}.md'
        self.assertIn('zero messages sent', path.read_text())
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(RunJournal.read(journal.path).data['send_state'], 'complete')
        self.harvest(RunJournal.read(journal.path), page, env)
        self.assertEqual(len(list(self.out.glob('response_*.md'))), 1)

    def test_harvest_can_bind_not_yet_seen_assistant_to_exact_request(self):
        journal, page, env = self.make_journal()
        journal.update(assistant_turn=None)
        self.harvest(RunJournal.read(journal.path), page, env)
        self.assertEqual(RunJournal.read(journal.path).data['assistant_turn'], 'assistant-1')

    def test_restart_binds_unobserved_request_only_with_exact_durable_evidence(self):
        journal, page, env = self.make_journal()
        journal.update(send_state='unknown', user_turn=None, assistant_turn=None)
        self.harvest(RunJournal.read(journal.path), page, env)
        restored = RunJournal.read(journal.path)
        self.assertEqual(restored.data['user_turn'], 'user-1')
        self.assertEqual(restored.data['send_state'], 'complete')

    def test_unknown_request_recovery_rejects_mismatched_text_and_missing_conversation(self):
        journal, page, env = self.make_journal()
        journal.update(send_state='unknown', user_turn=None, assistant_turn=None)
        page.rows[0]['text'] = 'unrelated request'
        with self.assertRaisesRegex(RuntimeError, 'request text'): self.harvest(journal, page, env)
        self.assertFalse(list(self.out.glob('response_*.md')))
        journal.update(conversation=None)
        with self.assertRaisesRegex(ValueError, 'insufficient'): journal.require_recovery()

    def test_harvest_waits_for_hydration_without_guessing_or_sending(self):
        journal, page, env = self.make_journal()
        original = page.eval_on_selector_all
        calls = []
        def hydrate(*args):
            calls.append(True)
            return [] if len(calls) == 1 else original(*args)
        page.eval_on_selector_all = hydrate
        self.harvest(journal, page, env)
        self.assertGreaterEqual(len(calls), 2)
        self.assertEqual(env.sends, 0)

    def test_wrong_conversation_rejected(self):
        journal, page, env = self.make_journal()
        page.goto = lambda *args, **kwargs: setattr(page, 'url', URL.replace('12345678-', '87654321-', 1))
        with self.assertRaisesRegex(RuntimeError, 'conversation'): self.harvest(journal, page, env)
        self.assertFalse(list(self.out.glob('response_*.md')))

    def test_wrong_request_and_assistant_and_ambiguous_turns_rejected(self):
        journal, page, env = self.make_journal()
        original = copy.deepcopy(page.rows)
        mutations = [lambda rows: rows[0].update(id='different-user'),
                     lambda rows: rows[1].update(id='regenerated-assistant'),
                     lambda rows: rows[0].update(text='different prompt'),
                     lambda rows: rows.append(dict(id='extra-user', role='user', text='later question')),
                     lambda rows: rows.append(dict(rows[1])),
                     lambda rows: rows.clear()]
        for mutate in mutations:
            page.rows = copy.deepcopy(original)
            mutate(page.rows)
            with self.assertRaises(RuntimeError): self.harvest(journal, page, env)
        self.assertFalse(list(self.out.glob('response_*.md')))

    def test_included_source_change_rejects_before_browser(self):
        journal, page, env = self.make_journal(source=True)
        src = Path(journal.data['source']['root'])
        (src / 'main.py').write_text('changed')
        with patch.object(m, 'sync_playwright', side_effect=AssertionError('no browser')):
            with self.assertRaisesRegex(ValueError, 'source changed'): journal.require_recovery()

    def test_unrelated_ignored_symlinks_and_runtime_changes_do_not_invalidate_review(self):
        journal, _, _ = self.make_journal(source=True)
        src = Path(journal.data['source']['root'])
        for name in ('node_modules/.bin', '.venv/bin', '.gjc/state'):
            (src / name).mkdir(parents=True)
        (src / 'node_modules/.bin/tool').symlink_to('/missing/tool')
        (src / '.venv/bin/python').symlink_to(sys.executable)
        (src / '.env').symlink_to('/missing/private-env')
        (src / '.gjc/state/session.json').write_text('runtime state')
        (src / 'new-unrelated.py').write_text('unrelated')
        journal.require_recovery()
        (src / '.gjc/state/session.json').write_text('changed runtime state')
        journal.require_recovery()
        (src / 'main.py').write_text('changed included source')
        with self.assertRaisesRegex(ValueError, 'source changed'): journal.require_recovery()

    def test_explicitly_packed_ignored_file_is_fingerprinted(self):
        src = self.root / 'src'
        src.mkdir()
        (src / '.gitignore').write_text('ignored.txt')
        (src / 'ignored.txt').write_text('intentionally packed')
        before = source_identity(src, ['ignored.txt'])
        (src / 'ignored.txt').write_text('changed')
        self.assertNotEqual(before, source_identity(src, ['ignored.txt']))

    def test_source_modified_while_repomix_runs_cannot_bind_to_old_pack(self):
        src = self.root / 'src'
        src.mkdir()
        (src / 'main.py').write_text('old code')
        output = self.out / 'pack.md'
        def fake_repomix(*args, **kwargs):
            output.write_text('## File: main.py\n```python\n1: old code\n```\n')
            (src / 'main.py').write_text('different source written during pack')
            return SimpleNamespace(returncode=0, stdout='Total Files: 1\nTotal Tokens: 10\n', stderr='')
        with patch.object(m.shutil, 'which', return_value='/fake/npx'), patch.object(m.subprocess, 'run', fake_repomix):
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'differs from its full packed content'):
                m.pack_repo(src, include='main.py', ignore=None, compress=False, style='markdown',
                            token_budget=None, out_path=output, identity_out={})

    def test_pack_change_rejected(self):
        journal, _, _ = self.make_journal(source=True)
        Path(journal.data['pack']['path']).write_text('modified pack')
        with self.assertRaisesRegex(ValueError, 'pack changed'): journal.require_recovery()

    def test_incomplete_response_never_saved(self):
        journal, page, env = self.make_journal()
        page.rows[1]['text'] = ''
        with self.assertRaisesRegex(RuntimeError, 'timeout'): self.harvest(journal, page, env, max_wait=2)
        self.assertFalse(list(self.out.glob('response_*.md')))

    def test_missing_model_or_conversation_rejects_recovery(self):
        journal, _, _ = self.make_journal()
        journal.update(verified_model=None)
        with self.assertRaisesRegex(ValueError, 'insufficient'): journal.require_recovery()

    def test_schema_anchor_and_identity_tampering_rejected(self):
        journal, _, _ = self.make_journal()
        original = journal.path.read_text()
        for key, value in [('schema', 2), ('user_turn', '" onclick="bad'),
                           ('assistant_turn', 'user-1'), ('identity_sha256', '0' * 64),
                           ('conversation', 'https://evil.example/c/12345678')]:
            data = json.loads(original)
            data[key] = value
            journal.path.write_text(json.dumps(data))
            with self.assertRaises(ValueError): RunJournal.read(journal.path)
        journal.path.write_text(original.replace('"schema": 1', '"schema": 1, "schema": 1'))
        with self.assertRaisesRegex(ValueError, 'duplicate'): RunJournal.read(journal.path)

    def test_private_modes_and_symlinks_and_hardlinks_rejected(self):
        journal, _, _ = self.make_journal()
        self.assertEqual(journal.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(journal.path.parent.stat().st_mode & 0o777, 0o700)
        journal.path.chmod(0o644)
        with self.assertRaises(ValueError): RunJournal.read(journal.path)
        journal.path.chmod(0o600)
        original = journal.path.read_bytes()
        outside = self.root / 'outside'
        outside.write_bytes(original)
        outside.chmod(0o600)
        journal.path.unlink()
        journal.path.symlink_to(outside)
        with self.assertRaises(ValueError): RunJournal.read(journal.path)
        with self.assertRaises(ValueError): journal.save()
        self.assertEqual(outside.read_bytes(), original)
        journal.path.unlink()
        os.link(outside, journal.path)
        with self.assertRaises(ValueError): RunJournal.read(journal.path)

    def test_symlinked_journal_directory_rejected(self):
        outside = self.root / 'outside'
        outside.mkdir(mode=0o700)
        (self.out / 'runs').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError): RunJournal.create(self.out, TAG, 'fixture', 'question')
        self.assertEqual(list(outside.iterdir()), [])

    def test_completed_response_tampering_not_overwritten(self):
        journal, page, env = self.make_journal()
        self.harvest(journal, page, env)
        path = self.out / f'response_fixture_{TAG}.md'
        path.write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'no overwrite'): self.harvest(RunJournal.read(journal.path), page, env)
        self.assertEqual(path.read_text(), 'tampered')

    def test_response_publication_is_atomic_and_recovers_after_journal_completion_crash(self):
        journal, page, env = self.make_journal()
        original = RunJournal.update
        def crash(journal, **changes):
            if changes.get('send_state') == 'complete':
                raise RuntimeError('process died after artifact publication')
            return original(journal, **changes)
        with patch.object(RunJournal, 'update', crash):
            with self.assertRaisesRegex(RuntimeError, 'process died'):
                self.harvest(journal, page, env)
        path = self.out / f'response_fixture_{TAG}.md'
        self.assertTrue(path.read_text().endswith('A complete audited response.\n'))
        self.harvest(RunJournal.read(journal.path), page, env)
        self.assertEqual(RunJournal.read(journal.path).data['send_state'], 'complete')

    def test_failed_response_write_never_publishes_partial_name(self):
        path = self.out / 'response.md'
        with patch.object(m.os, 'fsync', side_effect=OSError('disk full')):
            with self.assertRaises(OSError): m.write_response_artifact(path, 'complete body')
        self.assertFalse(path.exists())
        self.assertEqual(list(self.out.iterdir()), [])

    def test_valid_external_journal_change_is_not_overwritten_by_loaded_run(self):
        journal, _, _ = self.make_journal()
        restored = RunJournal.read(journal.path)
        data = json.loads(journal.path.read_text())
        data['verified_model'] = 'tampered model'
        journal.path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'outside this run'):
            restored.update(response_sha256='0' * 64)

    def test_source_changed_followup_rejected_before_browser(self):
        journal, page, env = self.make_journal(source=True)
        self.harvest(journal, page, env)
        artifact = self.out / f'response_fixture_{TAG}.md'
        Path(journal.data['source']['root'], 'main.py').write_text('new code')
        with self.assertRaisesRegex(ValueError, 'source changed'):
            env.run('--followup', str(artifact))
        self.assertEqual(env.sends, 0)

    def test_followup_inherits_identity_and_remains_a_new_question(self):
        journal, page, env = self.make_journal(source=True)
        self.harvest(journal, page, env)
        artifact = self.out / f'response_fixture_{TAG}.md'
        # The new question keeps the old attachment and the exact original code identity.
        env = Harness(self.out)
        original = m.RunJournal.create
        saved = []
        def capture(*args, **kwargs):
            result = original(*args, **kwargs)
            saved.append(result)
            return result
        with patch.object(m.RunJournal, 'create', capture), patch.object(m, 'pack_repo', side_effect=AssertionError('no repack')):
            self.assertEqual(env.run('--followup', str(artifact)), 0)
        self.assertEqual(env.sends, 1)
        self.assertEqual(saved[0].data['mode'], 'followup')
        self.assertEqual(saved[0].data['identity_sha256'], journal.data['identity_sha256'])
        self.assertEqual(saved[0].data['verified_model'], journal.data['verified_model'])
        self.assertNotEqual(saved[0].data['run_tag'], TAG)

    def test_resume_cli_rejects_new_question_and_bootstrap_flags(self):
        journal, _, _ = self.make_journal()
        for extra in (['--prompt', 'new question'], ['--target', str(self.root)], ['--ensure-env'], ['--model', 'pro']):
            with patch.object(sys, 'argv', ['pack_and_ask.py', '--resume', str(journal.path), *extra]):
                with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                    m.main()
                self.assertEqual(caught.exception.code, 2)


if __name__ == '__main__':
    unittest.main()
