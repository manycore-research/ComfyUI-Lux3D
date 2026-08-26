"""Resolve native ComfyUI inputs and upload them through Asset/OUS V2."""

from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

import numpy as np
from PIL import Image

from .asset_upload import Lux3DAssetUploader
from .config import api_config, resolve_api_key
from .contracts import validate_public_url


IMAGE_FILE_EXTENSIONS = (
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
)
EXPORT_MODEL_EXTENSIONS = (".glb", ".zip")
MATERIAL_MODEL_EXTENSIONS = (".glb",)
VIEWER_MODEL_EXTENSIONS = (".glb", ".ply")


def _input_directory() -> Optional[Path]:
    try:
        import folder_paths  # type: ignore
    except ImportError:
        return None
    getter = getattr(folder_paths, "get_input_directory", None)
    if not callable(getter):
        return None
    value = getter()
    if not value:
        return None
    path = Path(value).expanduser().resolve()
    return path if path.is_dir() else None


def _comfy_directories() -> Dict[str, Path]:
    try:
        import folder_paths  # type: ignore
    except ImportError:
        return {}

    directories: Dict[str, Path] = {}
    for type_name, getter_name in (
        ("input", "get_input_directory"),
        ("output", "get_output_directory"),
        ("temp", "get_temp_directory"),
    ):
        getter = getattr(folder_paths, getter_name, None)
        if not callable(getter):
            continue
        value = getter()
        if not value:
            continue
        path = Path(value).expanduser().resolve()
        if path.is_dir():
            directories[type_name] = path
    return directories


def local_file_choices(extensions: Iterable[str]) -> List[str]:
    """List supported files below ComfyUI's input directory."""
    root = _input_directory()
    allowed = {str(extension).lower() for extension in extensions}
    if root is None:
        return [""]

    choices = []
    for current_root, _, filenames in os.walk(root):
        current_path = Path(current_root)
        for filename in filenames:
            path = current_path / filename
            if path.suffix.lower() in allowed:
                choices.append(path.relative_to(root).as_posix())
    return [""] + sorted(choices, key=str.casefold)


def local_model_input(
    extensions: Sequence[str],
    *,
    tooltip: str,
) -> Tuple[List[str], Dict[str, Any]]:
    """Build a native ComfyUI mesh-upload combo for a local model file."""
    return (
        local_file_choices(extensions),
        {
            "default": "",
            "mesh_upload": True,
            "file_upload": True,
            "upload_subfolder": "lux3d",
            "tooltip": tooltip,
        },
    )


def model_url_or_local_input(
    extensions: Sequence[str],
    *,
    tooltip: str,
) -> Tuple[str, Dict[str, Any]]:
    """Build one STRING widget that also remains a connectable model socket.

    ``LUX3D_MODEL_SOURCE`` is only a frontend/socket discriminator.  Runtime
    values remain strings (HTTP(S) URLs or ComfyUI-relative file names); this
    deliberately does not claim compatibility with ComfyUI ``FILE_3D``
    objects.
    """

    return (
        "STRING,LUX3D_MODEL_SOURCE",
        {
            "widgetType": "STRING",
            "default": "",
            "multiline": False,
            "supported_extensions": [str(value).lower() for value in extensions],
            "tooltip": tooltip,
        },
    )


def resolve_input_file(
    value: Any,
    extensions: Sequence[str],
    field_name: str,
) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} cannot be empty")
    name = value.strip().replace("\\", "/")
    directory_type = "input"
    for candidate_type in ("input", "output", "temp"):
        annotation = f" [{candidate_type}]"
        if name.endswith(annotation):
            directory_type = candidate_type
            name = name[: -len(annotation)]
            break
    candidate_name = Path(name)
    if candidate_name.is_absolute() or ".." in candidate_name.parts:
        raise ValueError(f"{field_name} must stay inside a ComfyUI file directory")

    root = _comfy_directories().get(directory_type)
    if root is None:
        raise ValueError(f"ComfyUI {directory_type} directory is unavailable")
    path = (root / candidate_name).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            f"{field_name} must stay inside a ComfyUI file directory"
        ) from exc
    if not path.is_file():
        raise ValueError(f"{field_name} does not exist in ComfyUI {directory_type}")
    if path.stat().st_size <= 0:
        raise ValueError(f"{field_name} cannot be an empty file")

    allowed = {str(extension).lower() for extension in extensions}
    if path.suffix.lower() not in allowed:
        supported = ", ".join(sorted(allowed))
        raise ValueError(f"{field_name} must use one of: {supported}")
    return path


