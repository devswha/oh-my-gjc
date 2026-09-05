#!/usr/bin/env python3
"""Opt-in pinned GJC integration. Downloads only into its new evidence directory."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import sys
import tempfile
import urllib.request

import run_ci as ci


def download_verified(spec: dict, destination: Path) -> dict:
    """Never execute or publish downloaded bytes before checking the pinned digest."""
    digest = hashlib.sha256()
    partial = destination.with_suffix('.part')
    try:
        with urllib.request.urlopen(spec['url'], timeout=60) as response, partial.open('xb') as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        actual = digest.hexdigest()
        if actual != spec['sha256']:
            raise ValueError(f"SHA256 mismatch for {destination.name}: expected {spec['sha256']}, got {actual}")
        partial.rename(destination)
        return {'url': spec['url'], 'sha256': actual, 'version': spec['version']}
    finally:
        partial.unlink(missing_ok=True)


def load_command_json(path: Path) -> dict:
    # execute() writes exactly one JSON-quoted argv header, then combined output.
    return json.loads(path.read_text().split('\n', 1)[1])


def require_probe(report: dict) -> None:
    if report.get('available') is not True or report.get('isolation', {}).get('status') != 'available':
        raise RuntimeError('sandbox prerequisites/namespace probe unavailable; no integration coverage')


def require_integration(report: dict) -> None:
    if report.get('ok') is not True:
        raise RuntimeError('sandbox did not report success')
    skills = report.get('skills', [])
    commands = report.get('commands', [])
    expected_skills = {'extragoal', 'gpt-image', 'insane-review', 'insane-search', 'no-english'}
    names = {'omg', 'omg:setup', 'omg:no-english', 'omg:insane-review', 'omg:gpt-image'}
    expected = {(name, variant) for name in names for variant in
                ('no-args', 'arguments', 'quoted-args', 'literal-args')}
    expected.update(('omg:no-english', variant) for variant in ('on', 'off', 'status'))
    if len(skills) != 5 or {s.get('name') for s in skills} != expected_skills:
        raise RuntimeError('sandbox returned incomplete skill evidence')
    if len(commands) != len(expected) or {(c.get('name'), c.get('variant')) for c in commands} != expected:
        raise RuntimeError('sandbox returned incomplete command evidence')
    if any(c.get('expanded') is not True or c.get('arguments_verified') is not True for c in commands):
        raise RuntimeError('sandbox command expansion/arguments were not verified')
    coverage = report.get('coverage', {})
    for key, count in (('skill_injection', 5), ('public_commands', len(expected))):
        if coverage.get(key) != {'status': 'passed', 'expected': count, 'passed': count}:
            raise RuntimeError(f'sandbox {key} coverage is incomplete or inconsistent')
    if any(s.get('request_chars', 0) <= 1000 for s in skills):
        raise RuntimeError('sandbox skill injection evidence is empty or truncated')
    sandbox = report.get('sandbox', {})
    required = {'bubblewrap': True, 'network_namespace': 'isolated-loopback-only',
                'host_home_masked': True, 'suite_read_only': True,
                'workspace_writable': True, 'provider': 'local-responses-stub', 'paid_calls': 0}
    if any(sandbox.get(key) != value for key, value in required.items()):
        raise RuntimeError('sandbox isolation/provider evidence does not match the CI contract')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path, help='new evidence directory')
    args = parser.parse_args(argv)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    report = {'schema_version': 1, 'lane': 'pinned-gjc-sandbox', 'steps': [],
              'versions': {'python': platform.python_version(), 'platform': platform.platform()},
              'coverage': {'integration': 'not run', 'nlp_activation': 'not evaluated',
                           'command_behavior': 'not evaluated', 'live_browser': 'not evaluated'}}
    steps = report['steps']
    tools_dir = out / 'tools'
    try:
        pins = ci.read_pins()
        report['pins'] = pins
        report['source'] = ci.source_identity()
        if platform.python_version() != pins['python'] or platform.system() != 'Linux' or platform.machine() != 'x86_64':
            raise RuntimeError('pinned sandbox requires CPython ' + pins['python'] + ' on Linux x86_64')
        tools_dir.mkdir()
        for name, filename in [('gjc', 'gjc'), ('bubblewrap', 'bubblewrap.deb')]:
            spec = pins['sandbox_tools'][name]
            record = download_verified(spec, tools_dir / filename)
            logfile = out / (name + '-download.log')
            logfile.write_text(json.dumps(record, indent=2) + '\n')
            steps.append({'name': name + '-download', 'status': 'passed', 'rc': 0,
                          'log': logfile.name, 'log_sha256': ci.sha256(logfile), **record})
        (tools_dir / 'gjc').chmod(0o755)
        with tempfile.TemporaryDirectory(prefix='omg-ci-', dir='/tmp') as temporary:
            env = ci.isolated_environment(Path(temporary))
            def run(name, command, **kwargs):
                result = ci.execute(name, command, cwd=ci.ROOT, env=env, out=out, **kwargs)
                steps.append(result)
                if result['status'] != 'passed':
                    raise RuntimeError(f"{name} failed rc={result['rc']}; see {result['log']}")
                return result
            # Extract the hash-pinned distro package privately; no apt, sudo or host install.
            run('extract-bubblewrap', ['dpkg-deb', '--extract', str(tools_dir / 'bubblewrap.deb'), str(tools_dir / 'bubblewrap')])
            extracted = tools_dir / 'bubblewrap/usr/bin/bwrap'
            installed = shutil.which('bwrap', path=env['PATH'])
            # Ubuntu's AppArmor profile is attached to /usr/bin/bwrap. Reuse an
            # existing executable only when its bytes equal the hash-pinned package.
            if installed and ci.sha256(Path(installed)) == ci.sha256(extracted):
                bwrap_dir = str(Path(installed).parent)
                report['bubblewrap_source'] = 'existing executable matches pinned package byte-for-byte'
            else:
                bwrap_dir = str(extracted.parent)
                report['bubblewrap_source'] = 'privately extracted pinned executable; namespace support requires probe'
            env['PATH'] = str(tools_dir) + os.pathsep + bwrap_dir + os.pathsep + env['PATH']
            run('tool-versions', [sys.executable, '-c',
                'import json,subprocess; '
                'v={n:subprocess.check_output([n,"--version"],text=True).strip() for n in ["gjc","bwrap"]}; '
                'print(json.dumps(v)); '
                f'assert v["gjc"] == {("gjc/" + pins["sandbox_tools"]["gjc"]["version"])!r}, "GJC version mismatch"; '
                'assert v["bwrap"] == "bubblewrap 0.9.0", "bubblewrap version mismatch"'])
            report['versions'].update(load_command_json(out / 'tool-versions.log'))
            report['binary_sha256'] = {name: ci.sha256(Path(shutil.which(name, path=env['PATH']))) for name in ('gjc', 'bwrap')}
            harness = str(ci.ROOT / 'plugins/oh-my-gjc/bin/skill_sandbox.py')
            result = ci.execute('sandbox-probe', [sys.executable, harness, '--probe-prerequisites'],
                                cwd=ci.ROOT, env=env, out=out, timeout=30)
            steps.append(result)
            report['probe'] = load_command_json(out / 'sandbox-probe.log')
            if result['status'] != 'passed':
                raise RuntimeError('namespace probe failed; integration coverage unavailable')
            require_probe(report['probe'])
            result = ci.execute('sandbox-integration', [sys.executable, harness, '--json'],
                                cwd=ci.ROOT, env=env, out=out, timeout=300)
            steps.append(result)
            report['integration'] = load_command_json(out / 'sandbox-integration.log')
            if result['status'] != 'passed':
                raise RuntimeError('sandbox integration failed; see its JSON coverage and log')
            require_integration(report['integration'])
            report['coverage']['integration'] = 'explicit skill injection and native command expansion passed'
    except Exception as exc:
        steps.append({'name': 'sandbox-ci', 'status': 'failed', 'rc': 1,
                      'error': f'{type(exc).__name__}: {exc}'})
        report['coverage']['integration'] = 'incomplete or unavailable; see failed step/probe'
    finally:
        # Retain evidence, not a 160MB executable, in the upload artifact.
        if tools_dir.is_dir():
            shutil.rmtree(tools_dir)
    return ci.write_summary(out, report)


if __name__ == '__main__':
    sys.exit(main())
