import base64
import io
from time import sleep
from typing import Any, Dict, Tuple

import numpy as np
import requests
from PIL import Image

from .sso.sso_token import generate_sign_by_lux3d_code, load_config


# ComfyUI node class definition
class Lux3D:
    """Lux3D image to 3D model node"""

    # Output type: generated glb model URL
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("glb_model_url",)

    # Execution method name
    FUNCTION = "generate_3d_model"

    # Node category
    CATEGORY = "Lux3D"
    OUTPUT_NODE = True

    # Node input configuration
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Image input, supports receiving IMAGE type through connections
                "image": ("IMAGE", {
                    "label": "Input Image",
                }),
                "base_api_path": ("STRING",
                                  {"default": "https://api.luxreal.ai"}),
                # Invitation code input (optional), used to parse ak/sk/appuid
                "lux3d_api_key": ("STRING", {
                    "label": "Invitation Code (Optional)",
                    "default": "",
                    "multiline": False,
                }),
            }
        }

    @staticmethod
    def tensor2pil(image: Any) -> Image.Image:
        """Convert tensor to PIL Image."""
        return Image.fromarray(
            np.clip(255.0 * image.cpu().numpy().squeeze(), 0, 255).astype(np.uint8)
        )

    def image_to_base64(self, image: Any) -> Tuple[str, tuple, tuple]:
        """Convert image tensor to base64 format.
            
        Args:
            image: Image tensor with shape [B, C, H, W]
                
        Returns:
            Tuple containing base64 image string, original shape, and permuted shape.
        """
        # Get original shape of input image
        original_shape = image.shape  # [B, C, H, W]
        print(f"Original input image shape: {original_shape}")
                
        # Get image channel count
        channels = original_shape[1]
        print(f"Image channels: {channels}")

        # Convert first batch image using tensor2pil function
        pil_image = self.tensor2pil(image[0])
                
        # Output processed image information
        print(f"Processed image size: {pil_image.size}, mode: {pil_image.mode}")

        # Choose save format based on channel count
        if channels == 4:
            # 4-channel image, use PNG format to preserve transparency channel
            save_format = 'png'
            # Ensure image mode is RGBA
            if pil_image.mode != 'RGBA':
                pil_image = pil_image.convert('RGBA')
            save_mode = 'RGBA'
        elif channels == 3:
            # 3-channel image, use JPEG format
            save_format = 'jpeg'
            # Ensure image mode is RGB
            if pil_image.mode != 'RGB':
                pil_image = pil_image.convert('RGB')
            save_mode = 'RGB'
        elif channels == 1:
            # 1-channel grayscale image, use JPEG format as grayscale
            save_format = 'jpeg'
            # Ensure image mode is L (grayscale)
            if pil_image.mode != 'L':
                pil_image = pil_image.convert('L')
            save_mode = 'L'
        else:
            # Other channel counts, convert to RGB and use JPEG format
            save_format = 'jpeg'
            pil_image = pil_image.convert('RGB')
            save_mode = 'RGB'

        # Add debug information
        print(
            f"Preparing to save image, mode: {save_mode}, "
            f"format: {save_format}, size: {pil_image.size}"
        )

        # Save image to buffer
        buffer = io.BytesIO()

        # Set different save parameters based on save format
        if save_format == 'jpeg':
            # Use JPEG format, set appropriate quality parameters
            pil_image.save(buffer, format=save_format)
            #   quality=85,  # Moderate quality, balance file size and image quality
            #   optimize=True,  # Enable optimization
            #   subsampling=2,  # Use 4:2:0 subsampling, reduce file size
            #   dpi=(72, 72))  # Set standard DPI
        else:
            # Use PNG format
            pil_image.save(buffer, format=save_format,
                           optimize=True,  # Enable optimization
                           dpi=(72, 72))  # Set standard DPI

        # Ensure buffer pointer is at the beginning
        buffer.seek(0)
                
        # Encode to base64
        img_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        base64_image = f"data:image/{save_format.lower()};base64,{img_str}"

        # Output debug information
        print(f"Save successful, base64 length: {len(img_str)} characters")

        # Record permuted shape information (for output)
        permuted_shape = (
            pil_image.size[1],
            pil_image.size[0],
            len(pil_image.mode) if pil_image.mode in ["RGB", "RGBA"] else 1,
        )

        return base64_image, original_shape, permuted_shape

    def generate_3d_model(
        self, image: Any, base_api_path: str, lux3d_api_key: str = ""
    ) -> Tuple[str]:
        """Core logic for generating 3D model."""

        lux3d_code = load_config(lux3d_api_key=lux3d_api_key if lux3d_api_key else None)
        appuid = lux3d_code["appuid"]
        # Validate API key
        if not appuid:
            raise ValueError(
                "API key cannot be empty, please provide invitation code "
                "or configure config.txt file"
            )

        # Validate image input
        if image is None or image.shape[0] == 0:
            raise ValueError("Image input cannot be empty")

        try:
            # Convert image to base64 format
            base64_image, _, _ = self.image_to_base64(image)
        
            # Submit task to API
            task_id = self.submit_task(
                base_api_path, lux3d_api_key, lux3d_code, base64_image
            )
            print(f"Task submitted successfully, Task ID: {task_id}")
        
            # Query task status
            glb_url = self.query_task_status(base_api_path, lux3d_code, task_id)
        
            # Simulate task processing delay
            sleep(1)
            print(f"Task completed, generated 3D model URL: {glb_url}")
                    
            return (glb_url,)
                    
        except Exception as e:
            print(f"Failed to generate 3D model: {str(e)}")
            raise RuntimeError(f"Failed to generate 3D model: {str(e)}")

    def submit_task(
        self, base_url: str, lux3d_api_key: str, lux3d_code: Dict[str, str], base64_image: str
    ) -> str:
        """Submit task to API."""
        code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
        appuid = code_with_sign["appuid"]
        appkey = code_with_sign["appkey"]
        sign = code_with_sign["sign"]
        timestamp = code_with_sign["timestamp"]
        url = (
            f"{base_url}/global/lux3d/generate/task/create?"
            f"appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"
        )

        headers = {
            "Content-Type": "application/json"
        }

        payload = {
            "img": base64_image,
            "lux3dToken": lux3d_api_key,
        }

        try:
            response = requests.post(url, json=payload, headers=headers)
            response.raise_for_status()

            result = response.json()
            bus_id = result.get("d")

            if bus_id is None:
                raise KeyError("Task ID not found in API response")
            
            return str(bus_id)

        except requests.exceptions.RequestException as e:
            print(f"Task submission request failed: {str(e)}")
            raise
        except KeyError as e:
            print(f"Expected task_id field not found in API response: {str(e)}")
            raise

    def query_task_status(
        self, base_url: str, lux3d_code: Dict[str, str], task_id: str
    ) -> str:
        """Query task status and get results."""
        code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
        appuid = code_with_sign["appuid"]
        appkey = code_with_sign["appkey"]
        sign = code_with_sign["sign"]
        timestamp = code_with_sign["timestamp"]
        url = (
            f"{base_url}/global/lux3d/generate/task/get?"
            f"busid={task_id}&appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"
        )

        headers = {
            "Content-Type": "application/json"
        }

        max_attempts = 60
        interval = 15

        for attempt in range(max_attempts):
            try:
                response = requests.get(url, headers=headers)
                response.raise_for_status()  # Check HTTP errors

                result = response.json()
                print(f"API Response Result: {result}")
                c_code = result.get("c")
                d_data = result.get("d")

                if not d_data:
                    raise Exception("Missing d field in API response")

                status = d_data.get("status")

                if c_code == "0" and status == 3:
                    outputs = d_data.get("outputs", [])
                    if outputs and len(outputs) > 0:
                        lux3d_url = outputs[0].get("content")
                        if lux3d_url:
                            return lux3d_url
                        raise Exception("content field not found in API response outputs")
                    raise Exception("outputs is empty in API response")
                elif status == 1:
                    print(
                        f"Task status: Running, waiting {interval} seconds "
                        f"before continuing polling..."
                    )
                    sleep(interval)
                elif status == 4:
                    raise Exception(f"Task execution failed, status code: {status}")
                else:
                    print(
                        f"Task status: {status}, waiting {interval} seconds "
                        f"before continuing polling..."
                    )
                    sleep(interval)

            except requests.exceptions.RequestException as e:
                print(f"Task status query request failed: {str(e)}")
                raise RuntimeError(f"Task status query request failed: {str(e)}")
            except KeyError as e:
                print(f"Expected fields not found in API response: {str(e)}")
                raise RuntimeError(f"Expected fields not found in API response: {str(e)}")
        # If maximum attempts reached without completion
        raise Exception("Task timeout, could not complete within specified time")


# Register node
NODE_CLASS_MAPPINGS = {
    "Lux3D": Lux3D
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3D": "Lux3D 1.0"
}
