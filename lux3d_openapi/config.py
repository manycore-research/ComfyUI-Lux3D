"""Shared Lux3D endpoint and server-side credential configuration."""

from __future__ import annotations

import os
from typing import Tuple


DEFAULT_BASE_API_PATH = "https://api.aholo3d.cn"

API_CONFIG_BY_BASE_API_PATH = {
    "https://api.aholo3d.cn": ("cn", "LUX3D_API_KEY_CN"),
    "https://api.aholo3d.com": ("intl", "LUX3D_API_KEY_INTL"),
}


def api_config(base_api_path: str) -> Tuple[str, str]:
    config = (
        API_CONFIG_BY_BASE_API_PATH.get(base_api_path)
        if isinstance(base_api_path, str)
        else None
    )
    if config is None:
        supported = ", ".join(API_CONFIG_BY_BASE_API_PATH)
        raise ValueError(f"base_api_path must be one of: {supported}")
    return config


def resolve_api_key(base_api_path: str, explicit_key: str = "") -> str:
    """Resolve an optional workflow key, otherwise use the server environment."""
    _, variable_name = api_config(base_api_path)
    if isinstance(explicit_key, str) and explicit_key.strip():
        return explicit_key.strip()
    value = os.environ.get(variable_name, "")
    if not value.strip():
        raise ValueError(
            f"Lux3D API key is not configured; set {variable_name} "
            "in the ComfyUI server environment"
        )
    return value.strip()


__all__ = [
    "API_CONFIG_BY_BASE_API_PATH",
    "DEFAULT_BASE_API_PATH",
    "api_config",
    "resolve_api_key",
]
