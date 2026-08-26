import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from aiohttp import web
from server import PromptServer


VIEWER_ASSET_ROUTE = (
    "/comfyui-lux3d/viewer-assets/v1/"
    "{manifest_digest}/{asset:.+}"
)
_ROUTE_MARKER = "_comfyui_lux3d_viewer_assets_v1_registered"
_ROOT = Path(__file__).resolve().parent
_ASSET_ROOT = (_ROOT / "viewer_assets").resolve()
_MANIFEST_PATH = _ASSET_ROOT / "manifest.json"
_MIME_BY_SUFFIX = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}


@dataclass(frozen=True)
class _Asset:
    body: bytes
    mime: str
    sha256: str

    @property
    def etag(self) -> str:
        return f'"{self.sha256}"'


def _load_manifest() -> tuple[str, Mapping[str, _Asset]]:
    manifest_bytes = _MANIFEST_PATH.read_bytes()
    manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
    try:
        manifest = json.loads(manifest_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("viewer_assets/manifest.json is not valid UTF-8 JSON") from error
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("assets"), list):
        raise RuntimeError("viewer asset manifest schema is unsupported")

    assets: dict[str, _Asset] = {}
    for index, entry in enumerate(manifest["assets"]):
        if not isinstance(entry, dict):
            raise RuntimeError(f"viewer asset manifest entry {index} is not an object")
        required = {
            "logical_key",
            "source_package",
            "source_version",
            "source_path",
            "path",
            "size",
            "mime",
            "license",
            "sha256",
        }
        if not required.issubset(entry):
            missing = sorted(required.difference(entry))
            raise RuntimeError(f"viewer asset manifest entry {index} misses {missing}")

        logical_key = entry["logical_key"]
        relative_path = entry["path"]
        if not _is_normalized_key(logical_key) or not _is_normalized_key(relative_path):
            raise RuntimeError(f"viewer asset manifest entry {index} has an invalid path")
        if logical_key in assets:
            raise RuntimeError(f"duplicate viewer asset logical key: {logical_key}")
        if not all(
            isinstance(entry[field], str) and entry[field]
            for field in (
                "source_package",
                "source_version",
                "source_path",
                "mime",
                "license",
                "sha256",
            )
        ):
            raise RuntimeError(f"viewer asset manifest entry {index} has invalid metadata")
        if (
            not isinstance(entry["size"], int)
            or isinstance(entry["size"], bool)
            or entry["size"] < 0
        ):
            raise RuntimeError(f"viewer asset manifest entry {index} has invalid size")
        expected_mime = _MIME_BY_SUFFIX.get(Path(relative_path).suffix)
        if entry["mime"] != expected_mime:
            raise RuntimeError(f"viewer asset manifest entry {index} has invalid MIME")
        if (
            len(entry["sha256"]) != 64
            or any(character not in "0123456789abcdef" for character in entry["sha256"])
        ):
            raise RuntimeError(f"viewer asset manifest entry {index} has invalid SHA-256")

        file_path = (_ASSET_ROOT / Path(*relative_path.split("/"))).resolve()
        try:
            file_path.relative_to(_ASSET_ROOT)
        except ValueError as error:
            raise RuntimeError(f"viewer asset path escapes its root: {relative_path}") from error
        if not file_path.is_file():
            raise RuntimeError(f"viewer asset file is missing: {relative_path}")
        body = file_path.read_bytes()
        digest = hashlib.sha256(body).hexdigest()
        if len(body) != entry["size"] or digest != entry["sha256"]:
            raise RuntimeError(f"viewer asset file does not match manifest: {relative_path}")
        assets[logical_key] = _Asset(body=body, mime=entry["mime"], sha256=digest)

    if not assets:
        raise RuntimeError("viewer asset manifest must contain at least one asset")
    return manifest_digest, MappingProxyType(assets)


def _is_normalized_key(value: object) -> bool:
    if not isinstance(value, str) or not value or value.startswith("/"):
        return False
    if "\\" in value or "\x00" in value:
        return False
    return all(segment not in ("", ".", "..") for segment in value.split("/"))


def _not_found() -> web.Response:
    return web.Response(
        status=404,
        body=b"",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def _if_none_match_matches(header: str | None, etag: str) -> bool:
    if not header:
        return False
    return any(
        token == "*" or token == etag or token == f"W/{etag}"
        for token in (part.strip() for part in header.split(","))
    )


_MANIFEST_DIGEST, _ASSETS = _load_manifest()


async def handle_viewer_asset(request) -> web.Response:
    if request.match_info.get("manifest_digest") != _MANIFEST_DIGEST:
        return _not_found()
    logical_key = request.match_info.get("asset")
    if not _is_normalized_key(logical_key):
        return _not_found()
    asset = _ASSETS.get(logical_key)
    if asset is None:
        return _not_found()

    headers = {
        "Cache-Control": "public,max-age=31536000,immutable",
        "Content-Type": asset.mime,
        "ETag": asset.etag,
        "X-Content-Type-Options": "nosniff",
    }
    if _if_none_match_matches(request.headers.get("If-None-Match"), asset.etag):
        return web.Response(status=304, body=None, headers=headers)
    headers["Content-Length"] = str(len(asset.body))
    body = None if request.method == "HEAD" else asset.body
    return web.Response(status=200, body=body, headers=headers)


def _register_route() -> None:
    routes = PromptServer.instance.routes
    try:
        registered = getattr(routes, _ROUTE_MARKER, False)
        setattr(routes, _ROUTE_MARKER, registered)
    except (AttributeError, TypeError) as error:
        raise RuntimeError("PromptServer routes cannot record Lux3D registration") from error
    if registered:
        return
    for route in routes:
        if getattr(route, "path", None) == VIEWER_ASSET_ROUTE:
            raise RuntimeError(f"viewer asset route namespace conflict: {VIEWER_ASSET_ROUTE}")
    routes.get(VIEWER_ASSET_ROUTE)(handle_viewer_asset)
    setattr(routes, _ROUTE_MARKER, True)


_register_route()
