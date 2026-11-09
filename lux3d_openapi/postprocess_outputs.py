"""Task-specific parsing, preserving action associations and failures."""
from __future__ import annotations

import json
from urllib.parse import urlsplit
from pathlib import PurePosixPath
from .contracts import parse_task_data, validate_public_url
from .postprocess_contracts import validate_model_url


def terminal_data(response):
    if not isinstance(response, dict) or isinstance(response.get("c"), bool) or response.get("c") not in (0, "0"):
        raise RuntimeError("Lux3D task response is missing a successful business envelope")
    return parse_task_data(response)


def output_content(data):
    outputs = data.get("outputs") or []
    if len(outputs) != 1 or not isinstance(outputs[0], dict) or not isinstance(outputs[0].get("content"), str):
        raise RuntimeError("Lux3D postprocessing task must return one output content string")
    return outputs[0]["content"]


def failure_message(data):
    details = []
    for key in ("errorMessage", "message", "error"):
        if data.get(key):
            details.append(str(data[key]))
    for output in data.get("outputs") or []:
        try:
            parsed = json.loads(output.get("content", ""))
        except (ValueError, TypeError, AttributeError):
            continue
        if isinstance(parsed, dict):
            if parsed.get("error"):
                details.append(json.dumps(parsed["error"], ensure_ascii=False))
            for action in parsed.get("actions", []) if isinstance(parsed.get("actions"), list) else []:
                if isinstance(action, dict) and action.get("status") == "failed":
                    details.append(f"{action.get('animation_id', '?')}: {action.get('error', 'failed')}")
    return "; ".join(details)[:2000]


def ensure_success(data, envelope_message=""):
    if data["status"] != 3:
        state = "cancelled" if data["status"] == 6 else "failed"
        raise RuntimeError(f"Lux3D task {data['taskId']} {state} (status={data['status']}): {failure_message(data) or envelope_message}")


def parse_single_result(response, *, require_glb=False):
    data = terminal_data(response)
    ensure_success(data, str(response.get("m") or ""))
    url = validate_public_url(output_content(data), "postprocessing result")
    suffix = PurePosixPath(urlsplit(url).path).suffix.lower().lstrip(".")
    if require_glb and suffix != "glb":
        raise RuntimeError("Lux3D task succeeded but did not return a GLB artifact")
    return url, suffix or "unknown"


def parse_retopology_result(response):
    """Parse the public GLB, OBJ, optional ZIP contract without moving slots."""
    data = terminal_data(response)
    ensure_success(data, str(response.get("m") or ""))
    outputs = data.get("outputs")
    if not isinstance(outputs, list) or len(outputs) != 3:
        raise RuntimeError(
            f"Lux3D task {data['taskId']} must return exactly three fixed retopology output slots"
        )
    contents = []
    for index, output in enumerate(outputs):
        if not isinstance(output, dict) or not isinstance(output.get("content"), str):
            raise RuntimeError(
                f"Lux3D task {data['taskId']} retopology output slot {index + 1} must contain a string"
            )
        contents.append(output["content"])

    glb = validate_model_url(
        contents[0], "retopology GLB output", expected_extension=".glb"
    )
    obj = validate_model_url(
        contents[1], "retopology OBJ output", expected_extension=".obj"
    )
    obj_zip = contents[2]
    if obj_zip:
        obj_zip = validate_model_url(
            obj_zip, "retopology OBJ ZIP output", expected_extension=".zip"
        )
    return glb, obj, obj_zip


def parse_retarget_result(response, requested_ids, out_format):
    data = terminal_data(response)
    ensure_success(data, str(response.get("m") or ""))
    try:
        parsed = json.loads(output_content(data))
    except ValueError as exc:
        raise RuntimeError("Lux3D retarget content must be a JSON object string") from exc
    actions = parsed.get("actions") if isinstance(parsed, dict) else None
    if not isinstance(actions, list) or len(actions) != len(requested_ids):
        raise RuntimeError("Lux3D retarget must report every requested action")
    indexed = {}
    url_key = "animationGlbUrl" if out_format == "glb" else "fbxUrl"
    for action in actions:
        if not isinstance(action, dict):
            raise RuntimeError("Lux3D action result must be an object")
        action_id = action.get("animation_id")
        if action_id not in requested_ids or action_id in indexed:
            raise RuntimeError("Lux3D returned a duplicate or unrequested action ID")
        state = action.get("status")
        if state == "success":
            url = validate_public_url(action.get(url_key), "animation artifact")
            if not urlsplit(url).path.lower().endswith("." + out_format):
                raise RuntimeError("Lux3D returned an artifact in the wrong animation format")
            if action.get("error") or action.get("fbxUrl" if out_format == "glb" else "animationGlbUrl"):
                raise RuntimeError("Lux3D action reports contradictory success and error")
        elif state == "failed":
            if not action.get("error") or action.get("animationGlbUrl") or action.get("fbxUrl"):
                raise RuntimeError("Lux3D failed action must contain an error and no artifact")
        else:
            raise RuntimeError("Lux3D action has an unknown terminal status")
        indexed[action_id] = action
    ordered = [indexed[action_id] for action_id in requested_ids]
    successful = [action[url_key] for action in ordered if action["status"] == "success"]
    if not successful:
        raise RuntimeError("Lux3D retarget task reports success without any delivered action")
    return ordered, list(dict.fromkeys(successful)), len(ordered) - len(successful)
