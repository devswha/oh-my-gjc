#!/usr/bin/env python3
"""Regression tests — browser-fallback gate + MCP-stub budget accounting.

Deterministic, network-free (every collaborator is monkeypatched). Locks in
two fixes to fetch_chain._fetch_core:

  Bug 1 — the two roles of TERMINAL_NONSUCCESS are separated:
    * a 429 (rate_limited) stops the TLS grid but MUST still run the browser
      fallback chain (transient — R6 gate / SKILL.md route it to browser/MCP).
    * a 404 (not_found) is a real wall — the browser is skipped.

  Bug 2 — a "gjc_browser" fallback entry is a zero-work stub the engine
    cannot launch from Python. It must be RECORDED in the trace but must NOT
    consume a max_browser_attempts slot, or cloudflare_turnstile's
    [gjc_browser, protocol_stealth_chrome, playwright_real_chrome] would burn
    both slots (max=2) before the real Chrome executor is ever reached.

Run:  python3 engine/tests/test_t7_browser_gate.py
"""
from __future__ import annotations

import os
import sys
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, ROOT)

# Kill the polite grid jitter so the test never really sleeps (read per-call
# from the env inside _fetch_core).
os.environ["INSANE_JITTER_MS_MIN"] = "0"
os.environ["INSANE_JITTER_MS_MAX"] = "0"

import engine.fetch_chain as fc          # noqa: E402
import engine.executor as ex             # noqa: E402
from engine.fetch_chain import Attempt, _fetch_core  # noqa: E402
from engine.validators import Verdict    # noqa: E402


class _FakeResp:
    def __init__(self, url):
        self.text = ""
        self.content = b""
        self.url = url
        self.status_code = 0


class _FakeCand:
    """Minimal stand-in for fetch_chain._Cand (only fields the grid loop reads)."""
    profile_id = "cloudflare_turnstile"
    transform = "original"
    impersonate = "chrome"
    referer = "none"
    known_bad_sizes = None

    def __init__(self, url):
        self.url = url


def _install_common_patches(*, probe_verdict, grid_verdict, fb_order):
    """Patch _fetch_core's collaborators. Returns (restore_fn, browser_calls)."""
    saved = {
        "_run_attempt": fc._run_attempt,
        "detect": fc.detect,
        "_build_plan": fc._build_plan,
        "load_profile": fc.load_profile,
        "ex_run_pw": ex.run_playwright_fallback,
    }
    browser_calls: list[str] = []

    def fake_run_attempt(url, *, phase, **kw):
        att = Attempt(phase=phase, executor="curl_cffi", url=url,
                      url_transform="original", impersonate="chrome", referer="none")
        att.verdict = probe_verdict if phase == "probe" else grid_verdict
        att.status = 429 if att.verdict == Verdict.RATE_LIMITED.value else 0
        return att, _FakeResp(url)

    def fake_detect(resp, profiles=None):
        return [SimpleNamespace(profile_id="cloudflare_turnstile",
                                confidence=0.9, signals=[])]

    def fake_build_plan(url, hits, profiles, device_class, probe_impersonate,
                        probe_referer, priority=None):
        return [_FakeCand(url)]

    def fake_load_profile(pid, profiles=None):
        return {"fallback_when_challenge": list(fb_order)}

    def fake_run_pw(url, *, profile_id, success_selectors=None, device_class="auto",
                    timeout=90, profile_dir=None, force_executor=None):
        browser_calls.append(force_executor)
        att = Attempt(phase="fallback", executor=force_executor, url=url,
                      url_transform="original", impersonate=None, referer="")
        # MCP → zero-work UNKNOWN stub; real executors here also "fail" (UNKNOWN)
        # so the loop keeps walking the fallback order.
        att.verdict = Verdict.UNKNOWN.value
        return att, ""

    fc._run_attempt = fake_run_attempt
    fc.detect = fake_detect
    fc._build_plan = fake_build_plan
    fc.load_profile = fake_load_profile
    ex.run_playwright_fallback = fake_run_pw

    def restore():
        fc._run_attempt = saved["_run_attempt"]
        fc.detect = saved["detect"]
        fc._build_plan = saved["_build_plan"]
        fc.load_profile = saved["load_profile"]
        ex.run_playwright_fallback = saved["ex_run_pw"]

    return restore, browser_calls


def _run(url, *, probe_verdict, grid_verdict, fb_order, max_browser_attempts=2):
    restore, browser_calls = _install_common_patches(
        probe_verdict=probe_verdict, grid_verdict=grid_verdict, fb_order=fb_order)
    try:
        result = _fetch_core(
            url, enable_phase0=False, enable_retry=False,
            enable_extraction=False, enable_markdown=False,
            enable_playwright=True,
            max_browser_attempts=max_browser_attempts,
        )
    finally:
        restore()
    return result, browser_calls


