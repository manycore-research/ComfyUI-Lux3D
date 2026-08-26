"""Single source of truth for Lux3D OpenAPI operation-to-node coverage."""

from __future__ import annotations

from .contracts import (
    DOCUMENTED_OPERATION_IDS,
    EXCLUDED_OPERATION_IDS,
    IMPLEMENTED_OPERATIONS,
)
from .nodes import (
    Lux3DOpenAPIImageTo3D,
    Lux3DOpenAPIImageToFourView,
    Lux3DOpenAPIMultiFormatExport,
    Lux3DOpenAPITextTo3D,
)


OPERATION_NODE_MAPPINGS = {
    operation.operation_id: operation.node_key
    for operation in IMPLEMENTED_OPERATIONS
}

NODE_CLASS_MAPPINGS = {
    "Lux3DOpenAPIImageTo3D": Lux3DOpenAPIImageTo3D,
    "Lux3DOpenAPITextTo3D": Lux3DOpenAPITextTo3D,
    "Lux3DOpenAPIImageToFourView": Lux3DOpenAPIImageToFourView,
    "Lux3DOpenAPIMultiFormatExport": Lux3DOpenAPIMultiFormatExport,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3DOpenAPIImageTo3D": "Lux3D Image to 3D",
    "Lux3DOpenAPITextTo3D": "Lux3D Text to 3D",
    "Lux3DOpenAPIImageToFourView": "Lux3D Multi-View Generator",
    "Lux3DOpenAPIMultiFormatExport": "Lux3D Multi-Format Export",
}


_expected_operation_ids = DOCUMENTED_OPERATION_IDS - EXCLUDED_OPERATION_IDS
if set(OPERATION_NODE_MAPPINGS) != _expected_operation_ids:
    raise RuntimeError("Lux3D OpenAPI operation coverage is incomplete")

_operation_node_keys = set(OPERATION_NODE_MAPPINGS.values())
_registered_operation_node_keys = set(NODE_CLASS_MAPPINGS)
if _operation_node_keys != _registered_operation_node_keys:
    raise RuntimeError("Lux3D OpenAPI operation/node registry is inconsistent")

for _operation_id, _node_key in OPERATION_NODE_MAPPINGS.items():
    if NODE_CLASS_MAPPINGS[_node_key].OPERATION_ID != _operation_id:
        raise RuntimeError(
            f"Lux3D node {_node_key} declares the wrong OpenAPI operation"
        )

if set(NODE_DISPLAY_NAME_MAPPINGS) != set(NODE_CLASS_MAPPINGS):
    raise RuntimeError("Lux3D OpenAPI display-name registry is inconsistent")


__all__ = [
    "DOCUMENTED_OPERATION_IDS",
    "EXCLUDED_OPERATION_IDS",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "OPERATION_NODE_MAPPINGS",
]
