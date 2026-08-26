import importlib.util
import sys
import types
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROUTE_PATH = "/comfyui-lux3d/viewer-assets/v1/{manifest_digest}/{asset:.+}"
EXPECTED_NODE_KEYS = {
    "Lux3DMaterialTransfer",
    "Lux3DViewer",
    "Lux3DOpenAPIImageTo3D",
    "Lux3DOpenAPITextTo3D",
    "Lux3DOpenAPIImageToFourView",
    "Lux3DOpenAPIMultiFormatExport",
}
EXPECTED_DISPLAY_NAMES = {
    "Lux3DMaterialTransfer": "Lux3D Material Redraw",
    "Lux3DViewer": "Lux3D Viewer",
    "Lux3DOpenAPIImageTo3D": "Lux3D Image to 3D",
    "Lux3DOpenAPITextTo3D": "Lux3D Text to 3D",
    "Lux3DOpenAPIImageToFourView": "Lux3D Multi-View Generator",
    "Lux3DOpenAPIMultiFormatExport": "Lux3D Multi-Format Export",
}


class FakeResponse:
    def __init__(self, *, status=200, body=None, headers=None):
        self.status = status
        self.body = body
        self.headers = dict(headers or {})


class FakeRoute:
    def __init__(self, method, path, handler):
        self.method = method
        self.path = path
        self.handler = handler


class FakeRoutes(list):
    def get(self, path):
        def decorator(handler):
            self.append(FakeRoute("GET", path, handler))
            return handler

        return decorator


class PackageImportSmokeTest(unittest.TestCase):
    def test_root_package_registers_all_nodes_and_viewer_route_once(self):
        routes = FakeRoutes()
        fake_modules = make_fake_host_modules(routes)
        package_names = (
            "_comfyui_lux3d_package_smoke_first",
            "_comfyui_lux3d_package_smoke_second",
        )
        previous_modules = {
            name: sys.modules.get(name)
            for name in fake_modules
        }

        try:
            sys.modules.update(fake_modules)
            first = load_root_package(package_names[0])

            self.assertEqual(set(first.NODE_CLASS_MAPPINGS), EXPECTED_NODE_KEYS)
            self.assertEqual(
                first.NODE_DISPLAY_NAME_MAPPINGS,
                EXPECTED_DISPLAY_NAMES,
            )
            for node_key in EXPECTED_NODE_KEYS:
                self.assertTrue(callable(first.NODE_CLASS_MAPPINGS[node_key]))
                self.assertIsInstance(
                    first.NODE_DISPLAY_NAME_MAPPINGS[node_key],
                    str,
                )
                self.assertTrue(first.NODE_DISPLAY_NAME_MAPPINGS[node_key])

            self.assertNotIn(
                f"{package_names[0]}.lux3d_node",
                sys.modules,
            )
            self.assertFalse(
                any(
                    name.startswith(f"{package_names[0]}.sso")
                    or name.startswith(f"{package_names[0]}.upload")
                    for name in sys.modules
                )
            )

            self.assertEqual(len(routes), 1)
            self.assertEqual(routes[0].method, "GET")
            self.assertEqual(routes[0].path, ROUTE_PATH)
            self.assertTrue(callable(routes[0].handler))

            second = load_root_package(package_names[1])
            self.assertEqual(set(second.NODE_CLASS_MAPPINGS), EXPECTED_NODE_KEYS)
            self.assertEqual(len(routes), 1)
        finally:
            for package_name in package_names:
                remove_package_modules(package_name)
            for name, previous in previous_modules.items():
                if previous is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = previous


def make_fake_host_modules(routes):
    fake_aiohttp = types.ModuleType("aiohttp")
    fake_aiohttp.web = types.SimpleNamespace(Response=FakeResponse)

    fake_server = types.ModuleType("server")
    fake_server.PromptServer = types.SimpleNamespace(
        instance=types.SimpleNamespace(routes=routes)
    )

    return {
        "aiohttp": fake_aiohttp,
        "server": fake_server,
    }


def load_root_package(package_name):
    spec = importlib.util.spec_from_file_location(
        package_name,
        REPOSITORY_ROOT / "__init__.py",
        submodule_search_locations=[str(REPOSITORY_ROOT)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not create the Lux3D package import spec")
    module = importlib.util.module_from_spec(spec)
    sys.modules[package_name] = module
    spec.loader.exec_module(module)
    return module


def remove_package_modules(package_name):
    for name in tuple(sys.modules):
        if name == package_name or name.startswith(f"{package_name}."):
            sys.modules.pop(name, None)


if __name__ == "__main__":
    unittest.main()
