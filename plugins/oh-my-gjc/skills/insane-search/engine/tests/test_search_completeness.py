"""Extraction coverage contracts with deterministic parser doubles (no installs)."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from engine import fetch_chain as fc


class Page:
    def __init__(self, text="page text", failure=False):
        self.text, self.failure = text, failure
    def extract_text(self):
        if self.failure:
            raise ValueError("fixture page failure")
        return self.text


def parser_context(pages):
    return SimpleNamespace(pages=pages, metadata=None)


def jsonld(text):
    return '<script type="application/ld+json">' + json.dumps({"articleBody": text}) + '</script>'


class CompletenessTests(unittest.TestCase):
    def extract(self, pages, backend="pypdf", cap=None):
        meta = {}
        with patch.object(fc, "_RESCUE_MAX_TEXT", cap or 1_000_000):
            if backend == "pypdf":
                with patch.object(fc, "_PdfReader", return_value=parser_context(pages)):
                    title, text, err = fc._extract_pdf_pypdf(b"fixture", meta=meta)
            else:
                context = Mock()
                context.__enter__ = Mock(return_value=parser_context(pages))
                context.__exit__ = Mock(return_value=False)
                with patch.object(fc, "_pdfplumber", SimpleNamespace(open=lambda _: context)):
                    title, text = fc._extract_pdf_pdfplumber(b"fixture", meta=meta)
        return text, meta

    def test_eighty_and_eighty_one_pages_both_backends(self):
        for backend in ("pypdf", "pdfplumber"):
            for count in (80, 81):
                with self.subTest(backend=backend, pages=count):
                    text, meta = self.extract([Page(f"page-{i}") for i in range(count)], backend)
                    self.assertEqual(meta["pages_total"], count)
                    self.assertEqual(meta["pages_processed"], 80)
                    self.assertEqual(meta["pages_with_text"], 80)
                    self.assertEqual(meta["pages_failed"], 0)
                    self.assertEqual(meta["pages_empty"], 0)
                    self.assertEqual(meta["truncation_reasons"], ["page_limit"] if count == 81 else [])
                    self.assertTrue(meta["coverage_uncertain"])
                    self.assertIs(meta["extraction_complete"], False if count == 81 else None)
                    self.assertNotIn("page-80", text)

    def test_failed_and_empty_pages_are_distinct_and_counted(self):
        for backend in ("pypdf", "pdfplumber"):
            text, meta = self.extract([Page("first"), Page(failure=True), Page("  "), Page("last")], backend)
            self.assertEqual(text, "first\n\nlast")
            self.assertEqual((meta["pages_processed"], meta["pages_failed"], meta["pages_empty"]), (4, 1, 1))
            self.assertEqual(meta["page_errors"], [{"page": 2, "error": "ValueError"}])
            self.assertFalse(meta["extraction_complete"])
            self.assertFalse(meta["truncated"])

    def test_text_cap_includes_separators_and_unprocessed_pages(self):
        for backend in ("pypdf", "pdfplumber"):
            text, meta = self.extract([Page("abc"), Page("defgh"), Page("unvisited")], backend, cap=7)
            self.assertEqual(text, "abc\n\nde")
            self.assertEqual(meta["pages_processed"], 2)
            self.assertEqual(meta["truncation_reasons"], ["text_limit"])
            text, meta = self.extract([Page("abc")], backend, cap=3)
            self.assertEqual(meta["truncation_reasons"], [])

    def test_parser_exceptions_and_successful_fallback_keep_attempts(self):
        broken = SimpleNamespace(open=Mock(side_effect=RuntimeError("fixture only")))
        meta = {}
        with patch.object(fc, "_pdfplumber", broken), patch.object(fc, "_PdfReader", return_value=parser_context([Page("fallback")])):
            _, text, _, error = fc._extract_pdf(b"%PDF-fixture", "https://public.test/a.pdf", meta=meta)
        self.assertEqual((text, error, meta["backend"]), ("fallback", "", "pypdf"))
        self.assertEqual(meta["attempts"][0]["error"], "pdf_error:RuntimeError")
        self.assertEqual(meta["attempts"][1]["pages_processed"], 1)
        with patch.object(fc, "_pdfplumber", broken), patch.object(fc, "_PdfReader", None):
            _, _, _, error = fc._extract_pdf(b"fixture", "https://public.test/a.pdf", meta={})
        self.assertEqual(error, "pdf_error:RuntimeError")

    def test_missing_parsers_and_input_limit(self):
        for parsers, limit, expected in ((False, 100, "pdf_no_extractor"), (True, 2, "pdf_too_large")):
            reader = Mock(side_effect=AssertionError("must never parse")) if parsers else None
            meta = {}
            with patch.object(fc, "_pdfplumber", None), patch.object(fc, "_PdfReader", reader), patch.object(fc, "_PDF_MAX_BYTES", limit):
                _, text, _, error = fc._extract_pdf(b"%PDF-fixture", "https://public.test/a.pdf", meta=meta)
            self.assertEqual((text, error), ("", expected))
            self.assertIsNone(meta["pages_total"])
            self.assertFalse(meta["extraction_complete"])

    def test_fetch_ok_does_not_imply_complete_extraction(self):
        response = SimpleNamespace(content=b"%PDF-fixture", text="", url="https://public.test/a.pdf", headers={})
        attempt = fc.Attempt("probe", "curl_cffi", response.url, "original", "safari", "", verdict="strong_ok")
        with patch.object(fc, "_pdfplumber", None), patch.object(fc, "_PdfReader", return_value=parser_context([Page()] * 81)):
            result = fc._build_result(response, attempt, [attempt], None, planned=1, executed=1, grid_exhausted=False, stop_reason="success")
        self.assertTrue(result.ok)
        self.assertFalse(result.to_dict()["extraction_meta"]["extraction_complete"])
        self.assertEqual(result.extraction_meta["pages_total"], 81)

    def test_jsonld_ten_eleven_blocks_and_two_hundred_k_blob(self):
        for count in (10, 11):
            meta = {}
            text = fc._extract_json_ld_text("".join(jsonld(f"block{i}") for i in range(count)), meta=meta)
            self.assertEqual(meta["blocks_processed"], 10)
            self.assertEqual(meta["truncation_reasons"], ["block_limit"] if count == 11 else [])
            self.assertEqual(meta["blocks_total"], None if count == 11 else 10)
            self.assertNotIn("block10", text)
        meta = {}
        text = fc._extract_json_ld_text(jsonld("a" * 200_001) + jsonld("retained"), meta=meta)
        self.assertEqual(text, "retained")
        self.assertEqual(meta["blocks_oversized"], 1)
        self.assertIn("blob_limit", meta["truncation_reasons"])

    def test_jsonld_scan_and_one_million_output_caps(self):
        meta = {}
        text = fc._extract_json_ld_text(" " * 2_000_000 + jsonld("unscanned"), meta=meta)
        self.assertEqual(text, "")
        self.assertEqual(meta["scan_chars"], 2_000_000)
        self.assertIn("scan_limit", meta["truncation_reasons"])
        self.assertIsNone(meta["blocks_total"])
        meta = {}
        text = fc._extract_json_ld_text("".join(jsonld("x" * 190_000) for _ in range(7)), meta=meta)
        self.assertEqual(len(text), 1_000_000)
        self.assertIn("text_limit", meta["truncation_reasons"])

    def test_jsonld_bad_json_and_raw_fallback_expose_diagnostics(self):
        text = '<script type="application/ld+json">{broken}</script>' + jsonld("good" * 100)
        meta = {}
        self.assertEqual(fc._extract_json_ld_text(text, meta=meta), "good" * 100)
        self.assertEqual(meta["blocks_failed"], 1)
        self.assertFalse(meta["extraction_complete"])
        html = "<html><body>page</body></html>" + jsonld("x" * 200_001)
        response = SimpleNamespace(text=html, content=html.encode(), headers={})
        _, content, _, result_meta = fc._extract_response(response, "https://public.test/", enable_markdown=False)
        self.assertEqual(content, html)
        self.assertEqual(result_meta["source"], "raw")
        self.assertFalse(result_meta["truncated"])
        self.assertIn("blob_limit", result_meta["json_ld"]["truncation_reasons"])


if __name__ == "__main__":
    unittest.main()
