from pathlib import Path
from typing import Any, Dict
from urllib.parse import quote, urlencode

from .lux3d_openapi.config import DEFAULT_BASE_API_PATH, api_config
from .lux3d_openapi.local_assets import (
    VIEWER_MODEL_EXTENSIONS,
    model_url_or_local_input,
    validate_single_url_or_local_file_source,
)


def _comfy_local_model_url(path: Path) -> str:
    """Build a same-origin ComfyUI /view URL for a validated local model."""

    try:
        import folder_paths  # type: ignore
    except ImportError as error:  # pragma: no cover - only outside ComfyUI
        raise ValueError("ComfyUI file directories are unavailable") from error

    for directory_type, getter_name in (
        ("input", "get_input_directory"),
        ("output", "get_output_directory"),
        ("temp", "get_temp_directory"),
    ):
        getter = getattr(folder_paths, getter_name, None)
        if not callable(getter):
            continue
        root_value = getter()
        if not root_value:
            continue
        root = Path(root_value).expanduser().resolve()
        try:
            relative = path.resolve().relative_to(root)
        except ValueError:
            continue
        if not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
            raise ValueError("model_url has an invalid ComfyUI-relative path")
        query = urlencode(
            {
                "filename": relative.name,
                "type": directory_type,
                "subfolder": relative.parent.as_posix()
                if relative.parent != Path(".")
                else "",
            },
            quote_via=quote,
            safe="",
        )
        return f"/view?{query}"
    raise ValueError("model_url must stay inside a ComfyUI file directory")


class Lux3DViewer:
    """Pass a model URL through while the frontend renders its preview."""

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "model_url": model_url_or_local_input(
                    VIEWER_MODEL_EXTENSIONS,
                    tooltip=(
                        "Public HTTP(S) .glb/.ply URL or a ComfyUI "
                        "input/output/temp relative .glb/.ply file. Local "
                        "files stay in ComfyUI and are never uploaded."
                    ),
                ),
                "base_api_path": (
                    "STRING",
                    {"default": DEFAULT_BASE_API_PATH},
                ),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("model_url",)
    FUNCTION = "execute"
    CATEGORY = "Lux3D"
    OUTPUT_NODE = True

    def execute(
        self,
        model_url: str = "",
        base_api_path: str = DEFAULT_BASE_API_PATH,
    ) -> Dict[str, Any]:
        api_config(base_api_path)
        remote_url, local_path = validate_single_url_or_local_file_source(
            model_url,
            VIEWER_MODEL_EXTENSIONS,
            field_name="model_url",
        )
        if remote_url is not None:
            resolved_model_url = remote_url
        elif local_path is not None:
            resolved_model_url = _comfy_local_model_url(local_path)
        else:  # pragma: no cover - defensive invariant
            raise RuntimeError("viewer model source resolution failed")
        return {
            "ui": {"model_url": [resolved_model_url]},
            "result": (resolved_model_url,),
        }


NODE_CLASS_MAPPINGS = {
    "Lux3DViewer": Lux3DViewer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3DViewer": "Lux3D Viewer",
}
