import importlib.util
import inspect
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CN = "https://api.aholo3d.cn"
INTL = "https://api.aholo3d.com"
KEY = "material-test-key-never-log"
MESH = "https://assets.example/source.glb"
REFERENCE = "https://assets.example/reference.png"
RESULT = "https://assets.example/result.glb"


def load_module():
    package_name = "_lux3d_material_contract"
    package = types.ModuleType(package_name)
    package.__path__ = [str(ROOT)]
    sys.modules[package_name] = package
    spec = importlib.util.spec_from_file_location(
        f"{package_name}.lux3d_material", ROOT / "lux3d_material.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class Lux3DMaterialTransferTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_module()

    def setUp(self):
        self.node = self.module.Lux3DMaterialTransfer()
        self.image = np.full((1, 3, 4, 3), 0.5, dtype=np.float32)
        self.client = Mock()
        self.client.create_material_transfer_task.return_value = {
            "d": 1256173, "m": None, "c": None
        }
        self.client.get_task.return_value = {
            "d": {
                "taskId": 1256173,
                "status": 3,
                "outputs": [{"content": RESULT}],
            },
            "m": None,
            "c": None,
        }
        environment = self.module.resolve_api_key.__globals__["os"].environ
        self.server_environment = environment
        self.environment = patch.dict(
            environment,
            {"LUX3D_API_KEY_CN": KEY, "LUX3D_API_KEY_INTL": KEY},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        patchers = (
            patch.object(self.module, "Lux3DOpenAPIClient", return_value=self.client),
            patch.object(
                self.module,
                "resolve_api_key",
                wraps=self.module.resolve_api_key,
            ),
            patch.object(self.module, "validate_image_batch", return_value=self.image),
            patch.object(self.module, "upload_image_batch", return_value=[REFERENCE]),
            patch.object(
                self.module, "resolve_single_url_or_local_file", return_value=MESH
            ),
        )
        (
            self.client_class,
            self.resolve_key,
            self.validate_image,
            self.upload_image,
            self.resolve_mesh,
        ) = (patcher.start() for patcher in patchers)
        for patcher in patchers:
            self.addCleanup(patcher.stop)

    def test_contract_exposes_image_and_mesh_union_fields(self):
        cls = self.module.Lux3DMaterialTransfer
        inputs = cls.INPUT_TYPES()["required"]
        self.assertEqual(
            tuple(inputs),
            ("image", "mesh_url", "base_api_path"),
        )
        self.assertEqual(inputs["image"][0], "STRING,IMAGE")
        self.assertEqual(inputs["image"][1]["widgetType"], "STRING")
        self.assertEqual(inputs["image"][1]["default"], "")
        self.assertIn("STRING", inputs["mesh_url"][0].split(","))
        self.assertEqual(inputs["mesh_url"][1]["widgetType"], "STRING")
        self.assertNotIn("mesh_file", inputs)
        self.assertNotIn("mesh_file", inspect.signature(cls.redraw_material).parameters)
        self.assertNotIn("lux3d_api_key", inputs)
        self.assertNotIn(
            "lux3d_api_key", inspect.signature(cls.redraw_material).parameters
        )
        self.assertEqual(inputs["base_api_path"][1]["default"], CN)
        self.assertEqual(
            self.module.NODE_CLASS_MAPPINGS, {"Lux3DMaterialTransfer": cls}
        )

    def test_remote_reference_image_passes_through_without_upload(self):
        self.assertEqual(self.node.redraw_material(REFERENCE, MESH, CN), (RESULT,))
        self.validate_image.assert_not_called()
        self.upload_image.assert_not_called()
        self.client.create_material_transfer_task.assert_called_once_with(
            {"img": REFERENCE, "meshUrl": MESH, "version": "v3.0-standard"}
        )

    def test_invalid_or_empty_reference_url_fails_before_upload(self):
        for value in (
            "",
            "   ",
            "ftp://assets.example/reference.png",
            "lux3d/reference.png",
            r"C:\images\reference.png",
        ):
            with self.subTest(value=value), self.assertRaisesRegex(
                RuntimeError, "image"
            ):
                self.node.redraw_material(value, MESH, CN)
        self.validate_image.assert_not_called()
        self.upload_image.assert_not_called()
        self.resolve_mesh.assert_not_called()
        self.client.create_material_transfer_task.assert_not_called()

    def test_url_mesh_uses_asset_flow_and_accepts_null_success_codes(self):
        self.assertEqual(self.node.redraw_material(self.image, MESH, CN), (RESULT,))
        self.resolve_key.assert_called_once_with(CN)
        self.client_class.assert_called_once_with(KEY, region="cn", timeout=30)
        self.upload_image.assert_called_once_with(
            CN, 30, self.image, "image", min_count=1, max_count=1,
            explicit_api_key=KEY,
        )
        self.resolve_mesh.assert_called_once_with(
            CN, 30, MESH, (".glb",), field_name="mesh_url",
            explicit_api_key=KEY,
        )
        self.client.create_material_transfer_task.assert_called_once_with(
            {"img": REFERENCE, "meshUrl": MESH, "version": "v3.0-standard"}
        )
        payload = self.client.create_material_transfer_task.call_args.args[0]
        self.assertNotIn("lux3d_api_key", payload)
        self.assertNotIn("api_key", payload)
        self.client.get_task.assert_called_once_with("1256173")

    def test_local_mesh_is_uploaded_and_forwarded(self):
        uploaded = "https://assets.example/uploaded.glb"
        self.resolve_mesh.return_value = uploaded
        with patch.object(
            self.module,
            "validate_single_url_or_local_file_source",
            return_value=(None, Path("lux3d/source.glb")),
        ):
            result = self.node.redraw_material(self.image, "lux3d/source.glb", INTL)
        self.assertEqual(result, (RESULT,))
        self.resolve_key.assert_called_once_with(INTL)
        self.client_class.assert_called_once_with(KEY, region="intl", timeout=30)
        payload = self.client.create_material_transfer_task.call_args.args[0]
        self.assertEqual(payload["meshUrl"], uploaded)

    def test_empty_mesh_is_rejected_before_reference_upload(self):
        with self.assertRaisesRegex(RuntimeError, "mesh_url cannot be empty"):
            self.node.redraw_material(self.image, "", CN)
        self.upload_image.assert_not_called()
        self.client.create_material_transfer_task.assert_not_called()

    def test_missing_server_environment_key_fails_before_upload(self):
        with patch.dict(self.server_environment, {"LUX3D_API_KEY_CN": ""}):
            with self.assertRaisesRegex(
                RuntimeError,
                "set LUX3D_API_KEY_CN in the ComfyUI server environment",
            ):
                self.node.redraw_material(self.image, MESH, CN)
        self.resolve_key.assert_called_once_with(CN)
        self.upload_image.assert_not_called()
        self.resolve_mesh.assert_not_called()
        self.client_class.assert_not_called()

    def test_server_environment_key_and_terminal_status_contract(self):
        with patch.dict(
            self.server_environment,
            {"LUX3D_API_KEY_INTL": KEY}, clear=True,
        ):
            self.assertEqual(self.node.redraw_material(self.image, MESH, INTL), (RESULT,))
        self.resolve_key.assert_called_once_with(INTL)
        self.client_class.assert_called_once_with(KEY, region="intl", timeout=30)

        for data in ({"status": 4}, {"status": 6}, {"status": True}, {"status": 99}):
            with self.subTest(data=data):
                self.client.get_task.return_value = {
                    "c": None,
                    "d": {"taskId": 1, **data},
                }
                with self.assertRaises((RuntimeError, ValueError)):
                    self.node._wait_for_result(self.client, "1")

    def test_undocumented_status_two_is_rejected_immediately(self):
        self.client.get_task.return_value = {
            "c": None,
            "d": {"taskId": 1, "status": 2},
        }
        with self.assertRaises((RuntimeError, ValueError)):
            self.node._wait_for_result(self.client, "1")
        self.assertEqual(self.client.get_task.call_count, 1)

    def test_invalid_base_and_task_ids_fail_before_submission(self):
        with self.assertRaisesRegex(RuntimeError, "base_api_path"):
            self.node.redraw_material(self.image, MESH, "https://attacker.example")
        for task_id in (None, "", " ", True, {}, []):
            with self.subTest(task_id=task_id), self.assertRaises(RuntimeError):
                self.node._task_id({"c": None, "d": task_id})


if __name__ == "__main__":
    unittest.main()
