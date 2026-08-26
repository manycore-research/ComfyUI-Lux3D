import base64
import io
import logging
from pathlib import Path
from tempfile import TemporaryDirectory
from time import sleep
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlencode, urlparse

import numpy as np
import requests
from PIL import Image

from .sso.sso_token import generate_sign_by_lux3d_code, load_config
from .upload.upload import upload_file

logger = logging.getLogger("Lux3D")


class BaseLux3DNode:
    """Base class for Lux3D nodes with common functionality"""

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("glb_model_url",)
    CATEGORY = "Lux3D/Legacy"
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
            save_format = "png"
            if pil_image.mode != "RGBA":
                pil_image = pil_image.convert("RGBA")
        elif channels == 3:
            save_format = "jpeg"
            if pil_image.mode != "RGB":
                pil_image = pil_image.convert("RGB")
        elif channels == 1:
            save_format = "jpeg"
            if pil_image.mode != "L":
                pil_image = pil_image.convert("L")
        else:
            save_format = "jpeg"
            pil_image = pil_image.convert("RGB")

        buffer = io.BytesIO()
        pil_image.save(buffer, format=save_format, optimize=True)
        buffer.seek(0)

        img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/{save_format.lower()};base64,{img_str}"

    def query_task_status(
        self,
        base_url: str,
        lux3d_code: Dict[str, str],
        task_id: str,
        max_attempts: int = 60,
        interval: int = 15,
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

                response = requests.get(
                    url,
                    headers={"Content-Type": "application/json"},
                    timeout=30,
                )
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
                        raise ValueError(
                            "content field not found in API response outputs"
                        )
                    raise ValueError("outputs is empty in API response")
                elif status == 4:
                    raise ValueError(f"Task execution failed, status code: {status}")
                elif attempt < max_attempts - 1:
                    logger.info(
                        f"Task status: {status}, waiting {interval}s before polling..."
                    )
                    sleep(interval)

            except requests.exceptions.RequestException as e:
                logger.error(f"Task status query failed: {str(e)}")
                raise RuntimeError(f"Task status query failed: {str(e)}")

        raise TimeoutError("Task timeout, could not complete within specified time")

    def _submit_task(
        self,
        base_url: str,
        api_path: str,
        lux3d_api_key: str,
        lux3d_code: Dict[str, str],
        payload: Dict[str, Any],
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
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30,
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
                "base_api_path": (
                    "STRING",
                    {"default": "https://api.luxreal.ai"},
                ),
                "lux3d_api_key": (
                    "STRING",
                    {
                        "label": "Invitation Code (Optional)",
                        "default": "",
                        "multiline": False,
                    },
                ),
            }
        }

    def generate_3d_model(
        self, image: Any, base_api_path: str, lux3d_api_key: str = ""
    ) -> Tuple[str]:
        """Core logic for generating 3D model from image."""
        lux3d_code = load_config(
            lux3d_api_key=lux3d_api_key if lux3d_api_key else None
        )

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
                base_api_path,
                "/global/lux3d/generate/task/create",
                lux3d_api_key,
                lux3d_code,
                payload,
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
                "prompt": (
                    "STRING",
                    {
                        "label": "Text Prompt",
                        "default": "",
                        "multiline": True,
                    },
                ),
                "style": (
                    [
                        "photorealistic",
                        "cartoon",
                        "anime",
                        "hand_painted",
                        "cyberpunk",
                        "fantasy",
                        "glass",
                    ],
                    {"default": "photorealistic", "label": "Style"},
                ),
                "base_api_path": (
                    "STRING",
                    {"default": "https://api.luxreal.ai"},
                ),
                "lux3d_api_key": (
                    "STRING",
                    {
                        "label": "Invitation Code (Optional)",
                        "default": "",
                        "multiline": False,
                    },
                ),
            },
            "optional": {
                "image": ("IMAGE", {"label": "Reference Image (Optional)"}),
            },
        }

    def generate_3d_from_text(
        self,
        prompt: str,
        style: str,
        base_api_path: str,
        lux3d_api_key: str = "",
        image: Optional[Any] = None,
    ) -> Tuple[str]:
        """Generate 3D model from text prompt with optional reference image."""
        lux3d_code = load_config(
            lux3d_api_key=lux3d_api_key if lux3d_api_key else None
        )

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
                logger.info(
                    f"Reference image provided, base64 length: {len(payload['img'])}"
                )
            else:
                logger.info("No reference image provided")

            task_id = self._submit_task(
                base_api_path,
                "/global/lux3d/generate/text-to-3d/task/create",
                lux3d_api_key,
                lux3d_code,
                payload,
            )
            logger.info(f"Text-to-3D task submitted, ID: {task_id}")

            glb_url = self.query_task_status(base_api_path, lux3d_code, task_id)
            logger.info(f"Text-to-3D task completed, model URL: {glb_url}")

            return (glb_url,)

        except Exception as e:
            logger.error(f"Failed to generate 3D model from text: {str(e)}")
            raise RuntimeError(f"Failed to generate 3D model from text: {str(e)}")


