from .lux3d_node import Lux3D, Lux3DTextTo3D
from .luxreal_engine import LuxRealEngine

NODE_CLASS_MAPPINGS = {
    "Lux3D": Lux3D,
    "Lux3DTextTo3D": Lux3DTextTo3D,
    "LuxRealEngine": LuxRealEngine
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3D": "Lux3D 1.0 (Image to 3D)",
    "Lux3DTextTo3D": "Lux3D 1.0 (Text to 3D)",
    "LuxRealEngine": "LuxReal Engine",
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

WEB_DIRECTORY = "./js"