from .lux3d_material import Lux3DMaterialTransfer
from .lux3d_viewer import Lux3DViewer
from .lux3d_openapi.registry import (
    NODE_CLASS_MAPPINGS as OPENAPI_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as OPENAPI_NODE_DISPLAY_NAME_MAPPINGS,
)
from . import viewer_asset_routes as _viewer_asset_routes


_EXISTING_NODE_CLASS_MAPPINGS = {
    "Lux3DMaterialTransfer": Lux3DMaterialTransfer,
    "Lux3DViewer": Lux3DViewer,
}
_EXISTING_NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3DMaterialTransfer": "Lux3D Material Redraw",
    "Lux3DViewer": "Lux3D Viewer",
}

_duplicate_keys = set(_EXISTING_NODE_CLASS_MAPPINGS) & set(
    OPENAPI_NODE_CLASS_MAPPINGS
)
if _duplicate_keys:
    raise RuntimeError(
        f"Duplicate Lux3D node keys: {', '.join(sorted(_duplicate_keys))}"
    )

NODE_CLASS_MAPPINGS = {
    **_EXISTING_NODE_CLASS_MAPPINGS,
    **OPENAPI_NODE_CLASS_MAPPINGS,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    **_EXISTING_NODE_DISPLAY_NAME_MAPPINGS,
    **OPENAPI_NODE_DISPLAY_NAME_MAPPINGS,
}

WEB_DIRECTORY = "./js"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