class Lux3DMaterialTransfer(BaseLux3DNode):
    """Redraw a GLB material from a single reference image."""

    FUNCTION = "redraw_material"
    CATEGORY = "Lux3D"

    _IMAGE_UPLOAD_GUID = "holo-web-image-upload"
    _VERSION = "v3.0-standard"
    _ROUTES = {
        "https://api.aholo3d.cn": (
            "/lux3d/v1/generate/material-transfer/task/create",
            "/lux3d/v1/generate/task/get",
        ),
        "https://api.aholo3d.com": (
            "/global/lux3d/v1/generate/material-transfer/task/create",
            "/global/lux3d/v1/generate/task/get",
        ),
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"label": "Material Reference Image"}),
                "mesh_url": (
                    "STRING",
                    {"label": "GLB Model URL", "default": "", "multiline": False},
                ),
                "base_api_path": (
                    "STRING",
                    {"default": "https://api.aholo3d.cn"},
                ),
                "lux3d_api_key": (
                    "STRING",
                    {
                        "label": "Invitation Code",
                        "default": "",
                        "multiline": False,
                    },
                ),
            }
        }

    @staticmethod
    def _validate_http_url(value: Any, field_name: str) -> str:
        if not isinstance(value, str) or not value or value != value.strip():
            raise RuntimeError(f"{field_name} must be a non-empty HTTP(S) URL")

        parsed = urlparse(value)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.netloc
            or parsed.hostname is None
        ):
            raise RuntimeError(f"{field_name} must be a non-empty HTTP(S) URL")
        return value

    @classmethod
    def _validate_image(cls, image: Any) -> None:
        shape = getattr(image, "shape", None)
        if shape is None or len(shape) != 4:
            raise RuntimeError("image must be a ComfyUI IMAGE tensor in BHWC format")

        batch, height, width, channels = (int(value) for value in shape)
        if batch != 1:
            raise RuntimeError("image must contain exactly one reference image")
        if height <= 0 or width <= 0 or channels not in (1, 3, 4):
            raise RuntimeError("image must have positive dimensions and 1, 3, or 4 channels")

    @classmethod
    def _write_reference_png(cls, image: Any, output_path: Path) -> None:
        cls._validate_image(image)
        image_data = image[0]
        if hasattr(image_data, "detach"):
            image_data = image_data.detach()
        if hasattr(image_data, "cpu"):
            image_data = image_data.cpu()
        if hasattr(image_data, "numpy"):
            image_data = image_data.numpy()

        image_array = np.asarray(image_data)
        if not np.issubdtype(image_array.dtype, np.floating):
            raise RuntimeError("image tensor must contain floating-point values")
        if not np.all(np.isfinite(image_array)):
            raise RuntimeError("image tensor contains non-finite values")
        if np.any(image_array < 0.0) or np.any(image_array > 1.0):
            raise RuntimeError("image tensor values must be in the [0, 1] range")

        pixels = (image_array * 255.0).astype(np.uint8)
        channels = pixels.shape[-1]
        if channels == 1:
            pixels = pixels[:, :, 0]
            mode = "L"
        elif channels == 3:
            mode = "RGB"
        else:
            mode = "RGBA"
        Image.fromarray(pixels, mode=mode).save(output_path, format="PNG")

    @classmethod
    def _route_for(cls, base_api_path: Any) -> Tuple[str, str]:
        if not isinstance(base_api_path, str) or base_api_path not in cls._ROUTES:
            supported = ", ".join(cls._ROUTES)
            raise RuntimeError(
                f"Unsupported base_api_path: {base_api_path!r}; expected one of: {supported}"
            )
        return cls._ROUTES[base_api_path]

    @staticmethod
    def _request_url(
        base_api_path: str,
        api_path: str,
        task_id: Optional[str] = None,
    ) -> str:
        url = f"{base_api_path}{api_path}"
        if task_id is not None:
            url = f"{url}?{urlencode((('taskid', task_id),))}"
        return url

    def _upload_reference_image(
        self,
        image: Any,
        base_api_path: str,
        lux3d_api_key: str,
    ) -> str:
        with TemporaryDirectory(prefix="comfyui-lux3d-material-") as temp_dir:
            image_path = Path(temp_dir) / "material-reference.png"
            self._write_reference_png(image, image_path)
            upload_result = upload_file(
                guid=self._IMAGE_UPLOAD_GUID,
                file_path=image_path,
                base_api_path=base_api_path,
                authorization_api_key=lux3d_api_key,
            )
            if not isinstance(upload_result, dict):
                raise RuntimeError("Reference image upload returned an invalid response")
            data = upload_result.get("d")
            if upload_result.get("c") != "0" or not isinstance(data, dict):
                raise RuntimeError("Reference image upload failed")
            if data.get("status") != 5:
                raise RuntimeError(
                    f"Reference image upload failed: status={data.get('status')!r}"
                )
            return self._validate_http_url(
                data.get("url"),
                "Uploaded reference image URL",
            )

    @classmethod
    def _select_glb_output(cls, outputs: Any) -> str:
        if not isinstance(outputs, list) or not outputs:
            raise RuntimeError("Material task succeeded without outputs")

        glb_urls = []
        for output in outputs:
            content = output.get("content") if isinstance(output, dict) else None
            if not isinstance(content, str):
                continue
            parsed = urlparse(content)
            if parsed.path.lower().endswith(".glb"):
                glb_urls.append(cls._validate_http_url(content, "Material GLB output URL"))

        if len(glb_urls) != 1:
            raise RuntimeError(
                "Material task must return exactly one GLB output; "
                f"found {len(glb_urls)}"
            )
        return glb_urls[0]

    def _submit_material_task(
        self,
        base_api_path: str,
        create_path: str,
        lux3d_api_key: str,
        payload: Dict[str, Any],
    ) -> str:
        url = self._request_url(base_api_path, create_path)
        try:
            response = requests.post(
                url,
                json=payload,
                headers={
                    "Authorization": lux3d_api_key,
                    "Content-Type": "application/json",
                },
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()
        except requests.exceptions.RequestException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            detail = f" (HTTP {status})" if status is not None else ""
            raise RuntimeError(f"Material task submission request failed{detail}") from None

        if not isinstance(result, dict):
            raise RuntimeError("Material task submission returned an invalid response")
        if result.get("c") != "0":
            raise RuntimeError(
                f"Material task submission failed: c={result.get('c')}, m={result.get('m')}"
            )

        task_id = result.get("d")
        if (
            isinstance(task_id, bool)
            or not isinstance(task_id, (str, int))
            or not str(task_id).strip()
        ):
            raise RuntimeError("Material task submission response has an invalid task ID")
        return str(task_id)

    def _query_material_task(
        self,
        base_api_path: str,
        query_path: str,
        lux3d_api_key: str,
        task_id: str,
        max_attempts: int = 60,
        interval: int = 15,
    ) -> str:
        for attempt in range(max_attempts):
            url = self._request_url(
                base_api_path,
                query_path,
                task_id=task_id,
            )
            try:
                response = requests.get(
                    url,
                    headers={
                        "Authorization": lux3d_api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=30,
                )
                response.raise_for_status()
                result = response.json()
            except requests.exceptions.RequestException as exc:
                status = getattr(getattr(exc, "response", None), "status_code", None)
                detail = f" (HTTP {status})" if status is not None else ""
                raise RuntimeError(
                    f"Material task status request failed{detail}"
                ) from None

            if not isinstance(result, dict):
                raise RuntimeError("Material task status returned an invalid response")
            if result.get("c") != "0":
                raise RuntimeError(
                    f"Material task status failed: c={result.get('c')}, m={result.get('m')}"
                )

            data = result.get("d")
            if not isinstance(data, dict):
                raise RuntimeError("Material task status response is missing d")
            status = data.get("status")
            if isinstance(status, bool):
                raise RuntimeError("Material task status must be an integer code")

            if status == 3:
                return self._select_glb_output(data.get("outputs"))
            if status in (4, 6):
                state = "failed" if status == 4 else "cancelled"
                raise RuntimeError(f"Material task {state}: status={status}")
            if status not in (0, 1, 2):
                raise RuntimeError(f"Material task returned unknown status: {status!r}")
            if attempt < max_attempts - 1:
                sleep(interval)

        raise TimeoutError("Material task timed out before completion")

    def redraw_material(
        self,
        image: Any,
        mesh_url: str,
        base_api_path: str,
        lux3d_api_key: str = "",
    ) -> Tuple[str]:
        """Upload a reference image and redraw only the source GLB material."""
        try:
            self._validate_image(image)
            validated_mesh_url = self._validate_http_url(mesh_url, "mesh_url")
            create_path, query_path = self._route_for(base_api_path)
            if not isinstance(lux3d_api_key, str) or not lux3d_api_key.strip():
                raise RuntimeError("lux3d_api_key must not be empty")
            api_key = lux3d_api_key.strip()

            image_url = self._upload_reference_image(
                image,
                base_api_path,
                api_key,
            )
            payload = {
                "img": image_url,
                "meshUrl": validated_mesh_url,
                "version": self._VERSION,
            }
            task_id = self._submit_material_task(
                base_api_path,
                create_path,
                api_key,
                payload,
            )
            glb_url = self._query_material_task(
                base_api_path,
                query_path,
                api_key,
                task_id,
            )
            return (glb_url,)
        except Exception as exc:
            if isinstance(exc, RuntimeError) and str(exc).startswith(
                "Material redraw failed:"
            ):
                raise
            raise RuntimeError(f"Material redraw failed: {exc}") from exc


NODE_CLASS_MAPPINGS = {
    "Lux3DMaterialTransfer": Lux3DMaterialTransfer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3DMaterialTransfer": "Lux3D Material Redraw",
}
