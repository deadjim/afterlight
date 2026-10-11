#!/usr/bin/env python3
"""Serve AFTERLIGHT's static dist directory on loopback."""

from __future__ import annotations

import argparse
import hashlib
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlsplit


DIST_ROOT = (Path(__file__).resolve().parent.parent / "dist").resolve()
REQUIRED_RELEASE_FILES = ("index.html", "game.js", "audio.js", "style.css", "fonts.css")
MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
}


class StaticHandler(BaseHTTPRequestHandler):
    server_version = "AfterlightStatic/1.0"
    sys_version = ""

    def setup(self) -> None:
        self.request.settimeout(5)
        super().setup()

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        )
        super().end_headers()

    def do_GET(self) -> None:
        self._serve(send_body=True)

    def do_HEAD(self) -> None:
        self._serve(send_body=False)

    def do_POST(self) -> None:
        self._method_not_allowed()

    def do_PUT(self) -> None:
        self._method_not_allowed()

    def do_DELETE(self) -> None:
        self._method_not_allowed()

    def do_OPTIONS(self) -> None:
        self._method_not_allowed()

    def _method_not_allowed(self) -> None:
        body = b"Method not allowed\n"
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _serve(self, send_body: bool) -> None:
        try:
            request_path = urlsplit(self.path).path
            decoded = unquote(request_path, errors="strict")
        except (UnicodeDecodeError, ValueError):
            self._not_found()
            return

        if decoded == "/healthz":
            healthy = all((DIST_ROOT / name).is_file() for name in REQUIRED_RELEASE_FILES)
            status = 200 if healthy else 503
            body = b"ok\n" if healthy else b"unhealthy\n"
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if send_body:
                self.wfile.write(body)
            return

        if "\\" in decoded or "\x00" in decoded:
            self._not_found()
            return
        segments = decoded.split("/")
        if any(segment in {".", ".."} for segment in segments):
            self._not_found()
            return

        relative = decoded.lstrip("/") or "index.html"
        candidate = (DIST_ROOT / relative).resolve()
        if not candidate.is_relative_to(DIST_ROOT) or not candidate.is_file():
            self._not_found()
            return

        try:
            body = candidate.read_bytes()
        except OSError:
            self._not_found()
            return

        etag = '"%s"' % hashlib.sha256(body).hexdigest()
        if self._etag_matches(self.headers.get("If-None-Match"), etag):
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return

        content_type = MIME_TYPES.get(candidate.suffix.lower())
        if content_type is None:
            content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("ETag", etag)
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    @staticmethod
    def _etag_matches(header: Optional[str], etag: str) -> bool:
        if not header:
            return False
        for value in header.split(","):
            token = value.strip()
            if token == "*" or token.removeprefix("W/") == etag:
                return True
        return False

    def _not_found(self) -> None:
        body = b"Not found\n"
        self.send_response(404)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def log_message(self, fmt: str, *args: object) -> None:
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080, help="loopback TCP port (default: 8080)")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), StaticHandler)
    server.daemon_threads = True
    print("Serving %s on http://127.0.0.1:%d" % (DIST_ROOT, server.server_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
