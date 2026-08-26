import asyncio
import hashlib
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROUTE_MODULE_PATH = REPOSITORY_ROOT / "viewer_asset_routes.py"
ROUTE_PATH = "/comfyui-lux3d/viewer-assets/v1/{manifest_digest}/{asset:.+}"


class FakeResponse:
    def __init__(self, *, status=200, body=None, headers=None):
        self.status = status
        self.body = body
        self.headers = dict(headers or {})


class FakeRoute:
    def __init__(self, method, path, handler):
        self.method = method
        self.path = path
        self.handler = handler


class FakeRoutes(list):
    def get(self, path):
        def decorator(handler):
            self.append(FakeRoute("GET", path, handler))
            return handler

        return decorator


class FakeRequest:
    def __init__(self, digest, asset, *, method="GET", headers=None):
        self.match_info = {"manifest_digest": digest, "asset": asset}
        self.method = method
        self.headers = dict(headers or {})


class ViewerAssetRouteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes = FakeRoutes()
        cls.module = load_route_module("viewer_asset_routes_test", cls.routes)
        cls.manifest_bytes = (REPOSITORY_ROOT / "viewer_assets/manifest.json").read_bytes()
        cls.manifest = json.loads(cls.manifest_bytes)
        cls.digest = hashlib.sha256(cls.manifest_bytes).hexdigest()
        cls.assets = {entry["logical_key"]: entry for entry in cls.manifest["assets"]}

    def test_registers_exact_route_once_across_repeated_imports(self):
        self.assertEqual(len(self.routes), 1)
        self.assertEqual(self.routes[0].method, "GET")
        self.assertEqual(self.routes[0].path, ROUTE_PATH)

        load_route_module("viewer_asset_routes_test_reimport", self.routes)
        self.assertEqual(len(self.routes), 1)

    def test_rejects_an_existing_namespace_without_registration_marker(self):
        routes = FakeRoutes([FakeRoute("GET", ROUTE_PATH, object())])
        with self.assertRaisesRegex(RuntimeError, "namespace conflict"):
            load_route_module("viewer_asset_routes_test_conflict", routes)

    def test_get_returns_exact_bytes_and_security_headers(self):
        key = "draco/draco_decoder.wasm"
        response = self.call(key)
        entry = self.assets[key]
        expected_body = (REPOSITORY_ROOT / "viewer_assets" / entry["path"]).read_bytes()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body, expected_body)
        self.assertEqual(response.headers["Content-Type"], "application/wasm")
        self.assertEqual(response.headers["Content-Length"], str(len(expected_body)))
        self.assertEqual(response.headers["ETag"], f'"{entry["sha256"]}"')
        self.assertEqual(
            response.headers["Cache-Control"],
            "public,max-age=31536000,immutable",
        )
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_javascript_mime_is_fixed(self):
        response = self.call("basis/basis_transcoder.js")
        self.assertEqual(response.status, 200)
        self.assertEqual(
            response.headers["Content-Type"],
            "text/javascript; charset=utf-8",
        )

    def test_head_has_get_headers_and_no_body(self):
        key = "basis/basis_transcoder.wasm"
        get_response = self.call(key)
        head_response = self.call(key, method="HEAD")
        self.assertEqual(head_response.status, 200)
        self.assertIsNone(head_response.body)
        self.assertEqual(head_response.headers, get_response.headers)

    def test_if_none_match_returns_304(self):
        key = "draco/draco_wasm_wrapper.js"
        etag = f'"{self.assets[key]["sha256"]}"'
        for header in (etag, f'"unrelated", {etag}', f"W/{etag}", "*"):
            with self.subTest(header=header):
                response = self.call(key, headers={"If-None-Match": header})
                self.assertEqual(response.status, 304)
                self.assertIsNone(response.body)
                self.assertEqual(response.headers["ETag"], etag)
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_digest_mismatch_and_unknown_key_are_not_found(self):
        mismatch = self.call("draco/draco_decoder.wasm", digest="0" * 64)
        unknown = self.call("draco/unknown.wasm")
        for response in (mismatch, unknown):
            self.assertEqual(response.status, 404)
            self.assertEqual(response.body, b"")
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")

    def test_rejects_non_normalized_and_traversal_keys(self):
        invalid_keys = (
            "/draco/draco_decoder.wasm",
            "draco\\draco_decoder.wasm",
            "draco/./draco_decoder.wasm",
            "draco/../basis/basis_transcoder.wasm",
            "draco//draco_decoder.wasm",
            "draco/draco_decoder.wasm/",
            "draco/\x00.wasm",
            ".",
            "..",
        )
        for key in invalid_keys:
            with self.subTest(key=repr(key)):
                self.assertEqual(self.call(key).status, 404)

    def test_manifest_digest_matches_generated_frontend_constant(self):
        generated = (
            REPOSITORY_ROOT / "frontend/src/generated/viewer-assets.js"
        ).read_text(encoding="utf-8")
        self.assertIn(
            f'VIEWER_ASSET_MANIFEST_DIGEST = "{self.digest}"',
            generated,
        )
        self.assertEqual(self.module._MANIFEST_DIGEST, self.digest)

    def call(self, key, *, digest=None, method="GET", headers=None):
        request = FakeRequest(
            digest or self.digest,
            key,
            method=method,
            headers=headers,
        )
        return asyncio.run(self.module.handle_viewer_asset(request))


def load_route_module(name, routes):
    fake_aiohttp = types.ModuleType("aiohttp")
    fake_aiohttp.web = types.SimpleNamespace(Response=FakeResponse)
    fake_server = types.ModuleType("server")
    fake_server.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=routes)
    )
    previous_aiohttp = sys.modules.get("aiohttp")
    previous_server = sys.modules.get("server")
    try:
        sys.modules["aiohttp"] = fake_aiohttp
        sys.modules["server"] = fake_server
        spec = importlib.util.spec_from_file_location(name, ROUTE_MODULE_PATH)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        if previous_aiohttp is None:
            sys.modules.pop("aiohttp", None)
        else:
            sys.modules["aiohttp"] = previous_aiohttp
        if previous_server is None:
            sys.modules.pop("server", None)
        else:
            sys.modules["server"] = previous_server


if __name__ == "__main__":
    unittest.main()
