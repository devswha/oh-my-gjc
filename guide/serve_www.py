#!/usr/bin/env python3
"""가재코드 가이드 정적 서버 (ThreadingHTTPServer, 0.0.0.0:8090).
기동:   nohup python3 serve_www.py >/tmp/gjc-guide-server.log &
접속:   http://<tailscale-ip>:8090/
중지:   pkill -f serve_www.py
"""
import http.server, socketserver, os, sys

PORT = int(os.environ.get("GUIDE_PORT", "8090"))
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
ACCESS_LOG = "/tmp/gjc-guide-access.log"


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        try:
            with open(ACCESS_LOG, "a") as f:
                f.write((fmt % args) + "\n")
        except Exception:
            pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving {ROOT} on http://0.0.0.0:{PORT}/", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            sys.exit(0)