def t_429_stop_still_runs_browser_fallback() -> None:
    # Probe CHALLENGE → grid returns 429 → grid stops with stop_reason=rate_limited.
    result, browser_calls = _run(
        "https://ratelimited.test/",
        probe_verdict=Verdict.CHALLENGE.value,
        grid_verdict=Verdict.RATE_LIMITED.value,
        fb_order=["playwright_real_chrome"],
    )
    assert result.stop_reason == Verdict.RATE_LIMITED.value, \
        f"expected stop_reason=rate_limited, got {result.stop_reason}"
    assert browser_calls == ["playwright_real_chrome"], \
        f"429 must NOT skip the browser fallback, got calls={browser_calls}"
    # The hardened OMG port never escapes to an unpinned external browser.
    assert result.must_invoke_browser is False
    assert any("rate-limited" in r.lower() for r in result.untried_routes), \
        f"rate_limited gate message missing: {result.untried_routes}"
    print(f"  ✓ 429 stops grid but still runs browser fallback {browser_calls} "
          f"(external browser disabled={not result.must_invoke_browser})")


def t_404_stop_skips_browser_fallback() -> None:
    # Probe CHALLENGE → grid returns 404 → real wall → browser is skipped.
    result, browser_calls = _run(
        "https://notfound.test/",
        probe_verdict=Verdict.CHALLENGE.value,
        grid_verdict=Verdict.NOT_FOUND.value,
        fb_order=["playwright_real_chrome"],
    )
    assert result.stop_reason == Verdict.NOT_FOUND.value, \
        f"expected stop_reason=not_found, got {result.stop_reason}"
    assert browser_calls == [], \
        f"404 must skip the browser fallback, got calls={browser_calls}"
    print("  ✓ 404 skips the browser fallback (real wall)")


def t_mcp_stub_does_not_consume_browser_budget() -> None:
    # Turnstile order: [gjc_browser, protocol_stealth_chrome, playwright_real_chrome]
    # with max_browser_attempts=2. The MCP stub must NOT eat a budget slot, so
    # BOTH real executors (protocol_stealth + real_chrome) must still be reached.
    result, browser_calls = _run(
        "https://turnstile.test/",
        probe_verdict=Verdict.CHALLENGE.value,
        grid_verdict=Verdict.CHALLENGE.value,   # grid exhausts (non-terminal)
        fb_order=["gjc_browser", "protocol_stealth_chrome", "playwright_real_chrome"],
        max_browser_attempts=2,
    )
    assert browser_calls == [
        "gjc_browser", "protocol_stealth_chrome", "playwright_real_chrome"], \
        f"real Chrome must be reached after the MCP stub, got {browser_calls}"
    assert "playwright_real_chrome" in browser_calls, "real Chrome executor was starved"
    # The stub is still recorded in the trace / route output.
    assert any(a.executor.startswith("gjc_browser") for a in result.trace), \
        "MCP-stub attempt must still be recorded in the trace"
    print(f"  ✓ MCP stub recorded but budget-free; real Chrome reached {browser_calls}")


def t_mcp_budget_cap_still_bounds_real_executors() -> None:
    # Guard against over-correction: MCP is free, but real executors are still
    # capped. With max=1 and [gjc_browser, protocol_stealth, real_chrome],
    # only ONE real executor runs (the MCP stub does not lift the cap).
    _result, browser_calls = _run(
        "https://turnstile2.test/",
        probe_verdict=Verdict.CHALLENGE.value,
        grid_verdict=Verdict.CHALLENGE.value,
        fb_order=["gjc_browser", "protocol_stealth_chrome", "playwright_real_chrome"],
        max_browser_attempts=1,
    )
    assert browser_calls == ["gjc_browser", "protocol_stealth_chrome"], \
        f"real-executor budget (max=1) must still bound the loop, got {browser_calls}"
    print(f"  ✓ real-executor cap still enforced with MCP free {browser_calls}")


def t_executor_mcp_stub_is_zero_work() -> None:
    # The contract bug 2 relies on: the executor returns a UNKNOWN stub for a
    # "gjc_browser" choice WITHOUT launching any browser (fully offline).
    att, content = ex.run_playwright_fallback(
        "https://93.184.216.34/", profile_id="cloudflare_turnstile",
        force_executor="gjc_browser")
    assert att.verdict == Verdict.UNKNOWN.value, f"stub verdict was {att.verdict}"
    assert content == "", "stub must not return rendered content"
    assert "GJC's browser tool" in (att.error or ""), f"stub error missing browser note: {att.error!r}"
    print("  ✓ executor 'gjc_browser' choice is a zero-work UNKNOWN stub")


def main() -> int:
    tests = [v for k, v in sorted(globals().items())
             if k.startswith("t_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
        except AssertionError as e:
            print(f"  ✗ {test.__name__}: {e}")
            failed += 1
    print(f"\n{'OK' if failed == 0 else 'FAIL'}: {len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
