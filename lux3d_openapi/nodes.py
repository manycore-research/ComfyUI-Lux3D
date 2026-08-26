"""ComfyUI nodes for the public Lux3D OpenAPI and Asset upload flow."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional, Tuple

from .client import Lux3DOpenAPIClient
from .config import (
    DEFAULT_BASE_API_PATH,
    api_config as _api_config,
    resolve_api_key as _resolve_api_key,
)
from .contracts import (
    EXPORT_FORMAT_CHOICES,
    GENERATION_FORMAT_CHOICES,
    GENERATION_VERSIONS,
    STYLES,
    TRISTATE_VALUES,
    build_export_payload,
    build_four_view_payload,
    build_image_to_3d_payload,
    build_text_to_3d_payload,
    parse_create_task_id,
    validate_public_url,
)
from .local_assets import (
    EXPORT_MODEL_EXTENSIONS,
    model_url_or_local_input,
    resolve_single_url_or_local_file,
    upload_image_batch,
    validate_image_batch,
)
from .result_outputs import map_export_outputs, map_generation_outputs
from .task_polling import HTTP_TIMEOUT_SECONDS, wait_for_task_result


def _api_inputs() -> Dict[str, Any]:
    return {
        "base_api_path": (
            "STRING",
            {
                "default": DEFAULT_BASE_API_PATH,
                "multiline": False,
                "tooltip": (
                    "Use https://api.aholo3d.cn or https://api.aholo3d.com. "
                    "The matching server API key environment variable is used."
                ),
            },
        ),
    }


def _generation_inputs() -> Dict[str, Any]:
    return {
        "version": (list(GENERATION_VERSIONS), {"default": "G1-Turbo"}),
        "face_count": (
            "INT",
            {
                "default": 200000,
                "min": 0,
                "max": 300000,
                "step": 1000,
                "tooltip": "Defaults to 200000; use 0 to omit the field.",
            },
        ),
        "output_format": (
            list(GENERATION_FORMAT_CHOICES),
            {
                "default": "default",
                "tooltip": (
                    "G1 always returns ZIP + GLB and optionally PLY; "
                    "G1-Turbo follows the selected combination."
                ),
            },
        ),
        "enable_pbr": (
            list(TRISTATE_VALUES),
            {
                "default": "default",
                "tooltip": "G1-Turbo only; omit for PLY-only output.",
            },
        ),
        "ai_predict_size": (
            list(TRISTATE_VALUES),
            {"default": "default"},
        ),
    }


def _image_or_url_input(tooltip: str) -> Tuple[str, Dict[str, Any]]:
    """Describe one ComfyUI input that accepts an IMAGE link or URL widget."""

    return (
        "STRING,IMAGE",
        {
            "widgetType": "STRING",
            "default": "",
            "multiline": False,
            "tooltip": tooltip,
        },
    )


def _validate_image_or_url(
    value: Any,
    field_name: str,
    *,
    allow_empty: bool,
) -> Tuple[str, Any]:
    """Classify and validate a union input without performing an upload."""

    if isinstance(value, str):
        url = value.strip()
        if not url:
            if allow_empty:
                return "empty", ""
            raise ValueError(f"{field_name} must be a public HTTP(S) URL or IMAGE")
        return "url", validate_public_url(url, field_name)

    validate_image_batch(value, field_name, min_count=1, max_count=1)
    return "image", value


def _resolve_image_or_url(
    base_api_path: str,
    kind: str,
    value: Any,
    field_name: str,
) -> str:
    if kind in ("empty", "url"):
        return str(value)
    return upload_image_batch(
        base_api_path,
        HTTP_TIMEOUT_SECONDS,
        value,
        field_name,
        min_count=1,
        max_count=1,
    )[0]


class _BaseOpenAPINode:
    OUTPUT_NODE = True

    @staticmethod
    def _client(base_api_path: str) -> Lux3DOpenAPIClient:
        region, _ = _api_config(base_api_path)
        return Lux3DOpenAPIClient(
            _resolve_api_key(base_api_path),
            region=region,
            timeout=HTTP_TIMEOUT_SECONDS,
        )

    @staticmethod
    def _complete_task(
        client: Lux3DOpenAPIClient,
        create_response: Mapping[str, Any],
        *,
        expected_output_count: Optional[int] = None,
        require_json_array_content: bool = False,
    ) -> Tuple[str, list[str]]:
        task_id = parse_create_task_id(create_response)
        _, urls = wait_for_task_result(
            client,
            task_id,
            expected_output_count=expected_output_count,
            require_json_array_content=require_json_array_content,
        )
        return task_id, urls


class Lux3DOpenAPIImageTo3D(_BaseOpenAPINode):
    """POST /lux3d/v1/generate/img-to-3d/task/create."""

    OPERATION_ID = "createImgTo3dTask"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        required: Dict[str, Any] = {}
        required.update(_api_inputs())
        for slot in range(1, 9):
            required[f"image_{slot}"] = _image_or_url_input(
                f"Optional public image URL or connected IMAGE/STRING for slot {slot}."
            )
        required.update(_generation_inputs())
        return {"required": required}

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "lux3d_zip", "glb", "ply")
    FUNCTION = "execute"
    CATEGORY = "Lux3D/Generate"

    def execute(
        self,
        base_api_path: str,
        image_1: Any,
        image_2: Any,
        image_3: Any,
        image_4: Any,
        image_5: Any,
        image_6: Any,
        image_7: Any,
        image_8: Any,
        version: str,
        face_count: int,
        output_format: str,
        enable_pbr: str,
        ai_predict_size: str,
    ) -> Tuple[str, str, str, str]:
        values = (
            image_1,
            image_2,
            image_3,
            image_4,
            image_5,
            image_6,
            image_7,
            image_8,
        )

        # Validate every slot before starting any upload so a later invalid
        # source cannot leave earlier files uploaded unnecessarily.
        sources = []
        for slot, value in enumerate(values, start=1):
            kind, validated = _validate_image_or_url(
                value, f"image_{slot}", allow_empty=True
            )
            if kind == "empty":
                continue
            sources.append((slot, kind, validated))

        if not sources:
            raise ValueError("provide at least one image URL or local IMAGE")

        resolved_urls = []
        for slot, kind, value in sources:
            resolved_urls.append(
                _resolve_image_or_url(
                    base_api_path, kind, value, f"image_{slot}"
                )
            )

        payload = build_image_to_3d_payload(
            "multiple",
            "",
            resolved_urls,
            version,
            face_count,
            output_format,
            enable_pbr,
            ai_predict_size,
        )
        client = self._client(base_api_path)
        response = client.create_img_to_3d_task(payload)
        task_id, urls = self._complete_task(client, response)
        return task_id, *map_generation_outputs(urls)


class Lux3DOpenAPITextTo3D(_BaseOpenAPINode):
    """POST /lux3d/v1/generate/text-to-3d/task/create."""

    OPERATION_ID = "createTextTo3dTask"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        required: Dict[str, Any] = {}
        required.update(_api_inputs())
        required.update(
            {
                "prompt": (
                    "STRING",
                    {"default": "", "multiline": True},
                ),
                "style": (list(STYLES), {"default": "photorealistic"}),
                "reference_image": _image_or_url_input(
                    "Optional public HTTP(S) URL or connected IMAGE/STRING."
                ),
            }
        )
        required.update(_generation_inputs())
        return {"required": required}

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "lux3d_zip", "glb", "ply")
    FUNCTION = "execute"
    CATEGORY = "Lux3D/Generate"

    def execute(
        self,
        base_api_path: str,
        prompt: str,
        style: str,
        reference_image: Any,
        version: str,
        face_count: int,
        output_format: str,
        enable_pbr: str,
        ai_predict_size: str,
    ) -> Tuple[str, str, str, str]:
        reference_kind, reference_value = _validate_image_or_url(
            reference_image, "reference_image", allow_empty=True
        )
        resolved_reference_url = _resolve_image_or_url(
            base_api_path,
            reference_kind,
            reference_value,
            "reference_image",
        )

        payload = build_text_to_3d_payload(
            prompt,
            style,
            resolved_reference_url,
            version,
            face_count,
            output_format,
            enable_pbr,
            ai_predict_size,
        )
        client = self._client(base_api_path)
        response = client.create_text_to_3d_task(payload)
        task_id, urls = self._complete_task(client, response)
        return task_id, *map_generation_outputs(urls)


class Lux3DOpenAPIImageToFourView(_BaseOpenAPINode):
    """POST /lux3d/v1/generate/image-to-four-view/task/create."""

    OPERATION_ID = "createImageToFourViewTask"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        required = _api_inputs()
        required["image"] = _image_or_url_input(
            "Required public HTTP(S) URL or connected IMAGE/STRING."
        )
        return {"required": required}

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "image_1", "image_2", "image_3", "image_4")
    FUNCTION = "execute"
    CATEGORY = "Lux3D/Generate"

    def execute(
        self,
        base_api_path: str,
        image: Any,
    ) -> Tuple[str, str, str, str, str]:
        image_kind, image_value = _validate_image_or_url(
            image, "image", allow_empty=False
        )
        resolved_image_url = _resolve_image_or_url(
            base_api_path, image_kind, image_value, "image"
        )
        client = self._client(base_api_path)
        response = client.create_image_to_four_view_task(
            build_four_view_payload(resolved_image_url)
        )
        task_id, urls = self._complete_task(
            client,
            response,
            expected_output_count=4,
            require_json_array_content=True,
        )
        return task_id, urls[0], urls[1], urls[2], urls[3]


class Lux3DOpenAPIMultiFormatExport(_BaseOpenAPINode):
    """POST /lux3d/v1/multi-format-export/task/create."""

    OPERATION_ID = "createMultiFormatExportTask"

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        required = _api_inputs()
        required.update(
            {
                "model_url": model_url_or_local_input(
                    EXPORT_MODEL_EXTENSIONS,
                    tooltip=(
                        "Public HTTP(S) .glb/.zip URL or a ComfyUI "
                        "input/output/temp relative file (for example "
                        "model.glb or model.glb [output])."
                    ),
                ),
                "output_format": (
                    list(EXPORT_FORMAT_CHOICES),
                    {"default": "default"},
                ),
            }
        )
        return {"required": required}

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "glb", "usdz", "obj_zip", "fbx_zip")
    FUNCTION = "execute"
    CATEGORY = "Lux3D/Export"

    def execute(
        self,
        base_api_path: str,
        model_url: str,
        output_format: str,
    ) -> Tuple[str, str, str, str, str]:
        resolved_model_url = resolve_single_url_or_local_file(
            base_api_path,
            HTTP_TIMEOUT_SECONDS,
            model_url,
            EXPORT_MODEL_EXTENSIONS,
            field_name="model_url",
        )
        payload = build_export_payload(resolved_model_url, output_format)
        client = self._client(base_api_path)
        response = client.create_multi_format_export_task(payload)
        task_id, urls = self._complete_task(client, response)
        return task_id, *map_export_outputs(urls, payload.get("outputFormat"))
