"""SSRF / redirect safety guard for an agent-facing fetcher.

curl_cffi follows redirects but does NOT validate the destination (confirmed
against the official docs: there is no built-in private-IP/safe-redirect
option). Since this engine fetches attacker-influenced URLs and follows their
redirects, a hostile page could redirect to loopback, RFC-1918, link-local, or
the cloud metadata endpoint (169.254.169.254) to exfiltrate internal data.

This module provides a pure, deterministic classifier and a redirect resolver.
Default-deny for private/internal targets; opt in with allow_private=True
(env INSANE_ALLOW_PRIVATE=1) for local testing.
"""
from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urljoin, urlsplit

ALLOWED_SCHEMES = {"http", "https"}
DEFAULT_MAX_REDIRECTS = 10


def allow_private_default() -> bool:
    return os.environ.get("INSANE_ALLOW_PRIVATE", "") in ("1", "true", "yes")


def _ip_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified)


def resolve_public(url: str, allow_private: bool = False) -> tuple[list[str], str]:
    """Resolve ``url`` to public addresses for a later CURLOPT_RESOLVE pin.

    Returning the checked addresses is essential: validating DNS and then
    letting the HTTP client resolve again leaves a DNS-rebinding gap.
    """
    try:
        p = urlsplit(url)
    except Exception as e:
        return [], f"parse_error:{e}"
    if p.scheme not in ALLOWED_SCHEMES:
        return [], f"scheme:{p.scheme or 'none'}"
    host = p.hostname
    if not host:
        return [], "no_host"
    if allow_private:
        return [host], "allow_private"

    try:
        ipaddress.ip_address(host)
        return ([], f"ip_blocked:{host}") if _ip_blocked(host) else ([host], "public_ip")
    except ValueError:
        pass

    try:
        port = p.port or (443 if p.scheme == "https" else 80)
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        ips = sorted({str(info[4][0]) for info in infos})
    except Exception as e:
        return [], f"resolve_failed:{type(e).__name__}"
    if not ips:
        return [], "resolve_empty"
    for ip in ips:
        if _ip_blocked(ip):
            return [], f"resolves_internal:{host}->{ip}"
    return ips, "public"


def curl_resolve_entries(url: str, allow_private: bool = False) -> tuple[list[str], str]:
    """Return libcurl ``CURLOPT_RESOLVE`` entries pinned to validated IPs."""
    ips, reason = resolve_public(url, allow_private)
    if not ips:
        return [], reason
    p = urlsplit(url)
    host = p.hostname or ""
    port = p.port or (443 if p.scheme == "https" else 80)
    encoded = [f"[{ip}]" if ":" in ip else ip for ip in ips]
    return [f"{host}:{port}:{','.join(encoded)}"], reason


def classify_url(url: str, allow_private: bool = False) -> tuple[bool, str]:
    """(is_safe, reason). Blocks non-http(s) schemes and hosts that are — or
    DNS-resolve to — private/loopback/link-local/reserved/metadata addresses."""
    try:
        p = urlsplit(url)
    except Exception as e:
        return False, f"parse_error:{e}"
    if p.scheme not in ALLOWED_SCHEMES:
        return False, f"scheme:{p.scheme or 'none'}"
    host = p.hostname
    if not host:
        return False, "no_host"
    if allow_private:
        return True, "allow_private"

    ips, reason = resolve_public(url, allow_private)
    return bool(ips), reason


def location_of(resp) -> str | None:
    """Case-insensitive Location header from a curl_cffi/requests response."""
    try:
        headers = {k.lower(): v for k, v in dict(getattr(resp, "headers", {}) or {}).items()}
        return headers.get("location")
    except Exception:
        return None


def is_redirect(resp) -> bool:
    try:
        return int(getattr(resp, "status_code", 0) or 0) in (301, 302, 303, 307, 308)
    except Exception:
        return False


def resolve_redirect(base_url: str, location: str) -> str:
    return urljoin(base_url, location)
