import logging
from typing import Any, Dict, Optional
from .render.build_render_design import (
    build_render_design_and_poll,
    update_render_design_and_poll,
)
from .render.image_to_torch import depth_exr_url_to_tensor, image_url_to_image_tensor
from .render.model_upload import upload_models_with_cache
from .render.offline_render import render_and_poll
from .sso.sso_token import get_sso_token
from server import PromptServer

logger = logging.getLogger("LuxRealEngine")
_DESIGN_ID_CACHE: Dict[str, str] = {}
_SSO_TOKEN_CACHE: Dict[str, str] = {}


class LuxRealEngine:
    """LuxReal Engine node for 3D rendering and real-time preview."""

    def __init__(self) -> None:
        """Initialize LuxRealEngine node."""
        pass

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        """Define input types for LuxRealEngine node."""
        return {
            "required": {
                "resolution": (
                    ["1K", "2K", "4K", "8K"],
                    {"default": "1K"},
                ),
                "ratio": (
                    ["1:1", "16:9", "9:16", "4:3", "3:4"],
                    {"default": "16:9"},
                ),
                "lux3d_input_1": ("STRING", {"default": None}),
                "lux3d_input_2": ("STRING", {"default": None}),
                "lux3d_input_3": ("STRING", {"default": None}),
                "lux3d_input_4": ("STRING", {"default": None}),
                "lux3d_input_5": ("STRING", {"default": None}),
                "file_input_1": ("STRING", {"default": None}),
                "file_input_2": ("STRING", {"default": None}),
                "file_input_3": ("STRING", {"default": None}),
                "file_input_4": ("STRING", {"default": None}),
                "file_input_5": ("STRING", {"default": None}),
                "base_api_path": (
                    "STRING",
                    {
                        "default": (
                            "https://api.luxreal.ai"
                        )
                    },
                ),
                "seed": (
                    "INT",
                    {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF},
                ),
                # Invitation code input (optional), used to parse ak/sk/appuid
                "lux3d_api_key": (
                    "STRING",
                    {
                        "label": "Invitation Code (Optional)",
                        "default": "",
                        "multiline": False,
                    },
                ),
                # _upload_cache as hidden widget for storing upload cache
                "_upload_cache": ("STRING", {"default": "{}"}),
            },
            # Hidden field for unique_id, key for ComfyUI node identification
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = (
        "render_image",
        "material_ch",
        "model_ch",
        "depth",
        "diffuse",
        "normal",
    )
    FUNCTION = "process_urls"
    CATEGORY = "Lux3D"

    def process_urls(
            self,
            resolution: str,
            ratio: str,
            lux3d_input_1: Optional[str],
            lux3d_input_2: Optional[str],
            lux3d_input_3: Optional[str],
            lux3d_input_4: Optional[str],
            lux3d_input_5: Optional[str],
            file_input_1: Optional[str],
            file_input_2: Optional[str],
            file_input_3: Optional[str],
            file_input_4: Optional[str],
            file_input_5: Optional[str],
            base_api_path: str,
            seed: int,
            lux3d_api_key: str = "",
            _upload_cache: str = "{}",
            unique_id: Optional[str] = None,
    ) -> Dict[str, Any]:

        logger.info(f">>> Start processing Node ID: {unique_id}")
        logger.debug(f">>> Current Global Cache Keys: {list(_DESIGN_ID_CACHE.keys())}")
        logger.info(f">>> _upload_cache: {_upload_cache}")
        logger.info(f">>> resolution={resolution}, ratio={ratio}")

        # Collect current file paths
        file_paths = {
            "file_input_1": file_input_1,
            "file_input_2": file_input_2,
            "file_input_3": file_input_3,
            "file_input_4": file_input_4,
            "file_input_5": file_input_5,
        }

        # Upload models (with cache)
        uploaded_urls, new_upload_cache = upload_models_with_cache(
            file_paths=file_paths,
            upload_cache=_upload_cache,
            base_api_path=base_api_path,
            lux3d_api_key=lux3d_api_key,
        )

        # Build urlMap dictionary
        current_url_map: Dict[str, str] = {}
        if lux3d_input_1:
            current_url_map["lux3d_input_1"] = lux3d_input_1
        if lux3d_input_2:
            current_url_map["lux3d_input_2"] = lux3d_input_2
        if lux3d_input_3:
            current_url_map["lux3d_input_3"] = lux3d_input_3
        if lux3d_input_4:
            current_url_map["lux3d_input_4"] = lux3d_input_4
        if lux3d_input_5:
            current_url_map["lux3d_input_5"] = lux3d_input_5

        # Add uploaded URLs to url_map (use uploaded URLs instead of local paths)
        for field_name, url in uploaded_urls.items():
            current_url_map[field_name] = url

        # [Build Design] or [Update Design]
        render_design_id = _DESIGN_ID_CACHE.get(unique_id)
        if render_design_id is None:
            logger.info(f">>> Start build render design: {unique_id}")
            # Design building
            current_design_id = build_render_design_and_poll(
                base_url=base_api_path,
                url_map=current_url_map,
                base_render_design_id=None,
                lux3d_api_key=lux3d_api_key,
            )

            render_design_id = current_design_id
            _DESIGN_ID_CACHE[unique_id] = current_design_id
            if render_design_id is None:
                raise RuntimeError(f"build design failed: {render_design_id}")
        else:
            # Design updating
            logger.info(f">>> Start update render design: {render_design_id}")
            render_design_id = update_render_design_and_poll(
                base_url=base_api_path,
                obs_render_design_id=render_design_id,
                url_map=current_url_map,
                lux3d_api_key=lux3d_api_key,
            )

        # Notify frontend to load iframe immediately
        logger.info(f">>> Start notify js: {render_design_id}")
        iframe_url = (
            f"https://www.luxreal.ai/create?"
            f"bizkey=Luxreal-comfyUI&renderdesignid={render_design_id}"
        )

        # sso_token cached by unique_id, lifecycle consistent with render_design_id
        sso_token = _SSO_TOKEN_CACHE.get(unique_id)
        if not sso_token:
            sso_token = get_sso_token(
                lux3d_api_key=lux3d_api_key if lux3d_api_key else None
            )
            if not sso_token:
                raise RuntimeError(
                    f"sso token failed: {sso_token}, please check invitation "
                    f"code or config.txt configuration"
                )
            _SSO_TOKEN_CACHE[unique_id] = sso_token

        # Send WebSocket message to frontend
        server = PromptServer.instance  # ComfyUI specific
        payload = {
            "node": unique_id,
            "iframe_url": iframe_url,
            "sso_token": sso_token,
        }

        if server.client_id is not None:
            server.send_sync("lux-real-engine-iframe-update", payload, server.client_id)
        else:
            server.send_sync("lux-real-engine-iframe-update", payload)

        # Offline rendering, get 6 images (time-consuming operation)
        logger.info(f">>> Start render design: {render_design_id}")
        poll = render_and_poll(
            base_api_path,
            render_design_id,
            resolution=resolution,
            ratio=ratio,
            lux3d_api_key=lux3d_api_key,
        )

        render_image = image_url_to_image_tensor(poll.get("RGB"))
        material_ch = image_url_to_image_tensor(poll.get("MtlId"))
        model_ch = image_url_to_image_tensor(poll.get("ModelId"))
        depth = depth_exr_url_to_tensor(poll.get("Depth"))
        diffuse = image_url_to_image_tensor(poll.get("RawDiffuseFilter"))
        normal = image_url_to_image_tensor(poll.get("WorldSpaceNormal"))

        logger.info(f">>> Finished render design: {render_design_id}")

        # Return results (UI part maintains ComfyUI standard workflow)
        return {
            "ui": {
                "iframe_url": [iframe_url],
                "_upload_cache": [new_upload_cache],
                "sso_token": [sso_token],
            },
            "result": (
                render_image,
                material_ch,
                model_ch,
                depth,
                diffuse,
                normal,
            ),
        }


# Register node
NODE_CLASS_MAPPINGS = {
    "LuxRealEngine": LuxRealEngine
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LuxRealEngine": "LuxReal Engine"
}
