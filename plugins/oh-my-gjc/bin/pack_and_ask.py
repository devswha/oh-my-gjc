#!/usr/bin/env python3
"""
insane-review — repomix 패킹 → 구독 ChatGPT(웹) GPT-5.6 Sol Pro 투입 → 분석 회수 (API 비용 0)

흐름:
  1) 분석 대상 폴더를 repomix로 단일 파일 패킹 (--compress, secretlint 기본 on)
  2) Comet/Chrome를 CDP로 attach → 로그인된 chatgpt.com 세션 재사용
  3) 패킹본을 '파일 첨부' + 짧은 프롬프트로 투입 (모델/추론단계 검증)
  4) 턴 단위로 응답 완료를 판정(stop-button 사라짐 + copy 버튼 등장 + 텍스트 안정) → 회수
  5) 응답을 .md로 원자적 저장

v2 (2026-06-20): GPT-5.6 Sol Pro 리뷰 반영 — 턴-스코프 판정, 모델 검증, fail-closed CDP/로그인,
force-answer 재시도, UUID/PID 파일명, repomix 버전 핀+timeout, 권한/시크릿, env 설정화.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))
from cdp_lock import CdpLease

# 파이프/리다이렉트로 실행해도 진행 로그가 즉시 흘러가게 라인 버퍼링(백그라운드
# 실행 + 로그 폴링 중계 패턴에서 필수). 증분 스트림 출력은 개별 print에서 flush.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(line_buffering=True)
    except Exception:
        pass

# ---- 선택 의존성(라이브 모드에서만 필요) ----
try:
    import pyperclip
except ImportError:
    pyperclip = None
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

# ---------------------------------------------------------------------------
# 설정 (env로 오버라이드 가능 — 하드코딩 탈피)
# ---------------------------------------------------------------------------
COMET_PATH = os.environ.get("INSANE_REVIEW_COMET", "/Applications/Comet.app/Contents/MacOS/Comet")
CHROME_PATH = os.environ.get("INSANE_REVIEW_CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
CDP_PORT = int(os.environ.get("INSANE_REVIEW_CDP_PORT", "9222"))
CDP_URL = f"http://127.0.0.1:{CDP_PORT}"


# 전용(격리) 프로필 — 사용자 주 브라우저 세션과 분리. Chrome 136+는 '기본 프로필'에서
# --remote-debugging-port를 정책적으로 무시하므로(쿠키 탈취 방지), 이 별도 user-data-dir이
# 없으면 디버그 포트가 아예 안 열린다. 모든 OS 공통으로 전용 프로필을 쓴다.
BROWSER_PROFILE_INPUT = Path(os.environ.get(
    "INSANE_REVIEW_PROFILE", str(Path.home() / ".insane-review" / "browser-profile"))).expanduser()
BROWSER_PROFILE_DIR = BROWSER_PROFILE_INPUT.resolve()
# 선택한 브라우저를 영속화(재질문 방지) — 우선순위: --browser > env > config 저장값 > 첫 감지.
CONFIG_PATH = Path(os.environ.get(
    "INSANE_REVIEW_CONFIG", str(Path.home() / ".insane-review" / "config.json")))
# repomix 버전 핀(재현성·공급망) — env로 갱신. 빈 문자열이면 latest.
REPOMIX_VERSION = os.environ.get("INSANE_REVIEW_REPOMIX_VERSION", "1.15.0")
REPOMIX_TIMEOUT = int(os.environ.get("INSANE_REVIEW_REPOMIX_TIMEOUT", "300"))

CHATGPT_URL = "https://chatgpt.com/"


def _guard_dialogs(ctx, page=None):
    """Stop playwright's default dialog auto-dismiss from racing over CDP.

    Over connect_over_cdp, any JS dialog (beforeunload/alert/confirm) on the
    ChatGPT page triggers playwright's built-in auto-dismiss. Across CDP that
    races the browser → `ProtocolError: No dialog is showing`, an UNCAUGHT
    driver exception that crashes the run (100% CPU spin) before the prompt is
    ever submitted. Registering our own handler disables the default and
    swallows the race.
    """
    def _on_dialog(d):
        try:
            d.dismiss()
        except Exception:
            pass
    def _attach(p):
        try:
            p.on("dialog", _on_dialog)
        except Exception:
            pass
    try:
        for p in (getattr(ctx, "pages", None) or []):
            _attach(p)
        ctx.on("page", _attach)   # cover future tabs/pages too
    except Exception:
        pass
    if page is not None:
        _attach(page)


INPUT_SELECTORS = ["#prompt-textarea", 'div[contenteditable="true"]']
FILE_INPUT_SELECTOR = 'input[type="file"]'
# 폴백 리스트(첫 항목=현행 실측 셀렉터, 이후=구조적 폴백) — INPUT_SELECTORS와 같은 컨벤션.
# 단일점 셀렉터는 ChatGPT가 data-testid를 한 번 바꾸면 그대로 즉사한다(2026-08-27 실측).
COPY_BTN_SELECTORS = [
    'button[data-testid="copy-turn-action-button"]',
    'button[aria-label="Copy"]',
    'button[data-testid*="copy"]',
]
STREAMING_BTN_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop streaming"]',
    'button[data-testid*="stop"]',
]
USER_MSG_SELECTORS = ['[data-message-author-role="user"]', 'article[data-turn="user"]',
                      'section[data-turn="user"]']
ASSISTANT_MSG_SELECTORS = ['[data-message-author-role="assistant"]',
                           'article[data-turn="assistant"]', 'section[data-turn="assistant"]']

# 사용량 한도(쿼터) 차단 배너 감지 문구 — dialog/alert 표면에서만 대조(오탐 방지).
# 본문 응답 텍스트는 절대 스캔하지 않는다: 리뷰 답변이 "usage limit"을 논하면 오탐이 된다.
QUOTA_HINTS = [
    "usage limit", "reached your limit", "limit reached", "you've hit",
    "reached the current usage cap", "try again later", "upgrade to",
    "사용량 한도", "한도에 도달", "사용 한도", "요금제를 업그레이드",
]
LOGIN_WALL_SELECTORS = [
    'button[data-testid="login-button"]',
    'a[href*="auth/login"]',
    'button:has-text("로그인")',
    'button:has-text("Log in")',
]

MAX_WAIT_SECS = int(os.environ.get("INSANE_REVIEW_MAX_WAIT", "1200"))  # 기본 20분(--max-wait/env로 변경)
MIN_WAIT_SECS = 20
STABLE_CHECK_SECS = 8
STATUS_INTERVAL = 15
FORCE_MAX_TRIES = 6    # force-answer 클릭 재시도 상한
# 첨부 실패 시 pack을 프롬프트에 인라인으로 붙여 보내는 폴백의 크기 상한(초과 시 자르지 않고 중단).
PASTE_FALLBACK_MAX_CHARS = int(os.environ.get("INSANE_REVIEW_PASTE_MAX", "50000"))
REFUSAL_MARKERS = (
    "이 콘텐츠는 표시할 수 없습니다",
    "Trusted Access",
    "사이버보안 관련 요청은",
    "I can't help with that",
    "I'm unable to help with that",
)
PROMPT_ECHO_CHARS = 200
MIN_ECHO_CHARS = 120

# 출력은 '실행한 현재 프로젝트'의 .insane-review/ 에 저장(플러그인 내부 X — kkirikkiri의 .kkirikkiri 패턴).
# env INSANE_REVIEW_OUT 또는 --out-dir로 오버라이드.
OUT_DIR = Path(os.environ["INSANE_REVIEW_OUT"]).expanduser() if os.environ.get("INSANE_REVIEW_OUT") \
    else Path.cwd() / ".insane-review"

DEFAULT_PROMPT = (
    "첨부는 repomix로 패킹한 코드베이스입니다. 다음을 한국어로 분석해줘:\n"
    "1) 이 프로젝트가 하는 일과 전체 아키텍처\n"
    "2) 핵심 모듈 간 데이터 흐름\n"
    "3) 잠재적 버그/리스크 또는 개선점 3가지 (근거 파일 경로 포함)\n"
    "결론부터 말하고 근거는 그 뒤에."
)


# ===========================================================================
# 1) repomix 패킹 (버전 핀 + timeout + returncode + 권한 + 시크릿 노트)
# ===========================================================================
def missing_explicit_include_paths(include: str | None, packed_paths: list[str]) -> list[str]:
    if not include:
        return []
    exact_includes = {
        item.strip().removeprefix("./")
        for item in include.split(",")
        if item.strip() and not re.search(r"[*?[\]{}]", item)
    }
    normalized_packed = {item.strip().removeprefix("./") for item in packed_paths}
    return sorted(exact_includes - normalized_packed)


def pack_repo(target: Path, *, include: str | None, ignore: str | None,
              compress: bool, style: str, token_budget: int | None,
              out_path: Path, line_numbers: bool = True,
              no_default_patterns: bool = False,
              no_gitignore: bool = False) -> tuple[Path, int | None]:
    if shutil.which("npx") is None:
        sys.exit("❌ npx가 없습니다. Node.js를 설치하세요.")

    # 시크릿 위생: 대상에 secretlint(보안검사)를 끄는 로컬 repomix 설정이 있으면 외부전송 전 중단(fail-closed)
    for cfg in ("repomix.config.json", "repomix.config.json5", "repomix.config.jsonc"):
        p = target / cfg
        if p.exists():
            try:
                raw = p.read_text(encoding="utf-8", errors="replace")
            except OSError as exc:
                sys.exit(f"❌ {cfg} 읽기 실패({str(exc)[:60]}) — 보안설정 검증 불가로 중단(fail-closed).")
            # 키/값의 따옴표 유무(JSON 쌍따옴표 / JSON5 무따옴표·단따옴표) 모두 매칭
            if re.search(r"""['"]?enableSecurityCheck['"]?\s*:\s*false""", raw):
                sys.exit(f"❌ {cfg}에서 보안검사(enableSecurityCheck)가 꺼져 있음 — 시크릿 유출 위험으로 중단.\n"
                         "     보안검사를 켜거나 해당 설정을 제거한 뒤 다시 실행하세요.")

    if compress:
        print("  ⚠️  --compress: 함수 본문이 제거된다(시그니처 골격만). 정확성 리뷰/원인분석엔 부적합 —\n"
              "       리뷰면 끄고, 너무 크면 --include로 관련 파일만 좁혀 풀로 보내라.")

    spec = f"repomix@{REPOMIX_VERSION}" if REPOMIX_VERSION else "repomix@latest"
    # hermetic: 외부 repomix 설정(CWD의 .ts/.js/json·글로벌 설정)이 압축·본문생략(output.files)·
    # 보안검사를 조용히 바꾸지 못하도록 안전한 임시 config를 만들어 --config로 강제한다
    # (--config 지정 시 repomix는 자동탐색 대신 이 파일을 쓴다). compress는 요청값만 반영.
    hermetic_cfg = {
        "output": {"compress": bool(compress), "files": True,
                   "removeComments": False, "removeEmptyLines": False},
        "security": {"enableSecurityCheck": True},
    }
    cfg_path = out_path.with_name(out_path.name + ".repomixcfg.json")
    try:
        cfg_path.write_text(json.dumps(hermetic_cfg), encoding="utf-8")
    except OSError as exc:
        # fail-closed: hermetic config 없이 돌리면 repomix가 대상 리포의 설정(.js/.ts 포함)을
        # 자동탐색해 secretlint를 조용히 끌 수 있다 — 사전 검사(json/json5/jsonc)로는 못 막는다.
        sys.exit(f"❌ hermetic repomix 설정 생성 실패({str(exc)[:60]}) — 보안검사 강제 불가로 중단(fail-closed).")
    cmd = ["npx", "-y", spec, str(target), "-o", str(out_path), "--style", style]
    cmd += ["--config", str(cfg_path)]   # 외부 설정 차단(압축·보안·본문생략 강제)
    if line_numbers:
        cmd.append("--output-show-line-numbers")  # AI가 파일:라인 인용 가능 → 근거 강제에 필요
    if compress:
        cmd.append("--compress")
    if include:
        cmd += ["--include", include]
    if ignore:
        cmd += ["--ignore", ignore]
    if no_default_patterns:
        cmd.append("--no-default-patterns")
    if no_gitignore:
        cmd.append("--no-gitignore")
    if token_budget:
        cmd += ["--token-budget", str(token_budget)]

    print(f"  $ {' '.join(cmd)}")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=REPOMIX_TIMEOUT)
    except subprocess.TimeoutExpired:
        if cfg_path is not None:
            try:
                cfg_path.unlink()
            except OSError:
                pass
        # 타임아웃 전에 repomix가 부분 산출물을 남겼으면 권한 축소(시크릿 위생 — 모든 실패경로 보장)
        if out_path.exists():
            try:
                os.chmod(out_path, 0o600)
            except OSError:
                pass
        sys.exit(f"❌ repomix 타임아웃({REPOMIX_TIMEOUT}s) — 네트워크/범위 확인")
    if cfg_path is not None:   # hermetic 임시 config 정리(성공 경로)
        try:
            cfg_path.unlink()
        except OSError:
            pass
    out = proc.stdout + proc.stderr

    tokens = None
    m = re.search(r"Total Tokens:\s*([\d,]+)", out)
    if m:
        tokens = int(m.group(1).replace(",", ""))

    # 시크릿 스캔 결과 노출 (repomix는 secretlint 기본 on — hit 파일은 출력에서 제외됨)
    sm = re.search(r"(\d+)\s+suspicious file", out)
    if sm and int(sm.group(1)) > 0:
        print(f"  🔒 secretlint: 의심 파일 {sm.group(1)}개 감지 → 출력에서 제외됨(외부 전송 안전)")

    if proc.returncode != 0:
        # 실패해도 repomix가 산출물을 남겼으면 권한 축소(token-budget 초과 시 파일 생성됨 — 시크릿 위생)
        if out_path.exists():
            try:
                os.chmod(out_path, 0o600)
            except OSError:
                pass
        if token_budget and tokens and tokens > token_budget:
            sys.exit(f"⚠️ 중단: 토큰 예산 초과 — 패킹은 완료됐으나 {tokens:,} > {token_budget:,} 한도. "
                     "범위를 좁히거나(--include) 예산을 늘리세요(--token-budget). [요청한 예산 가드]")
        else:
            sys.exit(f"❌ repomix 실행 실패 (rc={proc.returncode}) — 로그를 확인하세요.\n"
                     "     " + "\n     ".join(out.strip().splitlines()[-6:]))

    if not out_path.exists():
        sys.exit("❌ repomix 출력 파일이 생성되지 않았습니다.")

    # 외부 웹 서비스로 나가는 파일 → 권한 축소
    try:
        os.chmod(out_path, 0o600)
    except OSError:
        pass

    size = out_path.stat().st_size
    print(f"  ✓ 패킹 완료: {out_path.name}  ({size:,} bytes"
          + (f", ~{tokens:,} tokens)" if tokens else ")"))

    # 누락 검증(감사): 패킹된 파일 수/목록 노출 → 빠진 게 있으면 눈에 띄게
    mf = re.search(r"Total Files:\s*([\d,]+)", out)          # repomix stdout(신뢰가능 카운트)
    n_files = int(mf.group(1).replace(",", "")) if mf else None
    flist = []
    try:
        body = out_path.read_text(encoding="utf-8", errors="replace")
        if style == "markdown":                              # 구조 헤더 '## File:'는 컬럼0(라인번호 없음)
            flist = re.findall(r"(?m)^## File:\s+(.+?)\s*$", body)
    except OSError:
        pass
    cnt = n_files if n_files is not None else len(flist)
    shown = (": " + ", ".join(flist[:10]) + (f" … (+{len(flist) - 10})" if len(flist) > 10 else "")) if flist else ""
    print(f"  📦 패킹 포함 {cnt}개 파일{shown}")
    # 빈/불명 컨텍스트 전송 방지 — 파일수가 0이거나, 신뢰가능 카운트도 목록도 못 얻으면 중단(fail-closed)
    if n_files == 0 or (n_files is None and len(flist) == 0):
        try:
            os.chmod(out_path, 0o600)
        except OSError:
            pass
        reason = "0개" if n_files == 0 else "확인 불가(repomix 파일수 파싱 실패)"
        sys.exit(f"❌ 패킹 파일 수 {reason} — 대상 경로/--include/--ignore를 확인하세요(빈·불명 컨텍스트 전송 방지).")
    # An explicit file path is a closed request, unlike a glob. If repomix's
    # default ignore rules silently drop it (for example package-lock.json),
    # sending the incomplete pack would invalidate the requested review scope.
    if include and flist:
        missing_exact = missing_explicit_include_paths(include, flist)
        if missing_exact:
            sys.exit("❌ 명시한 파일이 패킹에서 누락됨: "
                     + ", ".join(missing_exact)
                     + " — repomix 기본 ignore를 확인하고 필요하면 --no-default-patterns를 사용하세요.")
    if compress:
        print("  ⚠️  위 파일들은 본문이 압축됨(⋮----) — 제어흐름 누락. 리뷰엔 부적합.")
    if tokens and tokens > 120_000:
        print(f"  ⚠️  pack이 큼(~{tokens:,} 토큰) — ChatGPT 웹에서 잘릴(truncation) 수 있다. "
              "--include로 좁히거나 여러 번 나눠 보내라.")
    return out_path, tokens