def _asset_uploader(
    base_api_path: str,
    timeout: int,
    explicit_api_key: str = "",
) -> Lux3DAssetUploader:
    region, _ = api_config(base_api_path)
    return Lux3DAssetUploader(
        resolve_api_key(base_api_path, explicit_api_key),
        region=region,
        timeout=timeout,
    )


def _uploaded_url(result: Any) -> str:
    if not isinstance(result, dict):
        raise RuntimeError("Asset upload returned an invalid response")
    return validate_public_url(result.get("url"), "uploaded asset URL")


def upload_input_file(
    base_api_path: str,
    timeout: int,
    local_file: str,
    extensions: Sequence[str],
    field_name: str,
    *,
    explicit_api_key: str = "",
) -> str:
    path = resolve_input_file(local_file, extensions, field_name)
    result = _asset_uploader(
        base_api_path, timeout, explicit_api_key
    ).upload_file(path, path.name)
    return _uploaded_url(result)


def _image_batch_array(image: Any, field_name: str) -> np.ndarray:
    value = image
    for method_name in ("detach", "cpu"):
        method = getattr(value, method_name, None)
        if callable(method):
            value = method()
    to_numpy = getattr(value, "numpy", None)
    if callable(to_numpy):
        value = to_numpy()
    array = np.asarray(value)
    if array.ndim != 4 or array.shape[0] < 1:
        raise ValueError(f"{field_name} must be a non-empty BHWC IMAGE batch")
    if array.shape[-1] not in (1, 3, 4):
        raise ValueError(f"{field_name} must have 1, 3, or 4 channels")
    if not np.issubdtype(array.dtype, np.number) or not np.all(np.isfinite(array)):
        raise ValueError(f"{field_name} contains non-finite or non-numeric values")
    if np.issubdtype(array.dtype, np.floating):
        if np.any(array < 0.0) or np.any(array > 1.0):
            raise ValueError(f"{field_name} values must be in the [0, 1] range")
        array = array * 255.0
    elif np.any(array < 0) or np.any(array > 255):
        raise ValueError(f"{field_name} integer values must be in the [0, 255] range")
    return np.rint(array).astype(np.uint8)


def validate_image_batch(
    image: Any,
    field_name: str,
    *,
    min_count: int = 1,
    max_count: int = 32,
) -> np.ndarray:
    array = _image_batch_array(image, field_name)
    count = int(array.shape[0])
    if not min_count <= count <= max_count:
        if min_count == max_count:
            raise ValueError(f"{field_name} must contain exactly {min_count} image")
        raise ValueError(
            f"{field_name} must contain between {min_count} and {max_count} images"
        )
    return array


def _save_png(image: np.ndarray, path: Path) -> None:
    if image.shape[-1] == 1:
        pixels = image[..., 0]
        mode = "L"
    else:
        pixels = image
        mode = "RGB" if image.shape[-1] == 3 else "RGBA"
    Image.fromarray(pixels, mode=mode).save(path, format="PNG")


def upload_image_batch(
    base_api_path: str,
    timeout: int,
    image: Any,
    field_name: str,
    *,
    min_count: int = 1,
    max_count: int = 32,
    explicit_api_key: str = "",
) -> List[str]:
    array = validate_image_batch(
        image,
        field_name,
        min_count=min_count,
        max_count=max_count,
    )
    count = int(array.shape[0])

    uploader = _asset_uploader(base_api_path, timeout, explicit_api_key)
    urls: List[str] = []
    with TemporaryDirectory(prefix="comfyui-lux3d-assets-") as temp_dir:
        root = Path(temp_dir)
        for index, pixels in enumerate(array, start=1):
            filename = (
                "comfyui-image.png"
                if count == 1
                else f"comfyui-image-{index:02d}.png"
            )
            path = root / filename
            _save_png(pixels, path)
            urls.append(_uploaded_url(uploader.upload_file(path, filename)))
    return urls


