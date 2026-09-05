"""Orchestration contracts; these tests make no NLP activation claims."""
import contextlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import run_ci as ci
import record_provenance as provenance


class RunnerTest(unittest.TestCase):
    def run_command(self, code, **kwargs):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            out = Path(directory)
            result = ci.execute('probe', [sys.executable, '-c', code], cwd=ROOT,
                                env=os.environ.copy(), out=out, **kwargs)
            self.assertEqual(result['log_sha256'], ci.sha256(out / result['log']))
            return result

    def test_child_failure_is_preserved(self):
        result = self.run_command('print("deliberate failure"); raise SystemExit(7)')
        self.assertEqual(result['rc'], 7)
        self.assertEqual(result['status'], 'failed')

    def test_success_and_counts(self):
        result = self.run_command('print("OK: 3/3 passed")', test_output=True)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['counts']['tests'], 3)

    def test_missing_dependency_cannot_be_a_successful_skip(self):
        result = self.run_command('print("  ⚠ skipped: pypdf not installed\\nOK: 1/1 passed")', test_output=True)
        self.assertEqual(result['rc'], 0)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(len(result['skips']), 1)

    def test_routing_prose_is_not_a_test_skip(self):
        result = self.run_command('print("  ✓ 404 skips the browser fallback\\nOK: 1/1 passed")', test_output=True)
        self.assertEqual(result['status'], 'passed')

    def test_unittest_and_bun_skips_fail(self):
        for text in ['Ran 2 tests in 0.1s\nOK (skipped=1)', ' 2 pass\n 1 skip\n 0 fail\n']:
            with self.subTest(text=text):
                result = self.run_command(f'print({text!r})', test_output=True)
                self.assertEqual(result['status'], 'failed')

    def test_no_tests_is_not_green(self):
        for output in ('', 'OK: 0/0 passed', '0 passed, 0 failed', '1 passed, 1 failed', ' 1 pass\n 1 fail'):
            with self.subTest(output=output):
                self.assertEqual(self.run_command(f'print({output!r})', test_output=True)['status'], 'failed')

    def test_timeout_records_partial_log_and_rc(self):
        result = self.run_command('import time; print("started",flush=True); time.sleep(10)', timeout=0.1)
        self.assertEqual(result['rc'], 124)
        self.assertTrue(result['timed_out'])

    def test_missing_executable_records_failure(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            result = ci.execute('missing', ['/nonexistent/omg-ci-command'], cwd=ROOT,
                                env={}, out=Path(directory))
            self.assertEqual(result['rc'], 127)
            self.assertEqual(result['status'], 'failed')

    def test_summary_fails_for_blocked_required_coverage(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            report = {'steps': [ci.omitted('dependency', 'missing', status='blocked'),
                                ci.omitted('online', 'intentional')]}
            self.assertEqual(ci.write_summary(Path(directory), report), 1)
            saved = json.loads((Path(directory) / 'summary.json').read_text())
            self.assertIsNone(saved['steps'][0]['rc'])
            self.assertEqual(len(saved['skips']), 1)

    def test_dependency_metadata_and_real_import_failures(self):
        with mock.patch.object(ci, 'lock_versions', return_value={'pypdf': '1.2.3'}), \
             mock.patch.object(ci.importlib.metadata, 'version', return_value='0.0.0'), \
             mock.patch.object(ci.importlib, 'import_module', side_effect=ImportError('broken wheel')):
            result = ci.check_dependencies()
        self.assertIn('expected 1.2.3', result['errors'][0])
        self.assertTrue(any('broken wheel' in error for error in result['errors']))
        with mock.patch.object(ci, 'lock_versions', return_value={'pypdf': '1.2.3'}), \
             mock.patch.object(ci.importlib.metadata, 'version', side_effect=ci.importlib.metadata.PackageNotFoundError), \
             mock.patch.object(ci.importlib, 'import_module'):
            self.assertIn('missing', ci.check_dependencies()['errors'][0])

    def test_isolated_environment_drops_provider_credentials(self):
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.dict(os.environ, {'OPENAI_API_KEY': 'fixture', 'GJC_CODING_AGENT_DIR': '/live'}):
            env = ci.isolated_environment(Path(directory))
            self.assertNotIn('OPENAI_API_KEY', env)
            self.assertNotIn('GJC_CODING_AGENT_DIR', env)
            self.assertEqual(env['GJC_NOTIFICATIONS'], '0')
            self.assertEqual(env['GJC_SDK_DISABLE'], '1')
            self.assertTrue(Path(env['HOME']).is_dir())


class InventoryTest(unittest.TestCase):
    def test_markers_exist_in_actual_tracked_repository(self):
        # git's index supplies the actual inventory; no manufactured legacy files.
        paths = subprocess.check_output(['git', 'ls-files', '-z', '--', 'plugins/oh-my-gjc'], cwd=ROOT)
        tracked = {p.decode().removeprefix('plugins/oh-my-gjc/') for p in paths.split(b'\0') if p}
        self.assertEqual(len(provenance.MARKERS), len(set(provenance.MARKERS)))
        self.assertFalse(set(provenance.MARKERS) - tracked,
                         f'markers absent from actual tracked plugin: {set(provenance.MARKERS) - tracked}')
        # Every shipped native skill and command must remain independently visible.
        public = {p for p in tracked if re.fullmatch(r'skills/[^/]+/SKILL\.md|templates/[^/]+\.md', p)}
        self.assertTrue(public)
        self.assertFalse(public - set(provenance.MARKERS))
        for path in provenance.MARKERS:
            self.assertTrue((ROOT / 'plugins/oh-my-gjc' / path).is_file(), path)

    def test_reviewed_allowlist_has_no_online_suite(self):
        expected = {'t1', 't2', 't3', 't4', 't5', 't6', 't7', 'u1', 'u5', 'u7', 'u8', 'u9'}
        numbered = {match[1] for p in ci.ENGINE_SUITES if (match := re.match(r'test_([tu]\d+)', p))}
        self.assertEqual(numbered, expected)
        self.assertEqual({p for p in ci.ENGINE_SUITES if not re.match(r'test_[tu]\d+', p)},
                         {'test_search_completeness.py', 'test_search_outputs.py', 'test_public_captions.py'})
        self.assertEqual(len(ci.ENGINE_SUITES), 15)
        for name in ci.ENGINE_SUITES:
            self.assertTrue((ROOT / ci.ENGINE / name).is_file())
        self.assertNotIn('test_u4.py', ci.ENGINE_SUITES)
        self.assertNotIn('test_smoke.py', ci.ENGINE_SUITES)

    def test_lock_and_official_wheel_records_agree(self):
        wheels = json.loads((HERE / 'dependency-wheels.json').read_text())['wheels']
        locked = ci.lock_versions()
        self.assertTrue(locked)
        self.assertEqual({p['name']: p['version'] for p in wheels}, locked)
        contents = (HERE / 'requirements-ci.lock').read_text()
        for wheel in wheels:
            self.assertIn('--hash=sha256:' + wheel['sha256'], contents)
            self.assertTrue(wheel['url'].startswith('https://files.pythonhosted.org/'))
        direct = dict(re.findall(r'^([\w.-]+)==([^\s]+)', (HERE / 'requirements-ci.in').read_text(), re.M))
        normalized = {k.lower().replace('_', '-'): v for k, v in locked.items()}
        for name, version in direct.items():
            self.assertEqual(normalized[name.lower().replace('_', '-')], version)
        self.assertEqual(normalized['yt-dlp'], '2026.8.19')
        for forbidden in ('playwright', 'openai', 'pytest', 'pymupdf'):
            self.assertNotIn(forbidden, normalized)

    def test_workflow_uses_only_verified_full_action_shas(self):
        pins = ci.read_pins()
        workflow = (ROOT / '.github/workflows/test.yml').read_text()
        used = re.findall(r'uses: ([\w/-]+)@([^\s]+)', workflow)
        self.assertTrue(used)
        for name, sha in used:
            self.assertRegex(sha, r'^[0-9a-f]{40}$')
            self.assertEqual(pins['actions'][name]['sha'], sha)
        self.assertIn(f"python-version: '{pins['python']}'", workflow)
        self.assertIn(f"bun-version: '{pins['bun']}'", workflow)
        self.assertIn('if: always()', workflow)
        self.assertIn('if-no-files-found: error', workflow)
        self.assertNotIn('continue-on-error', workflow)

    def test_casebank_is_data_with_positive_and_negative_cases_per_skill(self):
        bank = json.loads((HERE / 'skill-activation-casebank.json').read_text())
        self.assertEqual(bank['evaluation'], 'manual-or-optional-model')
        ids = [c['id'] for c in bank['cases']]
        self.assertEqual(len(ids), len(set(ids)))
        for skill in ('extragoal', 'gpt-image', 'insane-review', 'insane-search', 'no-english'):
            cases = [c for c in bank['cases'] if c['skill'] == skill]
            self.assertEqual({c['expected_load'] for c in cases}, {True, False})
            for case in cases:
                self.assertTrue(case['prompt'])
                self.assertTrue(case['reason'])
                self.assertTrue((ROOT / case['source']).is_file())


class SandboxLaneTest(unittest.TestCase):
    def test_bad_download_hash_is_never_published(self):
        import run_sandbox_ci as sandbox
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'gjc'
            with mock.patch.object(sandbox.urllib.request, 'urlopen', return_value=io.BytesIO(b'wrong executable')):
                with self.assertRaisesRegex(ValueError, 'SHA256 mismatch'):
                    sandbox.download_verified({'url': 'https://example.test/tool', 'sha256': '0' * 64}, destination)
            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_suffix('.part').exists())

    def test_verified_download_records_hash_before_execution(self):
        import run_sandbox_ci as sandbox
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'gjc'
            data = b'fixture'
            digest = sandbox.hashlib.sha256(data).hexdigest()
            with mock.patch.object(sandbox.urllib.request, 'urlopen', return_value=io.BytesIO(data)):
                result = sandbox.download_verified({'url': 'https://example.test/tool', 'sha256': digest, 'version': 'fixture'}, destination)
            self.assertEqual(result['sha256'], digest)
            self.assertEqual(destination.read_bytes(), data)
            self.assertFalse(destination.stat().st_mode & 0o111)

    def test_missing_namespace_support_is_a_failure(self):
        import run_sandbox_ci as sandbox
        for report in ({}, {'available': True}, {'available': False, 'isolation': {'status': 'available'}}):
            with self.subTest(report=report), self.assertRaises(RuntimeError):
                sandbox.require_probe(report)
        sandbox.require_probe({'available': True, 'isolation': {'status': 'available'}})

    def test_empty_or_duplicate_integration_evidence_is_rejected(self):
        import run_sandbox_ci as sandbox
        for report in ({}, {'ok': True}, {'ok': True, 'skills': [{'name': 'extragoal'}] * 5, 'commands': [{}] * 23}):
            with self.subTest(report=report), self.assertRaises(RuntimeError):
                sandbox.require_integration(report)


    def test_complete_integration_and_inconsistent_coverage(self):
        import copy
        import run_sandbox_ci as sandbox
        names = ['omg', 'omg:setup', 'omg:no-english', 'omg:insane-review', 'omg:gpt-image']
        cases = [(n, v) for n in names for v in ('no-args', 'arguments', 'quoted-args', 'literal-args')]
        cases += [('omg:no-english', v) for v in ('on', 'off', 'status')]
        report = {'ok': True,
            'skills': [{'name': n, 'request_chars': 2000} for n in
                ('extragoal', 'gpt-image', 'insane-review', 'insane-search', 'no-english')],
            'commands': [{'name': n, 'variant': v, 'expanded': True, 'arguments_verified': True} for n, v in cases],
            'coverage': {'skill_injection': {'status': 'passed', 'expected': 5, 'passed': 5},
                         'public_commands': {'status': 'passed', 'expected': 23, 'passed': 23}},
            'sandbox': {'bubblewrap': True, 'network_namespace': 'isolated-loopback-only',
                        'host_home_masked': True, 'suite_read_only': True, 'workspace_writable': True,
                        'provider': 'local-responses-stub', 'paid_calls': 0}}
        sandbox.require_integration(report)
        changes = (
            lambda r: r['coverage']['public_commands'].update(passed=5),
            lambda r: r['coverage']['skill_injection'].update(passed=4),
            lambda r: r['commands'].pop(),
            lambda r: r['commands'][0].update(arguments_verified=False),
            lambda r: r['commands'][0].update(expanded=False),
            lambda r: r['sandbox'].update(paid_calls=1),
        )
        for change in changes:
            bad = copy.deepcopy(report)
            change(bad)
            with self.assertRaises(RuntimeError):
                sandbox.require_integration(bad)


if __name__ == '__main__':
    unittest.main()
