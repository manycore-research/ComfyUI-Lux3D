import base64
import io
import logging
from time import sleep
from typing import Any, Dict, Tuple, Optional

import numpy as np
import requests
from PIL import Image

from .sso.sso_token import generate_sign_by_lux3d_code, load_config

logger = logging.getLogger("Lux3D")


class BaseLux3DNode:
    """Base class for Lux3D nodes with common functionality"""
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("glb_model_url",)
    CATEGORY = "Lux3D"
    OUTPUT_NODE = True
    
    @staticmethod
    def tensor2pil(image: Any) -> Image.Image:
        """Convert tensor to PIL Image."""
        return Image.fromarray(
            np.clip(255.0 * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8)
        )

    def image_to_base64(self, image: Any) -> str:
        """Convert image tensor to base64 format."""
        original_shape = image.shape
        channels = original_shape[1]
        pil_image = self.tensor2pil(image[0])

        if channels == 4:
            save_format = 'png'
            if pil_image.mode != 'RGBA':
                pil_image = pil_image.convert('RGBA')
        elif channels == 3:
            save_format = 'jpeg'
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
        elif channels == 1:
            save_format = 'jpeg'
            if pil_image.mode != 'L':
                pil_image = pil_image.convert('L')
        else:
            save_format = 'jpeg'
            pil_image = pil_image.convert('RGB')

        buffer = io.BytesIO()
        pil_image.save(buffer, format=save_format, optimize=True)
        buffer.seek(0)
        
        img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/{save_format.lower()};base64,{img_str}"

    def query_task_status(
        self, base_url: str, lux3d_code: Dict[str, str], task_id: str, 
        max_attempts: int = 60, interval: int = 15
    ) -> str:
        """Query task status and get results."""
        for attempt in range(max_attempts):
            try:
                code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
                url = (
                    f"{base_url}/global/lux3d/generate/task/get?"
                    f"busid={task_id}&appuid={code_with_sign['appuid']}"
                    f"&appkey={code_with_sign['appkey']}&sign={code_with_sign['sign']}"
                    f"&timestamp={code_with_sign['timestamp']}"
                )

                response = requests.get(url, headers={"Content-Type": "application/json"}, timeout=30)
                response.raise_for_status()
                result = response.json()

                c_code = result.get("c")
                d_data = result.get("d")

                if not d_data:
                    raise ValueError("Missing d field in API response")

                status = d_data.get("status")

                if c_code == "0" and status == 3:
                    outputs = d_data.get("outputs", [])
                    if outputs:
                        lux3d_url = outputs[0].get("content")
                        if lux3d_url:
                            return lux3d_url
                        raise ValueError("content field not found in API response outputs")
                    raise ValueError("outputs is empty in API response")
                elif status == 4:
                    raise ValueError(f"Task execution failed, status code: {status}")
                elif attempt < max_attempts - 1:
                    logger.info(f"Task status: {status}, waiting {interval}s before polling...")
                    sleep(interval)

            except requests.exceptions.RequestException as e:
                logger.error(f"Task status query failed: {str(e)}")
                raise RuntimeError(f"Task status query failed: {str(e)}")
        
        raise TimeoutError("Task timeout, could not complete within specified time")

    def _submit_task(
        self, base_url: str, api_path: str, lux3d_api_key: str, 
        lux3d_code: Dict[str, str], payload: Dict[str, Any]
    ) -> str:
        """Generic task submission helper."""
        code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
        url = (
            f"{base_url}{api_path}?"
            f"appuid={code_with_sign['appuid']}&appkey={code_with_sign['appkey']}"
            f"&sign={code_with_sign['sign']}&timestamp={code_with_sign['timestamp']}"
        )

        try:
            response = requests.post(
                url, json=payload, 
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            
            bus_id = result.get("d")
            if bus_id is None:
                raise KeyError("Task ID not found in API response")
            
            return str(bus_id)

        except requests.exceptions.RequestException as e:
            logger.error(f"Task submission failed: {str(e)}")
            raise
        except KeyError as e:
            logger.error(f"Expected field not found: {str(e)}")
            raise


class Lux3D(BaseLux3DNode):
    """Lux3D image to 3D model node"""

    FUNCTION = "generate_3d_model"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"label": "Input Image"}),
                "base_api_path": ("STRING", {"default": "https://api.luxreal.ai"}),
                "lux3d_api_key": ("STRING", {
                    "label": "Invitation Code (Optional)",
                    "default": "",
                    "multiline": False,
                }),
            }
        }

    def generate_3d_model(
        self, image: Any, base_api_path: str, lux3d_api_key: str = ""
    ) -> Tuple[str]:
        """Core logic for generating 3D model from image."""
        lux3d_code = load_config(lux3d_api_key=lux3d_api_key if lux3d_api_key else None)
        
        if not lux3d_code["appuid"]:
            raise ValueError("API key cannot be empty")
        
        if image is None or image.shape[0] == 0:
            raise ValueError("Image input cannot be empty")

        try:
            base64_image = self.image_to_base64(image)
            logger.info(f"Image base64 encoded, length: {len(base64_image)}")

            payload = {
                "img": base64_image,
                "lux3dToken": lux3d_api_key,
            }

            task_id = self._submit_task(
                base_api_path, "/global/lux3d/generate/task/create",
                lux3d_api_key, lux3d_code, payload
            )
            logger.info(f"Task submitted, ID: {task_id}")

            glb_url = self.query_task_status(base_api_path, lux3d_code, task_id)
            logger.info(f"Task completed, model URL: {glb_url}")

            return (glb_url,)

        except Exception as e:
            logger.error(f"Failed to generate 3D model: {str(e)}")
            raise RuntimeError(f"Failed to generate 3D model: {str(e)}")