def validate_url_or_local_file_source(
    remote_url: Any,
    local_file: Any,
    extensions: Sequence[str],
    *,
    url_field_name: str,
    file_field_name: str,
) -> Tuple[Optional[str], Optional[Path]]:
    remote_selected = isinstance(remote_url, str) and bool(remote_url.strip())
    local_selected = isinstance(local_file, str) and bool(local_file.strip())
    if remote_selected == local_selected:
        raise ValueError(
            f"provide exactly one of {url_field_name} or {file_field_name}"
        )

    if local_selected:
        return None, resolve_input_file(local_file, extensions, file_field_name)

    url = validate_public_url(remote_url, url_field_name)
    suffix = Path(urlparse(url).path).suffix.lower()
    allowed = {str(extension).lower() for extension in extensions}
    if suffix not in allowed:
        supported = ", ".join(sorted(allowed))
        raise ValueError(f"{url_field_name} must use one of: {supported}")
    return url, None


def resolve_url_or_local_file(
    base_api_path: str,
    timeout: int,
    remote_url: Any,
    local_file: Any,
    extensions: Sequence[str],
    *,
    url_field_name: str,
    file_field_name: str,
    explicit_api_key: str = "",
) -> str:
    url, path = validate_url_or_local_file_source(
        remote_url,
        local_file,
        extensions,
        url_field_name=url_field_name,
        file_field_name=file_field_name,
    )
    if url is not None:
        return url
    if path is None:  # pragma: no cover - defensive invariant
        raise RuntimeError("local file source resolution failed")
    result = _asset_uploader(
        base_api_path, timeout, explicit_api_key
    ).upload_file(path, path.name)
    return _uploaded_url(result)


def validate_single_url_or_local_file_source(
    value: Any,
    extensions: Sequence[str],
    *,
    field_name: str,
) -> Tuple[Optional[str], Optional[Path]]:
    """Resolve one STRING field as either an HTTP(S) URL or ComfyUI file.

    A value with an explicit URI scheme is never silently interpreted as a
    filename.  Local values are relative to ComfyUI input/output/temp and use
    the same ``[output]`` / ``[temp]`` annotations as native file widgets.
    """

    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} cannot be empty")
    source = value.strip()
    parsed = urlparse(source)

    # Let resolve_input_file produce the more useful containment error for an
    # absolute Windows path instead of reporting its drive letter as a scheme.
    is_windows_absolute = (
        len(source) >= 3
        and source[0].isalpha()
        and source[1] == ":"
        and source[2] in ("/", "\\")
    )
    if not is_windows_absolute and (parsed.scheme or parsed.netloc):
        if parsed.scheme.lower() not in ("http", "https"):
            raise ValueError(
                f"{field_name} must be an HTTP(S) URL or a ComfyUI-relative file"
            )
        url = validate_public_url(source, field_name)
        suffix = Path(urlparse(url).path).suffix.lower()
        allowed = {str(extension).lower() for extension in extensions}
        if suffix not in allowed:
            supported = ", ".join(sorted(allowed))
            raise ValueError(f"{field_name} must use one of: {supported}")
        return url, None

    return None, resolve_input_file(source, extensions, field_name)


def resolve_single_url_or_local_file(
    base_api_path: str,
    timeout: int,
    value: Any,
    extensions: Sequence[str],
    *,
    field_name: str,
    explicit_api_key: str = "",
) -> str:
    """Return a remote URL, uploading a selected local ComfyUI file first."""

    url, path = validate_single_url_or_local_file_source(
        value,
        extensions,
        field_name=field_name,
    )
    if url is not None:
        return url
    if path is None:  # pragma: no cover - defensive invariant
        raise RuntimeError("local file source resolution failed")
    result = _asset_uploader(
        base_api_path, timeout, explicit_api_key
    ).upload_file(path, path.name)
    return _uploaded_url(result)


__all__ = [
    "EXPORT_MODEL_EXTENSIONS",
    "IMAGE_FILE_EXTENSIONS",
    "MATERIAL_MODEL_EXTENSIONS",
    "VIEWER_MODEL_EXTENSIONS",
    "local_file_choices",
    "local_model_input",
    "model_url_or_local_input",
    "resolve_input_file",
    "resolve_single_url_or_local_file",
    "resolve_url_or_local_file",
    "upload_image_batch",
    "upload_input_file",
    "validate_image_batch",
    "validate_single_url_or_local_file_source",
    "validate_url_or_local_file_source",
]
