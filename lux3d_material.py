"""Lux3D material redraw node backed by the public API and Asset/OUS V2."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Tuple
from urllib.parse import urlparse

from .lux3d_openapi.client import Lux3DOpenAPIClient
from .lux3d_openapi.config import (
    DEFAULT_BASE_API_PATH,
    api_config,
    resolve_api_key,
)
from .lux3d_openapi.contracts import validate_public_url
from .lux3d_openapi.local_assets import (
    MATERIAL_MODEL_EXTENSIONS,
    model_url_or_local_input,
    resolve_single_url_or_local_file,
    upload_image_batch,
    validate_image_batch,
    validate_single_url_or_local_file_source,
)
from .lux3d_openapi.task_polling import (
    MAX_POLL_ATTEMPTS,
    POLL_INTERVAL_SECONDS,
    POLL_TIMEOUT_SECONDS,
    wait_for_task_result,
)


class Lux3DMaterialTransfer:
    """Upload a reference image and redraw an existing GLB material."""

    _VERSION = "v3.0-standard"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "image": (
                    "STRING,IMAGE",
                    {
                        "widgetType": "STRING",
                        "default": "",
                        "multiline": False,
                        "label": "Material Reference Image",
                        "tooltip": (
                            "Public HTTP(S) image URL or one connected local "
                            "IMAGE. Connecting the socket disables this URL field."
                        ),
                    },
                ),
                "mesh_url": model_url_or_local_input(
                    MATERIAL_MODEL_EXTENSIONS,
                    tooltip=(
                        "Public HTTP(S) .glb URL or a ComfyUI "
                        "input/output/temp relative .glb file."
                    ),
                ),
                "base_api_path": (
                    "STRING",
                    {"default": DEFAULT_BASE_API_PATH},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("glb_model_url",)
    FUNCTION = "redraw_material"
    CATEGORY = "Lux3D"
    OUTPUT_NODE = True

    @staticmethod
    def _task_id(response: Mapping[str, Any]) -> str:
        task_id = response.get("d")
        if (
            isinstance(task_id, bool)
            or not isinstance(task_id, (str, int))
            or not str(task_id).strip()
        ):
            raise RuntimeError("Material task response has an invalid task ID")
        return str(task_id)

    @staticmethod
    def _select_glb_output(outputs: Any) -> str:
        if not isinstance(outputs, list) or not outputs:
            raise RuntimeError("Material task succeeded without outputs")
        glb_urls = []
        for output in outputs:
            content = (
                output
                if isinstance(output, str)
                else output.get("content") if isinstance(output, dict) else None
            )
            if not isinstance(content, str):
                continue
            parsed = urlparse(content.strip())
            if (
                parsed.scheme.lower() in ("http", "https")
                and parsed.netloc
                and parsed.path.lower().endswith(".glb")
            ):
                glb_urls.append(content.strip())
        if len(glb_urls) != 1:
            raise RuntimeError(
                "Material task must return exactly one GLB output; "
                f"found {len(glb_urls)}"
            )
        return glb_urls[0]

    def _wait_for_result(
        self,
        client: Lux3DOpenAPIClient,
        task_id: str,
        *,
        max_attempts: int = MAX_POLL_ATTEMPTS,
        interval: float = POLL_INTERVAL_SECONDS,
        poll_timeout: float = POLL_TIMEOUT_SECONDS,
    ) -> str:
        _, urls = wait_for_task_result(
            client,
            task_id,
            max_attempts=max_attempts,
            poll_interval=interval,
            poll_timeout=poll_timeout,
        )
        return self._select_glb_output(urls)

    def redraw_material(
        self,
        image: Any,
        mesh_url: str,
        base_api_path: str = DEFAULT_BASE_API_PATH,
    ) -> Tuple[str]:
        try:
            region, _ = api_config(base_api_path)
            api_key = resolve_api_key(base_api_path)

            if isinstance(image, str):
                reference_source = image.strip()
                if not reference_source:
                    raise ValueError(
                        "image must be a public HTTP(S) URL or connected IMAGE"
                    )
                reference_url = validate_public_url(reference_source, "image")
            else:
                reference_source = validate_image_batch(
                    image,
                    "image",
                    min_count=1,
                    max_count=1,
                )
                reference_url = ""
            validate_single_url_or_local_file_source(
                mesh_url,
                MATERIAL_MODEL_EXTENSIONS,
                field_name="mesh_url",
            )

            if not reference_url:
                reference_url = upload_image_batch(
                    base_api_path,
                    30,
                    reference_source,
                    "image",
                    min_count=1,
                    max_count=1,
                    explicit_api_key=api_key,
                )[0]
            resolved_mesh_url = resolve_single_url_or_local_file(
                base_api_path,
                30,
                mesh_url,
                MATERIAL_MODEL_EXTENSIONS,
                field_name="mesh_url",
                explicit_api_key=api_key,
            )

            client = Lux3DOpenAPIClient(api_key, region=region, timeout=30)
            response = client.create_material_transfer_task(
                {
                    "img": reference_url,
                    "meshUrl": resolved_mesh_url,
                    "version": self._VERSION,
                }
            )
            return (self._wait_for_result(client, self._task_id(response)),)
        except Exception as exc:
            if isinstance(exc, RuntimeError) and str(exc).startswith(
                "Material redraw failed:"
            ):
                raise
            raise RuntimeError(f"Material redraw failed: {exc}") from exc


NODE_CLASS_MAPPINGS = {"Lux3DMaterialTransfer": Lux3DMaterialTransfer}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3DMaterialTransfer": "Lux3D Material Redraw",
}


__all__ = [
    "Lux3DMaterialTransfer",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