# ===========================================================================
# 2) 브라우저(CDP) 준비 + fail-closed 검증
# ===========================================================================
def is_port_open(port: int = CDP_PORT) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def cdp_browser_ok() -> bool:
    """포트가 '진짜 CDP 브라우저'인지 /json/version으로 검증(엉뚱한 프로세스 차단)."""
    try:
        with urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=4) as r:
            info = json.loads(r.read().decode("utf-8"))
        browser = str(info.get("Browser", ""))
        return any(k in browser for k in ("Chrome", "Chromium", "Comet", "HeadlessChrome", "Edg"))
    except Exception:
        return False


# ---- 크로스플랫폼 브라우저 레지스트리 (mac / windows / linux) ----
def host_os() -> str:
    s = platform.system()
    return "mac" if s == "Darwin" else "win" if s == "Windows" else "linux"


# Arc은 CDP/멀티인스턴스가 불안정해 자동 목록에서 제외(사용자가 절대경로로 직접 지정은 가능).
def _browser_registry() -> list[tuple[str, list[str]]]:
    """[(표시이름, [후보 실행경로...])] — OS별. 절대경로는 존재검사, 비절대는 PATH(which)로 해석."""
    osname = host_os()
    home = Path.home()
    if osname == "mac":
        A = "/Applications"
        return [
            ("Chrome",   [f"{A}/Google Chrome.app/Contents/MacOS/Google Chrome"]),
            ("Comet",    [f"{A}/Comet.app/Contents/MacOS/Comet"]),
            ("Brave",    [f"{A}/Brave Browser.app/Contents/MacOS/Brave Browser"]),
            ("Edge",     [f"{A}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]),
            ("Chromium", [f"{A}/Chromium.app/Contents/MacOS/Chromium"]),
            ("Vivaldi",  [f"{A}/Vivaldi.app/Contents/MacOS/Vivaldi"]),
        ]
    if osname == "win":
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pfx = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        lad = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
        return [
            ("Chrome",   [rf"{pf}\Google\Chrome\Application\chrome.exe",
                          rf"{pfx}\Google\Chrome\Application\chrome.exe",
                          rf"{lad}\Google\Chrome\Application\chrome.exe"]),
            ("Edge",     [rf"{pf}\Microsoft\Edge\Application\msedge.exe",
                          rf"{pfx}\Microsoft\Edge\Application\msedge.exe"]),
            ("Brave",    [rf"{pf}\BraveSoftware\Brave-Browser\Application\brave.exe",
                          rf"{pfx}\BraveSoftware\Brave-Browser\Application\brave.exe",
                          rf"{lad}\BraveSoftware\Brave-Browser\Application\brave.exe"]),
            ("Chromium", [rf"{lad}\Chromium\Application\chrome.exe"]),
            ("Vivaldi",  [rf"{lad}\Vivaldi\Application\vivaldi.exe"]),
        ]
    return [  # linux
        ("Chrome",   ["google-chrome", "google-chrome-stable"]),
        ("Chromium", ["chromium", "chromium-browser"]),
        ("Brave",    ["brave-browser", "brave"]),
        ("Edge",     ["microsoft-edge", "microsoft-edge-stable"]),
        ("Vivaldi",  ["vivaldi", "vivaldi-stable"]),
    ]


def detect_browsers() -> list[tuple[str, str]]:
    """이 OS에 설치된 크로미움 계열 브라우저 [(이름, 실행경로)]. env 경로 오버라이드도 우선 반영."""
    found, seen = [], set()
    for env, nm in (("INSANE_REVIEW_BROWSER_PATH", None),
                    ("INSANE_REVIEW_CHROME", "Chrome"), ("INSANE_REVIEW_COMET", "Comet")):
        p = os.environ.get(env)
        if p and Path(p).exists():
            name = nm or Path(p).stem
            if name.lower() not in seen:
                found.append((name, p)); seen.add(name.lower())
    for name, cands in _browser_registry():
        if name.lower() in seen:
            continue
        for c in cands:
            p = c if os.path.isabs(c) else (shutil.which(c) or "")
            if p and Path(p).exists():
                found.append((name, p)); seen.add(name.lower())
                break
    return found


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_browser_choice(name_or_path: str) -> None:
    """선택한 브라우저(이름 또는 경로)를 config에 영속화 → 다음 실행부터 재질문 안 함."""
    try:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        cfg = _load_config()
        cfg["browser"] = name_or_path
        tmp = CONFIG_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, CONFIG_PATH)
    except Exception:
        pass


def resolve_browser(name_or_path: str | None) -> tuple[str, str] | None:
    """--browser 값(이름 'chrome' 또는 절대경로)을 (이름, 경로)로 해석.
    인자 없으면 config 저장값 → 첫 감지 브라우저 순. 못 찾으면 None."""
    if name_or_path:
        if os.path.isabs(name_or_path) and Path(name_or_path).exists():
            return (Path(name_or_path).stem, name_or_path)
        for name, path in detect_browsers():
            if name.lower() == name_or_path.lower():
                return (name, path)
        return None
    saved = _load_config().get("browser")
    if saved:
        r = resolve_browser(saved)
        if r:
            return r
    bs = detect_browsers()
    return bs[0] if bs else None


def _prepare_browser_profile() -> bool:
    """Create and verify the credential-bearing dedicated profile."""
    try:
        home = Path.home().resolve()
        requested = BROWSER_PROFILE_INPUT.absolute()
        relative = requested.relative_to(home)
        current = home
        uid = os.geteuid() if hasattr(os, "geteuid") else None
        for part in relative.parts:
            current = current / part
            if current.is_symlink():
                raise OSError(f"symlinked profile component: {current}")
            if current.exists():
                details = current.lstat()
                if not stat.S_ISDIR(details.st_mode):
                    raise OSError(f"profile component is not a directory: {current}")
            else:
                current.mkdir(mode=0o700)
                details = current.lstat()
            if uid is not None and details.st_uid != uid:
                raise OSError(f"profile component is not owned by the current user: {current}")
            if os.name != "nt":
                os.chmod(current, 0o700)
                if stat.S_IMODE(current.lstat().st_mode) != 0o700:
                    raise OSError(f"profile component permissions are not 0700: {current}")
        if requested.resolve(strict=True) != BROWSER_PROFILE_DIR:
            raise OSError("profile path is not canonical")
        return True
    except (OSError, ValueError) as exc:
        print(f"  ❌ 전용 브라우저 프로필 보안 설정 실패: {str(exc)[:100]}")
        return False


def _fetch_cdp_info(port: int = CDP_PORT) -> dict | None:
    """/json/version 조회(best-effort). 실패 시 None."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _cdp_info_shape_ok(info: dict, port: int) -> tuple[bool, str]:
    """로컬 루프백 CDP 브라우저 엔드포인트 형태인지 → (판정, live ws path)."""
    try:
        browser = str(info.get("Browser", ""))
        if not any(k in browser for k in ("Chrome", "Chromium", "Comet", "HeadlessChrome", "Edg")):
            return False, ""
        ws = urllib.parse.urlparse(str(info.get("webSocketDebuggerUrl", "")))
        ok = (
            ws.hostname in {"127.0.0.1", "localhost"}
            and ws.port == port
            and ws.path.startswith("/devtools/browser/")
        )
        return ok, (ws.path if ok else "")
    except (ValueError, AttributeError):
        return False, ""


def _receipt_binds_dedicated_profile(port: int, live_ws_path: str) -> bool:
    """구버전 Chromium 증거 — user-data-dir에 남는 DevToolsActivePort 영수증(있을 때만).

    Chrome 136+는 --remote-debugging-port로 띄워도 이 파일을 더 이상 남기지 않는다
    (2026-08-19 실측: Chrome 145.0.7632.45, headless/GUI 동일). 그때는 아래
    리스너-argv 바인딩이 증명을 대신한다. 영수증 파일은 0700 프로필 디렉토리
    안쪽에 있으므로 파일 자체 모드 대신 소유자/형태만 검증한다.
    """
    receipt = BROWSER_PROFILE_DIR / "DevToolsActivePort"
    # lstat→read 경합(심볼릭링크 스왑)을 없앤다: O_NOFOLLOW로 열고 fstat으로
    # 동일 파일인 채로 읽는다(Windows에 O_NOFOLLOW가 없으면 일반 open).
    try:
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(receipt, flags)
        try:
            receipt_stat = os.fstat(fd)
            if not stat.S_ISREG(receipt_stat.st_mode):
                return False
            if (hasattr(os, "geteuid") and receipt_stat.st_uid != os.geteuid()) or receipt_stat.st_size > 4096:
                return False
            data = os.read(fd, 4097)
        finally:
            os.close(fd)
        lines = data.decode("utf-8", errors="strict").splitlines()
        if len(lines) < 2 or lines[0].strip() != str(port):
            return False
        expected_path = lines[1].strip()
        return expected_path.startswith("/devtools/browser/") and expected_path == live_ws_path
    except (OSError, UnicodeError, ValueError):
        return False


def _argv_flag_last_value(argv: list[str], flag: str) -> tuple[bool, str | None]:
    """Chromium 스위치 파싱과 정확히 일치하는 **마지막** '--flag=VALUE' 값.

    반환: (ok, value). ok=False면 그 argv는 증명으로 쓰지 않는다(fail-closed).
    Chromium은 (1) 값을 '=' 형태만 받는다(공백 형태는 부울 스위치+별도 인자),
    (2) 값 없는 등장은 부울 스위치다, (3) '--' 이후는 인자 영역이라 파싱을
    멈춘다. 우리 런처도 '=' 형태만 생성한다.
    """
    value = None
    for token in argv:
        if token == "--":
            break
        if token == flag:
            return False, None
        if token.startswith(flag + "="):
            value = token[len(flag) + 1:]
    return True, value


def _argv_binds_dedicated_profile(argv: list[str], port: int = CDP_PORT) -> bool:
    """argv가 '전용 user-data-dir + 지정 디버그 포트'로 실행된 크로미움인지.

    값은 마지막 등장만 수용(중복 플래그에서 선행값으로의 위장 차단)하고,
    경로는 절대경로 문자열만(Chromium은 '~' 확장/상대경로 해석을 검증자와 다르게
    할 수 있으므로 애초에 우리 런처가 쓰는 절대경로 형태만 받는다).
    """
    ok_port, port_value = _argv_flag_last_value(argv, "--remote-debugging-port")
    if not ok_port or port_value != str(port):
        return False
    ok_dir, value = _argv_flag_last_value(argv, "--user-data-dir")
    if not ok_dir or not value or not Path(value).is_absolute():
        return False
    try:
        return Path(value).resolve(strict=False) == BROWSER_PROFILE_DIR
    except (OSError, ValueError, RuntimeError):
        return False


CHROMIUM_EXE_HINTS = ("chrome", "chromium", "brave", "msedge", "edge", "vivaldi", "comet")


def _exe_is_chromium_family(exe: str) -> bool:
    return any(hint in exe.lower() for hint in CHROMIUM_EXE_HINTS)


def _linux_listener_cmdlines(port: int) -> list[tuple[list[str], str]]:
    """/proc만으로 127.0.0.1:port를 LISTEN하는 프로세스의 (argv, 실행파일명).

    증명 주소는 엔진이 실제로 fetch/attach 하는 주소(127.0.0.1)와 **동일하게**
    한다 — 다른 주소(::1 등)의 리스너를 증명에 섞으면 '다른 프로세스 증명 → 이
    주소 접속'의 조합 오류가 생긴다. IPv6 루프백은 애초에 쓰지 않는다.
    """
    wanted = f"{port:04X}"
    inodes: set[str] = set()
    try:
        lines = Path("/proc/net/tcp").read_text(encoding="ascii").splitlines()[1:]
    except OSError:
        return []
    for line in lines:
        fields = line.split()
        if len(fields) < 10 or fields[3] != "0A":  # 0A = LISTEN
            continue
        host_hex, _, port_hex = fields[1].rpartition(":")
        if port_hex.upper() != wanted or host_hex.upper() != "0100007F":  # 127.0.0.1
            continue
        inodes.add(fields[9])
    if not inodes:
        return []
    wanted_sockets = {f"socket:[{inode}]" for inode in inodes}
    found: list[tuple[list[str], str]] = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            owns = False
            for fd in (proc / "fd").iterdir():
                try:
                    if os.readlink(fd) in wanted_sockets:
                        owns = True
                        break
                except OSError:
                    continue
            if not owns:
                continue
            exe = os.readlink(str(proc / "exe"))
            raw = (proc / "cmdline").read_bytes()
        except OSError:
            continue
        argv = [part.decode("utf-8", "replace") for part in raw.split(b"\0") if part]
        # Chrome 145+는 메인 프로세스 cmdline을 공백 결합 단일 문자열로 재작성한다
        # (NUL 1개만 남음). 그 형태를 표준 argv로 정규화한다.
        if len(argv) == 1 and " " in argv[0]:
            try:
                argv = shlex.split(argv[0])
            except ValueError:
                continue
        if argv:
            found.append((argv, Path(exe).name))
    return found


def _macos_listener_cmdlines(port: int) -> list[tuple[list[str], str]]:
    """lsof로 127.0.0.1:port LISTEN pid 수집 → (argv, 실행파일명).

    증명 주소는 fetch/attach 주소(127.0.0.1)와 동일하게만 — 다른 주소의 리스너를
    섞지 않는다(조합 오류 방지).
    """
    pids: set[str] = set()
    try:
        out = subprocess.run(
            ["lsof", "-nP", f"-iTCP@127.0.0.1:{port}", "-sTCP:LISTEN", "-F", "p"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    for line in out.splitlines():
        if line.startswith("p") and line[1:].strip().isdigit():
            pids.add(line[1:].strip())
    found: list[tuple[list[str], str]] = []
    for pid in sorted(pids):
        try:
            ps = subprocess.run(["ps", "-o", "command=", "-p", pid],
                                capture_output=True, text=True, timeout=5).stdout.strip()
            comm = subprocess.run(["ps", "-o", "comm=", "-p", pid],
                                  capture_output=True, text=True, timeout=5).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            continue
        if ps and comm:
            found.append((shlex.split(ps), Path(comm).name))
    return found


def _windows_split_command_line(line: str) -> list[str]:
    """Windows CommandLine 파싱 — POSIX shlex는 백슬래시를 escape 처리해 망가뜨리므로
    posix=False로 자르고 각 토큰의 겹따옴표만 벗긴다."""
    try:
        tokens = shlex.split(line, posix=False)
    except ValueError:
        return []
    out = []
    for token in tokens:
        if len(token) >= 2 and token[0] == '"' and token[-1] == '"':
            token = token[1:-1]
        out.append(token)
    return out


def _windows_listener_cmdlines(port: int) -> list[tuple[list[str], str]]:
    """netstat -aon에서 127.0.0.1:port LISTEN만 수집 → (argv, 실행파일명).

    증명 주소는 fetch/attach 주소(127.0.0.1)와 동일하게만.
    """
    out = subprocess.run(["netstat", "-aon"], capture_output=True, text=True, timeout=10).stdout
    pids = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 5 or parts[3] != "LISTENING":
            continue
        host, _, port_str = parts[1].rpartition(":")
        if port_str != str(port) or host != "127.0.0.1":
            continue
        if parts[4].isdigit():
            pids.add(parts[4])
    found: list[tuple[list[str], str]] = []
    for pid in sorted(pids):
        try:
            row = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "(Get-CimInstance Win32_Process -Filter 'ProcessId=" + pid + "')"
                 " | Select-Object CommandLine,ExecutablePath | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=10,
            ).stdout.strip()
            info = json.loads(row) if row else {}
            command_line = str(info.get("CommandLine") or "")
            exe_path = str(info.get("ExecutablePath") or "")
        except (OSError, subprocess.SubprocessError, ValueError):
            continue
        argv = _windows_split_command_line(command_line)
        if argv and exe_path:
            found.append((argv, Path(exe_path).name))
    return found


def _cdp_listener_cmdlines(port: int = CDP_PORT) -> list[tuple[list[str], str]]:
    """**루프백** port를 LISTEN 중인 프로세스의 (argv, 실행파일명)(best-effort, 실패 시 []).

    Chrome 136+/145+는 영수증을 남기지 않으므로, '포트를 점유한 프로세스 자체의
    실행인자'로 전용 프로필을 확정한다(커널 수준 증거). 주소는 fetch/attach 주소인
    127.0.0.1과 동일하게만, 실행파일은 크로미움 계열만 수용한다.
    """
    try:
        system = platform.system()
        if system == "Linux":
            return _linux_listener_cmdlines(port)
        if system == "Darwin":
            return _macos_listener_cmdlines(port)
        if system == "Windows":
            return _windows_listener_cmdlines(port)
    except Exception:
        pass
    return []


def _profile_dir_hardened(profile: Path) -> bool:
    """전용 프로필 디렉토리 계열이 '우리 소유의 사경로 없는 0700'인지(순수 검증).

    생성(mkdir)은 하지 않는다 — gpt_image_web 위임 경로에서도 쓰는 읽기 전용 검증.
    """
    try:
        uid = os.geteuid() if hasattr(os, "geteuid") else None
        current = Path.home().resolve()
        if profile.resolve(strict=True) != profile:
            return False
        for part in profile.relative_to(Path.home().resolve()).parts:
            current = current / part
            details = current.lstat()
            if current.is_symlink() or not stat.S_ISDIR(details.st_mode):
                return False
            if uid is not None and details.st_uid != uid:
                return False
            if os.name != "nt" and stat.S_IMODE(details.st_mode) & 0o077:
                return False
        return True
    except (OSError, ValueError):
        return False


def _listener_binds_dedicated_profile(port: int) -> bool:
    """리스너 증명: 루프백 포트 점유 프로세스가 크로미움 계열 실행파일이며
    마지막 --user-data-dir/--remote-debugging-port 값이 전용 프로필/포트와 정확히 일치."""
    for argv, exe in _cdp_listener_cmdlines(port):
        if _exe_is_chromium_family(exe) and _argv_binds_dedicated_profile(argv, port):
            return True
    return False


def _cdp_matches_dedicated_profile() -> bool:
    """Bind the live CDP endpoint to the dedicated insane-review browser profile.

    증거는 2중: (1) 구버전 영수증(DevToolsActivePort), (2) 루프백 리스너 프로세스
    (크로미움 실행파일)의 --user-data-dir/--remote-debugging-port 바인딩(Chrome 136+).
    어느 하나가 전용 프로필을 확정하면 통과, 둘 다 아니면 fail-closed. 리스너 증명을
    마지막에 측정해 TOCTOU 창을 최소화한다(잔여 위험은 동일 사용자 신뢰 경계 내).
    """
    info = _fetch_cdp_info()
    if info is None:
        return False
    shape_ok, live_ws_path = _cdp_info_shape_ok(info, CDP_PORT)
    if not shape_ok or not _profile_dir_hardened(BROWSER_PROFILE_DIR):
        return False
    if _receipt_binds_dedicated_profile(CDP_PORT, live_ws_path):
        return True
    return _listener_binds_dedicated_profile(CDP_PORT)


def cdp_binds_dedicated_profile(port: int, info: dict) -> bool:
    """형제 CLI(gpt_image_web)용 공개 바인딩 증명 — 동일 전용 프로필 계약.

    위임 이전 gpt_image_web이 스스로 하던 프로필 디렉토리 경성 검증(소유/0700/심볼릭
    없음)도 여기서 동일하게 강제한다.
    """
    shape_ok, live_ws_path = _cdp_info_shape_ok(info, port)
    if not shape_ok or not _profile_dir_hardened(BROWSER_PROFILE_DIR):
        return False
    if _receipt_binds_dedicated_profile(port, live_ws_path):
        return True
    return _listener_binds_dedicated_profile(port)


def launch_browser_exe(path: str) -> bool:
    """전용 프로필 + 디버그 포트로 크로미움 직접 실행한 뒤 소유 프로필을 검증한다."""
    if not _prepare_browser_profile():
        return False
    cmd = [path, f"--remote-debugging-port={CDP_PORT}",
           "--remote-debugging-address=127.0.0.1",
           f"--user-data-dir={BROWSER_PROFILE_DIR}",
           "--no-first-run", "--no-default-browser-check"]

    def _spawn_and_wait(secs: int) -> bool:
        try:
            # The CLI is short-lived, but the dedicated browser must survive it so
            # its authenticated profile and cookies remain available to the next run.
            popen_kwargs = {
                "stdin": subprocess.DEVNULL,
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if os.name == "nt":
                popen_kwargs["creationflags"] = (
                    subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
                )
            else:
                popen_kwargs["start_new_session"] = True
            subprocess.Popen(cmd, **popen_kwargs)
        except OSError as exc:
            print(f"  ❌ 실행 실패: {str(exc)[:80]}")
            return False
        for i in range(secs):
            if is_port_open() and cdp_browser_ok() and _cdp_matches_dedicated_profile():
                print(f"  ✓ 시작 완료 ({i + 1}s)")
                time.sleep(2)
                return True
            time.sleep(1)
        return False

    print(f"  브라우저 시작: {Path(path).name} (CDP {CDP_PORT}, 전용 프로필)")
    if _spawn_and_wait(15):
        return True
    print("  ❌ 전용 프로필 CDP 확인 실패 — 기존 브라우저를 직접 종료한 뒤 다시 시도하세요")
    return False


def ensure_browser(browser_arg: str | None) -> bool:
    """이미 CDP가 떠 있으면 그걸 검증·사용, 아니면 지정/감지된 브라우저를 전용 프로필로 띄운다."""
    if is_port_open():
        if _prepare_browser_profile() and cdp_browser_ok() and _cdp_matches_dedicated_profile():
            print(f"  ✓ CDP 브라우저 확인 (port {CDP_PORT})")
            return True
        print(f"  ❌ port {CDP_PORT}의 브라우저가 전용 프로필과 일치하지 않음")
        return False
    resolved = resolve_browser(browser_arg)
    if not resolved:
        avail = ", ".join(n for n, _ in detect_browsers()) or "없음"
        print(f"  ❌ 사용할 브라우저를 찾지 못함 (지정='{browser_arg}', 설치감지=[{avail}])")
        return False
    return launch_browser_exe(resolved[1])


def probe_login() -> str:
    """브라우저(CDP) up + playwright 있을 때 ChatGPT 로그인 상태를 best-effort로 확인.
    반환: 'ok' | 'no' | 'unknown'(프로브 불가/오류)."""
    import importlib.util
    if not (is_port_open(CDP_PORT) and cdp_browser_ok()):
        return "unknown"
    if not importlib.util.find_spec("playwright"):
        return "unknown"
    try:
        from playwright.sync_api import sync_playwright as _spw
        with _spw() as pw:
            b = pw.chromium.connect_over_cdp(CDP_URL)
            ctx = pick_context(b)
            if ctx is None:
                return "no"
            page = ctx.new_page()
            _guard_dialogs(ctx, page)
            try:
                page.goto(CHATGPT_URL, wait_until="load", timeout=30000)
                time.sleep(2)
                return "ok" if looks_logged_in(page) else "no"
            finally:
                try:
                    page.close()
                except Exception:
                    pass
    except Exception:
        return "unknown"


def check_env(do_install: bool = False) -> int:
    """환경 점검 — node/npx, repomix, pyperclip, playwright, CDP 브라우저, ChatGPT 로그인.
    마지막에 'STATUS ...' 라인을 출력해 커맨드(AskUserQuestion 온보딩)가 분기에 파싱한다."""
    import importlib.util
    print("=== insane-review 환경 점검 ===")
    ok, issues = [], []

    npx, node = shutil.which("npx"), shutil.which("node")
    node_ok = bool(node and npx)
    if node_ok:
        ok.append("node/npx 있음")
        ok.append(f"repomix: `npx -y repomix@{REPOMIX_VERSION or 'latest'}`로 자동 설치(사전설치 불필요)")
    else:
        issues.append(("node/npx 없음", "Node.js 설치: https://nodejs.org 또는 `brew install node`"))

    # pip 의존성 — do_install이면 '로그인 프로브 전에' 먼저 설치(설치 후 프로브 가능)
    if do_install:
        for mod, pip in (("pyperclip", "pyperclip"), ("playwright", "playwright")):
            if not importlib.util.find_spec(mod):
                print(f"  [--install] pip install {pip} ...")
                subprocess.run([sys.executable, "-m", "pip", "install", pip])
        importlib.invalidate_caches()

    deps_ok = True
    for mod, pip in (("pyperclip", "pyperclip"), ("playwright", "playwright")):
        if importlib.util.find_spec(mod):
            ok.append(f"python {mod} 있음")
        else:
            issues.append((f"python {mod} 없음", f"pip install {pip} (또는 --install)"))
            deps_ok = False

    if is_port_open(CDP_PORT) and cdp_browser_ok() and _cdp_matches_dedicated_profile():
        browser_state = "ok"
        ok.append(f"CDP 브라우저({CDP_PORT}) 확인 (전용 프로필 바인딩 OK)")
    elif is_port_open(CDP_PORT) and cdp_browser_ok():
        browser_state = "wrong"
        issues.append((f"port {CDP_PORT}은 CDP 브라우저이나 전용 프로필 바인딩 실패",
                       "다른 프로필/다른 프로세스가 포트를 쓰고 있음 — 종료 후 --launch-browser로 전용 프로필 실행"))
    elif is_port_open(CDP_PORT):
        browser_state = "wrong"
        issues.append((f"port {CDP_PORT}이 CDP 브라우저 아님", "다른 프로세스 종료 후 --launch-browser로 전용 프로필 실행"))
    else:
        browser_state = "down"
        issues.append((f"브라우저 CDP({CDP_PORT}) 닫힘",
                       "전용 브라우저를 디버그포트+전용프로필로 실행(--launch-browser; 아래 BROWSERS 참고)"))

    # ChatGPT 로그인 프로브(브라우저 up + deps 있을 때만)
    login_state = "unknown"
    if browser_state == "ok" and deps_ok:
        login_state = probe_login()
        if login_state == "ok":
            ok.append("ChatGPT 로그인됨 (입력창/모델 어포던스 확인)")
        elif login_state == "no":
            issues.append(("ChatGPT 로그인 안 됨", "해당 브라우저에서 chatgpt.com 로그인 + GPT-5.6 Sol Pro 선택"))

    for o in ok:
        print(f"  ✓ {o}")
    for name, hint in issues:
        print(f"  ✗ {name}\n      → {hint}")

    # 저장된 브라우저 선택값(있으면 이름) — 커맨드가 "최초 1회만 질문" 분기를 명시적으로 판단.
    _saved = _load_config().get("browser")
    if _saved:
        _r = resolve_browser(_saved)
        saved_browser = _r[0] if _r else _saved
    else:
        saved_browser = "none"

    # 머신 파싱용 상태 라인 — 커맨드 온보딩이 어느 단계가 막혔는지 분기에 사용(토큰 additive)
    print(f"\nSTATUS node={'ok' if node_ok else 'missing'} deps={'ok' if deps_ok else 'missing'} "
          f"browser={browser_state} login={login_state} saved_browser={saved_browser} os={host_os()}")
    # 설치된 크로미움 목록 — 커맨드가 브라우저 선택 AskUserQuestion을 구성하는 데 사용
    bs = detect_browsers()
    print("BROWSERS " + ",".join(n for n, _ in bs))
    print(f"결과: {len(ok)} OK / {len(issues)} 부족" + ("  — 전부 준비됨 ✅" if not issues else "  ⚠️"))
    return len(issues)


# ===========================================================================
# 3) ChatGPT 상호작용 프리미티브
# ===========================================================================
def find_input(page):
    for sel in INPUT_SELECTORS:
        try:
            el = page.query_selector(sel)
            if el:
                return el
        except Exception:
            continue
    return None


def _q(page, selectors):
    """폴백 리스트에서 첫 매치 노드(없으면 None)."""
    if isinstance(selectors, str):
        selectors = [selectors]
    for sel in selectors:
        try:
            node = page.query_selector(sel)
        except Exception:
            continue
        if node is not None:
            return node
    return None


def _qa(page, selectors):
    """폴백 리스트에서 첫 비어있지 않은 query_selector_all 결과(없으면 [])."""
    if isinstance(selectors, str):
        selectors = [selectors]
    for sel in selectors:
        try:
            nodes = page.query_selector_all(sel)
        except Exception:
            continue
        if nodes:
            return nodes
    return []


def count_msgs(page, selectors) -> int:
    if isinstance(selectors, str):
        selectors = [selectors]
    for sel in selectors:
        try:
            n = len(page.query_selector_all(sel))
        except Exception:
            continue
        if n:
            return n
    return 0


def count_msgs_strict(page, selectors) -> int:
    """기준개수 포착 전용 — 조회 실패를 0으로 숨기지 않는다. 재시도 후에도 실패하면 예외(fail-closed).
    base_* 가 조회실패로 0이 되면 기존 DOM이 '새 턴'으로 오인돼 이전 답변을 저장할 수 있으므로 이를 차단한다."""
    if isinstance(selectors, str):
        selectors = [selectors]
    last_exc = None
    for _ in range(3):
        clean_zero = True
        for sel in selectors:
            try:
                n = len(page.query_selector_all(sel))
            except Exception as exc:
                last_exc = exc
                clean_zero = False
                continue
            if n:
                return n
        if clean_zero:
            return 0  # 전 셀렉터 조회 성공 + 전부 0 — 실제로 없음
        time.sleep(0.3)
    raise RuntimeError(f"기준 메시지 수 조회 실패({selectors}): {str(last_exc)[:60]} → 전송 중단(fail-closed)")


def msg_id_set(page) -> set:
    """현재 DOM의 data-message-id 집합(역할 무관). 실패 시 빈 집합.

    빈 집합이 base로 쓰이면 '아무것도 제외하지 않음'이므로 신규 판정이 느슨해질 수
    있다 — 호출자는 count 기준선과 AND로 묶어서 쓴다(단독 fail-open 금지)."""
    try:
        return set(page.eval_on_selector_all(
            "[data-message-id]", 'els => els.map(e => e.getAttribute("data-message-id"))'))
    except Exception:
        return set()


def new_assistant_nodes(page, base_ids: set):
    """base_ids에 없는 '신규' assistant 턴 노드들(순서 유지)."""
    fresh = []
    for node in _qa(page, ASSISTANT_MSG_SELECTORS):
        try:
            if (node.get_attribute("data-message-id") or "") not in base_ids:
                fresh.append(node)
        except Exception:
            continue
    return fresh


def is_streaming(page) -> bool:
    try:
        return _q(page, STREAMING_BTN_SELECTORS) is not None
    except Exception:
        return False


def detect_quota_block(page) -> str | None:
    """쿼터/한도 차단 감지 — role=dialog/alert 표면만 스캔한다.

    응답 본문은 절대 보지 않는다(리뷰 답변이 한도를 논하면 오탐). 매칭 문구를
    반환하고, 실패는 조용히 None(대기 루프를 깨지 않는다)."""
    try:
        for sel in ('[role="dialog"]', '[role="alert"]'):
            for node in page.query_selector_all(sel):
                try:
                    txt = (node.inner_text() or "").strip()
                except Exception:
                    continue
                if not txt:
                    continue
                low = txt.lower()
                for hint in QUOTA_HINTS:
                    if hint.lower() in low:
                        return txt[:200]
    except Exception:
        return None
    return None


def normalize(text: str | None) -> str:
    return re.sub(r"\s+", " ", text).strip() if text else ""


def rejection_reason(response: str, prompt: str) -> str | None:
    """Return why a recovered page is not a usable answer, if applicable."""
    normalised = normalize(response)
    if not normalised:
        return "응답이 비어 있음"
    for marker in REFUSAL_MARKERS:
        if normalised.startswith(marker) and len(normalised) <= 1000:
            return f"모델 거부 응답 감지: {marker}"
    prompt_normalised = normalize(prompt)
    prompt_head = prompt_normalised[:PROMPT_ECHO_CHARS]
    echo_extra = len(normalised) - len(prompt_normalised)
    if (len(prompt_head) >= MIN_ECHO_CHARS
            and normalised.startswith(prompt_normalised)
            and 0 <= echo_extra <= 40):
        return "프롬프트 앞부분이 응답에 그대로 반복됨(답변 아님)"
    return None


def last_assistant_node(page):
    nodes = _qa(page, ASSISTANT_MSG_SELECTORS)
    return nodes[-1] if nodes else None


def last_assistant_text(page) -> str:
    node = last_assistant_node(page)
    if node:
        try:
            return node.inner_text() or ""
        except Exception:
            return ""
    return ""


def node_copy_button(node):
    """그 턴 '자신의' copy 버튼. 전역 마지막 버튼을 집지 않는다.

    실측(sol-lane 0.6.5): copy 버튼은 메시지 div 바깥의 턴 컨테이너 툴바에 있어
    closest('[data-turn]')에서 찾아야 하고, user 턴에도 copy 버튼이 있어 전역
    개수로는 assistant 턴을 구분할 수 없다."""
    for sel in COPY_BTN_SELECTORS:
        try:
            btn = node.evaluate_handle(
                """(el, sel) => {
                    const turn = el.closest('[data-turn]') || el.parentElement;
                    return turn ? turn.querySelector(sel) : null;
                }""", sel)
        except Exception:
            continue
        try:
            element = btn.as_element() if btn else None
        except Exception:
            element = None
        if element is not None:
            return element
    return None


def turn_terminal(page, node) -> bool:
    """대상 턴이 끝났는가: 스트리밍 아님 + (그 턴의 copy 버튼 또는 전송 버튼 복귀).

    전역 copy 버튼 '개수 증가'를 필수 조건으로 삼던 옛 설계를 대체한다 — 그 방식은
    user 턴의 copy 버튼과 셀렉터 불일치 때문에 델타가 깨졌다(sol-lane 0.6.5 P0)."""
    if is_streaming(page):
        return False
    if node_copy_button(node) is not None:
        return True
    # copy 버튼이 늦게 붙는 UI: 전송 버튼이 되살아났으면 턴은 끝난 것이다.
    try:
        send = _q(page, ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'])
        if send is not None and send.is_enabled():
            return True
    except Exception:
        pass
    return False


def last_turn_complete(page, base_assistant: int = 0, base_ids: set | None = None) -> bool:
    """신규 assistant 턴이 완료됐는지. 대상 턴 = message-id 차집합의 신규 노드.

    base_assistant(개수 기준선)와 AND로 묶는다 — id 조회가 실패해 빈 집합이
    돌아와도 개수 기준선이 이전 응답을 새 턴으로 오인하는 것을 막는다."""
    if is_streaming(page):
        return False
    try:
        if count_msgs(page, ASSISTANT_MSG_SELECTORS) <= base_assistant:
            return False
        node = new_assistant_target(page, base_ids)
        return node is not None and turn_terminal(page, node)
    except Exception:
        return False


def new_assistant_target(page, base_ids: set | None):
    """회수 대상 assistant 노드 — 신규 id가 있으면 그것, 없으면 마지막 노드."""
    if base_ids is not None:
        fresh = new_assistant_nodes(page, base_ids)
        if fresh:
            return fresh[-1]
        if base_ids:
            # 기준 id가 있었는데 신규가 없다 → 아직 우리 턴이 아니다(fail-closed)
            return None
    return last_assistant_node(page)


def copy_turn(page, node, expected: str = "") -> str | None:
    """대상 턴의 copy 버튼으로 회수 + 클립보드 오염 대조.

    대기 중 사용자가 다른 것을 복사했을 수 있으므로 그 턴의 DOM 텍스트와
    대조해 통과할 때만 클립보드 값을 인정한다(불일치 시 None → DOM 폴백)."""
    if pyperclip is None:
        return None
    btn = node_copy_button(node)
    if btn is None:
        return None
    for _ in range(3):
        try:
            pyperclip.copy("__INSANE_REVIEW_SENTINEL__")
            btn.click(force=True)
            time.sleep(1)
            txt = pyperclip.paste()
        except Exception:
            return None
        if txt and txt != "__INSANE_REVIEW_SENTINEL__" and txt.strip():
            if clipboard_matches(txt, expected):
                return txt
            return None
        time.sleep(0.5)
    return None


def clipboard_matches(clip: str, expected: str) -> bool:
    """클립보드가 그 턴의 DOM 텍스트와 같은 답인지(경합 오염 차단).

    80자 미만은 정규화 전체 일치를 요구한다 — 짧은 답에서 앞/뒤 조각만 보면
    사실상 무조건 통과였다. 그 이상은 시작·중간·끝 3조각을 대조한다."""
    want = normalize(expected)
    got = normalize(clip)
    if not want:
        return True
    if not got:
        return False
    if len(want) < 80:
        return got == want
    for piece in (want[:40], want[len(want) // 2:len(want) // 2 + 40], want[-40:]):
        if piece and piece not in got:
            return False
    return True


# ---- 모델 스위처 ----
MODEL_SWITCHER_SELECTORS = [
    'button.__composer-pill[aria-haspopup="menu"]',   # 실측: 모델/추론 pill
    'button[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="model" i]',
]
# ChatGPT는 추론단계 라벨 체계를 자주 바꾼다(2026-08-19 하루에 '즉시…Pro' →
# 'Light…최대/울트라'까지 관측). --model 값은 '의미'를 가리키고 엔진은 아래
# 별칭 후보 중 실제 존재하는 라벨을 aria-checked 실측으로 선택/검증한다.
# 2026-08-31 실측(sol-lane e8c1a3f 백포팅): 모델명 표기가 'GPT-5.6 Sol'에서 '5.6 Sol'로
# 바뀌었다 — 접두사 없는 버전 숫자(\d+\.\d+)도 모델명으로 인정한다. effort 항목
# (즉시/중간/높음/매우 높음/최대/기본)에는 숫자가 없으므로 구분은 유지된다.
MODEL_NAME_RE = r"GPT|gpt|o\d|Claude|Gemini|\d+\.\d+"


def _model_name_matches(menu_name: str, require: str) -> bool:
    """2026-08-31 UI는 'GPT-5.6 Sol'을 '5.6 Sol'로 표시한다.

    요청명과 메뉴명 양쪽에서 'GPT-'/'gpt ' 접두사를 떼고 나머지의 포함 관계로
    비교한다: require 'GPT-5.6 Sol'은 메뉴 '5.6 Sol'과 일치한다.
    """
    def strip_prefix(value: str) -> str:
        lowered = value.strip().casefold()
        for prefix in ("gpt-", "gpt ", "gpt"):
            if lowered.startswith(prefix):
                return lowered[len(prefix):].strip("- ")
        return lowered

    return strip_prefix(require) in strip_prefix(menu_name) or strip_prefix(menu_name) in strip_prefix(require)


EFFORT_ALIASES = {
    "pro": ("pro", "최대", "울트라", "ultra", "max"),
    "max": ("max", "최대", "pro", "울트라", "ultra"),
    "ultra": ("ultra", "울트라", "pro", "최대", "max"),
    "high": ("high", "높음"),
    "medium": ("medium", "중간"),
    "low": ("low", "light", "낮음"),
    "light": ("light", "low", "낮음"),
}


def _effort_candidates(want: str) -> tuple[str, ...]:
    key = want.strip().casefold()
    if key in EFFORT_ALIASES:
        return EFFORT_ALIASES[key]
    return (want.strip(),)


EFFORT_ITEM_SELECTORS = ['[role="menuitemradio"]', '[role="menuitem"]', '[role="option"]']


def read_model_pills(page) -> list[str]:
    out = []
    for el in page.query_selector_all('button.__composer-pill'):
        try:
            t = (el.inner_text() or "").strip()
            if t:
                out.append(t)
        except Exception:
            continue
    return out


def _drive_effort_slider(page, slider, want_l: str) -> str | None:
    """Select an effort level from the August 2026 slider and verify via the pill."""
    try:
        slider.click(force=True)
        time.sleep(0.4)
        for _ in range(8):
            if slider.get_attribute("aria-valuenow") == slider.get_attribute("aria-valuemin"):
                break
            page.keyboard.press("ArrowLeft")
            time.sleep(0.35)
        for _ in range(9):
            label = _exact_effort_pill(page, want_l)
            at_maximum = slider.get_attribute("aria-valuenow") == slider.get_attribute("aria-valuemax")
            if label and (want_l != "pro" or at_maximum):
                return label
            if at_maximum:
                return None
            page.keyboard.press("ArrowRight")
            time.sleep(0.5)
    except Exception:
        return None
    return None


def _exact_effort_pill(page, want_l: str) -> str | None:
    """Return an exact effort label, never a model or unrelated Pro-containing pill.

    want_l이 별칭 그룹('pro' 등)이면 그 후보 라벨들도 정확 매칭한다."""
    wanted = {c.casefold() for c in _effort_candidates(want_l)}
    for pill in read_model_pills(page):
        lines = [line.strip() for line in pill.splitlines() if line.strip()]
        for line in lines:
            if line.casefold() in wanted:
                return line[:40]
    return None


def _slider_effort_verified(page, want_l: str) -> bool:
    try:
        slider = page.query_selector('[role="slider"]')
        if slider is None:
            return False
        at_maximum = slider.get_attribute("aria-valuenow") == slider.get_attribute("aria-valuemax")
        is_top = want_l.strip().casefold() in {"pro", "max", "ultra", "최대", "울트라"}
        return _exact_effort_pill(page, want_l) is not None and (not is_top or at_maximum)
    except Exception:
        return False


def _open_switcher(page):
    # 컴포저 pill은 하이드레이션 중 aria-haspopup이 늦게 붙는다(실측: pill 클래스
    # 조회는 잡히는데 aria-haspopup 셀렉터만 빗나감 → 재시도 소진). 광범위 폴백
    # 셀렉터 + 짧은 재시도로 하이드레이션을 기다린다.
    selectors = MODEL_SWITCHER_SELECTORS + ['button.__composer-pill']
    for _attempt in range(4):
        for sel in selectors:
            try:
                el = page.query_selector(sel)
                if el:
                    el.click()
                    time.sleep(1.2)
                    return True
            except Exception:
                continue
        time.sleep(1.0)
    return False


def _menu_text(node) -> str:
    """Return accessible label plus visible text for localized menu rows."""
    try:
        label = node.get_attribute("aria-label") or ""
        text = node.inner_text() or ""
        return "\n".join(part.strip() for part in (label, text) if part.strip())
    except Exception:
        return ""


def _switcher_menu_open(page) -> bool:
    try:
        return bool(page.query_selector('[role="menu"]'))
    except Exception:
        return False


def _ensure_switcher_menu(page) -> bool:
    return _switcher_menu_open(page) or _open_switcher(page)


def _expand_advanced_options(page) -> bool:
    """Open the localized advanced view when the current ChatGPT UX hides it.

    2026-08-19 이후 UI는 '고급' 토글 없이 모델/추론 행이 기본으로 보인다 — 그 경우
    토글 탐색 없이 이미 성공으로 간주한다(메뉴 형태가 자주 바뀌는 대응)."""
    try:
        if _find_menu_row(page, ("모델", "model")) and _find_menu_row(page, ("추론", "reasoning")):
            return True
        for row in page.query_selector_all('[role="menuitem"]'):
            label = _menu_text(row).lower()
            expanded = row.get_attribute("aria-expanded")
            if "고급" in label or "advanced" in label or "간략" in label:
                if expanded == "true":
                    return True
                row.click()
                time.sleep(0.8)
                return True
    except Exception:
        pass
    return False


def _find_menu_row(page, labels: tuple[str, ...]):
    for row in page.query_selector_all('[role="menuitem"]'):
        text = _menu_text(row).lower()
        if any(label.lower() in text for label in labels):
            return row
    return None


def _click_menu_radio(page, target: str) -> str | None:
    target_l = target.lower()
    # 2026-08 실측: 서브메뉴 라디오는 포털 재렌더로 (1) ElementHandle 탈착,
    # (2) actionability 대기(stable) 영구 불완료, (3) 심지어 force 클릭도 무시된다.
    # 접근성 role 매칭 + dispatch_event('click') 합성 이벤트가 유일하게 안정 동작.
    try:
        loc = page.get_by_role("menuitemradio", name=target, exact=True)
        if loc.count() == 0:
            loc = page.get_by_role("option", name=target, exact=True)
        if loc.count() == 0:
            loc = page.get_by_role("menuitemradio", name=target)
        if loc.count() > 0:
            loc.first.dispatch_event("click")
            time.sleep(0.8)
            return target[:40]
    except Exception:
        pass
    # 폴백: role 이름 밖의 표현(부분 라벨/개행 포함) — 핸들 재조회 재시도
    for _attempt in range(2):
        try:
            candidates = page.query_selector_all('[role="menuitemradio"], [role="option"]')
            for exact in (True, False):
                for item in candidates:
                    text = _menu_text(item).strip()
                    lines = [line.strip() for line in text.splitlines() if line.strip()]
                    candidate = lines[-1] if lines else text
                    matched = candidate.lower() == target_l if exact else target_l in text.lower()
                    if matched:
                        try:
                            item.click(timeout=5000)
                        except Exception:
                            time.sleep(0.4)
                            break
                        time.sleep(0.8)
                        return candidate[:40]
        except Exception:
            pass
        time.sleep(0.3)
    return None


def _click_menu_row(page, labels: tuple[str, ...]) -> bool:
    """메뉴 행(모델/추론 강도) 클릭 — 재마운트로 핸들이 떨어지면 재조회 재시도."""
    for _attempt in range(3):
        row = _find_menu_row(page, labels)
        if row is None:
            return False
        try:
            row.click(force=True, timeout=5000)
            return True
        except Exception:
            time.sleep(0.4)
    return False



def _radio_effort_actually_checked(page, want: str) -> bool:
    """클릭한 추론 라디오가 실제로 aria-checked=true가 됐는지(2026-08 UI는 클릭이
    조용히 무시될 수 있다 — 반환값만으로 판단하지 않는다). 별칭 후보도 수용."""
    wanted = {c.casefold() for c in _effort_candidates(want)}
    try:
        for item in page.query_selector_all('[role="menuitemradio"], [role="option"]'):
            if item.get_attribute("aria-checked") != "true":
                continue
            lines = [line.strip() for line in _menu_text(item).splitlines() if line.strip()]
            candidate = lines[-1] if lines else ""
            if candidate.casefold() in wanted:
                return True
    except Exception:
        pass
    return False

def _effort_row_shows(page, want: str) -> bool:
    """상위 '추론' 행의 현재 값이 별칭 후보 중 하나인지(라디오가 사라진 UI용 검증)."""
    wanted = {c.casefold() for c in _effort_candidates(want)}
    row = _find_menu_row(page, ("추론", "reasoning"))
    if row is None:
        return False
    lines = [line.strip() for line in _menu_text(row).splitlines() if line.strip()]
    return bool(lines) and lines[-1].casefold() in wanted


def _select_advanced_model_and_effort(page, want: str, require_model: str) -> tuple[bool, str | None] | None:
    """Select Model and Reasoning effort from the current Advanced menu UX."""
    if not _expand_advanced_options(page):
        return None
    model_row = _find_menu_row(page, ("모델", "model"))
    effort_row = _find_menu_row(page, ("추론", "reasoning"))
    if not model_row or not effort_row:
        return None
    wanted_efforts = {c.casefold() for c in _effort_candidates(want)}
    # fast-path: 이미 목표 조합이면 조작 없이 행 텍스트로만 검증 통과(2026-08 UI는
    # 조작 클릭이 불안정하고, 사용자가 수동 설정해 둔 상태가 흔하다).
    current_model = _menu_text(model_row).splitlines()[-1].strip()
    current_effort = _menu_text(effort_row).splitlines()[-1].strip()
    if _model_name_matches(current_model, require_model) and current_effort.casefold() in wanted_efforts:
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        result_name = f"{current_model} ({current_effort})"
        print(f"  ✓ 이미 목표 조합: model={current_model}, effort={current_effort} → 조작 생략")
        return True, result_name
    if not _click_menu_row(page, ("모델", "model")):
        return False, None
    time.sleep(0.8)
    selected_model = _click_menu_radio(page, require_model)
    if selected_model is None:
        return False, None
    if not _ensure_switcher_menu(page) or not _expand_advanced_options(page):
        return False, None
    # 추론 강도: 라벨 체계가 자주 바뀐다(2026-08: 'Pro' → '최대/울트라' 관측).
    # 별칭 후보 순서로 라디오 시도 → 검증은 (a) 라디오 aria-checked 또는
    # (b) 성공 선택이 서브메뉴를 닫아버린 UI를 위한 상위 행 값. 그래도 없으면 슬라이더.
    effort_candidates = _effort_candidates(want)
    selected_effort = None
    slider_used = False
    if _click_menu_row(page, ("추론", "reasoning")):
        time.sleep(0.8)
        for cand in effort_candidates:
            clicked = _click_menu_radio(page, cand) is not None
            if clicked and _radio_effort_actually_checked(page, want):
                selected_effort = cand
                break
            # 서브메뉴가 닫혔을 수 있다(성공 선택이 닫는 UI) — 재오픈 후 상위 행 값으로 검증
            if clicked and _ensure_switcher_menu(page) and _expand_advanced_options(page) and _effort_row_shows(page, want):
                selected_effort = cand
                break
            if not _ensure_switcher_menu(page) or not _expand_advanced_options(page) or not _click_menu_row(page, ("추론", "reasoning")):
                break
            time.sleep(0.6)
    if selected_effort is None:
        if not _ensure_switcher_menu(page):
            return False, None
        slider = page.query_selector('[role="slider"]')
        if slider is None:
            return False, None
        selected_effort = _drive_effort_slider(page, slider, want.lower())
        slider_used = selected_effort is not None
    if selected_effort is None:
        return False, None
    if not _ensure_switcher_menu(page) or not _expand_advanced_options(page):
        return False, None
    model_row = _find_menu_row(page, ("모델", "model"))
    effort_row = _find_menu_row(page, ("추론", "reasoning"))
    model_text = _menu_text(model_row) if model_row else ""
    if not model_text.strip():
        return False, None
    effort_text = _menu_text(effort_row) if effort_row else ""
    if not effort_text.strip():
        return False, None  # 최종 행 증거 없음 — 요청값 폴백 금지(fail-closed)
    verified_model = model_text.splitlines()[-1].strip()
    verified_effort = effort_text.splitlines()[-1].strip()
    wanted_efforts = {c.casefold() for c in _effort_candidates(want)}
    effort_ok = (_slider_effort_verified(page, want.strip().casefold())
                 if slider_used else verified_effort.casefold() in wanted_efforts)
    verified = _model_name_matches(verified_model, require_model) and effort_ok
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    result_name = f"{verified_model} ({verified_effort})"
    print(f"  {'✓' if verified else '❌'} 최종 모델 검증: model={verified_model} (기대:{require_model}), effort={verified_effort} (기대:{want}) -> 결과={'OK' if verified else '실패'}")
    return verified, result_name if verified else None


def read_menu_state(page) -> dict:
    """열린 메뉴에서 모델명(menuitem 중 checked/selected) + 체크된 추론단계(menuitemradio aria-checked)를 읽는다."""
    state = {"model": None, "model_source": None, "models": [], "effort_checked": None, "items": []}
    try:
        # 한 번 순회하며 (1) 모델같은 항목 전부 수집, (2) aria-checked/selected된 활성 모델 검출
        for it in page.query_selector_all('[role="menuitem"], [role="menuitemradio"], [role="option"]'):
            is_checked = it.get_attribute("aria-checked") == "true" or it.get_attribute("aria-selected") == "true"
            t = _menu_text(it)
            if t and re.search(MODEL_NAME_RE, t):
                name = t.splitlines()[0][:40]
                if name not in state["models"]:
                    state["models"].append(name)
                if is_checked and not state["model"]:
                    state["model"] = name
                    state["model_source"] = "checked"
        # 활성표시(aria-checked)를 못 찾았을 때만 첫 모델명 폴백 — 출처를 'fallback'으로 표기(검증 시 모호하면 거부)
        if not state["model"] and state["models"]:
            state["model"] = state["models"][0]
            state["model_source"] = "fallback"
    except Exception:
        pass
    try:
        for it in page.query_selector_all('[role="menuitemradio"]'):
            t = _menu_text(it)
            # 모델 radio('5.6 Sol' 등)는 effort 후보가 아니다 — items와
            # effort_checked 모두에서 제외한다(2026-08-31 실측: 모델 radio가 items를
            # 채워 already-pill/슬라이더 분기를 우회하게 만들었다).
            if re.search(MODEL_NAME_RE, t):
                continue
            state["items"].append(t)
            if it.get_attribute("aria-checked") == "true":
                state["effort_checked"] = t
    except Exception:
        pass
    return state


def select_model(page, want: str, require_model: str | None = None) -> tuple[bool, str | None]:
    """모델 스위처를 열고 want(추론단계, 예: 'pro')를 선택 + 검증.
    require_model 지정 시 모델명(예: 'GPT-5.6')이 일치하지 않으면 False(실패) 반환.
    반환: (verified, verified_model_name)"""
    want_l = want.lower()
    # 2026-08-31 실측: 메뉴가 열리면 composer pill이 DOM에서 사라지고 effort 표시는
    # pill('5.6 Sol|최대')의 둘째 줄에만 남는다 — 열기 '전에' 스냅숏해 already 판정에 쓴다.
    pill_effort_before = _exact_effort_pill(page, want_l)
    if not _open_switcher(page):
        print("  ⚠️  모델 스위처를 못 찾음 → 기본 모델로 진행")
        return False, None

    if require_model:
        advanced_result = _select_advanced_model_and_effort(page, want, require_model)
        if advanced_result is not None:
            return advanced_result

    before = read_menu_state(page)
    if before["model"]:
        print(f"  메뉴 모델명: {before['model']!r} / 추론단계 목록: {before['items']}")

    # require_model 검증 (모델명을 읽지 못했거나 모델명이 기대값과 다르면 즉시 중단)
    if require_model:
        if not before["model"]:
            print(f"  ❌ 모델명 획득 실패 (require_model '{require_model}' 검증 불가) → 즉시 중단 (fail-closed)")
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            return False, None
        if not _model_name_matches(before["model"], require_model):
            print(f"  ❌ 모델 불일치: 기대 '{require_model}' ≠ 메뉴 '{before['model']}' → 중단(전송 안 함)")
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            return False, None

    # 추론단계 클릭 대상 탐색
    clicked = None
    slider_used = False
    already_pill = False
    if before["effort_checked"] is None and pill_effort_before is not None:
        # 2026-08-31 UI: effort가 메뉴가 아니라 pill에만 있다. 메뉴를 열기 전의 pill이
        # 이미 목표 단계를 가리키면 조작 없이 인정한다(메뉴 안에서 pill은 DOM에 없다).
        print(f"  추론단계 이미 선택됨(pill): {pill_effort_before!r} (조작 생략)")
        clicked = f"already-pill:{pill_effort_before}"
        already_pill = True
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        time.sleep(0.5)
    if not clicked and not before["items"]:
        try:
            slider = page.query_selector('[role="slider"]')
        except Exception:
            slider = None
        if slider is not None:
            label = _drive_effort_slider(page, slider, want_l)
            if not label:
                print(f"  ❌ 추론단계 슬라이더에서 '{want}' 단계를 못 찾음 → 중단(전송 안 함)")
                try:
                    page.keyboard.press("Escape")
                except Exception:
                    pass
                return False, None
            print(f"  추론단계 슬라이더: {label!r} 선택")
            clicked = f"slider:{label}"
            slider_used = True
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
            time.sleep(0.5)
    cands = []
    if not clicked:
        for sel in EFFORT_ITEM_SELECTORS:
            try:
                cands.extend(page.query_selector_all(sel))
            except Exception:
                continue

        for exact in (True, False):
            for it in cands:
                try:
                    t = (it.inner_text() or "").strip()
                    low = t.lower()
                    if (exact and low == want_l) or (not exact and want_l in low):
                        it.click()
                        clicked = t.splitlines()[0][:40]
                        time.sleep(1.5)  # 클릭 후 드롭다운이 닫히는 시간 대기
                        break
                except Exception:
                    continue
            if clicked:
                break

    if not clicked:
        print(f"  ⚠️  '{want}' 추론단계 항목 못 찾음 → 기본값")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return False, None

    # Pro 제안: 메뉴 재오픈하여 effort_checked 및 model_checked 상태 검증
    if not _open_switcher(page):
        if not already_pill:
            print("  ⚠️  선택 상태 검증을 위해 메뉴 재오픈 실패")
            return False, None
        print("  ⚠️  메뉴 재오픈 실패 — 조작이 없었으므로 최초 메뉴 읽기로 검증한다")
        after = before
    else:
        after = read_menu_state(page)
        # 2026-08-27 실측(sol-lane 이식): Escape 후 재오픈이 빈 메뉴를 준다(포털 재마운트).
        # 조작이 없었던 already 경로는 before==after가 논리적으로 보장되므로 최초 읽기로 검증.
        if already_pill and after["model"] is None and after["effort_checked"] is None:
            after = before
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass
    time.sleep(0.5)

    model_verified = True
    if require_model:
        name_ok = after["model"] is not None and _model_name_matches(after["model"], require_model)
        # 폴백(활성표시 없음)으로 잡은 모델명은 메뉴에 모델이 여러 개일 때 신뢰 불가 → fail-closed.
        # 활성표시(checked)거나 메뉴에 모델이 하나뿐이면 폴백이라도 안전(= 활성 모델).
        src_ok = (after.get("model_source") == "checked") or (len(after.get("models") or []) <= 1)
        model_verified = name_ok and src_ok
        if name_ok and not src_ok:
            print(f"  ❌ 활성 모델 확정 불가(체크표시 없음 + 메뉴에 모델 {len(after['models'])}개: {after['models']}) → fail-closed")

    effort_verified = (_slider_effort_verified(page, want_l)
                       if slider_used else
                       (after["effort_checked"] is not None and want_l in after["effort_checked"].lower())
                       or (already_pill and (pill_effort_before is not None
                                             or _exact_effort_pill(page, want_l) is not None)))
    verified = model_verified and effort_verified

    verified_model = after["model"] or "Unknown Model"
    verified_effort = verified_effort_label(
        slider_label=_exact_effort_pill(page, want_l),
        slider_used=slider_used,
        checked_label=after["effort_checked"],
        pill_label_before=pill_effort_before,
    )
    verified_model_name = f"{verified_model} ({verified_effort})"

    print(f"  {'✓' if verified else '⚠️'} 최종 모델 검증: model={after['model']} (기대:{require_model}), effort={after['effort_checked']} (기대:{want}) -> 결과={'OK' if verified else '실패'}")
    return verified, verified_model_name


def verified_effort_label(*, slider_label: str | None, slider_used: bool,
                          checked_label: str | None, pill_label_before: str | None) -> str:
    return ((slider_label if slider_used else checked_label)
            or pill_label_before
            or "Default")


def write_response_artifact(path: Path, body: str) -> None:
    """Create a new private response without following or replacing an artifact."""
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    identity = os.fstat(fd)
    try:
        try:
            os.fchmod(fd, 0o600)
        except AttributeError:
            os.chmod(path, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            fd = -1
            stream.write(body)
    except Exception:
        if fd >= 0:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            current = os.stat(path, follow_symlinks=False)
            if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino):
                os.unlink(path)
        except OSError:
            pass
        raise


# ---- 첨부 / 입력 / 전송 ----
def attach_file(page, path: Path) -> bool:
    """파일 첨부 후 '파일명이 실제로 첨부 영역에 떴는지' 검증."""
    try:
        inp = page.query_selector(FILE_INPUT_SELECTOR)
        if not inp:
            print("  ⚠️  파일 입력 요소를 못 찾음 → 호출자 폴백 판단(붙여넣기 or 중단)")
            return False
        inp.set_input_files(str(path))
        print(f"  파일 첨부 시도: {path.name} (업로드 대기...)")
        stem = path.stem[:14]  # 칩 라벨은 잘릴 수 있어 앞부분만 매칭
        
        # composer 내부 영역(form 또는 textarea의 presentation 부모)으로 locator 한정
        # ChatGPT UI에서 파일 첨부 칩이 노출되는 영역
        composer = page.locator("form:has(#prompt-textarea), [role='presentation']:has(#prompt-textarea)").first
        
        for _ in range(40):
            time.sleep(1)
            try:
                # composer 내부에서만 stem 텍스트를 갖는 칩(요소) 검색
                chip = composer.get_by_text(stem, exact=False)
                if chip.count() > 0:
                    print("  ✓ 첨부 확인됨 (composer 내 파일명 노출)")
                    time.sleep(1.5)
                    return True
            except Exception:
                pass
        print("  ❌ 첨부 칩(파일명) 확인 실패 — fail-closed (잘못된 컨텍스트 전송 방지)")
        return False
    except Exception as exc:
        print(f"  ❌ 첨부 실패({str(exc)[:60]})")
        return False


def build_paste_fallback(prompt: str, pack_path: Path) -> str | None:
    """첨부 실패 시 pack을 프롬프트에 인라인으로 붙여 보낼 메시지를 구성.
    크기 상한 초과면 None(호출자가 조용히 자르지 않고 fail-closed) — 잘린 컨텍스트 전송 방지."""
    try:
        body = pack_path.read_text(encoding="utf-8", errors="strict")
    except OSError:
        return None
    if len(body) > PASTE_FALLBACK_MAX_CHARS:
        return None
    return f'{prompt}\n\n<repomix_pack file="{pack_path.name}">\n{body}\n</repomix_pack>'


SEND_BTN_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-send-button"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="보내기" i]',
    'button[aria-label*="프롬프트 보내기" i]',
]


def put_text(page, message: str):
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(0.3)
    el = find_input(page)
    focused = False
    if el is not None:
        try:
            el.click(force=True)  # 메뉴 조작 뒤 포커스가 pill에 남아 insert_text가
            focused = True        # 허공에 떨어지는 것을 막는다(실제 클릭으로 진입).
        except Exception:
            focused = False
    if not focused:
        page.evaluate(
            """() => { const el = document.querySelector('#prompt-textarea')
                || document.querySelector('div[contenteditable=\\"true\\"]');
                if (el) { el.scrollIntoView({block:'center'}); el.focus(); } }"""
        )
    time.sleep(0.3)
    # 잔여 draft를 지운다 — '비었음'을 읽어 확인하지 못하면 입력하지 않는다(fail-closed:
    # 잔여 텍스트가 프롬프트에 섞여 전송되는 것을 원천 차단. 전용 프로필 소유 상태).
    if not clear_composer(page):
        raise RuntimeError("composer 초기화 실패(잔여 텍스트 제거 불가) → 중단(fail-closed)")
    # 크로스플랫폼: OS 클립보드/⌘V(맥 전용) 대신 Playwright 네이티브 insert_text(insertText 이벤트).
    # → mac/win/linux 동일 동작 + 동시 실행 시 클립보드 경합 제거. 실패 시 키 입력 폴백.
    try:
        page.keyboard.insert_text(message)
    except Exception:
        page.keyboard.type(message)
    time.sleep(0.6)


def read_composer_text(page) -> str:
    """입력창(composer)에 현재 들어있는 텍스트를 읽는다(전송 전 프롬프트 입력 검증용)."""
    try:
        return page.evaluate(
            """() => { const el = document.querySelector('#prompt-textarea')
                || document.querySelector('div[contenteditable=\\"true\\"]');
                return el ? (el.innerText || el.textContent || '') : ''; }"""
        ) or ""
    except Exception:
        return ""


def composer_has_prompt(page, prompt: str) -> bool:
    """프롬프트 '전체'가 composer에 **정확히** 들어갔는지 검증(정규화 후 동일성).

    잘림·중복·앞뒤 잔여 draft·그 외 오염 모두 '동일성 불일치'로 거부한다(fail-closed).
    예전의 1.5배 길이 여유 슬랙은 짧은 잔여 draft가 긴 프롬프트에 붙어 통과하는
    fail-open 구멍이었으므로 제거했다."""
    want = normalize(prompt)
    if not want:
        return True
    return normalize(read_composer_text(page)) == want


def clear_composer(page) -> bool:
    """composer를 비운다(중복 입력 방지) — '비었음'을 읽어 확인한 뒤에만 True.

    select-all은 OS별 단축키를 쓴다 — Linux/Windows에선 Control+a(Meta+a는
    Super키라 전체선택이 아니었다). 읽기 실패도 '미확인'으로 False(fail-closed).
    """
    select_all = "Meta+a" if platform.system() == "Darwin" else "Control+a"
    for _attempt in range(3):
        try:
            page.evaluate(
                """() => { const el = document.querySelector('#prompt-textarea')
                    || document.querySelector('div[contenteditable=\\"true\\"]');
                    if (el) { el.focus(); } }"""
            )
            page.keyboard.press(select_all)
            page.keyboard.press("Backspace")
            time.sleep(0.2)
            if not read_composer_text(page).strip():
                return True
        except Exception:
            continue
    return False


def click_send(page) -> bool:
    """전송 버튼이 visible·enabled 될 때까지 폴링 후 클릭(첨부 처리 시간 대비). 끝까지 안 되면 Enter."""
    for _ in range(15):  # 최대 ~15s 대기
        for sel in SEND_BTN_SELECTORS:
            try:
                btn = page.query_selector(sel)
                if btn and btn.is_visible() and btn.is_enabled():
                    btn.click()
                    print("  ✓ 전송 버튼 클릭")
                    time.sleep(1)
                    return True
            except Exception:
                continue
        time.sleep(1)
    print("  ⚠️  전송 버튼이 enabled 안 됨 → Enter 폴백")
    page.keyboard.press("Enter")
    time.sleep(1)
    return False


def click_answer_now(page) -> bool:
    """리즈닝 중 '지금 답변 받기'를 눌러 강제 답변.
    실측: 버튼은 리즈닝 flyout 최상단(우측 패널). 패널이 아래로 스크롤되면 버튼이 밀려나므로
    스크롤 컨테이너를 top으로 올린 뒤 scroll_into_view 후 클릭한다.
    칩 매칭은 '생각 중'으로 좁힌다 — 프롬프트 본문의 '추론' 등과 오매칭 방지."""
    answer_pats = [("지금 답변 받기", True), ("지금 답변받기", True),
                   ("답변 받기", False), ("Get answer", False), ("answer now", False)]
    chip_re = re.compile(r"생각\s*중|Thinking", re.I)

    def scroll_panels_top():
        try:
            page.evaluate("() => { for (const el of document.querySelectorAll('*')) "
                          "{ if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = 0; } }")
        except Exception:
            pass

    def try_answer() -> bool:
        scroll_panels_top()
        for txt, exact in answer_pats:
            try:
                loc = page.get_by_text(txt, exact=exact)
                if loc.count() > 0:
                    try:
                        loc.first.scroll_into_view_if_needed(timeout=2000)
                    except Exception:
                        pass
                    loc.first.click(timeout=2500)
                    return True
            except Exception:
                continue
        return False

    if try_answer():
        return True
    # 리즈닝 칩(좁은 매칭)을 눌러 패널을 연 뒤 재시도
    try:
        chip = page.get_by_text(chip_re)
        if chip.count() > 0:
            chip.first.click(timeout=2500)
            time.sleep(1.2)
    except Exception:
        pass
    return try_answer()


def wait_for_turn_response(page, force_after=None, max_wait=None,
                           base_user: int = 0, base_assistant: int = 0,
                           base_ids: set | None = None,
                           stream: bool = False) -> tuple[str, str]:
    """새 user 턴(전송 전 기준개수 대비 증가) 기준 응답 회수.
    base_user/base_assistant: 전송 직전의 메시지 수 — 이전 응답을 성공으로 오인하지 않도록 결속.
    base_ids: 전송 직전 data-message-id 집합 — 회수 대상을 그 차집합의 신규 턴으로 한정한다.
    stream=True면 생성 중인 assistant 텍스트를 stdout에 증분 출력(완료 판정에는 영향 없음).
    반환: (status, text) — status ∈ {'ok','timeout','not_sent','quota'}."""
    mw = max_wait if max_wait else MAX_WAIT_SECS
    start = time.monotonic()
    last_status = 0
    force_tries = 0
    streamed = ""      # 이미 스트리밍 출력한 접두부
    stream_header = False

    # 1) 우리 user 턴이 '새로' 떴는지 확인(전송 전 기준보다 증가). 안 떴으면 not_sent → 호출자가 재전송
    sent = False
    while time.monotonic() - start < 25:
        if count_msgs(page, USER_MSG_SELECTORS) > base_user:
            sent = True
            break
        time.sleep(1)
    if not sent:
        return ("not_sent", "")

    # 2) assistant 턴 완료까지 대기 (stop-button 사라짐 + copy 버튼 + 텍스트 안정)
    print(f"    응답 대기 중... (최대 {mw}s"
          + (f", {force_after}s 후 '지금 답변 받기' 재시도" if force_after else "") + ")")
    stable_since = None
    last_text = ""
    while time.monotonic() - start < mw:
        elapsed = int(time.monotonic() - start)

        # force-answer: 성공할 때까지 매 틱 재시도(상한). 실패해도 latch 안 함.
        if force_after and elapsed >= force_after and force_tries < FORCE_MAX_TRIES and is_streaming(page):
            if click_answer_now(page):
                print(f"    ⚡ {elapsed}s — '지금 답변 받기' 클릭(리즈닝 강제 종료)")
                force_tries = FORCE_MAX_TRIES  # 성공 → 그만
            else:
                force_tries += 1
                if force_tries >= FORCE_MAX_TRIES:
                    print(f"    ⚠️  {elapsed}s — '지금 답변 받기' 버튼 {FORCE_MAX_TRIES}회 실패 → 자연완료 대기")

        # Once live body streaming starts, status lines would splice themselves
        # into arbitrary prose positions because streamed chunks need not end in
        # a newline. The body itself is then the liveness signal.
        if elapsed - last_status >= STATUS_INTERVAL and elapsed > 0 and not (stream and stream_header):
            st = "⏳ 생성중" if is_streaming(page) else "정지(확인중)"
            print(f"    {elapsed}s | {st}")
            last_status = elapsed

        if elapsed < MIN_WAIT_SECS or is_streaming(page):
            # --stream: 생성 중인 텍스트를 증분 출력(완료 판정과 무관한 중계 전용).
            # 재렌더로 접두가 바뀌면 조용히 재동기화(중복 출력 방지).
            if stream:
                live = last_assistant_text(page)
                if live.startswith(streamed) and live != streamed:
                    if not stream_header:
                        print("    ── 실시간 응답(생성 중) ──")
                        stream_header = True
                    print(live[len(streamed):], end="", flush=True)
                    streamed = live
                elif not live.startswith(streamed):
                    streamed = live
            stable_since = None
            time.sleep(2)
            continue

        # 완료 신호 + 텍스트 안정성 (새 assistant 턴이 실제로 생겼을 때만 완료로 인정)
        target = new_assistant_target(page, base_ids)
        cur = ""
        if target is not None:
            try:
                cur = target.inner_text() or ""
            except Exception:
                cur = ""
        if not last_turn_complete(page, base_assistant=base_assistant, base_ids=base_ids) or not cur.strip():
            # 완료되지 않은 채 멈춰 있으면 쿼터 배너를 확인한다 — 한도 차단은
            # 최대 대기(기본 20분)까지 침묵하던 경로였다.
            blocked = detect_quota_block(page)
            if blocked:
                print(f"    ⛔ 사용량 한도 차단 감지 → 대기 중단: {blocked[:80]}")
                return ("quota", "")
            stable_since = None
            time.sleep(2)
            continue
        if normalize(cur) != normalize(last_text):
            last_text = cur
            stable_since = time.monotonic()
            time.sleep(2)
            continue
        if stable_since and (time.monotonic() - stable_since) >= STABLE_CHECK_SECS:
            # 회수: 그 턴의 copy 버튼 우선(클립보드 오염 대조), 실패 시 DOM
            txt = copy_turn(page, target, expected=cur)
            if txt and txt.strip():
                print(f"    ✅ 응답 수신: {len(txt)}자 ({int(time.monotonic()-start)}s, copy)")
                return ("ok", txt)
            if cur and cur.strip():
                print(f"    ✅ 응답 수신: {len(cur)}자 ({int(time.monotonic()-start)}s, DOM)")
                return ("ok", cur)
        time.sleep(2)

    target = new_assistant_target(page, base_ids)
    fallback = ""
    if target is not None:
        try:
            fallback = target.inner_text() or ""
        except Exception:
            fallback = ""
    return ("timeout", fallback) if fallback else ("timeout", "")


# ===========================================================================
# 4) 로그인된 context 선택 (fail-closed)
# ===========================================================================
def pick_context(browser):
    """인증 세션 쿠키(__Secure-next-auth*)가 있는 context를 1순위로. 그다음 chatgpt.com 쿠키 보유,
    끝으로 contexts[0]. context 자체가 없으면 None. (최종 로그인 판정은 looks_logged_in이 fail-closed로 한 번 더.)"""
    if not browser.contexts:
        return None
    # 1순위: 진짜 인증 쿠키(아무 쿠키나 X — 익명 분석쿠키로 오인 방지)
    for ctx in browser.contexts:
        try:
            cookies = ctx.cookies("https://chatgpt.com")
            if any(str(c.get("name", "")).startswith("__Secure-next-auth") for c in cookies):
                return ctx
        except Exception:
            continue
    # 2순위: chatgpt.com 쿠키가 하나라도 있는 context
    for ctx in browser.contexts:
        try:
            if ctx.cookies("https://chatgpt.com"):
                return ctx
        except Exception:
            continue
    return browser.contexts[0]


def looks_logged_in(page) -> bool:
    # 음성 신호: 입력창 존재 + 로그인 벽 부재
    if find_input(page) is None:
        return False
    for sel in LOGIN_WALL_SELECTORS:
        try:
            if page.query_selector(sel):
                return False
        except Exception:
            continue
    # 양성 신호: 인증된 세션에서만 렌더되는 composer 어포던스(모델 pill 또는 파일첨부 input)를 적극 확인.
    # 렌더 지연 대비 ~3s 폴링. 끝까지 없으면 fail-closed(인증 증명 실패로 간주).
    for _ in range(6):
        try:
            if page.query_selector('button.__composer-pill') or page.query_selector(FILE_INPUT_SELECTOR):
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


# ===========================================================================
# 3.9) ChatGPT 프로젝트 그룹핑 — 폴더명 프로젝트로 채팅 정리 (캐시→탐색→생성)
# 일반 채팅 목록이 매 실행마다 쌓이는 걸 막고, 폴더별로 채팅을 프로젝트 안에 묶는다.
# 프로젝트 홈 화면에도 컴포저(#prompt-textarea)·파일첨부(input[type=file])·모델 pill이
# 그대로 있어, 프로젝트 URL로 goto만 하면 이후 첨부/모델검증/전송/회수 로직은 변경 없이 동작.
# ===========================================================================
def _load_project_cache(cache_path: Path) -> dict:
    try:
        return json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_project_cache(cache_path: Path, cache: dict) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, cache_path)  # 원자적 저장
    except Exception:
        pass


def project_home_ok(page, url: str) -> bool:
    """캐시된 프로젝트 URL이 아직 살아있는지(삭제/404 아님) 확인 — 홈 이동 후 컴포저 존재."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)
        return "/g/g-p-" in page.url and find_input(page) is not None
    except Exception:
        return False


# 다국어(사용자 ChatGPT UI 언어) 베스트에포트 — '새 프로젝트' 버튼 / '만들기' 제출 버튼.
_NEW_PROJECT_RE = r"새 프로젝트|New project|新規プロジェクト|プロジェクトを追加|Add project|Create project"
_CREATE_SUBMIT_RE = r"프로젝트 만들기|Create project|プロジェクトを作成|^Create$|^作成$|^만들기$"


def find_project_url(page, name: str) -> str | None:
    """사이드바에서 '표시 이름이 정확히 name'인 프로젝트의 홈 URL을 회수(SPA 라우팅). 없으면 None.
    언어무관: 행(li)의 표시텍스트 == 이름으로 찾고(aria 로컬라이즈에 의존 안 함),
    같은 행의 '이름이 안 들어간 버튼'(=홈 버튼; 옵션버튼 aria엔 이름이 들어감)을 클릭한다.
    #2 대응: 목표가 보일 때까지 사이드바를 스크롤하며 폴링 → 가상화/지연으로 못 찾고 중복 생성하는 일 방지.
    #3 대응: 어떤 예외도 삼켜 None 반환(폴백 가능)."""
    try:
        for _ in range(12):
            clicked = page.evaluate("""(nm) => {
                const lis = [...document.querySelectorAll('nav li, aside li, li')];
                for (const li of lis) {
                    const first = ((li.innerText || '').trim().split('\\n')[0] || '').trim();
                    const btns = [...li.querySelectorAll('button[aria-label]')];
                    if (first === nm && btns.length) {
                        // 옵션버튼 aria엔 프로젝트명이 들어감 → 이름이 '안' 들어간 버튼이 홈(내비) 버튼
                        const home = btns.find(b => !((b.getAttribute('aria-label') || '').includes(nm))) || btns[0];
                        home.click();
                        return true;
                    }
                }
                return false;
            }""", name)
            if clicked:
                try:
                    page.wait_for_url("**/g/g-p-**", wait_until="commit", timeout=8000)
                except Exception:
                    pass
                time.sleep(1.2)
                return page.url if "/g/g-p-" in page.url else None
            # 가상화/접힘 대비: 스크롤 컨테이너를 끝까지 내려 더 로드한 뒤 재시도
            page.evaluate("""() => { for (const el of document.querySelectorAll('nav *, aside *')) {
                if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = el.scrollHeight; } }""")
            time.sleep(0.5)
    except Exception:
        return None
    return None


def create_project(page, name: str) -> str | None:
    """'새 프로젝트' 모달로 폴더명 프로젝트 생성 → 홈 URL 반환. 실패/미지원 시 None(호출자 폴백).
    제출은 다국어 텍스트 매칭 → 실패하면 Enter 폴백(언어무관)."""
    opened = page.evaluate("""(re) => { const rx = new RegExp(re, 'i');
        const b = [...document.querySelectorAll('button[aria-label]')].find(x => rx.test(x.getAttribute('aria-label') || ''));
        if (b) { b.click(); return true; } return false; }""", _NEW_PROJECT_RE)
    if not opened:
        return None  # '새 프로젝트' 버튼 없음(프로젝트 미지원 플랜/언어 불일치) → 일반 채팅 폴백
    try:
        # 모달의 유일한 visible text-input = 이름칸(컴포저는 contenteditable이라 input[type=text] 아님)
        name_input = page.locator('input[type="text"]:visible').last
        name_input.wait_for(state="visible", timeout=8000)
        name_input.click()
        name_input.fill(name)        # fill로 입력해야 제출 버튼이 enabled 된다
        time.sleep(0.4)
        submitted = page.evaluate("""(re) => { const rx = new RegExp(re, 'i');
            const btns = [...document.querySelectorAll('button')].filter(b => !b.disabled && rx.test((b.innerText || '').trim()));
            if (btns.length) { btns[btns.length - 1].click(); return true; } return false; }""", _CREATE_SUBMIT_RE)
        if not submitted:
            name_input.press("Enter")  # 텍스트 매칭 실패 시 언어무관 폴백
        page.wait_for_url("**/g/g-p-**", wait_until="commit", timeout=15000)
        time.sleep(2)
        return page.url if "/g/g-p-" in page.url else None
    except Exception:
        try:
            page.keyboard.press("Escape")  # 모달 닫고 폴백
        except Exception:
            pass
        return None


def ensure_project(page, name: str, cache_key: str, cache_path: Path) -> str | None:
    """프로젝트 홈 URL 확보: 캐시(절대경로 키) → 사이드바 탐색 → 생성.
    #1 대응: 캐시 키는 '절대경로'(cache_key) — 같은 폴더명의 다른 경로가 캐시를 공유하지 않는다.
    #3 대응: 함수 전체를 try/except로 감싸 어떤 예외도 None으로(호출자가 일반 채팅으로 폴백)."""
    try:
        cache = _load_project_cache(cache_path)
        cached = cache.get(cache_key)
        if cached and project_home_ok(page, cached):
            return cached
        page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=30000)  # 탐색/생성은 홈에서
        time.sleep(2)
        url = find_project_url(page, name)
        if not url:
            page.goto(CHATGPT_URL, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)
            url = create_project(page, name)
        if url:
            cache[cache_key] = url
            _save_project_cache(cache_path, cache)
        return url
    except Exception:
        return None


