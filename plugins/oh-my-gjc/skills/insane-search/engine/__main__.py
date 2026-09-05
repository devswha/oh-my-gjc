#!/usr/bin/env python3
"""CLI entrypoint for the insane-search engine.

Usage:
    python3 -m engine URL [URL ...] [--selector CSS] [--device auto|desktop|mobile]
                          [--timeout N] [--json | --body-json | --jsonl] [--trace]
                          [--captions --caption-language CODE --caption-source manual|auto]

Examples:
    python3 -m engine "https://example.com/" --selector "h1"
    python3 -m engine "https://example.com/" --json
    python3 -m engine "https://example.com/" --device mobile --trace

Exit codes:
    0   all inputs succeeded (fetch success is not extraction completeness)
    1   at least one input failed; other results are still emitted
    2   CLI arg error
"""
from __future__ import annotations

import argparse
import json
import sys

from .fetch_chain import FetchResult, fetch_many


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python3 -m engine",
                                description="Generic WAF-profile fetch chain.")
    p.add_argument("urls", nargs="+", help="Public URLs to fetch sequentially in input order.")
    p.add_argument("--selector", "-s", action="append", default=None,
                   dest="selectors", metavar="CSS",
                   help="Positive-proof CSS selector. Repeatable.")
    p.add_argument("--device", choices=("auto", "desktop", "mobile"), default="auto",
                   help="Device class pin.")
    p.add_argument("--timeout", type=int, default=25,
                   help="Per-attempt timeout seconds (default 25).")
    p.add_argument("--max-attempts", type=int, default=None,
                   help="TOTAL curl-attempt budget. Default: None = exhaustive (honours R6).")
    p.add_argument("--no-retry", action="store_true",
                   help="Disable transient-status (429/502/503/504) probe retry.")
    p.add_argument("--no-extract", action="store_true",
                   help="Disable content-rescue extraction (PDF/JSON-LD/render-merge); "
                        "always return the raw response text.")
    p.add_argument("--no-markdown", action="store_true",
                   help="Disable markdownification. By default a raw-HTML success is "
                        "converted to structure-preserving markdown (tables/code kept) "
                        "via markdownify; this returns the raw HTML instead.")
    p.add_argument("--maincontent", action="store_true",
                   help="Strip boilerplate (nav/footer/ads) to the article body via "
                        "optional resiliparse. Off by default; wins over --markdown.")
    p.add_argument("--no-playwright", action="store_true",
                   help="Skip Playwright fallback (curl-only).")
    p.add_argument("--no-phase0", action="store_true",
                   help="Skip the Phase 0 official-API router (generic grid only).")
    output = p.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true",
                        help="Legacy metadata JSON (one object, or array for multiple URLs); no body.")
    output.add_argument("--body-json", action="store_true",
                        help="Version 1 JSON envelope with wrapped body and provenance.")
    output.add_argument("--jsonl", action="store_true",
                        help="Version 1 body/provenance record per input, one JSON line each.")
    p.add_argument("--captions", action="store_true", help="Explicit public caption extraction only.")
    p.add_argument("--caption-language", metavar="CODE", help="Exact requested caption language.")
    p.add_argument("--caption-source", choices=("manual", "auto"), default=None,
                   help="Caption source; default manual. Never silently switches to auto.")
    p.add_argument("--trace", action="store_true",
                   help="Print per-attempt trace to stderr.")
    return p


