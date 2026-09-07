"""Map completed Lux3D task URLs to stable ComfyUI output slots."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Dict, Iterable, Sequence, Tuple
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


def map_export_outputs(
    fixed_slots: Sequence[str],
) -> Tuple[str, str, str, str, str, str, str]:
    """Map the service's fixed seven export slots to stable node outputs.

    The OpenAPI contract returns ``zipUrl, glbUrl, usdzUrl, objZipUrl,
    fbxZipUrl, stlUrl, threeMfUrl`` in that exact order.  Values are therefore
    never classified from URL suffixes: the source ZIP and OBJ/FBX ZIP exports
    may all use indistinguishable generic filenames.

    The node keeps its historic first four artifact outputs unchanged and
    appends STL, 3MF, and the source Lux3D ZIP for workflow compatibility.
    """

    slots = list(fixed_slots)
    if len(slots) != 7:
        raise Lux3DOutputProtocolError(
            "Lux3D export task must return exactly seven fixed output slots"
        )

    normalized = [
        "" if not value or value.strip().upper() == "NOT_REQUESTED" else value
        for value in slots
    ]
    lux3d_zip, glb, usdz, obj_zip, fbx_zip, stl, three_mf = normalized
    if not glb:
        raise Lux3DOutputProtocolError(
            "Lux3D export task returned an empty required glbUrl slot"
        )
    return (
        glb,
        usdz,
        obj_zip,
        fbx_zip,
        stl,
        three_mf,
        lux3d_zip,
    )


__all__ = [
    "Lux3DOutputProtocolError",
    "map_export_outputs",
    "map_generation_outputs",
]
