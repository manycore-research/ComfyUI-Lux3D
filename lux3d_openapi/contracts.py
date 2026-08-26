"""Public Lux3D OpenAPI contracts and request/response validation."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import urlparse


@dataclass(frozen=True)
class OpenAPIOperation:
    operation_id: str
    method: str
    path: str
    node_key: Optional[str]
    excluded_reason: Optional[str] = None


DOCUMENTED_OPERATIONS: Tuple[OpenAPIOperation, ...] = (
    OpenAPIOperation(
        "createImgTo3dTask",
        "POST",
        "/lux3d/v1/generate/img-to-3d/task/create",
        "Lux3DOpenAPIImageTo3D",
    ),
    OpenAPIOperation(
        "createTextTo3dTask",
        "POST",
        "/lux3d/v1/generate/text-to-3d/task/create",
        "Lux3DOpenAPITextTo3D",
    ),
    OpenAPIOperation(
        "createMaterialTransferTask",
        "POST",
        "/lux3d/v1/generate/material-transfer/task/create",
        None,
        "Material repainting is intentionally excluded from this release.",
    ),
    OpenAPIOperation(
        "createImageToFourViewTask",
        "POST",
        "/lux3d/v1/generate/image-to-four-view/task/create",
        "Lux3DOpenAPIImageToFourView",
    ),
    OpenAPIOperation(
        "createMultiFormatExportTask",
        "POST",
        "/lux3d/v1/multi-format-export/task/create",
        "Lux3DOpenAPIMultiFormatExport",
    ),
    OpenAPIOperation(
        "getTask",
        "GET",
        "/lux3d/v1/generate/task/get",
        None,
        "Task lookup is intentionally not exposed as a ComfyUI node.",
    ),
    OpenAPIOperation(
        "listTasks",
        "GET",
        "/lux3d/v1/generate/task/list",
        None,
        "Task history is intentionally not exposed as a ComfyUI node.",
    ),
)

DOCUMENTED_OPERATION_IDS = frozenset(
    operation.operation_id for operation in DOCUMENTED_OPERATIONS
)
EXCLUDED_OPERATION_IDS = frozenset(
    operation.operation_id
    for operation in DOCUMENTED_OPERATIONS
    if operation.excluded_reason
)
IMPLEMENTED_OPERATIONS = tuple(
    operation for operation in DOCUMENTED_OPERATIONS if not operation.excluded_reason
)

GENERATION_VERSIONS = ("G1", "G1-Turbo")
GENERATION_FORMATS = ("zip", "glb", "ply")
EXPORT_FORMATS = ("usdz", "obj_zip", "fbx_zip")
STYLES = (
    "photorealistic",
    "cartoon",
    "anime",
    "hand_painted",
    "cyberpunk",
    "fantasy",
    "glass",
)
TRISTATE_VALUES = ("default", "true", "false")
GENERATION_FORMAT_CHOICES = (
    "default",
    "zip",
    "glb",
    "ply",
    "zip,glb",
    "zip,ply",
    "glb,ply",
    "zip,glb,ply",
)
EXPORT_FORMAT_CHOICES = (
    "default",
    "usdz",
    "obj_zip",
    "fbx_zip",
    "usdz,obj_zip",
    "usdz,fbx_zip",
    "obj_zip,fbx_zip",
    "usdz,obj_zip,fbx_zip",
)

TASK_STATUS_LABELS = {
    0: "initialized",
    1: "running",
    3: "succeeded",
    4: "failed",
    6: "cancelled",
}
TASK_STATUS_CHOICES = (
    "all",
    "0 - initialized",
    "1 - running",
    "3 - succeeded",
    "4 - failed",
    "6 - cancelled",
)


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def require_text(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} cannot be empty")
    return value.strip()


def validate_public_url(value: Any, field_name: str) -> str:
    url = require_text(value, field_name)
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"{field_name} must be an accessible HTTP(S) URL")
    return url


def parse_string_list(value: Any, field_name: str) -> List[str]:
    """Parse a JSON string array or one-value-per-line widget value."""
    if isinstance(value, (list, tuple)):
        raw_values = list(value)
    else:
        text = require_text(value, field_name)
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{field_name} must be valid JSON or one URL per line") from exc
            if not isinstance(parsed, list):
                raise ValueError(f"{field_name} JSON value must be an array")
            raw_values = parsed
        else:
            raw_values = text.splitlines()

    values = []
    for item in raw_values:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"{field_name} must contain only non-empty strings")
        values.append(item.strip())
    return values


def parse_format_choice(
    value: Any, allowed: Sequence[str], field_name: str = "output_format"
) -> Optional[List[str]]:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        items = [str(item).strip() for item in value]
        if not items:
            return None
    else:
        text = str(value).strip()
        if not text or text == "default":
            return None
        items = [item.strip() for item in text.split(",")]

    if not items or any(not item for item in items):
        raise ValueError(f"{field_name} contains an empty format")
    if len(items) != len(set(items)):
        raise ValueError(f"{field_name} cannot contain duplicate formats")
    unknown = [item for item in items if item not in allowed]
    if unknown:
        raise ValueError(
            f"{field_name} contains unsupported formats: {', '.join(unknown)}"
        )
    return items


def parse_tristate(value: Any, field_name: str) -> Optional[bool]:
    if value is None or value == "default":
        return None
    if value is True or value == "true":
        return True
    if value is False or value == "false":
        return False
    raise ValueError(f"{field_name} must be default, true, or false")


def build_generation_options(
    version: str,
    face_count: int,
    output_format: Any,
    enable_pbr: Any,
    ai_predict_size: Any,
) -> Dict[str, Any]:
    if version not in GENERATION_VERSIONS:
        raise ValueError("version must be G1 or G1-Turbo")

    options: Dict[str, Any] = {"version": version}
    if face_count:
        if isinstance(face_count, bool) or not 10000 <= int(face_count) <= 300000:
            raise ValueError("face_count must be 0 or an integer from 10000 to 300000")
        options["faceCount"] = int(face_count)

    formats = parse_format_choice(output_format, GENERATION_FORMATS)
    if formats is not None:
        options["outputFormat"] = formats

    pbr = parse_tristate(enable_pbr, "enable_pbr")
    if version == "G1" and pbr is not None:
        raise ValueError("enable_pbr is only supported by G1-Turbo")
    if pbr is not None:
        if formats == ["ply"]:
            raise ValueError("enable_pbr does not apply to a PLY-only request")
        options["enablePbr"] = pbr

    predict_size = parse_tristate(ai_predict_size, "ai_predict_size")
    if predict_size is not None:
        options["aiPredictSize"] = predict_size
    return options


def build_image_to_3d_payload(
    input_mode: str,
    image_url: str,
    image_urls: Any,
    version: str,
    face_count: int,
    output_format: Any,
    enable_pbr: Any,
    ai_predict_size: Any,
) -> Dict[str, Any]:
    payload = build_generation_options(
        version, face_count, output_format, enable_pbr, ai_predict_size
    )
    single_value = image_url.strip() if isinstance(image_url, str) else ""
    multi_value = image_urls.strip() if isinstance(image_urls, str) else image_urls

    if input_mode == "single":
        if multi_value:
            raise ValueError("image_urls must be empty when input_mode is single")
        payload["img"] = validate_public_url(single_value, "image_url")
    elif input_mode == "multiple":
        if single_value:
            raise ValueError("image_url must be empty when input_mode is multiple")
        urls = parse_string_list(multi_value, "image_urls")
        if not 1 <= len(urls) <= 32:
            raise ValueError("image_urls must contain between 1 and 32 URLs")
        payload["imgs"] = [
            validate_public_url(url, "image_urls") for url in urls
        ]
    else:
        raise ValueError("input_mode must be single or multiple")
    return payload


def build_text_to_3d_payload(
    prompt: str,
    style: str,
    reference_image_url: str,
    version: str,
    face_count: int,
    output_format: Any,
    enable_pbr: Any,
    ai_predict_size: Any,
) -> Dict[str, Any]:
    if style not in STYLES:
        raise ValueError(f"style must be one of: {', '.join(STYLES)}")
    payload = build_generation_options(
        version, face_count, output_format, enable_pbr, ai_predict_size
    )
    payload["prompt"] = require_text(prompt, "prompt")
    payload["style"] = style
    if reference_image_url and reference_image_url.strip():
        payload["img"] = validate_public_url(
            reference_image_url, "reference_image_url"
        )
    return payload


def build_four_view_payload(image_url: str) -> Dict[str, Any]:
    return {"img": validate_public_url(image_url, "image_url")}


def build_export_payload(model_url: str, output_format: Any) -> Dict[str, Any]:
    model_url = validate_public_url(model_url, "model_url")
    suffix = urlparse(model_url).path.lower()
    if not suffix.endswith((".glb", ".zip")):
        raise ValueError("model_url must end with .glb or .zip")

    explicit_empty_formats = isinstance(output_format, (list, tuple)) and not output_format
    formats = parse_format_choice(output_format, EXPORT_FORMATS)
    if suffix.endswith(".glb") and not formats:
        raise ValueError("a GLB input requires at least one export format")

    payload: Dict[str, Any] = {"modelUrl": model_url}
    if formats is not None:
        payload["outputFormat"] = formats
    elif explicit_empty_formats:
        payload["outputFormat"] = []
    return payload


def normalize_task_id(value: Any) -> str:
    if isinstance(value, bool):
        raise ValueError("task_id must be a positive integer")
    text = str(value).strip()
    if not text.isdigit() or int(text) <= 0:
        raise ValueError("task_id must be a positive integer")
    return text


def build_list_params(
    page: int,
    page_size: int,
    status: Any,
    start_time_ms: int,
    end_time_ms: int,
) -> Dict[str, int]:
    if isinstance(page, bool) or int(page) < 1:
        raise ValueError("page must be at least 1")
    if isinstance(page_size, bool) or not 1 <= int(page_size) <= 100:
        raise ValueError("page_size must be between 1 and 100")

    params = {"page": int(page), "pagesize": int(page_size)}
    if status not in (None, "", "all"):
        status_text = str(status).strip().split(" ", 1)[0]
        if status_text not in {"0", "1", "3", "4", "6"}:
            raise ValueError("status must be all, 0, 1, 3, 4, or 6")
        params["status"] = int(status_text)

    start = int(start_time_ms or 0)
    end = int(end_time_ms or 0)
    if start < 0 or end < 0:
        raise ValueError("time filters cannot be negative")
    if start and end and end <= start:
        raise ValueError("end_time_ms must be greater than start_time_ms")
    if start:
        params["starttime"] = start
    if end:
        params["endtime"] = end
    return params


def parse_create_task_id(response: Mapping[str, Any]) -> str:
    if "d" not in response or response.get("d") is None:
        raise ValueError("create response is missing task id in d")
    return normalize_task_id(response["d"])


def parse_task_data(response: Mapping[str, Any]) -> Dict[str, Any]:
    data = response.get("d")
    if not isinstance(data, dict):
        raise ValueError("task response is missing object d")
    normalize_task_id(data.get("taskId"))
    status = data.get("status")
    if type(status) is not int or status not in TASK_STATUS_LABELS:
        raise ValueError("task response contains an unsupported status")
    outputs = data.get("outputs", [])
    if outputs is None:
        outputs = []
    if not isinstance(outputs, list):
        raise ValueError("task response outputs must be an array")
    return data


def extract_output_contents(outputs: Iterable[Any]) -> List[str]:
    contents: List[str] = []
    for output in outputs:
        if not isinstance(output, dict):
            raise ValueError("each task output must be an object")
        content = output.get("content")
        if content is None:
            continue
        if not isinstance(content, str):
            raise ValueError("task output content must be a string")
        stripped = content.strip()
        if stripped.startswith("["):
            try:
                nested = json.loads(stripped)
            except json.JSONDecodeError:
                nested = None
            if isinstance(nested, list) and all(
                isinstance(item, str) for item in nested
            ):
                contents.extend(nested)
                continue
        contents.append(content)
    return contents


def parse_task_list_data(response: Mapping[str, Any]) -> Dict[str, Any]:
    data = response.get("d")
    if not isinstance(data, dict):
        raise ValueError("task-list response is missing object d")
    items = data.get("items")
    if not isinstance(items, list):
        raise ValueError("task-list response items must be an array")
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("each task-list item must be an object")
        normalize_task_id(item.get("taskId"))
        if item.get("status") not in TASK_STATUS_LABELS:
            raise ValueError("task-list item contains an unsupported status")
    for field_name in ("total", "page", "pageSize"):
        value = data.get(field_name)
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(
                f"task-list response {field_name} must be an integer"
            )
    if data["total"] < 0:
        raise ValueError("task-list response total cannot be negative")
    if data["page"] < 1:
        raise ValueError("task-list response page must be at least 1")
    if not 1 <= data["pageSize"] <= 100:
        raise ValueError("task-list response pageSize must be between 1 and 100")
    return data
