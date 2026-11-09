"""Released postprocessing payloads; validate controls before any upload."""
from __future__ import annotations

import ipaddress
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit

from .animation_catalog import ANIMATION_IDS
from .contracts import parse_create_task_id, parse_string_list, require_text


RETOPOLOGY_TEXTURE_SIZES = (512, 1024, 2048, 4096)


def validate_model_url(
    value, field_name="model_url", *, https_only=False, expected_extension=".glb"
):
    url = require_text(value, field_name)
    if any(character.isspace() or ord(character) < 32 for character in url):
        raise ValueError(f"{field_name} cannot contain whitespace or control characters")
    parsed = urlsplit(url)
    if parsed.scheme not in (("https",) if https_only else ("http", "https")) or not parsed.hostname:
        raise ValueError(f"{field_name} must be a public {'HTTPS' if https_only else 'HTTP(S)'} GLB URL")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError(f"{field_name} cannot contain credentials or a fragment")
    # DNS hostnames may be written as absolute names with one or more trailing
    # dots. Normalize that spelling before local/private-host checks so
    # localhost. and 127.0.0.1. cannot bypass the public-URL guard.
    host = parsed.hostname.lower().rstrip(".")
    if not host:
        raise ValueError(f"{field_name} must be publicly accessible")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValueError(f"{field_name} must be publicly accessible")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if (address is not None and not address.is_global) or (address is None and "." not in host):
        raise ValueError(f"{field_name} must be publicly accessible")
    extension = str(expected_extension).lower()
    if not extension.startswith("."):
        extension = "." + extension
    if PurePosixPath(unquote(parsed.path)).suffix.lower() != extension:
        raise ValueError(f"{field_name} must use {extension}")
    return url


def validate_mesh_retopology_options(
    face_limit, quad=True, bake_textures=False, texture_size=2048, content_id=""
):
    """Validate every billable retopology control before resolving or uploading a model."""
    if type(quad) is not bool:
        raise ValueError("quad must be a boolean")
    if type(face_limit) is not int:
        raise ValueError("face_limit is required and must be an integer")
    minimum, maximum = (1000, 500000) if quad else (2000, 1000000)
    if not minimum <= face_limit <= maximum:
        mode = "quad" if quad else "triangle"
        raise ValueError(
            f"face_limit must be between {minimum} and {maximum} for {mode} topology"
        )
    if type(bake_textures) is not bool:
        raise ValueError("bake_textures must be a boolean")
    if type(texture_size) is not int or texture_size not in RETOPOLOGY_TEXTURE_SIZES:
        raise ValueError("texture_size must be 512, 1024, 2048, or 4096")
    if content_id is None:
        content_id = ""
    if not isinstance(content_id, str):
        raise ValueError("content_id must be text or empty")
    return {
        "face_limit": face_limit,
        "quad": quad,
        "bake_textures": bake_textures,
        "texture_size": texture_size,
        "content_id": content_id.strip(),
    }


def build_mesh_retopology_payload(
    model_url,
    face_limit,
    quad=True,
    bake_textures=False,
    texture_size=2048,
    content_id="",
):
    options = validate_mesh_retopology_options(
        face_limit, quad, bake_textures, texture_size, content_id
    )
    payload = {
        "modelUrl": validate_model_url(model_url),
        "faceLimit": options["face_limit"],
        "quad": options["quad"],
        "bakeTextures": options["bake_textures"],
        "textureSize": options["texture_size"],
    }
    if options["content_id"]:
        payload["contentId"] = options["content_id"]
    return payload


def parse_animation_ids(value):
    ids = parse_string_list(value, "animation_ids")
    if not 1 <= len(ids) <= 10 or len(set(ids)) != len(ids):
        raise ValueError("animation_ids must contain 1–10 distinct action IDs")
    unknown = [action for action in ids if action not in ANIMATION_IDS]
    if unknown:
        raise ValueError("animation_ids contains an unsupported case-sensitive action ID")
    return ids


def validate_animation_options(animation_ids, output_mode, out_format, animate_in_place):
    ids = parse_animation_ids(animation_ids)
    if output_mode not in ("separate", "combined"):
        raise ValueError("output_mode must be separate or combined")
    if out_format not in ("glb", "fbx"):
        raise ValueError("out_format must be glb or fbx")
    if type(animate_in_place) is not bool:
        raise ValueError("animate_in_place must be a boolean")
    return ids


def build_part_split_payload(model_url):
    return {"glbUrl": validate_model_url(model_url)}


def build_articulation_payload(model_url, prompt):
    return {"glbUrl": validate_model_url(model_url), "prompt": require_text(prompt, "prompt")}


def build_rig_payload(model_url):
    return {"modelUrl": validate_model_url(model_url, https_only=True)}


def build_retarget_payload(model_url, animation_ids, output_mode="separate", out_format="glb", animate_in_place=False):
    ids = validate_animation_options(animation_ids, output_mode, out_format, animate_in_place)
    return {"rigModelUrl": validate_model_url(model_url, https_only=True), "animationIds": ids,
            "animationOutputMode": output_mode, "outFormat": out_format, "animateInPlace": animate_in_place}


def new_task_id(response):
    if not isinstance(response, dict) or isinstance(response.get("c"), bool) or response.get("c") not in (0, "0") or type(response.get("d")) is not int:
        raise RuntimeError("Lux3D postprocessing create response must contain c=0 and a numeric task ID")
    return parse_create_task_id(response)