def body_record(result: FetchResult, index: int, requested_url: str) -> dict:
    """All fetched strings, including provenance, remain untrusted data."""
    route = result.extraction_meta.get("route")
    if not route and result.trace:
        route = result.trace[-1].executor
    return {
        "schema_version": 1,
        "input_index": index,
        "requested_url": requested_url,
        "final_url": result.final_url,
        "ok": result.ok,
        "route": route or result.profile_used or "none",
        "verdict": result.verdict,
        "meta": result.to_dict(),
        "content_untrusted": result.to_untrusted_text(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.captions:
        import re
        if not args.caption_language or not re.fullmatch(r"[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*", args.caption_language):
            parser.error("--captions requires --caption-language CODE (an exact language tag)")
        if args.no_phase0 or args.no_extract:
            parser.error("--captions cannot be combined with --no-phase0 or --no-extract")
    elif args.caption_language is not None or args.caption_source is not None:
        parser.error("caption options require --captions")
    if not 5 <= args.timeout <= 60:
        parser.error("--timeout must be between 5 and 60 seconds")
    results = fetch_many(
        args.urls,
        success_selectors=args.selectors,
        device_class=args.device,
        timeout=args.timeout,
        max_attempts=args.max_attempts,
        enable_playwright=False,
        enable_phase0=not args.no_phase0,
        enable_extraction=not args.no_extract,
        enable_retry=not args.no_retry,
        enable_markdown=not args.no_markdown,
        enable_maincontent=args.maincontent,
        caption_language=args.caption_language if args.captions else None,
        caption_source=args.caption_source or "manual",
    )
    for index, result in enumerate(results):
        _diagnostics(result, trace=args.trace)
        if args.jsonl:
            print(json.dumps(body_record(result, index, args.urls[index]), ensure_ascii=False))
        elif not args.json and not args.body_json:
            print(result.to_untrusted_text(), end="")
            if result.prompt_injection_risk in ("medium", "high"):
                signals = ",".join(result.prompt_injection_signals) or "none"
                print(f"[engine] prompt_injection_risk={result.prompt_injection_risk} signals={signals}",
                      file=sys.stderr)
            print(f"[engine] input_index={index} ok={result.ok} verdict={result.verdict} "
                  f"profile={result.profile_used} attempts={len(result.trace)} "
                  f"extraction_complete={result.extraction_meta.get('extraction_complete')}",
                  file=sys.stderr)
    if args.json:
        payload = [result.to_dict() for result in results]
        print(json.dumps(payload[0] if len(payload) == 1 else payload, ensure_ascii=False, indent=2))
    elif args.body_json:
        print(json.dumps({"schema_version": 1,
                          "ok": all(result.ok for result in results),
                          "results": [body_record(result, index, args.urls[index])
                                      for index, result in enumerate(results)]},
                         ensure_ascii=False, indent=2))
    return 0 if all(result.ok for result in results) else 1


def _diagnostics(result: FetchResult, *, trace: bool) -> None:
    if trace:
        print("=== trace ===", file=sys.stderr)
        for att in result.trace:
            d = att.to_dict()
            imp = d.get("impersonate") or "-"
            ref = d.get("referer") or "-"
            print(
                f"[{d['phase']:<8}] {d['executor']:<18} "
                f"xform={d['url_transform']:<16} imp={imp:<14} ref={ref:<14} "
                f"status={d['status']:>4} size={d['body_size']:>8} "
                f"verdict={d['verdict']} {('err=' + d['error'][:60]) if d.get('error') else ''}",
                file=sys.stderr,
            )
        print(f"=== summary: {result.summary} ===", file=sys.stderr)

    # Surface R7 hint (API-first route) prominently when summary contains it,
    # regardless of --trace flag — this is actionable guidance, not noise.
    if "R7 API-first" in (result.summary or ""):
        print(
            "\n════════════════════════════════════════════════════════════════\n"
            "⚠️  R7 triggered — consider API-first route instead of HTML grid.\n"
            "   See summary below (or re-run with --trace for full attempt log).\n"
            "════════════════════════════════════════════════════════════════",
            file=sys.stderr,
        )
        # Also print the full summary (which includes the hint) so caller sees it.
        print(result.summary, file=sys.stderr)

    # Failure gate (R6): giving up is NOT permission to stop. Surface the routes
    # the engine could not run by itself so the caller keeps escalating instead
    # of reporting "blocked" prematurely (the exact bug this hardening fixes).
    if not result.ok and (result.untried_routes or result.must_invoke_browser):
        print(
            "\n════════════════════════════════════════════════════════════════\n"
            "⛔ NOT EXHAUSTED — do not declare failure yet (R6).\n"
            f"   grid_exhausted={result.grid_exhausted}  stop_reason={result.stop_reason}\n"
            "   Routes the engine cannot run itself — try these before giving up:",
            file=sys.stderr,
        )
        for r in result.untried_routes:
            print(f"     • {r}", file=sys.stderr)
        if result.must_invoke_browser:
            print("   ➜ must_invoke_browser = TRUE — use GJC's browser tool for the public page only.", file=sys.stderr)
        print("════════════════════════════════════════════════════════════════", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
