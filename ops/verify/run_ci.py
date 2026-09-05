#!/usr/bin/env python3
"""Run the reviewed CI inventory, keeping command RCs and coverage gaps explicit."""
from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ENGINE = 'plugins/oh-my-gjc/skills/insane-search/engine/tests'
ENGINE_SUITES = (
    'test_t1_retry.py', 'test_t2_rescue.py', 'test_t3_markdown.py',
    'test_t4_maincontent.py', 'test_t5_pdfplumber.py', 'test_t6_differential.py',
    'test_t7_browser_gate.py', 'test_u1.py', 'test_u5.py', 'test_u7.py',
    'test_u8.py', 'test_u9.py',
    'test_search_completeness.py', 'test_search_outputs.py', 'test_public_captions.py',
)
EXCLUDED = {
    f'{ENGINE}/test_smoke.py': 'online endpoint smoke tests; outside the reviewed offline inventory',
    f'{ENGINE}/test_u4.py': 'contains real SessionPool/root warmup requests; not an offline suite',
    'skill-activation-casebank.json': 'manual/optional model evaluation; stub loading does not prove NLP activation',
    'live-browser-canaries': 'requires a dedicated logged-in browser; no browser or paid calls in CI',
    'local-installer-real-gjc': 'separate blocked-network root install reproduction requires explicit OMG_REAL_GJC; fixture installer tests run here',
}
IMPORTS = ('curl_cffi', 'bs4', 'yaml', 'markdownify', 'pypdf', 'pdfplumber', 'yt_dlp',
           'resiliparse.extract.html2text', 'resiliparse.parse.html')
SKIP_LINE = re.compile(r'^\s*(?:⚠\s*)?skipped\s*:', re.I)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_pins() -> dict:
    return json.loads((HERE / 'pins.json').read_text())


def lock_versions() -> dict[str, str]:
    return dict(re.findall(r'^([\w.-]+)==([^\s]+)',
                           (HERE / 'requirements-ci.lock').read_text(), re.M))


def check_dependencies() -> dict:
    """Check real imports, not only package metadata or optional-import fallbacks."""
    versions, errors = {}, []
    for name, expected in lock_versions().items():
        try:
            actual = importlib.metadata.version(name)
            versions[name] = actual
            if actual != expected:
                errors.append(f'{name}: expected {expected}, got {actual}')
        except importlib.metadata.PackageNotFoundError:
            errors.append(f'{name}: missing (required {expected})')
    for name in IMPORTS:
        try:
            importlib.import_module(name)
        except Exception as exc:
            errors.append(f'{name}: import failed: {type(exc).__name__}: {exc}')
    return {'versions': versions, 'errors': errors}


def parse_test_output(output: str) -> dict:
    """Recognize test-runner summaries; do not treat prose about skipped routes as skips."""
    skips = [line.strip() for line in output.splitlines() if SKIP_LINE.match(line)]
    counts = {}
    matches = re.findall(r'(?m)^\s*(\d+) (pass|fail|skip|todo)\s*$', output)
    if matches:
        counts = {key: int(value) for value, key in matches}
        if counts.get('skip', 0) or counts.get('todo', 0):
            skips.append(f'Bun skipped/todo: {counts}')
    match = re.search(r'Ran (\d+) tests? in ', output)
    if match:
        counts['tests'] = int(match[1])
    match = re.search(r'(?m)^OK: (\d+)/(\d+) passed\s*$', output)
    if match:
        counts.update(passed=int(match[1]), tests=int(match[2]))
    match = re.search(r'(?m)^(\d+) passed, (\d+) failed\s*$', output)
    if match:
        counts.update(passed=int(match[1]), failed=int(match[2]),
                      tests=int(match[1]) + int(match[2]))
    match = re.search(r'(?m)^OK \(skipped=(\d+)\)', output)
    if match and int(match[1]):
        skips.append(f'unittest skipped={match[1]}')
    return {'counts': counts, 'skips': skips}


def execute(name: str, command: list[str], *, cwd: Path, env: dict,
            out: Path, timeout: float = 300, test_output: bool = False) -> dict:
    """Save partial output even on launch errors/timeouts; kill the whole process group."""
    logfile = out / f'{name}.log'
    started = time.monotonic()
    rc, error, timed_out = 127, None, False
    with logfile.open('w') as log:
        log.write('$ ' + json.dumps(command) + '\n')
        log.flush()
        try:
            process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                       stderr=subprocess.STDOUT, start_new_session=True)
            try:
                rc = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                rc, error = 124, f'timeout after {timeout}s (process group killed)'
        except OSError as exc:
            error = f'{type(exc).__name__}: {exc}'
        if error:
            log.write(error + '\n')
    output = logfile.read_text(errors='replace')
    parsed = parse_test_output(output) if test_output else {'counts': {}, 'skips': []}
    if test_output and not parsed['counts']:
        error = error or 'test runner produced no recognized test-count summary'
    if test_output and not any(parsed['counts'].get(k, 0) for k in ('tests', 'pass')):
        error = error or 'test runner executed zero tests'
    if test_output and any(parsed['counts'].get(key, 0) for key in ('fail', 'failed')):
        error = error or 'test runner reported failures despite its process exit status'
    failed = rc != 0 or bool(parsed['skips']) or bool(error)
    result = {'name': name, 'command': command, 'cwd': str(cwd), 'rc': rc,
              'status': 'failed' if failed else 'passed', 'error': error,
              'timed_out': timed_out, 'seconds': round(time.monotonic() - started, 3),
              'log': logfile.name, 'log_sha256': sha256(logfile), **parsed}
    print(output, end='', flush=True)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return result


