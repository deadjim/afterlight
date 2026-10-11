"""Focused tests for the loopback static server."""

import http.client
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class StaticServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name) / "dist"
        cls.root.mkdir()
        (cls.root / "index.html").write_text("<h1>Game</h1>", encoding="utf-8")
        (cls.root / "game.js").write_text("/* game */", encoding="utf-8")
        (cls.root / "audio.js").write_text("/* audio */", encoding="utf-8")
        (cls.root / "style.css").write_text("body {}", encoding="utf-8")
        (cls.root / "fonts.css").write_text("/* fonts */", encoding="utf-8")
        (cls.root / "font.woff2").write_bytes(b"font")
        (cls.root / "private").mkdir()
        (cls.root / "private" / "secret.txt").write_text("secret", encoding="utf-8")
        cls.outside = Path(cls.temp.name) / "outside.txt"
        cls.outside.write_text("outside", encoding="utf-8")
        (cls.root / "escape.txt").symlink_to(cls.outside)

        cls.patch_root = patch.object(server, "DIST_ROOT", cls.root.resolve())
        cls.patch_root.start()
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.StaticHandler)
        cls.httpd.daemon_threads = True
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_port

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join()
        cls.httpd.server_close()
        cls.patch_root.stop()
        cls.temp.cleanup()

    def request(self, method, path):
        return self.request_with_headers(method, path, {})

    def request_with_headers(self, method, path, headers):
        connection = http.client.HTTPConnection("127.0.0.1", self.port)
        connection.request(method, path, headers=headers)
        response = connection.getresponse()
        result = (response.status, response.getheaders(), response.read())
        connection.close()
        return result

    def test_health_and_security_headers(self):
        status, headers, body = self.request("GET", "/healthz")
        headers = dict(headers)
        self.assertEqual((status, body), (200, b"ok\n"))
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])

    def test_get_head_mime_and_cache_headers(self):
        status, headers, body = self.request("GET", "/game.js")
        headers = dict(headers)
        self.assertEqual((status, body), (200, b"/* game */"))
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")
        self.assertEqual(headers["Cache-Control"], "no-cache")
        etag = headers["ETag"]
        self.assertTrue(etag.startswith('"'))

        status, headers, body = self.request_with_headers("GET", "/game.js", {"If-None-Match": etag})
        self.assertEqual((status, body), (304, b""))
        self.assertEqual(dict(headers)["ETag"], etag)

        status, _, body = self.request_with_headers("HEAD", "/game.js", {"If-None-Match": "W/" + etag})
        self.assertEqual((status, body), (304, b""))

        status, headers, body = self.request("GET", "/font.woff2")
        self.assertEqual(status, 200)
        self.assertEqual(dict(headers)["Content-Type"], "font/woff2")
        self.assertEqual(body, b"font")

        status, headers, body = self.request("HEAD", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(dict(headers)["Cache-Control"], "no-cache")

    def test_no_directory_listing_or_path_escape(self):
        for path in ("/private/", "/%2e%2e/outside.txt", "/escape.txt", "/..%5coutside.txt", "//[malformed"):
            with self.subTest(path=path):
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_health_fails_when_release_file_is_missing(self):
        incomplete = Path(self.temp.name) / "incomplete"
        incomplete.mkdir()
        (incomplete / "index.html").write_text("<h1>Partial</h1>", encoding="utf-8")
        with patch.object(server, "DIST_ROOT", incomplete):
            status, headers, body = self.request("GET", "/healthz")
        self.assertEqual((status, body), (503, b"unhealthy\n"))
        self.assertEqual(dict(headers)["Cache-Control"], "no-store")

    def test_only_get_and_head_are_allowed(self):
        status, headers, _ = self.request("POST", "/")
        self.assertEqual(status, 405)
        self.assertEqual(dict(headers)["Allow"], "GET, HEAD")


if __name__ == "__main__":
    unittest.main()
