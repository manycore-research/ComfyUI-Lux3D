from .lux3d_node import Lux3D
from .luxreal_engine import LuxRealEngine

NODE_CLASS_MAPPINGS = {
    "Lux3D": Lux3D,
    "LuxRealEngine": LuxRealEngine
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "Lux3D": "Lux3D 1.0",
    "LuxRealEngine": "LuxReal Engine",
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

WEB_DIRECTORY = "./js"