def omitted(name: str, reason: str, *, status: str = 'skipped') -> dict:
    return {'name': name, 'status': status, 'rc': None, 'reason': reason}


def write_summary(out: Path, report: dict) -> int:
    report['rc'] = int(any(step['status'] in ('failed', 'blocked') for step in report['steps']))
    report['status'] = 'failed' if report['rc'] else 'passed-with-explicit-exclusions'
    report['skips'] = [step for step in report['steps'] if step['status'] == 'skipped']
    path = out / 'summary.json'
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(f"CI {report['status']} rc={report['rc']}; evidence: {path}", flush=True)
    return report['rc']


def isolated_environment(scratch: Path) -> dict:
    """Never pass the caller's credentials/provider settings into disposable tests."""
    env = {'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ.get('PATH', ''),
           'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TERM': 'dumb', 'NO_COLOR': '1',
           'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1',
           'PYTHONUNBUFFERED': '1', 'PYTHONHASHSEED': '0',
           'GJC_NOTIFICATIONS': '0', 'GJC_SDK_DISABLE': '1',
           'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
    for key, directory in {'HOME': 'home', 'TMPDIR': 'tmp', 'XDG_CONFIG_HOME': 'config',
                           'XDG_CACHE_HOME': 'cache', 'XDG_DATA_HOME': 'data',
                           'XDG_STATE_HOME': 'state', 'PYTHONPYCACHEPREFIX': 'pycache'}.items():
        path = scratch / directory
        path.mkdir()
        env[key] = str(path)
    return env


def source_identity() -> dict:
    # Reuse the existing descriptor-walk + full-tree aggregate implementation.
    # This is a working-tree identity, NOT an installed-cache/HEAD attestation.
    import record_provenance as provenance
    plugin = ROOT / 'plugins/oh-my-gjc'
    fd = provenance.open_directory_chain(str(plugin), 'CI plugin input')
    try:
        tree = provenance.walk_payload_tree(fd, 'CI plugin input')
        payloads = {p: provenance.read_regular_file_at(fd, p, 'CI plugin input')
                    for p in tree['files']}
    finally:
        os.close(fd)
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True,
                          text=True, check=True).stdout.strip()
    return {'git_head': head, 'plugin_file_count': len(payloads),
            'plugin_working_tree_sha256': provenance.payload_aggregate_digest(payloads),
            'kind': 'working-tree snapshot; use record_provenance.py for installed-cache attestation',
            'files': {str(p.relative_to(ROOT)): sha256(p) for p in
                      [ROOT / '.github/workflows/test.yml', *sorted(HERE.glob('*.py')),
                       *sorted(HERE.glob('*.json')), *sorted(HERE.glob('requirements-ci.*'))]}}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='new evidence directory')
    parser.add_argument('--install-deps', action='store_true', help='explicit hash-locked pip install into this venv')
    args = parser.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    report = {'schema_version': 1, 'lane': 'offline', 'versions': {}, 'steps': [],
              'coverage': {'nlp_activation': 'not evaluated', 'live_browser': 'not evaluated'}}
    steps = report['steps']
    try:
        pins = read_pins()
        report['pins'] = pins
        report['source'] = source_identity()
        report['versions'].update(python=platform.python_version(), platform=platform.platform(),
                                  runner_image=os.environ.get('ImageVersion', 'local'))
        # Outside the checkout: non-Git fixtures must not discover its parent Git root.
        # A short path also keeps Unix-domain socket fixtures below Linux's limit.
        with tempfile.TemporaryDirectory(prefix='omg-ci-', dir='/tmp') as temporary:
            env = isolated_environment(Path(temporary))
            def run(name, command, **kwargs):
                result = execute(name, command, cwd=ROOT, env=env, out=out, **kwargs)
                steps.append(result)
                return result

            prereqs = run('runtime-versions', [sys.executable, '-c',
                'import json,platform,shutil,subprocess; '
                'names=["bun","git","bash","grep"]; '
                'assert all(shutil.which(n) for n in names), "required binary missing"; '
                'v={n:subprocess.check_output([n,"--version"],text=True).splitlines()[0] for n in names}; '
                'v["python"]=platform.python_version(); print(json.dumps(v)); '
                f'assert v["bun"] == {pins["bun"]!r}, "Bun version mismatch"; '
                f'assert v["python"] == {pins["python"]!r}, "Python version mismatch"'])
            for line in (out / 'runtime-versions.log').read_text().splitlines():
                if line.startswith('{'):
                    report['versions'].update(json.loads(line))
            if args.install_deps:
                if sys.prefix == sys.base_prefix:
                    steps.append(omitted('install-dependencies', '--install-deps requires a dedicated venv', status='blocked'))
                elif prereqs['status'] == 'passed':
                    run('install-dependencies', [sys.executable, '-m', 'pip', '--isolated', 'install',
                        '--disable-pip-version-check', '--no-cache-dir', '--require-hashes',
                        '--only-binary=:all:', '--index-url', 'https://pypi.org/simple',
                        '-r', str(HERE / 'requirements-ci.lock'), '--report', str(out / 'pip-install.json')])
                else:
                    steps.append(omitted('install-dependencies', 'runtime prerequisites failed', status='blocked'))
            dependency = run('dependencies', [sys.executable, str(__file__), '_dependencies'])
            for line in (out / 'dependencies.log').read_text().splitlines():
                if line.startswith('{'):
                    report['dependencies'] = json.loads(line)
            run('provenance-and-orchestration', [sys.executable, '-m', 'unittest', '-v',
                'ops.verify.test_record_provenance', 'ops.verify.test_ci'], test_output=True)
            if prereqs['status'] == 'passed' and dependency['status'] == 'passed':
                run('static', [sys.executable, str(__file__), '_static'])
                # File allowlist avoids the real sandbox test's environment-dependent skip.
                # That integration coverage is explicitly reported below.
                bun_files = sorted(str(p.relative_to(ROOT)) for p in (ROOT / 'plugins/oh-my-gjc/test').glob('*.test.ts')
                                   if p.name != 'skill-sandbox.test.ts')
                if not bun_files:
                    raise RuntimeError('no Bun tests found')
                run('sandbox-fixtures', [sys.executable, '-m', 'unittest', 'discover',
                    '-s', 'plugins/oh-my-gjc/test', '-p', 'skill_sandbox_test.py', '-v'], test_output=True)
                run('bun', ['bun', 'test', *bun_files], timeout=600, test_output=True)
                for filename in ENGINE_SUITES:
                    run(filename.removesuffix('.py'), [sys.executable, str(ROOT / ENGINE / filename)],
                        timeout=120, test_output=True)
            else:
                for name in ('static', 'sandbox-fixtures', 'bun', *ENGINE_SUITES):
                    steps.append(omitted(name, 'required runtime/dependency preflight failed', status='blocked'))
            import shutil
            missing = [name for name in ('gjc', 'bwrap') if not shutil.which(name, path=env['PATH'])]
            report['coverage']['gjc_sandbox'] = {'status': 'not run in offline lane', 'missing_prerequisites': missing,
                'reason': 'real GJC/bubblewrap integration is separate from offline and NLP activation evaluation'}
            steps.append(omitted('skill-sandbox.test.ts',
                'separate real GJC/bubblewrap integration; missing prerequisites: ' + (', '.join(missing) or 'none (lane intentionally separate)')))
    except Exception as exc:
        steps.append({'name': 'orchestrator', 'status': 'failed', 'rc': 1,
                      'error': f'{type(exc).__name__}: {exc}'})
    steps.extend(omitted(name, reason) for name, reason in EXCLUDED.items())
    return write_summary(out, report)


