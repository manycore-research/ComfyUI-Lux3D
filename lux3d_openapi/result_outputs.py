"""Map completed Lux3D task URLs to stable ComfyUI output slots."""

from __future__ import annotations

import re
from pathlib import PurePosixPath
from typing import Dict, Iterable, Optional, Sequence, Tuple
from urllib.parse import unquote, urlsplit


class Lux3DOutputProtocolError(RuntimeError):
    """The task succeeded, but its output URLs do not match the API contract."""


def _url_filename(url: str) -> str:
    """Return a decoded URL path filename, excluding query and fragment data."""

    path = unquote(urlsplit(url).path)
    return PurePosixPath(path).name.lower()


def _set_unique(
    slots: Dict[str, str], output_kind: str, url: str, *, task_kind: str
) -> None:
    if slots[output_kind]:
        raise Lux3DOutputProtocolError(
            f"Lux3D {task_kind} task returned duplicate {output_kind} outputs"
        )
    slots[output_kind] = url


def map_generation_outputs(urls: Iterable[str]) -> Tuple[str, str, str]:
    """Return generation artifacts as ``(lux3d_zip, glb, ply)``.

    The public task contract identifies these artifacts by their URL path
    suffix. Query-string values are intentionally ignored: inferring a format
    from arbitrary query metadata could silently put a result in the wrong
    ComfyUI socket.
    """

    slots = {"lux3d_zip": "", "glb": "", "ply": ""}
    suffix_kinds = (
        (".zip", "lux3d_zip"),
        (".glb", "glb"),
        (".ply", "ply"),
    )
    for url in urls:
        filename = _url_filename(url)
        output_kind = next(
            (kind for suffix, kind in suffix_kinds if filename.endswith(suffix)),
            None,
        )
        if output_kind is None:
            raise Lux3DOutputProtocolError(
                "Lux3D generation task returned an output URL with an "
                f"unsupported path suffix: {filename or '<empty filename>'}"
            )
        _set_unique(slots, output_kind, url, task_kind="generation")
    return slots["lux3d_zip"], slots["glb"], slots["ply"]


def _export_zip_kind(filename: str) -> Optional[str]:
    """Classify an export ZIP when its filename explicitly names OBJ or FBX."""

    stem = filename[:-4]  # The caller has already established the .zip suffix.
    tokens = set(filter(None, re.split(r"[^a-z0-9]+", stem)))
    matches = [kind for kind in ("obj", "fbx") if kind in tokens]
    if len(matches) > 1:
        raise Lux3DOutputProtocolError(
            f"Lux3D export task returned an ambiguous ZIP filename: {filename}"
        )
    return f"{matches[0]}_zip" if matches else None


def map_export_outputs(
    urls: Iterable[str], requested_formats: Optional[Sequence[str]] = None
) -> Tuple[str, str, str, str]:
    """Return export artifacts as ``(glb, usdz, obj_zip, fbx_zip)``.

    Export ZIPs sometimes have an explicit ``obj`` / ``fbx`` token in their
    filename and sometimes use a generic ``.zip`` filename. Explicit names are
    authoritative. Remaining generic ZIPs are assigned in the caller's
    ``outputFormat`` request order, matching the ordered-output fallback used
    by the Lux3D client contract. This lets OBJ ZIP and FBX ZIP be returned
    together even when both signed URLs end in a generic filename.
    """

    slots = {"glb": "", "usdz": "", "obj_zip": "", "fbx_zip": ""}
    zip_outputs = []
    for url in urls:
        filename = _url_filename(url)
        if filename.endswith(".glb"):
            output_kind = "glb"
        elif filename.endswith(".usdz"):
            output_kind = "usdz"
        elif filename.endswith(".zip"):
            output_kind = _export_zip_kind(filename)
            zip_outputs.append((url, output_kind))
            continue
        else:
            raise Lux3DOutputProtocolError(
                "Lux3D export task returned an output URL with an unsupported "
                f"path suffix: {filename or '<empty filename>'}"
            )
        _set_unique(slots, output_kind, url, task_kind="export")

    requested_zip_kinds = {
        value
        for value in (requested_formats or ())
        if value in ("obj_zip", "fbx_zip")
    }
    generic_urls = []
    for url, output_kind in zip_outputs:
        if output_kind is None:
            generic_urls.append(url)
            continue
        if output_kind not in requested_zip_kinds:
            raise Lux3DOutputProtocolError(
                f"Lux3D export task returned unrequested {output_kind} output"
            )
        _set_unique(slots, output_kind, url, task_kind="export")

    if generic_urls:
        remaining_kinds = [
            kind
            for kind in (requested_formats or ())
            if kind in requested_zip_kinds and not slots[kind]
        ]
        if len(generic_urls) != len(remaining_kinds):
            raise Lux3DOutputProtocolError(
                "Lux3D export task returned ambiguous generic ZIP outputs; "
                "their count does not match the remaining requested ZIP formats"
            )
        for output_kind, url in zip(remaining_kinds, generic_urls):
            _set_unique(slots, output_kind, url, task_kind="export")
    return (
        slots["glb"],
        slots["usdz"],
        slots["obj_zip"],
        slots["fbx_zip"],
    )


__all__ = [
    "Lux3DOutputProtocolError",
    "map_export_outputs",
    "map_generation_outputs",
]