class Lux3DTextTo3D(BaseLux3DNode):
    """Lux3D text to 3D model node (文生3D)"""

    FUNCTION = "generate_3d_from_text"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {
                    "label": "Text Prompt",
                    "default": "",
                    "multiline": True,
                }),
                "style": (
                    ["photorealistic", "cartoon", "anime", "hand_painted", "cyberpunk", "fantasy", "glass"],
                    {"default": "photorealistic", "label": "Style"},
                ),
                "base_api_path": ("STRING", {"default": "https://api.luxreal.ai"}),
                "lux3d_api_key": ("STRING", {
                    "label": "Invitation Code (Optional)",
                    "default": "",
                    "multiline": False,
                }),
            },
            "optional": {
                "image": ("IMAGE", {"label": "Reference Image (Optional)"}),
            }
        }

    def generate_3d_from_text(
        self, prompt: str, style: str, base_api_path: str, lux3d_api_key: str = "", 
        image: Optional[Any] = None
    ) -> Tuple[str]:
        """Generate 3D model from text prompt with optional reference image."""
        lux3d_code = load_config(lux3d_api_key=lux3d_api_key if lux3d_api_key else None)
        
        if not lux3d_code["appuid"]:
            raise ValueError("API key cannot be empty")
        
        if not prompt or not prompt.strip():
            raise ValueError("Text prompt cannot be empty")

        try:
            payload = {
                "style": style,
                "prompt": prompt,
                "lux3dToken": lux3d_api_key,
            }

            if image is not None and image.shape[0] > 0:
                payload["img"] = self.image_to_base64(image)
                logger.info(f"Reference image provided, base64 length: {len(payload['img'])}")
            else:
                logger.info("No reference image provided")

            task_id = self._submit_task(
                base_api_path, "/global/lux3d/generate/text-to-3d/task/create",
                lux3d_api_key, lux3d_code, payload
            )
            logger.info(f"Text-to-3D task submitted, ID: {task_id}")

            glb_url = self.query_task_status(base_api_path, lux3d_code, task_id)
            logger.info(f"Text-to-3D task completed, model URL: {glb_url}")

            return (glb_url,)

        except Exception as e:
            logger.error(f"Failed to generate 3D model from text: {str(e)}")
            raise RuntimeError(f"Failed to generate 3D model from text: {str(e)}")


NODE_CLASS_MAPPINGS = {
    "Lux3D": Lux3D,
    "Lux3DTextTo3D": Lux3DTextTo3D
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3D": "Lux3D 1.0 (Image to 3D)",
    "Lux3DTextTo3D": "Lux3D 1.0 (Text to 3D)"
}