def static_checks() -> int:
    import record_provenance as provenance
    catalog = json.loads((ROOT / '.claude-plugin/marketplace.json').read_text())
    manifest = json.loads((ROOT / 'plugins/oh-my-gjc/.claude-plugin/plugin.json').read_text())
    provenance.validate_marketplace(catalog, manifest)
    for path in [ROOT / 'install.sh', *sorted((ROOT / 'plugins/oh-my-gjc/bin').glob('*.sh'))]:
        subprocess.run(['bash', '-n', str(path)], check=True)
    # compile() checks syntax without writing into the plugin payload.
    for path in [*sorted(HERE.glob('*.py')), *sorted((ROOT / 'plugins/oh-my-gjc/bin').glob('*.py')),
                 *sorted((ROOT / 'plugins/oh-my-gjc/skills/insane-search/engine').rglob('*.py'))]:
        compile(path.read_bytes(), str(path), 'exec')
    print('manifest parity, shell syntax, and Python syntax passed')
    return 0


if __name__ == '__main__':
    if sys.argv[1:] == ['_dependencies']:
        result = check_dependencies()
        print(json.dumps(result))
        sys.exit(bool(result['errors']))
    if sys.argv[1:] == ['_static']:
        sys.exit(static_checks())
    sys.exit(main())
