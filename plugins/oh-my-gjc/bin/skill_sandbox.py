#!/usr/bin/env python3
"""Run shipped OMG skills and public commands through isolated real GJC.

Normal verification is deterministic and offline: GJC talks only to the local
Responses-API stub in this process. The test proves plugin installation, explicit
skill injection, native command expansion, filesystem confinement, and process
exit. It does not evaluate natural-language activation or model behavior, and
never calls a paid model, CDP, or the public network.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SkillCase:
    name: str
    invocation: str
    marker: str


CASES = (
    SkillCase("extragoal", "/skill:extragoal sandbox contract probe", "extragoal — 외부 최종 리뷰 게이트"),
    SkillCase("gpt-image", "/skill:gpt-image sandbox contract probe", "GPT Image (ChatGPT Images web)"),
    SkillCase("insane-review", "/skill:insane-review sandbox contract probe", "# insane-review (gjc 포트)"),
    SkillCase("insane-search", "/skill:insane-search sandbox contract probe", "# Insane Search"),
    SkillCase("no-english", "/skill:no-english sandbox contract probe", "No English (한국어 우선 응답)"),
)


@dataclass(frozen=True)
class CommandCase:
    name: str
    variant: str
    arguments: str
    expanded_arguments: str

    @property
    def invocation(self) -> str:
        return f"/{self.name}" + (f" {self.arguments}" if self.arguments else "")


COMMAND_NAMES = ("omg", "omg:setup", "omg:no-english", "omg:insane-review", "omg:gpt-image")
# Input and expected expansion are separate fixtures, not a copy of GJC's parser.
# Grouping quotes are consumed by GJC; literal quotes inside them must survive.
ARGUMENT_VARIANTS = (
    ("no-args", "", ""),
    ("arguments", "sandbox contract probe 한국어", "sandbox contract probe 한국어"),
    ("quoted-args", '''"two words" '한글  공백' '"literal quotes"' "it's literal"''',
     '''two words 한글  공백 "literal quotes" it's literal'''),
    ("literal-args", ''''"보존" café 🦞' $(touch sandbox-dollar-executed) `touch sandbox-backtick-executed` ; echo $HOME | cat > sandbox-redirection-executed''',
     '''"보존" café 🦞 $(touch sandbox-dollar-executed) `touch sandbox-backtick-executed` ; echo $HOME | cat > sandbox-redirection-executed'''),
)
COMMAND_CASES = tuple(
    CommandCase(name, variant, arguments, expanded)
    for name in COMMAND_NAMES
    for variant, arguments, expanded in ARGUMENT_VARIANTS
) + tuple(CommandCase("omg:no-english", option, option, option) for option in ("on", "off", "status"))
SHELL_SENTINELS = (
    "sandbox-dollar-executed", "sandbox-backtick-executed", "sandbox-redirection-executed",
)
STUB_PYTHON_FILE = ".stub-python.json"


def python_identity() -> dict[str, str]:
    return {
        "version": platform.python_version(),
        "implementation": platform.python_implementation(),
        "executable": str(Path(sys.executable).resolve()),
    }


def python_report(observations: list[dict[str, str]]) -> dict[str, Any]:
    host = python_identity()
    observed = observations[0] if observations else None
    return {
        "host": host,
        "sandbox": observed,
        # Equal version strings do not imply the same interpreter build.
        "version_match": host["version"] == observed["version"] if observed else None,
        "sandbox_observations": len(observations),
        "sandbox_source": "actual-stub-process",
    }


def coverage(status: str, skills: int = 0, commands: int = 0) -> dict[str, Any]:
    return {
        "skill_injection": {"status": status, "expected": len(CASES), "passed": skills},
        "public_commands": {"status": status, "expected": len(COMMAND_CASES), "passed": commands},
        "natural_language_activation": {
            "status": "not-evaluated",
            "reason": "The deterministic stub does not select skills; use a separate model evaluation.",
        },
        "command_behavior": {
            "status": "not-evaluated",
            "reason": "Expansion only; the stub neither follows instructions nor calls tools.",
        },
    }


class StubServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, capture: Path, port: int) -> None:
        self.capture = capture
        super().__init__(("127.0.0.1", port), StubHandler)


class StubHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self) -> None:
        if self.path != "/v1/responses" or self.headers.get("authorization") != "Bearer sandbox-key":
            self.send_error(403)
            return
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length))
        if payload.get("stream") is not True:
            self.send_error(400)
            return
        self.server.capture.write_text(  # type: ignore[attr-defined]
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        response = {
            "id": "resp_skill_sandbox",
            "object": "response",
            "created_at": 0,
            "status": "completed",
            "model": "gpt-4o-mini",
            "output": [{
                "id": "msg_skill_sandbox",
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{
                    "type": "output_text",
                    "text": "샌드박스 요청 수신을 확인했습니다.",
                    "annotations": [],
                }],
            }],
            "usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        }
        message = response["output"][0]
        part = message["content"][0]
        # A Responses stream announces its message/content before text deltas.
        # Current GJC ignores orphan deltas even if response.completed repeats them.
        events = [
            {"type": "response.created", "response": {**response, "status": "in_progress", "output": []}},
            {"type": "response.output_item.added", "output_index": 0,
             "item": {**message, "status": "in_progress", "content": []}},
            {"type": "response.content_part.added", "item_id": message["id"],
             "output_index": 0, "content_index": 0, "part": {**part, "text": ""}},
            {
                "type": "response.output_text.delta",
                "delta": part["text"],
                "item_id": "msg_skill_sandbox",
                "output_index": 0,
                "content_index": 0,
            },
            {"type": "response.output_text.done", "item_id": message["id"],
             "output_index": 0, "content_index": 0, "text": part["text"]},
            {"type": "response.content_part.done", "item_id": message["id"],
             "output_index": 0, "content_index": 0, "part": part},
            {"type": "response.output_item.done", "output_index": 0, "item": message},
            {"type": "response.completed", "response": response},
        ]
        for index, event in enumerate(events):
            event["sequence_number"] = index
        body = "".join(
            f"data: {json.dumps(event, ensure_ascii=False)}\n\n" for event in events
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("cache-control", "no-cache")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()

    def log_message(self, *_: object) -> None:
        pass


def serve_stub(capture: Path, port: int) -> int:
    server = StubServer(capture, port)
    ready = capture.with_name(".stub-ready")
    # Record the interpreter actually running the stub. The host harness may
    # use a pinned toolcache Python while isolated PATH selects the system one.
    capture.with_name(STUB_PYTHON_FILE).write_text(
        json.dumps(python_identity()) + "\n", encoding="utf-8",
    )
    ready.write_text("ready\n", encoding="utf-8")
    try:
        server.serve_forever()
    finally:
        ready.unlink(missing_ok=True)
        server.server_close()
    return 0


def require_binary(name: str) -> str:
    resolved = shutil.which(name)
    if resolved is None:
        raise RuntimeError(f"required binary is missing: {name}")
    return str(Path(resolved).resolve())


def bwrap_command(
    *,
    bubblewrap: str,
    gjc: str,
    suite: Path,
    sandbox: Path,
    command: list[str],
    port: int,
) -> list[str]:
    host_home = Path.home().resolve()
    if not host_home.is_dir():
        raise RuntimeError(f"host home is not a directory: {host_home}")
    home = sandbox / "home"
    workspace = sandbox / "workspace"
    for directory in (home, workspace):
        directory.mkdir(parents=True, exist_ok=True)
    command_prefix = [
        bubblewrap,
        "--die-with-parent",
        "--new-session",
        "--unshare-pid",
        "--unshare-ipc",
        "--unshare-uts",
        "--unshare-net",
        "--ro-bind", "/", "/",
        "--proc", "/proc",
        "--dev", "/dev",
        "--tmpfs", "/mnt",
        "--dir", "/mnt/omg-sandbox",
        "--dir", "/mnt/omg-sandbox/bin",
        "--ro-bind", gjc, "/mnt/omg-sandbox/bin/gjc",
        "--dir", "/mnt/omg-sandbox/home",
        "--bind", str(home), "/mnt/omg-sandbox/home",
        "--dir", "/mnt/omg-sandbox/workspace",
        "--bind", str(workspace), "/mnt/omg-sandbox/workspace",
        "--dir", "/mnt/omg-sandbox/suite",
        "--ro-bind", str(suite), "/mnt/omg-sandbox/suite",
        "--tmpfs", "/home",
        "--tmpfs", "/root",
        "--tmpfs", "/run/user",
        "--tmpfs", "/tmp",
        "--clearenv",
        "--unsetenv", "GJC_SESSION_ID",
        "--setenv", "HOME", "/mnt/omg-sandbox/home",
        "--setenv", "XDG_CONFIG_HOME", "/mnt/omg-sandbox/home/config",
        "--setenv", "XDG_DATA_HOME", "/mnt/omg-sandbox/home/data",
        "--setenv", "XDG_STATE_HOME", "/mnt/omg-sandbox/home/state",
        "--setenv", "XDG_RUNTIME_DIR", "/mnt/omg-sandbox/home/runtime",
        "--setenv", "GJC_CODING_AGENT_DIR", "/mnt/omg-sandbox/home/.gjc/agent",
        "--setenv", "PATH", "/mnt/omg-sandbox/bin:/usr/local/bin:/usr/bin:/bin",
        "--setenv", "LANG", "C.UTF-8",
        "--setenv", "OPENAI_API_KEY", "sandbox-key",
        "--setenv", "OPENAI_BASE_URL", f"http://127.0.0.1:{port}/v1",
        "--setenv", "GJC_NOTIFICATIONS", "0",
        "--setenv", "GJC_SDK_DISABLE", "1",
        "--setenv", "OMG_HOST_HOME", str(host_home),
        "--chdir", "/mnt/omg-sandbox/workspace",
        "--",
    ]
    if host_home != Path("/root") and Path("/home") not in host_home.parents:
        insertion = command_prefix.index("--clearenv")
        command_prefix[insertion:insertion] = ["--tmpfs", str(host_home)]
    return [*command_prefix, *command]


def run_checked(command: list[str], *, timeout: int = 45) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command, stdin=subprocess.DEVNULL, capture_output=True,
        text=True, timeout=timeout, check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"sandbox command failed ({result.returncode}): {detail}")
    return result


def request_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def probe_prerequisites() -> dict[str, Any]:
    """Check binaries and actual namespace support, without running/installing GJC."""
    prerequisites = {}
    for name in ("gjc", "bwrap"):
        try:
            prerequisites[name] = {"available": True, "path": require_binary(name)}
        except (OSError, RuntimeError) as error:
            prerequisites[name] = {"available": False, "path": None, "reason": str(error)}
    missing = [name for name, item in prerequisites.items() if not item["available"]]
    isolation = {"status": "not-run", "reason": "Missing required binaries: " + ", ".join(missing)}
    if not missing:
        try:
            with tempfile.TemporaryDirectory(prefix="omg-sandbox-probe-") as temporary:
                run_checked(bwrap_command(
                    bubblewrap=prerequisites["bwrap"]["path"],
                    gjc=prerequisites["gjc"]["path"],
                    suite=Path(__file__).resolve().parents[3],
                    sandbox=Path(temporary), port=18765,
                    command=["/bin/true"],
                ), timeout=10)
            isolation = {"status": "available"}
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            isolation = {"status": "unavailable", "reason": str(error)}
    available = not missing and isolation["status"] == "available"
    return {
        "schema_version": 1,
        "ok": available,
        "available": available,
        "status": "available" if available else "unavailable",
        "prerequisites": prerequisites,
        "isolation": isolation,
        "python": python_report([]),
        "coverage": coverage("not-run" if available else "unavailable"),
    }


def latest_user_text(payload: dict[str, Any]) -> str:
    """Inspect the actual user turn, never markers in instructions or tool metadata."""
    messages = payload.get("input")
    if isinstance(messages, list):
        for message in reversed(messages):
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = message.get("content")
            if isinstance(content, str) and content:
                return content
            if isinstance(content, list):
                texts = [part["text"] for part in content if isinstance(part, dict)
                         and part.get("type") == "input_text" and isinstance(part.get("text"), str)]
                if texts:
                    return "\n".join(texts)
            raise RuntimeError("local request's latest user message has no text")
    raise RuntimeError("local request has no user message")


def command_body(path: Path) -> str:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        raise RuntimeError(f"command is missing frontmatter: {path}")
    for index, line in enumerate(lines[1:], 1):
        if line.strip() == "---":
            body = "".join(lines[index + 1:]).strip()
            if body:
                return body
            break
    raise RuntimeError(f"command has malformed frontmatter or empty body: {path}")


def compact_table_padding(body: str) -> str:
    """Allow table-cell padding removal captured from real GJC 0.16.0 requests.

    Apply only to static template text, BEFORE argument substitution. Never
    normalize received text, argument bytes, code fences, or general whitespace.
    """
    lines = []
    fence = None
    for line in body.split("\n"):
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            delimiter = stripped[0]
            if fence is None:
                fence = delimiter
            elif fence == delimiter:
                fence = None
        if fence is None and line.startswith("|") and line.endswith("|"):
            line = "|".join(cell.strip(" \t") for cell in line.split("|"))
        lines.append(line)
    return "\n".join(lines)


def check_command(case: CommandCase, body: str, payload: dict[str, Any]) -> dict[str, Any]:
    mode = "substitution" if "$ARGUMENTS" in body else "append"
    actual = latest_user_text(payload)
    matched_format = None
    for format_name, template in (("verbatim", body), ("compact-markdown-tables", compact_table_padding(body))):
        expected = (template.replace("$ARGUMENTS", case.expanded_arguments) if mode == "substitution"
                    else template + (f"\n\n{case.expanded_arguments}" if case.expanded_arguments else ""))
        if "$ARGUMENTS" not in actual and actual == expected:
            matched_format = format_name
            break
    if matched_format is None:
        raise RuntimeError(
            f"command /{case.name} ({case.variant}) expansion/argument mismatch; "
            f"expected exact native template body with {mode}"
        )
    return {
        "name": case.name,
        "variant": case.variant,
        "invocation": case.invocation,
        "arguments": case.arguments,
        "expanded_arguments": case.expanded_arguments,
        "argument_mode": mode,
        "body_format": matched_format,
        "expanded_prompt_sha256": hashlib.sha256(actual.encode("utf-8")).hexdigest(),
        "expanded": True,
        "arguments_verified": True,
        "request_chars": len(request_text(payload)),
    }


def run_request(
    base: dict[str, Any], invocation: str, *,
    stub_runtimes: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    workspace = base["sandbox"] / "workspace"
    capture = workspace / "request.json"
    capture.unlink(missing_ok=True)
    capture.with_name(".stub-ready").unlink(missing_ok=True)
    runtime_file = capture.with_name(STUB_PYTHON_FILE)
    runtime_file.unlink(missing_ok=True)
    # The invocation is a positional argument to a fixed script. Never interpolate
    # untrusted text into shell source, eval it, or run a template's instructions.
    script = (
        "set -eu; unset GJC_SESSION_ID; "
        "python3 /mnt/omg-sandbox/suite/plugins/oh-my-gjc/bin/skill_sandbox.py "
        "--serve-stub --capture /mnt/omg-sandbox/workspace/request.json "
        f"--port {base['port']} & server=$!; "
        "trap 'kill \"$server\" 2>/dev/null || true' EXIT; "
        "i=0; while [ ! -f /mnt/omg-sandbox/workspace/.stub-ready ]; do "
        "kill -0 \"$server\"; "
        "i=$((i + 1)); [ \"$i\" -lt 200 ] || exit 1; sleep 0.01; done; "
        "/mnt/omg-sandbox/bin/gjc -p --no-session --no-tools --no-mcp "
        "--model openai/gpt-4o-mini \"$1\"; rc=$?; "
        "kill \"$server\" 2>/dev/null || true; wait \"$server\" 2>/dev/null || true; "
        "exit \"$rc\""
    )
    run_checked(bwrap_command(
        **base, command=["/bin/sh", "-c", script, "sandbox-probe", invocation],
    ))
    for sentinel in SHELL_SENTINELS:
        if (workspace / sentinel).exists():
            raise RuntimeError(f"shell-like arguments were executed: {sentinel}")
    if not capture.is_file():
        raise RuntimeError(f"{invocation.split()[0]!r} made no local model request")
    if not runtime_file.is_file():
        raise RuntimeError("local stub did not record its Python runtime")
    runtime = json.loads(runtime_file.read_text(encoding="utf-8"))
    if not isinstance(runtime, dict) or any(
        not isinstance(runtime.get(key), str) or not runtime[key]
        for key in ("version", "implementation", "executable")
    ):
        raise RuntimeError("local stub recorded malformed Python runtime metadata")
    if stub_runtimes is not None:
        if stub_runtimes and runtime != stub_runtimes[0]:
            raise RuntimeError("local stub Python runtime changed between sandbox cases")
        stub_runtimes.append(runtime)
    payload = json.loads(capture.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("local model request was not a JSON object")
    return payload


def run_suite(prerequisites: dict[str, Any] | None = None) -> dict[str, Any]:
    prerequisites = prerequisites if prerequisites is not None else probe_prerequisites()
    if not prerequisites["available"]:
        raise RuntimeError("sandbox prerequisites unavailable; run --probe-prerequisites for details")
    bubblewrap = prerequisites["prerequisites"]["bwrap"]["path"]
    gjc = prerequisites["prerequisites"]["gjc"]["path"]
    suite = Path(__file__).resolve().parents[3]
    plugin_root = suite / "plugins" / "oh-my-gjc"
    for case in CASES:
        skill = plugin_root / "skills" / case.name / "SKILL.md"
        if not skill.is_file():
            raise RuntimeError(f"missing shipped skill: {skill}")

    with tempfile.TemporaryDirectory(prefix="omg-skill-sandbox-") as temporary:
        sandbox = Path(temporary)
        port = 18765
        base = {
            "bubblewrap": bubblewrap,
            "gjc": gjc,
            "suite": suite,
            "sandbox": sandbox,
            "port": port,
        }
        # The real one-shot installer registers the local marketplace and
        # materializes native commands/skills into the isolated GJC home.
        run_checked(bwrap_command(
            **base,
            command=[
                "/bin/bash", "/mnt/omg-sandbox/suite/install.sh",
                "--candidate-ref", "/mnt/omg-sandbox/suite",
            ],
        ))
        listed = run_checked(bwrap_command(
            **base,
            command=["/mnt/omg-sandbox/bin/gjc", "plugin", "list"],
        ))
        if "oh-my-gjc@oh-my-gjc" not in listed.stdout:
            raise RuntimeError("isolated GJC did not list the installed OMG plugin")
        version = run_checked(bwrap_command(
            **base, command=["/mnt/omg-sandbox/bin/gjc", "--version"],
        )).stdout.strip()
        if not version:
            raise RuntimeError("isolated GJC did not report its version")
        digest = hashlib.sha256()
        with Path(gjc).open("rb") as binary:
            for chunk in iter(lambda: binary.read(1024 * 1024), b""):
                digest.update(chunk)

        # Prove the workspace is writable while the suite and host homes are not.
        run_checked(bwrap_command(
            **base,
            command=[
                "/bin/sh", "-c",
                (
                    "touch sandbox-write-ok && "
                    "test \"$GJC_NOTIFICATIONS\" = 0 && test \"$GJC_SDK_DISABLE\" = 1 && "
                    "test -z \"${GJC_SESSION_ID+x}\" && "
                    "{ test ! -e \"$OMG_HOST_HOME\" || "
                    "{ test -d \"$OMG_HOST_HOME\" && "
                    "omg_home_entries=\"$(ls -A \"$OMG_HOST_HOME\")\" && "
                    "test -z \"$omg_home_entries\"; }; } && "
                    "! touch /mnt/omg-sandbox/suite/.sandbox-escape 2>/dev/null"
                ),
            ],
        ))

        bodies = {}
        for name in COMMAND_NAMES:
            installed = sandbox / "home" / ".gjc" / "agent" / "commands" / f"{name}.md"
            template = plugin_root / "templates" / f"{name.split(':')[-1]}.md"
            if not installed.is_file() or installed.read_bytes() != template.read_bytes():
                raise RuntimeError(f"native /{name} command does not match the shipped template")
            bodies[name] = command_body(installed)

        reports = []
        stub_runtimes = []
        for case in CASES:
            payload = run_request(base, case.invocation, stub_runtimes=stub_runtimes)
            if case.marker not in latest_user_text(payload):
                raise RuntimeError(
                    f"skill {case.name!r} was not injected; missing marker {case.marker!r}"
                )
            reports.append({
                "name": case.name,
                "invocation": case.invocation.split()[0],
                "marker": case.marker,
                "request_chars": len(request_text(payload)),
            })

        commands = [check_command(case, bodies[case.name], run_request(
                        base, case.invocation, stub_runtimes=stub_runtimes,
                    ))
                    for case in COMMAND_CASES]

        if (suite / ".sandbox-escape").exists():
            raise RuntimeError("sandbox modified the read-only suite")
        return {
            **prerequisites,
            "ok": True,
            "status": "passed",
            "plugin": "oh-my-gjc@oh-my-gjc",
            "gjc": {"version": version, "binary_sha256": digest.hexdigest()},
            "python": python_report(stub_runtimes),
            "skills": reports,
            "commands": commands,
            "coverage": coverage("passed", len(reports), len(commands)),
            "sandbox": {
                "bubblewrap": True,
                "network_namespace": "isolated-loopback-only",
                "host_home_masked": True,
                "suite_read_only": True,
                "workspace_writable": True,
                "provider": "local-responses-stub",
                "paid_calls": 0,
            },
            "live_canaries": ["insane-review CDP/ChatGPT", "gpt-image CDP/ChatGPT"],
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--probe-prerequisites", action="store_true",
        help="emit JSON without installing/running GJC; exit 0 if available, 1 otherwise",
    )
    parser.add_argument("--serve-stub", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--capture", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--port", type=int, default=18765, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve_stub:
        if args.capture is None:
            parser.error("--serve-stub requires --capture")
        return serve_stub(args.capture, args.port)
    prerequisites = probe_prerequisites()
    if args.probe_prerequisites:
        print(json.dumps(prerequisites, ensure_ascii=False, indent=2))
        return 0 if prerequisites["available"] else 1
    if not prerequisites["available"]:
        report = {
            **prerequisites,
            "error": "sandbox prerequisites unavailable; no integration coverage was collected",
            "skills": [], "commands": [],
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    try:
        report = run_suite(prerequisites)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        report = {
            **prerequisites, "ok": False, "status": "failed", "error": str(error),
            "coverage": coverage("incomplete"),
        }
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        names = ", ".join(skill["name"] for skill in report["skills"])
        print(f"sandbox PASS: {len(report['skills'])} explicit skill injections ({names}); "
              f"{len(report['commands'])} native command expansion cases across {len(COMMAND_NAMES)} commands")
        print("Natural-language activation and command behavior: not evaluated (deterministic stub).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
