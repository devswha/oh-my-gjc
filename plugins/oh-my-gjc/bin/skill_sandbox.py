#!/usr/bin/env python3
"""Run every shipped OMG skill through real GJC inside a bubblewrap sandbox.

Normal verification is deterministic and offline: GJC talks only to the local
Responses-API stub in this process. The test proves plugin installation, command
or skill activation, prompt injection, filesystem confinement, and process exit.
It never calls a paid model, CDP, or the public network.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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
                    "text": "샌드박스 스킬 로딩을 확인했습니다.",
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
                "delta": "샌드박스 스킬 로딩을 확인했습니다.",
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
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"sandbox command failed ({result.returncode}): {detail}")
    return result


def request_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def run_suite() -> dict[str, Any]:
    bubblewrap = require_binary("bwrap")
    gjc = require_binary("gjc")
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

        # Prove the workspace is writable while the suite and host homes are not.
        run_checked(bwrap_command(
            **base,
            command=[
                "/bin/sh", "-c",
                (
                    "touch sandbox-write-ok && "
                    "test ! -e \"$OMG_HOST_HOME\" && "
                    "! touch /mnt/omg-sandbox/suite/.sandbox-escape 2>/dev/null"
                ),
            ],
        ))

        reports = []
        capture = sandbox / "workspace" / "request.json"
        ready = capture.with_name(".stub-ready")
        for case in CASES:
            capture.unlink(missing_ok=True)
            ready.unlink(missing_ok=True)
            script = (
                "set -eu; "
                "python3 /mnt/omg-sandbox/suite/plugins/oh-my-gjc/bin/skill_sandbox.py "
                "--serve-stub --capture /mnt/omg-sandbox/workspace/request.json "
                f"--port {port} & server=$!; "
                "trap 'kill \"$server\" 2>/dev/null || true' EXIT; "
                "i=0; while [ ! -f /mnt/omg-sandbox/workspace/.stub-ready ]; do "
                "i=$((i + 1)); [ \"$i\" -lt 200 ] || exit 1; sleep 0.01; done; "
                "/mnt/omg-sandbox/bin/gjc -p --no-session --no-tools --no-mcp "
                "--model openai/gpt-4o-mini \"$1\"; rc=$?; "
                "kill \"$server\" 2>/dev/null || true; wait \"$server\" 2>/dev/null || true; "
                "exit \"$rc\""
            )
            run_checked(bwrap_command(
                **base,
                command=["/bin/sh", "-c", script, "skill-probe", case.invocation],
            ))
            if not capture.is_file():
                raise RuntimeError(f"skill {case.name!r} made no local model request")
            payload = json.loads(capture.read_text(encoding="utf-8"))
            text = request_text(payload)
            if case.marker not in text:
                raise RuntimeError(
                    f"skill {case.name!r} was not injected; missing marker {case.marker!r}"
                )
            reports.append({
                "name": case.name,
                "invocation": case.invocation.split()[0],
                "marker": case.marker,
                "request_chars": len(text),
            })

        if (suite / ".sandbox-escape").exists():
            raise RuntimeError("sandbox modified the read-only suite")
        return {
            "ok": True,
            "plugin": "oh-my-gjc@oh-my-gjc",
            "skills": reports,
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
    parser.add_argument("--serve-stub", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--capture", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--port", type=int, default=18765, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve_stub:
        if args.capture is None:
            parser.error("--serve-stub requires --capture")
        return serve_stub(args.capture, args.port)
    try:
        report = run_suite()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        report = {"ok": False, "error": str(error)}
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        names = ", ".join(skill["name"] for skill in report["skills"])
        print(f"skill sandbox PASS: {names}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
