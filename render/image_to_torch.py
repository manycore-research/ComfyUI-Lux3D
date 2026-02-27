import argparse
import os
import OpenEXR
import Imath
import numpy as np
import torch
import requests
from io import BytesIO
from PIL import Image

def depth_exr_url_to_tensor(url: str):
    """
    Read EXR depth map from HTTP/HTTPS URL, convert to normalized RGB grayscale image,
    return torch.FloatTensor with shape [1, H, W, 3], value range [0,1].
    Farther distances appear darker, closer distances appear brighter.
    """
    if not url:
        raise ValueError("Empty URL")

    # Download EXR data
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = BytesIO(resp.content)

    # Use OpenEXR to read from memory
    # OpenEXR.InputFile can accept filename or objects supporting .read/.seek
    exr = OpenEXR.InputFile(data)

    # Read header and dimensions
    header = exr.header()
    dw = header["dataWindow"]
    w = dw.max.x - dw.min.x + 1
    h = dw.max.y - dw.min.y + 1

    # Select depth channel
    depth_channel = None
    for ch in ("Z", "R", "G", "B"):
        if ch in header["channels"]:
            depth_channel = ch
            break
    if depth_channel is None:
        raise RuntimeError("No depth-like channel (Z/R/G/B) found in EXR.")

    # Read depth data
    pt = Imath.PixelType(Imath.PixelType.FLOAT)
    raw = exr.channel(depth_channel, pt)
    depth = np.frombuffer(raw, dtype=np.float32).reshape(h, w)

    # Percentile clipping + normalization for robustness
    low = np.percentile(depth, 1)
    high = np.percentile(depth, 99)
    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        dmin = float(np.nanmin(depth))
        dmax = float(np.nanmax(depth))
        if not np.isfinite(dmin) or not np.isfinite(dmax) or dmax <= dmin:
            norm = np.zeros_like(depth, dtype=np.float32)
        else:
            norm = np.clip((depth - dmin) / (dmax - dmin + 1e-8), 0, 1).astype(np.float32)
    else:
        norm = np.clip((depth - low) / (high - low + 1e-8), 0, 1).astype(np.float32)

    inv = 1.0 - norm  # Dark for far, bright for near

    # Generate RGB grayscale and normalize to [0,1]
    gray = inv  # [H, W]
    rgb = np.stack([gray, gray, gray], axis=-1).astype(np.float32)  # [H, W, 3]

    # Convert to torch tensor with shape [1, H, W, 3]
    img_tensor = torch.from_numpy(rgb)[None, ...]  # float32, [0,1]

    return img_tensor


def image_url_to_image_tensor(url: str):
    if not url:
        return None

    resp = requests.get(url, timeout=10)
    resp.raise_for_status()

    img = Image.open(BytesIO(resp.content)).convert("RGB")
    img_np = np.array(img).astype(np.float32) / 255.0

    # ComfyUI IMAGE: [B, H, W, C]
    img_tensor = torch.from_numpy(img_np)[None, ...]

    return img_tensor
