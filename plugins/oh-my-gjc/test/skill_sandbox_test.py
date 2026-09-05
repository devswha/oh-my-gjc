"""Sandbox contract regressions that run without GJC or bubblewrap installed."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


HARNESS = Path(__file__).resolve().parents[1] / "bin" / "skill_sandbox.py"
spec = importlib.util.spec_from_file_location("skill_sandbox", HARNESS)
sandbox = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = sandbox
spec.loader.exec_module(sandbox)


def request(text: str) -> dict:
    return {"input": [{"role": "user", "content": [{"type": "input_text", "text": text}]}]}


class CommandContractTests(unittest.TestCase):
    def test_all_public_commands_have_empty_plain_quoted_and_literal_arguments(self):
        for name in ("omg", "omg:setup", "omg:no-english", "omg:insane-review", "omg:gpt-image"):
            with self.subTest(command=name):
                variants = {case.variant for case in sandbox.COMMAND_CASES if case.name == name}
                self.assertTrue({"no-args", "arguments", "quoted-args", "literal-args"} <= variants)
        toggles = {case.arguments for case in sandbox.COMMAND_CASES if case.name == "omg:no-english"}
        self.assertTrue({"", "on", "off", "status"} <= toggles)

    def test_full_body_and_all_placeholder_occurrences_are_required(self):
        case = sandbox.CommandCase("omg:gpt-image", "quoted", "'한글  공백'", "한글  공백")
        body = '# /omg:gpt-image\n입력 인자: `$ARGUMENTS`\nrun -- "$ARGUMENTS"'
        expected = '# /omg:gpt-image\n입력 인자: `한글  공백`\nrun -- "한글  공백"'
        report = sandbox.check_command(case, body, request(expected))
        self.assertTrue(report["expanded"])
        self.assertTrue(report["arguments_verified"])
        self.assertEqual(report["expanded_arguments"], "한글  공백")
        for bad in (
            case.invocation,  # Public slash-command text alone is not expansion.
            "# /omg:gpt-image",  # A marker alone is not expansion.
            body,  # Unexpanded placeholders.
            expected.replace('run -- "한글  공백"', 'run -- "$ARGUMENTS"'),
            expected.replace("한글  공백", "한글 공백"),  # Argument spaces matter.
            expected[:-1],  # Truncated body.
            "unrelated stdin\n" + expected,
            expected + "\nextra instructions",
        ):
            with self.subTest(bad=bad), self.assertRaisesRegex(RuntimeError, "expansion/argument mismatch"):
                sandbox.check_command(case, body, request(bad))

    def test_empty_arguments_substitute_empty_and_no_placeholder_appends(self):
        empty = sandbox.CommandCase("omg", "no-args", "", "")
        report = sandbox.check_command(empty, "# /omg\n`$ARGUMENTS`", request("# /omg\n``"))
        self.assertEqual(report["argument_mode"], "substitution")
        args = sandbox.CommandCase("omg", "args", "한글", "한글")
        report = sandbox.check_command(args, "# /omg", request("# /omg\n\n한글"))
        self.assertEqual(report["argument_mode"], "append")
        with self.assertRaises(RuntimeError):
            sandbox.check_command(args, "# /omg", request("# /omg"))

    def test_table_padding_allowance_never_normalizes_arguments_or_code(self):
        case = sandbox.CommandCase("omg", "args", "'한글 |  공백'", "한글 |  공백")
        body = "# /omg\n$ARGUMENTS\n| A | B |\n|---|---|\n```\n| keep | spaces |\n```"
        expected = "# /omg\n한글 |  공백\n|A|B|\n|---|---|\n```\n| keep | spaces |\n```"
        report = sandbox.check_command(case, body, request(expected))
        self.assertEqual(report["body_format"], "compact-markdown-tables")
        for bad in (expected.replace("한글 |  공백", "한글|공백"),
                    expected.replace("| keep | spaces |", "|keep|spaces|"),
                    expected.replace("|A|B|", "|wrong|B|")):
            with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                sandbox.check_command(case, body, request(bad))

    def test_only_current_user_text_can_prove_expansion(self):
        case = sandbox.CommandCase("omg", "no-args", "", "")
        expected = "# /omg\nactual body"
        payload = {
            "instructions": expected,
            "tools": [{"description": expected}],
            "input": [
                {"role": "user", "content": expected},
                {"role": "assistant", "content": expected},
                {"role": "user", "content": case.invocation},
            ],
        }
        with self.assertRaises(RuntimeError):
            sandbox.check_command(case, expected, payload)
        self.assertEqual(sandbox.latest_user_text(payload), "/omg")
        for payload in ({"instructions": expected}, {"input": []}, {"input": [None]},
                        {"input": [{"role": "user", "content": expected},
                                   {"role": "user", "content": []}]}):
            with self.subTest(payload=payload), self.assertRaises(RuntimeError):
                sandbox.latest_user_text(payload)

    def test_html_comment_stripping_inside_code_is_not_a_formatting_allowance(self):
        case = sandbox.CommandCase("omg:setup", "no-args", "", "")
        body = "# /omg:setup\n```python\npattern = r'^<!-- marker -->$'\n```"
        corrupted = "# /omg:setup\n```python\npattern = r'^$'\n```"
        with self.assertRaisesRegex(RuntimeError, "expansion/argument mismatch"):
            sandbox.check_command(case, body, request(corrupted))

    def test_command_frontmatter_is_not_part_of_the_expanded_body(self):
        with tempfile.TemporaryDirectory() as temporary:
            command = Path(temporary) / "omg.md"
            command.write_text('---\ndescription: ignored\n---\n\n# /omg\n$ARGUMENTS\n')
            self.assertEqual(sandbox.command_body(command), "# /omg\n$ARGUMENTS")
            for bad in ("# no frontmatter", "---\nnever closed", "---\n---\n"):
                command.write_text(bad)
                with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                    sandbox.command_body(command)


class PrerequisiteTests(unittest.TestCase):
    def test_each_missing_dependency_is_explicit_and_never_runs_a_child(self):
        for missing in ("gjc", "bwrap"):
            with self.subTest(missing=missing), patch.object(
                sandbox.shutil, "which", side_effect=lambda name: None if name == missing else f"/usr/bin/{name}"
            ), patch.object(sandbox, "run_checked") as run:
                report = sandbox.probe_prerequisites()
                self.assertFalse(report["available"])
                self.assertFalse(report["ok"])
                self.assertEqual(report["status"], "unavailable")
                self.assertFalse(report["prerequisites"][missing]["available"])
                self.assertIn(missing, report["isolation"]["reason"])
                self.assertEqual(report["coverage"]["public_commands"]["status"], "unavailable")
                run.assert_not_called()

    def test_installed_but_unusable_bwrap_is_not_available(self):
        for error in (RuntimeError("unshare: Operation not permitted"),
                      subprocess.TimeoutExpired("bwrap", 10)):
            with self.subTest(error=error), patch.object(
                sandbox, "require_binary", side_effect=lambda name: f"/usr/bin/{name}"
            ), patch.object(sandbox, "run_checked", side_effect=error):
                report = sandbox.probe_prerequisites()
                self.assertTrue(report["prerequisites"]["bwrap"]["available"])
                self.assertFalse(report["available"])
                self.assertEqual(report["isolation"]["status"], "unavailable")

    def test_successful_probe_is_not_integration_or_activation_evidence(self):
        with patch.object(sandbox, "require_binary", side_effect=lambda name: f"/usr/bin/{name}"), \
                patch.object(sandbox, "run_checked") as run:
            report = sandbox.probe_prerequisites()
        self.assertTrue(report["available"])
        self.assertEqual(report["coverage"]["skill_injection"]["status"], "not-run")
        self.assertEqual(report["coverage"]["public_commands"]["passed"], 0)
        self.assertEqual(report["coverage"]["natural_language_activation"]["status"], "not-evaluated")
        self.assertEqual(run.call_args.args[0][-1], "/bin/true")
        self.assertIn("--unshare-net", run.call_args.args[0])

    def test_probe_and_explicit_run_exit_nonzero_without_dependencies(self):
        for args in (["--probe-prerequisites"], ["--json"], []):
            with self.subTest(args=args):
                result = subprocess.run(
                    [sys.executable, str(HARNESS), *args],
                    env={"PATH": "/nonexistent-sandbox-test-bin", "LANG": "C.UTF-8"},
                    stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=10,
                )
                self.assertEqual(result.returncode, 1, result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report["status"], "unavailable")
                self.assertFalse(report["available"])
                self.assertEqual(report["coverage"]["skill_injection"]["passed"], 0)
                self.assertEqual(report["coverage"]["public_commands"]["status"], "unavailable")
                if args != ["--probe-prerequisites"]:
                    self.assertEqual(report["skills"], [])
                    self.assertEqual(report["commands"], [])


class IsolationTests(unittest.TestCase):
    def test_parent_stdin_is_never_forwarded_to_gjc(self):
        with patch.object(sandbox.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as run:
            sandbox.run_checked(["/bin/true"])
        self.assertEqual(run.call_args.kwargs["stdin"], subprocess.DEVNULL)
        self.assertFalse(run.call_args.kwargs.get("shell", False))

    def test_raw_invocation_is_one_argument_to_a_fixed_script(self):
        case = next(case for case in sandbox.COMMAND_CASES if case.variant == "literal-args")
        with tempfile.TemporaryDirectory() as temporary:
            base = {"sandbox": Path(temporary), "port": 18765}
            workspace = base["sandbox"] / "workspace"
            workspace.mkdir()

            def fake_run(command):
                (workspace / "request.json").write_text(json.dumps(request("captured")))
                (workspace / sandbox.STUB_PYTHON_FILE).write_text(json.dumps(sandbox.python_identity()))

            with patch.object(sandbox, "bwrap_command", side_effect=lambda **kwargs: kwargs["command"]), \
                    patch.object(sandbox, "run_checked", side_effect=fake_run) as run:
                sandbox.run_request(base, case.invocation)
            command = run.call_args.args[0]
            self.assertEqual(command[-1], case.invocation)
            self.assertNotIn(case.invocation, command[2])
            self.assertIn('"$1"', command[2])
            self.assertIn("--no-session --no-tools --no-mcp", command[2])
            self.assertIn("unset GJC_SESSION_ID", command[2])

    def test_missing_capture_and_shell_side_effects_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = {"sandbox": Path(temporary), "port": 18765}
            workspace = base["sandbox"] / "workspace"
            workspace.mkdir()
            with patch.object(sandbox, "bwrap_command", return_value=[]), \
                    patch.object(sandbox, "run_checked"):
                # A stale previous case must not count as a fresh model request.
                (workspace / "request.json").write_text(json.dumps(request("stale")))
                with self.assertRaisesRegex(RuntimeError, "made no local model request"):
                    sandbox.run_request(base, "/omg")
                (workspace / sandbox.SHELL_SENTINELS[0]).touch()
                with self.assertRaisesRegex(RuntimeError, "shell-like arguments were executed"):
                    sandbox.run_request(base, "/omg")


class PythonRuntimeTests(unittest.TestCase):
    def test_host_pin_is_not_assumed_to_be_the_stub_interpreter(self):
        host = {"version": "3.12.12", "implementation": "CPython", "executable": "/toolcache/python3"}
        observed = {"version": "3.12.3", "implementation": "CPython", "executable": "/usr/bin/python3.12"}
        with patch.object(sandbox, "python_identity", return_value=host):
            report = sandbox.python_report([observed] * 28)
            probe = sandbox.python_report([])
        self.assertEqual(report["host"], host)
        self.assertEqual(report["sandbox"], observed)
        self.assertFalse(report["version_match"])
        self.assertEqual(report["sandbox_observations"], 28)
        self.assertIsNone(probe["sandbox"])
        self.assertIsNone(probe["version_match"])

    def test_stub_records_its_own_interpreter_before_readiness(self):
        observed = {"version": "3.12.3", "implementation": "CPython", "executable": "/usr/bin/python3.12"}
        with tempfile.TemporaryDirectory() as temporary:
            capture = Path(temporary) / "request.json"
            with patch.object(sandbox, "python_identity", return_value=observed), \
                    patch.object(sandbox, "StubServer") as server:
                def check_ready():
                    self.assertTrue(capture.with_name(".stub-ready").is_file())
                    self.assertEqual(json.loads(capture.with_name(sandbox.STUB_PYTHON_FILE).read_text()), observed)
                server.return_value.serve_forever.side_effect = check_ready
                self.assertEqual(sandbox.serve_stub(capture, 18765), 0)

    def test_stale_missing_malformed_and_changed_runtime_metadata_fail(self):
        observed = {"version": "3.12.3", "implementation": "CPython", "executable": "/usr/bin/python3.12"}
        with tempfile.TemporaryDirectory() as temporary:
            base = {"sandbox": Path(temporary), "port": 18765}
            workspace = base["sandbox"] / "workspace"
            workspace.mkdir()
            runtime_file = workspace / sandbox.STUB_PYTHON_FILE
            for runtime in (None, {}, [], {**observed, "version": 3123}, {**observed, "version": "3.12.12"}):
                runtime_file.write_text(json.dumps(observed))  # Prior case's record must be removed.
                def fake_run(command):
                    (workspace / "request.json").write_text(json.dumps(request("captured")))
                    if runtime is not None:
                        runtime_file.write_text(json.dumps(runtime))
                with self.subTest(runtime=runtime), \
                        patch.object(sandbox, "bwrap_command", return_value=[]), \
                        patch.object(sandbox, "run_checked", side_effect=fake_run), \
                        self.assertRaisesRegex(RuntimeError, "Python runtime"):
                    sandbox.run_request(base, "/omg", stub_runtimes=[observed])


if __name__ == "__main__":
    unittest.main()