# ===========================================================================
# main
# ===========================================================================
def main():
    ap = argparse.ArgumentParser(description="repomix → 구독 ChatGPT(GPT-5.6 Sol Pro) 분석")
    ap.add_argument("--target", default=None, help="분석 대상 폴더(생략 시 프롬프트만 = 의견 모드)")
    ap.add_argument("--include", default=None, help='repomix --include 글롭')
    ap.add_argument("--ignore", default=None, help="repomix --ignore 글롭")
    ap.add_argument("--no-default-patterns", action="store_true",
                    help="repomix 기본 제외 패턴 비활성화(명시 파일이 기본 제외될 때만)")
    ap.add_argument("--no-gitignore", action="store_true",
                    help="repomix .gitignore 제외 비활성화(의도적으로 ignored 파일을 검토할 때만)")
    ap.add_argument("--compress", action="store_true",
                    help="tree-sitter 골격만(토큰 절감) — 본문 제거되니 정확성 리뷰엔 쓰지 마라")
    ap.add_argument("--no-line-numbers", action="store_true",
                    help="라인번호 prefix 끄기(기본 on — AI가 파일:라인 인용하도록)")
    ap.add_argument("--style", default="markdown", choices=["xml", "markdown", "plain"])
    ap.add_argument("--token-budget", type=int, default=None)
    ap.add_argument("--attach", action="store_true",
                    help="첨부 강제 — 첨부 실패 시 붙여넣기 폴백 없이 중단(기본은 작은 pack에 한해 인라인 폴백)")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--model", default=None, help='추론단계 선택(예: "pro")')
    ap.add_argument("--require-model", default=None,
                    help='모델명 검증(예: "GPT-5.6") — 불일치 시 전송 중단')
    ap.add_argument("--force-answer-after", type=int, default=None,
                    help="N초 후 리즈닝 중이면 '지금 답변 받기' 재시도")
    ap.add_argument("--max-wait", type=int, default=None,
                    help=f"응답 최대 대기 초(기본 {MAX_WAIT_SECS}=20분; env INSANE_REVIEW_MAX_WAIT로도 설정)")
    ap.add_argument("--browser", default=None,
                    help="자동화에 쓸 브라우저(이름: chrome/comet/brave/edge/chromium/vivaldi 또는 절대경로). "
                         "생략 시 config 저장값 → 첫 감지 브라우저. 항상 전용 프로필로 실행")
    ap.add_argument("--list-browsers", action="store_true",
                    help="이 OS에 설치된 크로미움 계열 브라우저 목록 출력(BROWSERS 라인)")
    ap.add_argument("--launch-browser", default=None, metavar="NAME|PATH",
                    help="지정 브라우저를 전용 프로필+디버그포트로 실행(빈 문자열이면 자동 선택). 성공 시 config에 저장")
    ap.add_argument("--project", default=None,
                    help="채팅을 묶을 ChatGPT 프로젝트 이름(기본: 현재 폴더명). 폴더별로 채팅이 프로젝트 안에 정리됨")
    ap.add_argument("--no-project", action="store_true",
                    help="프로젝트 그룹핑 비활성화 — 일반 새 채팅으로 전송(기존 동작)")
    ap.add_argument("--pack-only", action="store_true")
    ap.add_argument("--keep-pack", action="store_true", help="전송 후 패킹 파일 보존(기본은 유지; 끄려면 --delete-pack)")
    ap.add_argument("--delete-pack", action="store_true", help="응답 회수 후 패킹 파일 삭제(시크릿 위생)")
    ap.add_argument("--out-dir", default=None,
                    help="출력 저장 폴더(기본: 현재 프로젝트의 .insane-review/; env INSANE_REVIEW_OUT)")
    ap.add_argument("--check-env", action="store_true")
    ap.add_argument("--ensure-env", action="store_true",
                    help="저장된 브라우저가 있고 CDP가 닫혀(down) 있으면 조용히 1회 자동 기동 후 점검 "
                         "(저장값-only·첫감지 폴백 없음; browser=wrong이면 자동기동 안 함)")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--council", action="store_true",
                    help="agent-council 멤버 모드: 로그는 stderr, 응답만 stdout")
    ap.add_argument("--retries", type=int, default=1)
    ap.add_argument("--stream", action="store_true",
                    help="응답 생성 중인 텍스트를 stdout에 실시간 증분 출력(파이프/로그 중계용)")
    ap.add_argument("prompt_args", nargs="*", help="프롬프트(위치인자 — council 호환)")
    args = ap.parse_args()

    if args.check_env:
        with CdpLease(CDP_PORT):
            sys.exit(check_env(do_install=args.install))

    if args.ensure_env:
        # 저장값-only 자동기동: CDP가 '닫힘'(down)이고 저장된 브라우저가 해석되면 한 번만 띄운다.
        # browser=wrong(포트를 다른 프로세스가 점유)이거나 저장값이 없으면 자동기동하지 않고,
        # check_env가 상태만 보고한다 → 커맨드가 그때만 사용자에게 묻는다(최초 1회 온보딩).
        with CdpLease(CDP_PORT):
            if not is_port_open(CDP_PORT):
                saved = _load_config().get("browser")
                if saved:
                    r = resolve_browser(saved)   # 인자 지정 경로 → 첫감지 폴백 없음(저장값-only)
                    if r:
                        launch_browser_exe(r[1])
            sys.exit(check_env(do_install=args.install))

    if args.list_browsers:
        bs = detect_browsers()
        print("BROWSERS " + ",".join(f"{n}={p}" for n, p in bs))
        for n, p in bs:
            print(f"  • {n}: {p}")
        if not bs:
            print("  (설치된 크로미움 계열 브라우저를 찾지 못함)")
        sys.exit(0)

    if args.launch_browser is not None:
        resolved = resolve_browser(args.launch_browser or None)
        if not resolved:
            avail = ", ".join(n for n, _ in detect_browsers()) or "없음"
            sys.exit(f"❌ 브라우저를 찾지 못함 (지정='{args.launch_browser}', 감지=[{avail}])")
        name, path = resolved
        with CdpLease(CDP_PORT):
            if launch_browser_exe(path):
                save_browser_choice(name)
                print(f"STATUS_LAUNCH ok browser={name}")
                sys.exit(0)
            sys.exit("❌ 브라우저 실행/CDP 확인 실패")

    # --require-model은 모델 검증 경로(select_model)에서만 효력 → --model 없이 단독 사용 시 검증이 통째로
    # 스킵되는 fail-open을 차단(fail-closed). 모델/추론단계를 함께 지정해야 검증이 돈다.
    if args.require_model and not args.model:
        sys.exit('❌ --require-model은 --model과 함께 써야 합니다(모델/추론단계를 선택·검증하는 경로).\n'
                 '     예: --model pro --require-model "GPT-5.6 Sol"')

    real_stdout = sys.stdout
    if args.council:
        sys.stdout = sys.stderr

    out_dir = Path(args.out_dir).expanduser() if args.out_dir else OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"  출력 폴더: {out_dir}")
    # 폴더명→프로젝트URL 캐시(per-repo) — 평소엔 사이드바 안 건드리고 바로 프로젝트로 goto
    project_cache_path = out_dir / "projects.json"
    # #4: 자동 이름은 '폴더명 · 경로해시8'. 원격(ChatGPT) 프로젝트 탐색은 표시이름으로만 매칭하므로,
    # 이름에 경로 식별자가 없으면 동명 다른 폴더(/a/api, /b/api)가 같은 원격 프로젝트로 병합된다.
    # 사용자가 --project로 명시하면 그 이름 그대로(사용자 의도 존중).
    if args.project:
        project_name = args.project
    else:
        _ph = hashlib.sha256(str(Path.cwd().resolve()).encode("utf-8")).hexdigest()[:8]
        project_name = f"{Path.cwd().name} · {_ph}"
    # 캐시 키 = 절대경로::이름 — 동명 다른 폴더도, 같은 폴더의 다른 --project도 충돌하지 않음
    project_cache_key = f"{Path.cwd().resolve()}::{project_name}"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_tag = f"{ts}_{os.getpid()}_{uuid.uuid4().hex[:6]}"  # 동시 실행 충돌 방지
    pack_path = None
    tokens = None
    label = "prompt"
    verified_model_name = None

    if args.target:
        target = Path(args.target).resolve()
        if not target.exists():
            sys.exit(f"❌ 대상 폴더 없음: {target}")
        label = re.sub(r"[^A-Za-z0-9_.-]", "-", target.name)
        ext = {"xml": "xml", "markdown": "md", "plain": "txt"}[args.style]
        pack_path = out_dir / f"pack_{label}_{run_tag}.{ext}"
        # 출력 폴더가 대상 안이면 이전 산출물(pack_*/response_*)이 다음 pack에 섞이는 self-inclusion 차단
        eff_ignore = args.ignore
        try:
            rel = out_dir.resolve().relative_to(target)
            rel_glob = f"{rel.as_posix()}/**"
            eff_ignore = f"{eff_ignore},{rel_glob}" if eff_ignore else rel_glob
            print(f"  ↳ 출력 폴더가 대상 내부 → ignore 자동 추가: {rel_glob}")
        except ValueError:
            pass  # 대상 밖 → self-inclusion 없음
        print(f"\n[1/3] repomix 패킹 — {label}")
        pack_path, tokens = pack_repo(
            target, include=args.include, ignore=eff_ignore, compress=args.compress,
            style=args.style, token_budget=args.token_budget, out_path=pack_path,
            line_numbers=not args.no_line_numbers,
            no_default_patterns=args.no_default_patterns,
            no_gitignore=args.no_gitignore)
        if args.pack_only:
            print(f"\n[pack-only] 산출물: {pack_path}")
            return
    else:
        if args.pack_only:
            sys.exit("❌ --pack-only는 --target이 필요합니다.")
        print("\n[프롬프트-only] 레포 없이 질문만 전송")

    if sync_playwright is None:
        sys.exit("❌ playwright 미설치. pip install playwright")
    if pyperclip is None:
        print("⚠️  pyperclip 미설치 — 붙여넣기/복사회수 신뢰도 하락")

    positional = " ".join(args.prompt_args).strip() if args.prompt_args else ""
    prompt = (args.prompt or positional
              or (Path(args.prompt_file).read_text(encoding="utf-8") if args.prompt_file else None)
              or DEFAULT_PROMPT)

    try:
        cdp_lease = CdpLease(CDP_PORT).acquire()
    except RuntimeError as exc:
        sys.exit(f"❌ {exc}")

    resolved_browser = resolve_browser(args.browser)
    bname = resolved_browser[0] if resolved_browser else (args.browser or "자동감지")
    print(f"\n[2/3] 브라우저 준비 ({bname})")
    if not ensure_browser(args.browser):
        sys.exit(1)
    # 명시적 지정(--browser)일 때만 영속화 — 자동감지 폴백을 사용자 선택처럼 굳히지 않는다.
    if args.browser and resolved_browser:
        save_browser_choice(resolved_browser[0])

    print("\n[3/3] ChatGPT 투입 & 응답 회수")
    response = ""
    attempts = max(1, args.retries + 1)
    for attempt in range(1, attempts + 1):
        if attempt > 1:
            print(f"  ↻ 재시도 {attempt - 1}/{args.retries} ...")
            time.sleep(3)
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.connect_over_cdp(CDP_URL)
                ctx = pick_context(browser)
                if ctx is None:
                    raise RuntimeError("브라우저 context 없음 (로그인된 Comet/Chrome 필요)")
                page = ctx.new_page()
                _guard_dialogs(ctx, page)
                try:
                    page.goto(CHATGPT_URL, wait_until="load", timeout=60000)
                    time.sleep(3)
                    for _ in range(10):
                        if find_input(page):
                            break
                        time.sleep(1)
                    if not looks_logged_in(page):
                        raise RuntimeError("ChatGPT 로그인 안 됨/입력창 없음 — 해당 브라우저에서 chatgpt.com 로그인 확인")

                    # 프로젝트 그룹핑(기본 on): 현재 폴더명 프로젝트로 채팅을 정리(일반 채팅목록 오염 방지).
                    # 어떤 실패(예외 포함)에도 하드중단 X — 컴포저가 확인되는 일반 채팅으로 폴백(#3).
                    if not args.no_project:
                        proj_url = ensure_project(page, project_name, project_cache_key, project_cache_path)
                        entered = False
                        if proj_url:
                            try:
                                page.goto(proj_url, wait_until="load", timeout=60000)
                                time.sleep(2)
                                for _ in range(10):
                                    if find_input(page):
                                        break
                                    time.sleep(1)
                                entered = find_input(page) is not None  # 컴포저 최종 확인
                            except Exception as pexc:
                                print(f"  ⚠️  프로젝트 진입 예외({str(pexc)[:50]})")
                                entered = False
                        if entered:
                            print(f"  🗂  프로젝트 '{project_name}'에 채팅 정리 → {proj_url}")
                        else:
                            # 폴백: 프로젝트 미확보/진입 실패 모두 일반 채팅으로(컴포저 보장)
                            print(f"  ⚠️  프로젝트 '{project_name}' 사용 불가 → 일반 채팅으로 진행(폴백)")
                            try:
                                page.goto(CHATGPT_URL, wait_until="load", timeout=60000)
                                time.sleep(2)
                                for _ in range(10):
                                    if find_input(page):
                                        break
                                    time.sleep(1)
                            except Exception:
                                pass

                    print(f"  현재 pill: {read_model_pills(page)}")
                    if args.model:
                        print(f"  모델/추론단계 선택: '{args.model}'"
                               + (f" (모델명 검증='{args.require_model}')" if args.require_model else ""))
                        verified, v_name = select_model(page, args.model, require_model=args.require_model)
                        if not verified:
                            raise RuntimeError(f"모델/추론단계 검증 실패 (model={args.model}, require={args.require_model}) — 전송 중단")
                        verified_model_name = v_name

                    # 본문은 '첨부'가 기본. 첨부 실패 시:
                    #  - --attach면 fail-closed(중단)
                    #  - 아니면 pack이 상한 내일 때만 프롬프트에 인라인 붙여 폴백, 초과면 fail-closed(잘린 전송 방지)
                    send_prompt = prompt
                    if pack_path is not None and not attach_file(page, pack_path):
                        if args.attach:
                            raise RuntimeError("코드 첨부 확인 실패 + --attach(첨부 강제) → 중단(fail-closed)")
                        send_prompt = build_paste_fallback(prompt, pack_path)
                        if send_prompt is None:
                            raise RuntimeError("코드 첨부 실패 + pack이 커서 붙여넣기 폴백 불가 → 중단(fail-closed)")
                        print(f"  ↩︎  첨부 실패 → pack을 프롬프트에 인라인 붙여넣기 폴백({len(send_prompt):,}자, 상한 내)")

                    # 전송 직전 기준개수 포착(턴-스코프 결속 — 이전 응답을 성공으로 오인 방지).
                    # 조회 실패를 0으로 숨기면 기존 DOM이 '새 턴'으로 오인되므로 fail-closed 카운터 사용.
                    base_user = count_msgs_strict(page, USER_MSG_SELECTORS)
                    base_assistant = count_msgs_strict(page, ASSISTANT_MSG_SELECTORS)
                    base_ids = msg_id_set(page)

                    put_text(page, send_prompt)
                    # 보낼 텍스트 '전체'가 입력창에 들어갔는지 검증 — 아니면 composer 비우고 1회 재입력, 그래도 불일치면 중단
                    # (첨부만/잘린 질문이 전송되어 '오염된 응답'을 성공저장하는 fail-open 차단)
                    if not composer_has_prompt(page, send_prompt):
                        clear_composer(page)
                        put_text(page, send_prompt)
                        if not composer_has_prompt(page, send_prompt):
                            raise RuntimeError("프롬프트가 입력창에 온전히 안 들어감 → 중단(첨부만/잘린 전송 방지, fail-closed)")
                    click_send(page)
                    status, text = wait_for_turn_response(page, force_after=args.force_answer_after,
                                                          max_wait=args.max_wait,
                                                          base_user=base_user, base_assistant=base_assistant,
                                                          base_ids=base_ids, stream=args.stream)
                    if status == "not_sent":
                        print("  ⚠️  user 턴 미생성(전송 안 됨) → 재시도")
                        continue
                    if status == "quota":
                        # 한도 차단은 재시도해도 같은 벽이다 — 메시지만 더 태운다.
                        sys.exit("❌ ChatGPT 사용량 한도에 막혔습니다. 한도가 풀린 뒤 다시 실행하세요.")
                    if status == "timeout":
                        print("  ⚠️  타임아웃 — 미완성 응답은 성공저장 안 함(fail-closed) → 재시도")
                        continue
                    if status == "ok" and text and text.strip():
                        response = text
                    else:
                        print(f"  ⚠️  응답 비었거나 너무 짧음(status={status}) → 재시도")
                finally:
                    try:
                        page.close()
                    except Exception:
                        pass
            if response:
                break
            print(f"  ⚠️  시도 {attempt}: 응답 비어있음")
        except Exception as exc:
            print(f"  ⚠️  시도 {attempt} 실패: {str(exc)[:160]}")

    if not response:
        sys.exit("❌ 응답 회수 실패 (모든 재시도 소진)")

    # 패킹 파일 시크릿 위생은 응답 판정과 무관하게 --delete-pack 계약을 지킨다.
    if pack_path is not None and args.delete_pack:
        try:
            pack_path.unlink()
            print(f"  🔒 패킹 파일 삭제됨(--delete-pack)")
        except OSError as exc:
            sys.exit(f"❌ 패킹 파일 삭제 실패(--delete-pack): {str(exc)[:120]}")

    rejection = rejection_reason(response, prompt)
    if rejection:
        sys.exit(f"❌ 회수한 페이지를 답변으로 인정하지 않음(fail-closed): {rejection}")

    resp_path = out_dir / f"response_{label}_{run_tag}.md"
    pack_line = (f"- 패킹: `{pack_path.name}`" + (f" (~{tokens:,} tokens)\n" if tokens else "\n")
                 if pack_path is not None else "- 패킹: (없음 / 프롬프트-only)\n")
    model_line = f"- 모델: `{verified_model_name}`\n" if verified_model_name else ""
    body = (f"# {label} — GPT 응답 (구독 ChatGPT)\n\n" + pack_line + model_line
            + f"- 프롬프트: {prompt[:80]}...\n\n---\n\n{response}\n")
    try:
        write_response_artifact(resp_path, body)
    except FileExistsError:
        sys.exit(f"❌ 응답 산출물이 이미 존재함 → 덮어쓰지 않고 중단: {resp_path}")
    print(f"\n[완료] 응답 저장: {resp_path}")
    if args.council:
        real_stdout.write(response + "\n")
        real_stdout.flush()
    else:
        print("─" * 50)
        print(response[:800] + ("\n...(생략)" if len(response) > 800 else ""))
    cdp_lease.release()


if __name__ == "__main__":
    main()
