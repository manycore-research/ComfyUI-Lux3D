import importlib.util
import inspect
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
CN = "https://api.aholo3d.cn"


def load_viewer_module():
    package_name = "_lux3d_viewer_contract"
    package = types.ModuleType(package_name)
    package.__path__ = [str(ROOT)]
    sys.modules[package_name] = package
    spec = importlib.util.spec_from_file_location(
        f"{package_name}.lux3d_viewer", ROOT / "lux3d_viewer.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class Lux3DViewerContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_viewer_module()

    def test_node_contract_exposes_one_model_string_field(self):
        viewer = self.module.Lux3DViewer
        input_types = viewer.INPUT_TYPES()
        inputs = input_types["required"]
        self.assertEqual(tuple(inputs), ("model_url", "base_api_path"))
        self.assertNotIn("timeout", inputs)
        self.assertNotIn("timeout", input_types.get("optional", {}))
        self.assertIn("STRING", inputs["model_url"][0].split(","))
        self.assertEqual(inputs["model_url"][1]["widgetType"], "STRING")
        self.assertEqual(inputs["base_api_path"][1]["default"], CN)
        self.assertNotIn("model_file", inputs)
        self.assertNotIn("model_url_input", input_types.get("optional", {}))
        parameters = inspect.signature(viewer.execute).parameters
        self.assertNotIn("model_file", parameters)
        self.assertNotIn("model_url_input", parameters)
        self.assertNotIn("resolve_url_or_local_file", self.module.__dict__)
        self.assertEqual(viewer.RETURN_NAMES, ("model_url",))
        self.assertEqual(viewer.FUNCTION, "execute")
        self.assertTrue(viewer.OUTPUT_NODE)

    def test_remote_url_passes_through_without_asset_credentials(self):
        model_url = "https://assets.example/model.glb?signature=a%2Bb"
        with patch.object(
            self.module,
            "validate_single_url_or_local_file_source",
            return_value=(model_url, None),
        ) as validator:
            result = self.module.Lux3DViewer().execute(model_url)
        validator.assert_called_once_with(
            model_url,
            (".glb", ".ply"),
            field_name="model_url",
        )
        self.assertEqual(
            result,
            {"ui": {"model_url": [model_url]}, "result": (model_url,)},
        )

    def test_connected_glb_url_uses_the_same_model_url_argument(self):
        model_url = "https://assets.example/from-upstream.glb?signature=a%2Bb"
        with patch.object(
            self.module,
            "validate_single_url_or_local_file_source",
            return_value=(model_url, None),
        ) as validator:
            result = self.module.Lux3DViewer().execute(model_url, CN)
        validator.assert_called_once_with(
            model_url,
            (".glb", ".ply"),
            field_name="model_url",
        )
        self.assertEqual(result["result"], (model_url,))

    def test_connected_ply_url_passes_through(self):
        model_url = "https://assets.example/from-upstream.ply?token=secret"
        result = self.module.Lux3DViewer().execute(model_url, CN)
        self.assertEqual(result["result"], (model_url,))

    def test_local_model_returns_encoded_comfy_view_url_without_upload(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            input_root = Path(directory) / "input"
            model = input_root / "nested dir" / "模型 #1.ply"
            model.parent.mkdir(parents=True)
            model.write_bytes(b"ply\n")
            fake_folder_paths = types.SimpleNamespace(
                get_input_directory=lambda: str(input_root),
                get_output_directory=lambda: str(Path(directory) / "output"),
                get_temp_directory=lambda: str(Path(directory) / "temp"),
            )
            local_assets = sys.modules[
                f"{self.module.__package__}.lux3d_openapi.local_assets"
            ]
            with patch.object(local_assets, "_asset_uploader") as uploader, patch.dict(
                sys.modules, {"folder_paths": fake_folder_paths}
            ):
                result = self.module.Lux3DViewer().execute(
                    "nested dir/模型 #1.ply", CN
                )
            uploader.assert_not_called()

        expected = (
            "/view?filename=%E6%A8%A1%E5%9E%8B%20%231.ply"
            "&type=input&subfolder=nested%20dir"
        )
        self.assertEqual(result["result"], (expected,))
        self.assertEqual(result["ui"]["model_url"], [expected])

    def test_local_model_rejects_directory_traversal(self):
        with self.assertRaisesRegex(ValueError, "must stay inside"):
            self.module.Lux3DViewer().execute("../secret.glb", CN)

    def test_rejects_non_viewer_remote_format_ignoring_query(self):
        with self.assertRaisesRegex(ValueError, "model_url must use one of"):
            self.module.Lux3DViewer().execute(
                "https://assets.example/model.obj?filename=model.glb"
            )

    def test_empty_source_is_rejected(self):
        viewer = self.module.Lux3DViewer()
        with self.assertRaisesRegex(ValueError, "model_url cannot be empty"):
            viewer.execute("")

    def test_invalid_url_scheme_is_rejected_explicitly(self):
        with self.assertRaisesRegex(ValueError, r"HTTP\(S\)"):
            self.module.Lux3DViewer().execute("ftp://assets.example/model.glb")

    def test_invalid_base_path_is_rejected_before_resolution(self):
        with patch.object(
            self.module, "validate_single_url_or_local_file_source"
        ) as validator:
            with self.assertRaises(ValueError):
                self.module.Lux3DViewer().execute(
                    "https://assets.example/model.glb",
                    "https://attacker.example",
                )
        validator.assert_not_called()


if __name__ == "__main__":
    unittest.main()
