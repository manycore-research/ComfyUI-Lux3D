import hashlib
import inspect
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, call, patch
from urllib.parse import parse_qs, urlparse

import requests
import numpy as np

from lux3d_openapi import contracts
from lux3d_openapi.asset_upload import Lux3DAssetUploader
from lux3d_openapi.client import Lux3DAPIError, Lux3DOpenAPIClient
from lux3d_openapi import local_assets, nodes, registry, task_polling


API_KEY = "lux3d-test-api-key-never-log"
OUS_TOKEN = "ous-test-token-never-log"
IMAGE_URL = "https://assets.example/input.png"
REFERENCE_URL = "https://assets.example/reference.jpg"
MODEL_GLB_URL = "https://assets.example/model.glb?signature=a%2Bb"
MODEL_ZIP_URL = "https://assets.example/results.zip?signature=a%2Bb"


def json_response(payload, status_code=200):
    response = Mock()
    response.status_code = status_code
    response.json.return_value = payload
    response.text = json.dumps(payload, ensure_ascii=False)
    return response


class RecordingSession:
    """A requests.Session double which snapshots multipart bodies before close."""

    def __init__(self, *results):
        self.results = list(results)
        self.calls = []
        self.request = Mock(side_effect=self._request)

    @staticmethod
    def _snapshot_files(files):
        if files is None:
            return None
        snapshot = {}
        for field_name, item in files.items():
            if not isinstance(item, tuple) or len(item) < 2:
                snapshot[field_name] = item
                continue
            filename, file_obj, *rest = item
            position = file_obj.tell()
            content = file_obj.read()
            file_obj.seek(position)
            snapshot[field_name] = (filename, content, *rest)
        return snapshot

    def _request(self, method, url, **kwargs):
        recorded = dict(kwargs)
        recorded["method"] = str(method).upper()
        recorded["url"] = url
        recorded["files"] = self._snapshot_files(kwargs.get("files"))
        self.calls.append(recorded)
        if not self.results:
            raise AssertionError(f"Unexpected HTTP request: {method} {url}")
        result = self.results.pop(0)
        if isinstance(result, BaseException):
            raise result
        return result


def query_params(call):
    params = call.get("params")
    if params is not None:
        return {str(key): str(value) for key, value in params.items()}
    parsed = parse_qs(urlparse(call["url"]).query)
    return {key: values[-1] for key, values in parsed.items()}


class Lux3DTransportContractTest(unittest.TestCase):
    def test_all_client_methods_use_the_documented_http_method_and_path(self):
        create_response = {"d": 1256173, "m": None, "c": None}
        task_response = {
            "d": {"taskId": 1256173, "status": 1, "outputs": []},
            "m": None,
            "c": None,
        }
        list_response = {
            "d": {"items": [], "total": 0, "page": 1, "pageSize": 20},
            "m": "",
            "c": "0",
        }
        session = RecordingSession(
            json_response(create_response),
            json_response(create_response),
            json_response(create_response),
            json_response(create_response),
            json_response(create_response),
            json_response(task_response),
            json_response(list_response),
        )
        client = Lux3DOpenAPIClient(API_KEY, session=session)

        self.assertEqual(
            client.create_img_to_3d_task({"img": IMAGE_URL, "version": "G1"}),
            create_response,
        )
        self.assertEqual(
            client.create_text_to_3d_task(
                {"prompt": "a chair", "version": "G1"}
            ),
            create_response,
        )
        self.assertEqual(
            client.create_image_to_four_view_task({"img": IMAGE_URL}),
            create_response,
        )
        self.assertEqual(
            client.create_material_transfer_task(
                {"img": IMAGE_URL, "meshUrl": MODEL_GLB_URL}
            ),
            create_response,
        )
        self.assertEqual(
            client.create_multi_format_export_task({"modelUrl": MODEL_ZIP_URL}),
            create_response,
        )
        self.assertEqual(client.get_task("1256173"), task_response)
        self.assertEqual(
            client.list_tasks({"page": 1, "pagesize": 20}), list_response
        )

        expected = (
            ("POST", "/lux3d/v1/generate/img-to-3d/task/create"),
            ("POST", "/lux3d/v1/generate/text-to-3d/task/create"),
            ("POST", "/lux3d/v1/generate/image-to-four-view/task/create"),
            ("POST", "/lux3d/v1/generate/material-transfer/task/create"),
            ("POST", "/lux3d/v1/multi-format-export/task/create"),
            ("GET", "/lux3d/v1/generate/task/get"),
            ("GET", "/lux3d/v1/generate/task/list"),
        )
        self.assertEqual(len(session.calls), len(expected))
        for call, (method, path) in zip(session.calls, expected):
            with self.subTest(path=path):
                self.assertEqual(call["method"], method)
                self.assertEqual(urlparse(call["url"]).path, path)
                self.assertEqual(call["headers"]["Authorization"], API_KEY)
                self.assertNotEqual(
                    call["headers"]["Authorization"], f"Bearer {API_KEY}"
                )
                self.assertEqual(call["timeout"], 30)

        self.assertEqual(query_params(session.calls[5]), {"taskid": "1256173"})
        self.assertEqual(
            query_params(session.calls[6]), {"page": "1", "pagesize": "20"}
        )

    def test_cn_and_intl_regions_have_distinct_documented_roots(self):
        task_response = {
            "d": {"taskId": 7, "status": 0, "outputs": []},
            "m": None,
            "c": None,
        }
        cases = (
            ("cn", "https://api.aholo3d.cn/lux3d/v1/generate/task/get"),
            (
                "intl",
                "https://api.aholo3d.com/global/lux3d/v1/generate/task/get",
            ),
        )
        for region, expected_url in cases:
            with self.subTest(region=region):
                session = RecordingSession(json_response(task_response))
                Lux3DOpenAPIClient(
                    API_KEY, region=region, session=session
                ).get_task(7)
                self.assertEqual(
                    session.calls[0]["url"].split("?", 1)[0], expected_url
                )
                self.assertEqual(
                    session.calls[0]["headers"]["Authorization"], API_KEY
                )

    def test_client_rejects_unknown_region_and_empty_key(self):
        for key in (None, "", "  "):
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    Lux3DOpenAPIClient(key)
        with self.assertRaises(ValueError):
            Lux3DOpenAPIClient(API_KEY, region="global")

    def test_transport_and_business_errors_do_not_expose_api_key(self):
        transport = RecordingSession(
            requests.ConnectionError(f"Authorization: {API_KEY}")
        )
        with self.assertRaises(Lux3DAPIError) as raised:
            Lux3DOpenAPIClient(API_KEY, session=transport).get_task(1)
        self.assertNotIn(API_KEY, str(raised.exception))

        for status_code, payload in (
            (403, {"c": "FORBIDDEN", "m": f"bad credential {API_KEY}"}),
            (200, {"c": "BUSINESS_ERROR", "m": f"rejected {API_KEY}"}),
        ):
            with self.subTest(status_code=status_code):
                session = RecordingSession(json_response(payload, status_code))
                with self.assertRaises(Lux3DAPIError) as raised:
                    Lux3DOpenAPIClient(API_KEY, session=session).get_task(1)
                self.assertNotIn(API_KEY, str(raised.exception))


class Lux3DRequestContractTest(unittest.TestCase):
    def generation_options(
        self,
        version="G1",
        face_count=0,
        output_format="default",
        enable_pbr="default",
        ai_predict_size="default",
    ):
        return contracts.build_generation_options(
            version,
            face_count,
            output_format,
            enable_pbr,
            ai_predict_size,
        )

    def image_payload(
        self,
        input_mode="single",
        image_url=IMAGE_URL,
        image_urls="",
        version="G1",
        face_count=0,
        output_format="default",
        enable_pbr="default",
        ai_predict_size="default",
    ):
        return contracts.build_image_to_3d_payload(
            input_mode,
            image_url,
            image_urls,
            version,
            face_count,
            output_format,
            enable_pbr,
            ai_predict_size,
        )

    def test_image_to_3d_requires_exactly_one_single_or_multi_input(self):
        self.assertEqual(
            self.image_payload(), {"version": "G1", "img": IMAGE_URL}
        )

        urls = [f"https://assets.example/view-{index}.png" for index in range(32)]
        for count in (1, 32):
            with self.subTest(count=count):
                result = self.image_payload(
                    input_mode="multiple",
                    image_url="",
                    image_urls="\n".join(urls[:count]),
                )
                self.assertEqual(result["imgs"], urls[:count])
                self.assertNotIn("img", result)

        invalid_cases = (
            dict(input_mode="single", image_urls=IMAGE_URL),
            dict(input_mode="multiple", image_url=IMAGE_URL, image_urls=[IMAGE_URL]),
            dict(input_mode="multiple", image_url="", image_urls=[]),
            dict(input_mode="multiple", image_url="", image_urls=urls + [IMAGE_URL]),
            dict(input_mode="invalid"),
        )
        for kwargs in invalid_cases:
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    self.image_payload(**kwargs)

    def test_generation_inputs_must_be_public_http_urls(self):
        invalid = ("", "C:\\images\\chair.png", "data:image/png;base64,AAAA", "ftp://x/a.png")
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.image_payload(image_url=value)

    def test_g1_and_g1_turbo_format_and_enable_pbr_rules(self):
        self.assertEqual(
            self.generation_options(
                version="G1",
                face_count=200000,
                output_format="glb,ply",
                ai_predict_size="false",
            ),
            {
                "version": "G1",
                "faceCount": 200000,
                "outputFormat": ["glb", "ply"],
                "aiPredictSize": False,
            },
        )
        self.assertEqual(
            self.generation_options(
                version="G1-Turbo",
                output_format="zip,glb",
                enable_pbr="false",
            ),
            {
                "version": "G1-Turbo",
                "outputFormat": ["zip", "glb"],
                "enablePbr": False,
            },
        )
        self.assertEqual(
            self.generation_options(version="G1-Turbo", output_format="default"),
            {"version": "G1-Turbo"},
        )

        invalid_cases = (
            dict(version="G1", enable_pbr="true"),
            dict(version="G1-Turbo", output_format="ply", enable_pbr="false"),
            dict(version="G1", output_format="glb,glb"),
            dict(version="G1", output_format="usdz"),
            dict(version="G2"),
        )
        for kwargs in invalid_cases:
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    self.generation_options(**kwargs)

    def test_face_count_has_documented_zero_sentinel_and_bounds(self):
        self.assertNotIn("faceCount", self.generation_options(face_count=0))
        for count in (10000, 300000):
            with self.subTest(count=count):
                self.assertEqual(
                    self.generation_options(face_count=count)["faceCount"], count
                )
        for count in (True, 1, 9999, 300001):
            with self.subTest(count=count):
                with self.assertRaises(ValueError):
                    self.generation_options(face_count=count)

    def test_text_to_3d_includes_all_documented_fields_with_openapi_casing(self):
        result = contracts.build_text_to_3d_payload(
            "  a hand-painted wooden chair  ",
            "hand_painted",
            REFERENCE_URL,
            "G1-Turbo",
            10000,
            "glb,ply",
            "true",
            "false",
        )
        self.assertEqual(
            result,
            {
                "prompt": "a hand-painted wooden chair",
                "style": "hand_painted",
                "img": REFERENCE_URL,
                "version": "G1-Turbo",
                "faceCount": 10000,
                "outputFormat": ["glb", "ply"],
                "enablePbr": True,
                "aiPredictSize": False,
            },
        )

        for prompt, style, reference in (
            ("", "photorealistic", ""),
            ("chair", "oil_painting", ""),
            ("chair", "photorealistic", "C:\\reference.png"),
        ):
            with self.subTest(prompt=prompt, style=style, reference=reference):
                with self.assertRaises(ValueError):
                    contracts.build_text_to_3d_payload(
                        prompt,
                        style,
                        reference,
                        "G1",
                        0,
                        "default",
                        "default",
                        "default",
                    )

    def test_four_view_payload_contains_only_one_img_url(self):
        self.assertEqual(
            contracts.build_four_view_payload(IMAGE_URL), {"img": IMAGE_URL}
        )
        for value in ("", "image.png", "data:image/png;base64,AAAA"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    contracts.build_four_view_payload(value)

    def test_multi_format_export_glb_requires_formats_but_zip_may_be_empty(self):
        self.assertEqual(
            contracts.build_export_payload(MODEL_GLB_URL, "usdz,obj_zip"),
            {
                "modelUrl": MODEL_GLB_URL,
                "outputFormat": ["usdz", "obj_zip"],
            },
        )
        self.assertEqual(
            contracts.build_export_payload(MODEL_ZIP_URL, "default"),
            {"modelUrl": MODEL_ZIP_URL},
        )
        empty_zip_payload = contracts.build_export_payload(MODEL_ZIP_URL, [])
        self.assertEqual(empty_zip_payload["modelUrl"], MODEL_ZIP_URL)
        self.assertEqual(empty_zip_payload.get("outputFormat", []), [])
        for model_url, output_format in (
            (MODEL_GLB_URL, "default"),
            (MODEL_GLB_URL, []),
            ("https://assets.example/model.obj", "usdz"),
            (MODEL_ZIP_URL, "glb"),
        ):
            with self.subTest(model_url=model_url, output_format=output_format):
                with self.assertRaises(ValueError):
                    contracts.build_export_payload(model_url, output_format)


class Lux3DResponseContractTest(unittest.TestCase):
    def test_create_response_returns_a_normalized_task_id(self):
        self.assertEqual(contracts.parse_create_task_id({"d": 1256173}), "1256173")
        for payload in ({}, {"d": None}, {"d": 0}, {"d": True}, {"d": "x"}):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    contracts.parse_create_task_id(payload)

    def test_get_task_accepts_only_documented_statuses(self):
        for status in (0, 1, 3, 4, 6):
            response = {
                "d": {"taskId": 1256173, "status": status, "outputs": []}
            }
            with self.subTest(status=status):
                data = contracts.parse_task_data(response)
                self.assertEqual(data["status"], status)
                self.assertEqual(
                    contracts.TASK_STATUS_LABELS[status],
                    {
                        0: "initialized",
                        1: "running",
                        3: "succeeded",
                        4: "failed",
                        6: "cancelled",
                    }[status],
                )
        for status in (None, True, 2, 5, 7, "3"):
            with self.subTest(status=status):
                with self.assertRaises(ValueError):
                    contracts.parse_task_data(
                        {"d": {"taskId": 1, "status": status, "outputs": []}}
                    )

    def test_four_view_content_is_decoded_and_flattened_from_nested_json(self):
        urls = [
            "https://assets.example/front.png",
            "https://assets.example/opposite.png",
            "https://assets.example/side.png",
            "https://assets.example/back.png",
        ]
        response = {
            "d": {
                "taskId": 2696733,
                "status": 3,
                "outputs": [{"content": json.dumps(urls)}],
            }
        }
        data = contracts.parse_task_data(response)
        self.assertEqual(contracts.extract_output_contents(data["outputs"]), urls)

    def test_regular_output_urls_preserve_documented_order(self):
        urls = [
            "https://assets.example/results.zip",
            "https://assets.example/model.glb",
            "https://assets.example/gaussian.ply",
        ]
        outputs = [{"content": value} for value in urls]
        self.assertEqual(contracts.extract_output_contents(outputs), urls)

    def test_list_filters_defaults_bounds_and_response(self):
        self.assertEqual(
            contracts.build_list_params(1, 20, "all", 0, 0),
            {"page": 1, "pagesize": 20},
        )
        self.assertEqual(
            contracts.build_list_params(
                2, 100, "3 - succeeded", 1786591762000, 1786592088000
            ),
            {
                "page": 2,
                "pagesize": 100,
                "status": 3,
                "starttime": 1786591762000,
                "endtime": 1786592088000,
            },
        )
        response = {
            "d": {
                "items": [
                    {
                        "taskId": 2667998,
                        "status": 3,
                        "created": 1786591762000,
                        "lastModified": 1786592088000,
                    }
                ],
                "total": 1,
                "page": 1,
                "pageSize": 20,
            }
        }
        self.assertEqual(contracts.parse_task_list_data(response), response["d"])

        invalid_params = (
            (0, 20, "all", 0, 0),
            (1, 0, "all", 0, 0),
            (1, 101, "all", 0, 0),
            (1, 20, "2", 0, 0),
            (1, 20, "all", -1, 0),
            (1, 20, "all", 100, 100),
            (1, 20, "all", 101, 100),
        )
        for values in invalid_params:
            with self.subTest(values=values):
                with self.assertRaises(ValueError):
                    contracts.build_list_params(*values)

        invalid_responses = (
            {},
            {"d": {"items": None}},
            {"d": {"items": [{"taskId": 1, "status": 2}]}},
        )
        for value in invalid_responses:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    contracts.parse_task_list_data(value)


class Lux3DTaskPollingContractTest(unittest.TestCase):
    def task_response(self, task_id, status, outputs=None, **extra):
        data = {
            "taskId": task_id,
            "status": status,
            "outputs": [] if outputs is None else outputs,
        }
        data.update(extra)
        return {"d": data, "m": None, "c": None}

    def test_internal_http_and_polling_limits_are_fixed(self):
        self.assertEqual(task_polling.HTTP_TIMEOUT_SECONDS, 30)
        self.assertEqual(task_polling.POLL_INTERVAL_SECONDS, 15.0)
        self.assertEqual(task_polling.MAX_POLL_ATTEMPTS, 60)
        self.assertEqual(task_polling.POLL_TIMEOUT_SECONDS, 900.0)

    def test_initialized_and_running_continue_until_success_without_real_sleep(self):
        client = Mock()
        final = self.task_response(
            501,
            3,
            [{"content": "https://assets.example/result.glb"}],
        )
        client.get_task.side_effect = [
            self.task_response(501, 0),
            self.task_response(501, 1),
            final,
        ]

        with patch.object(task_polling.time, "sleep") as sleep:
            response, urls = task_polling.wait_for_task_result(client, "501")

        self.assertIs(response, final)
        self.assertEqual(urls, ["https://assets.example/result.glb"])
        self.assertEqual(client.get_task.call_args_list, [
            call("501"),
            call("501"),
            call("501"),
        ])
        self.assertEqual(sleep.call_args_list, [call(15.0), call(15.0)])

    def test_failed_and_cancelled_raise_without_sleeping_again(self):
        for status, label in ((4, "failed"), (6, "cancelled")):
            with self.subTest(status=status):
                client = Mock()
                client.get_task.return_value = self.task_response(
                    502,
                    status,
                    message="documented failure detail",
                )
                with patch.object(task_polling.time, "sleep") as sleep:
                    with self.assertRaisesRegex(RuntimeError, label):
                        task_polling.wait_for_task_result(client, 502)
                client.get_task.assert_called_once_with("502")
                sleep.assert_not_called()

    def test_polling_attempt_limit_raises_timeout_without_real_sleep(self):
        client = Mock()
        client.get_task.return_value = self.task_response(503, 1)
        with patch.object(task_polling.time, "sleep") as sleep:
            with self.assertRaisesRegex(TimeoutError, "503"):
                task_polling.wait_for_task_result(
                    client,
                    503,
                    max_attempts=3,
                    poll_timeout=900.0,
                )
        self.assertEqual(client.get_task.call_args_list, [
            call("503"),
            call("503"),
            call("503"),
        ])
        self.assertEqual(sleep.call_args_list, [call(15.0), call(15.0)])

    def test_wall_clock_deadline_raises_timeout_without_real_sleep(self):
        client = Mock()
        client.get_task.return_value = self.task_response(506, 1)
        with patch.object(
            task_polling.time, "monotonic", side_effect=[0.0, 0.0, 2.0]
        ), patch.object(task_polling.time, "sleep") as sleep:
            with self.assertRaisesRegex(TimeoutError, "1 seconds"):
                task_polling.wait_for_task_result(
                    client,
                    506,
                    poll_timeout=1.0,
                )
        client.get_task.assert_called_once_with("506")
        sleep.assert_not_called()

    def test_four_view_nested_json_is_flattened_and_requires_exactly_four_urls(self):
        urls = [
            "https://assets.example/front.png",
            "https://assets.example/opposite.png",
            "https://assets.example/side.png",
            "https://assets.example/back.png",
        ]
        client = Mock()
        client.get_task.return_value = self.task_response(
            504,
            3,
            [{"content": json.dumps(urls)}],
        )
        response, actual_urls = task_polling.wait_for_task_result(
            client,
            504,
            expected_output_count=4,
            require_json_array_content=True,
        )
        self.assertEqual(response["d"]["outputs"][0]["content"], json.dumps(urls))
        self.assertEqual(actual_urls, urls)

        client.get_task.return_value = self.task_response(
            504,
            3,
            [{"content": json.dumps(urls[:3])}],
        )
        with self.assertRaisesRegex(RuntimeError, "expected 4"):
            task_polling.wait_for_task_result(
                client,
                504,
                expected_output_count=4,
                require_json_array_content=True,
            )

        client.get_task.return_value = self.task_response(
            504,
            3,
            [{"content": url} for url in urls],
        )
        with self.assertRaisesRegex(RuntimeError, "JSON array"):
            task_polling.wait_for_task_result(
                client,
                504,
                expected_output_count=4,
                require_json_array_content=True,
            )

    def test_success_without_valid_url_content_is_rejected(self):
        invalid_outputs = (
            [],
            [{"content": None}],
            [{"content": "C:\\private\\result.glb"}],
        )
        for outputs in invalid_outputs:
            with self.subTest(outputs=outputs):
                client = Mock()
                client.get_task.return_value = self.task_response(505, 3, outputs)
                with self.assertRaises((RuntimeError, ValueError)):
                    task_polling.wait_for_task_result(client, 505)

    def test_not_requested_placeholders_are_ignored_when_results_exist(self):
        client = Mock()
        client.get_task.return_value = self.task_response(
            507,
            3,
            [
                {"content": "NOT_REQUESTED"},
                {"content": "https://assets.example/result.glb"},
            ],
        )
        _, urls = task_polling.wait_for_task_result(client, 507)
        self.assertEqual(urls, ["https://assets.example/result.glb"])


class Lux3DRegistryContractTest(unittest.TestCase):
    EXPECTED_OPERATION_TO_NODE = {
        "createImgTo3dTask": "Lux3DOpenAPIImageTo3D",
        "createTextTo3dTask": "Lux3DOpenAPITextTo3D",
        "createImageToFourViewTask": "Lux3DOpenAPIImageToFourView",
        "createMultiFormatExportTask": "Lux3DOpenAPIMultiFormatExport",
    }

    def test_registry_contains_only_the_four_exposed_create_operations(self):
        documented = set(registry.DOCUMENTED_OPERATION_IDS)
        excluded = set(registry.EXCLUDED_OPERATION_IDS)
        self.assertEqual(
            documented,
            set(self.EXPECTED_OPERATION_TO_NODE)
            | {"createMaterialTransferTask", "getTask", "listTasks"},
        )
        self.assertEqual(
            excluded,
            {"createMaterialTransferTask", "getTask", "listTasks"},
        )
        self.assertEqual(
            set(registry.OPERATION_NODE_MAPPINGS), documented - excluded
        )
        self.assertEqual(
            dict(registry.OPERATION_NODE_MAPPINGS), self.EXPECTED_OPERATION_TO_NODE
        )

    def test_every_operation_has_one_distinct_comfyui_node(self):
        classes = []
        for operation_id, node_key in self.EXPECTED_OPERATION_TO_NODE.items():
            with self.subTest(operation_id=operation_id):
                self.assertIn(node_key, registry.NODE_CLASS_MAPPINGS)
                node_class = registry.NODE_CLASS_MAPPINGS[node_key]
                classes.append(node_class)
                self.assertTrue(callable(node_class.INPUT_TYPES))
                self.assertIsInstance(node_class.INPUT_TYPES(), dict)
                self.assertTrue(hasattr(node_class, node_class.FUNCTION))
                self.assertTrue(str(node_class.CATEGORY).startswith("Lux3D"))
        self.assertEqual(len(classes), len(set(classes)))

        self.assertNotIn("Lux3DAssetUpload", registry.NODE_CLASS_MAPPINGS)
        self.assertFalse(hasattr(nodes, "Lux3DOpenAPIGetTask"))
        self.assertFalse(hasattr(nodes, "Lux3DOpenAPIListTasks"))

    def test_display_names_do_not_include_openapi(self):
        self.assertEqual(
            registry.NODE_DISPLAY_NAME_MAPPINGS,
            {
                "Lux3DOpenAPIImageTo3D": "Lux3D Image to 3D",
                "Lux3DOpenAPITextTo3D": "Lux3D Text to 3D",
                "Lux3DOpenAPIImageToFourView": "Lux3D Multi-View Generator",
                "Lux3DOpenAPIMultiFormatExport": "Lux3D Multi-Format Export",
            },
        )

    def test_material_transfer_is_not_registered_under_any_name(self):
        all_keys = " ".join(registry.NODE_CLASS_MAPPINGS).lower()
        all_classes = " ".join(
            cls.__name__ for cls in registry.NODE_CLASS_MAPPINGS.values()
        ).lower()
        self.assertNotIn("material", all_keys)
        self.assertNotIn("material", all_classes)


class Lux3DNodeExecutionContractTest(unittest.TestCase):
    def assert_json_equal(self, actual, expected):
        self.assertEqual(json.loads(actual), expected)

    def _execute_image_to_3d_with_outputs(self, outputs):
        node = nodes.Lux3DOpenAPIImageTo3D()
        client = Mock()
        client.create_img_to_3d_task.return_value = {
            "d": 901,
            "m": None,
            "c": None,
        }
        client.get_task.return_value = {
            "d": {"taskId": 901, "status": 3, "outputs": outputs},
            "m": None,
            "c": None,
        }
        with patch.object(node, "_client", return_value=client):
            return node.execute(
                "https://api.aholo3d.cn",
                IMAGE_URL,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "G1-Turbo",
                200000,
                "glb",
                "default",
                "default",
            )

    def _execute_export_with_outputs(self, outputs):
        node = nodes.Lux3DOpenAPIMultiFormatExport()
        client = Mock()
        client.create_multi_format_export_task.return_value = {
            "d": 902,
            "m": None,
            "c": None,
        }
        client.get_task.return_value = {
            "d": {"taskId": 902, "status": 3, "outputs": outputs},
            "m": None,
            "c": None,
        }
        with patch.object(node, "_client", return_value=client):
            return node.execute(
                "https://api.aholo3d.cn",
                MODEL_GLB_URL,
                "usdz,obj_zip,fbx_zip",
            )

    def test_create_nodes_expose_only_typed_result_outputs(self):
        expected = {
            nodes.Lux3DOpenAPIImageTo3D: (
                "task_id",
                "lux3d_zip",
                "glb",
                "ply",
            ),
            nodes.Lux3DOpenAPITextTo3D: (
                "task_id",
                "lux3d_zip",
                "glb",
                "ply",
            ),
            nodes.Lux3DOpenAPIImageToFourView: (
                "task_id",
                "image_1",
                "image_2",
                "image_3",
                "image_4",
            ),
            nodes.Lux3DOpenAPIMultiFormatExport: (
                "task_id",
                "glb",
                "usdz",
                "obj_zip",
                "fbx_zip",
            ),
        }
        for node_class, return_names in expected.items():
            with self.subTest(node=node_class.__name__):
                self.assertEqual(node_class.RETURN_NAMES, return_names)
                self.assertEqual(
                    node_class.RETURN_TYPES,
                    tuple("STRING" for _ in return_names),
                )
                self.assertNotIn("response_json", node_class.RETURN_NAMES)

    def test_four_create_nodes_poll_until_success_and_return_typed_outputs(self):
        cases = []

        image_node = nodes.Lux3DOpenAPIImageTo3D()
        image_client = Mock()
        image_client.create_img_to_3d_task.return_value = {
            "d": 101,
            "m": None,
            "c": None,
        }
        image_zip = "https://assets.example/results.zip?token=zip"
        image_glb = "https://assets.example/pbr_mesh.glb?token=glb"
        image_ply = "https://assets.example/gaussian.ply?token=ply"
        image_final = {
            "d": {
                "taskId": 101,
                "status": 3,
                "outputs": [
                    {"content": image_ply},
                    {"content": image_zip},
                    {"content": image_glb},
                ],
            },
            "m": None,
            "c": None,
        }
        image_client.get_task.side_effect = [
            {"d": {"taskId": 101, "status": 0, "outputs": []}},
            {"d": {"taskId": 101, "status": 1, "outputs": []}},
            image_final,
        ]
        cases.append(
            (
                image_node,
                image_client,
                lambda: image_node.execute(
                    "https://api.aholo3d.cn",
                    IMAGE_URL,
                    REFERENCE_URL,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "G1-Turbo",
                    200000,
                    "zip,glb,ply",
                    "true",
                    "false",
                ),
                image_client.create_img_to_3d_task,
                {
                    "imgs": [IMAGE_URL, REFERENCE_URL],
                    "version": "G1-Turbo",
                    "faceCount": 200000,
                    "outputFormat": ["zip", "glb", "ply"],
                    "enablePbr": True,
                    "aiPredictSize": False,
                },
                ("101", image_zip, image_glb, image_ply),
                "https://api.aholo3d.cn",
            )
        )

        text_node = nodes.Lux3DOpenAPITextTo3D()
        text_client = Mock()
        text_client.create_text_to_3d_task.return_value = {
            "d": "102",
            "m": None,
            "c": None,
        }
        text_glb = "https://assets.example/text-result.glb?signature=a%2Bb"
        text_final = {
            "d": {
                "taskId": "102",
                "status": 3,
                "outputs": [
                    {"content": text_glb}
                ],
            },
            "m": None,
            "c": None,
        }
        text_client.get_task.side_effect = [
            {"d": {"taskId": "102", "status": 0, "outputs": []}},
            {"d": {"taskId": "102", "status": 1, "outputs": []}},
            text_final,
        ]
        cases.append(
            (
                text_node,
                text_client,
                lambda: text_node.execute(
                    "https://api.aholo3d.com",
                    "a chair",
                    "cartoon",
                    REFERENCE_URL,
                    "G1-Turbo",
                    200000,
                    "glb",
                    "default",
                    "default",
                ),
                text_client.create_text_to_3d_task,
                {
                    "prompt": "a chair",
                    "style": "cartoon",
                    "img": REFERENCE_URL,
                    "version": "G1-Turbo",
                    "faceCount": 200000,
                    "outputFormat": ["glb"],
                },
                ("102", "", text_glb, ""),
                "https://api.aholo3d.com",
            )
        )

        four_view_node = nodes.Lux3DOpenAPIImageToFourView()
        four_view_client = Mock()
        four_view_client.create_image_to_four_view_task.return_value = {
            "d": 103,
            "m": None,
            "c": None,
        }
        four_view_urls = [
            "https://assets.example/front.png",
            "https://assets.example/opposite.png",
            "https://assets.example/side.png",
            "https://assets.example/back.png",
        ]
        four_view_final = {
            "d": {
                "taskId": 103,
                "status": 3,
                "outputs": [{"content": json.dumps(four_view_urls)}],
            },
            "m": None,
            "c": None,
        }
        four_view_client.get_task.side_effect = [
            {"d": {"taskId": 103, "status": 0, "outputs": []}},
            {"d": {"taskId": 103, "status": 1, "outputs": []}},
            four_view_final,
        ]
        cases.append(
            (
                four_view_node,
                four_view_client,
                lambda: four_view_node.execute(
                    "https://api.aholo3d.cn", IMAGE_URL
                ),
                four_view_client.create_image_to_four_view_task,
                {"img": IMAGE_URL},
                ("103", *four_view_urls),
                "https://api.aholo3d.cn",
            )
        )

        export_node = nodes.Lux3DOpenAPIMultiFormatExport()
        export_client = Mock()
        export_client.create_multi_format_export_task.return_value = {
            "d": 104,
            "m": None,
            "c": None,
        }
        export_usdz = "https://assets.example/export-result.usdz?token=usdz"
        export_obj = "https://assets.example/chair_obj.zip?token=obj"
        export_fbx = "https://assets.example/chair_fbx.zip?token=fbx"
        export_final = {
            "d": {
                "taskId": 104,
                "status": 3,
                "outputs": [
                    {"content": export_fbx},
                    {"content": export_usdz},
                    {"content": export_obj},
                ],
            },
            "m": None,
            "c": None,
        }
        export_client.get_task.side_effect = [
            {"d": {"taskId": 104, "status": 0, "outputs": []}},
            {"d": {"taskId": 104, "status": 1, "outputs": []}},
            export_final,
        ]
        cases.append(
            (
                export_node,
                export_client,
                lambda: export_node.execute(
                    "https://api.aholo3d.cn",
                    MODEL_GLB_URL,
                    "usdz,obj_zip,fbx_zip",
                ),
                export_client.create_multi_format_export_task,
                {
                    "modelUrl": MODEL_GLB_URL,
                    "outputFormat": ["usdz", "obj_zip", "fbx_zip"],
                },
                ("104", "", export_usdz, export_obj, export_fbx),
                "https://api.aholo3d.cn",
            )
        )

        for (
            node,
            client,
            execute,
            operation,
            expected_payload,
            expected_result,
            expected_base_api_path,
        ) in cases:
            with self.subTest(node=node.__class__.__name__):
                with patch.object(node, "_client", return_value=client) as factory, patch.object(
                    task_polling.time, "sleep"
                ) as sleep:
                    result = execute()
                factory.assert_called_once_with(expected_base_api_path)
                operation.assert_called_once_with(expected_payload)
                self.assertEqual(result, expected_result)
                task_id = expected_result[0]
                self.assertEqual(client.get_task.call_args_list, [
                    call(task_id),
                    call(task_id),
                    call(task_id),
                ])
                self.assertEqual(sleep.call_args_list, [call(15.0), call(15.0)])

    def test_export_glb_only_fills_unreturned_format_slots_with_empty_strings(self):
        glb = "https://assets.example/converted.glb?download=1"
        node = nodes.Lux3DOpenAPIMultiFormatExport()
        client = Mock()
        client.create_multi_format_export_task.return_value = {"d": 105}
        client.get_task.return_value = {
            "d": {
                "taskId": 105,
                "status": 3,
                "outputs": [{"content": glb}],
            }
        }
        with patch.object(node, "_client", return_value=client):
            result = node.execute(
                "https://api.aholo3d.cn",
                MODEL_ZIP_URL,
                "default",
            )
        self.assertEqual(result, ("105", glb, "", "", ""))

    def test_generation_duplicate_or_unknown_output_format_is_rejected(self):
        invalid_outputs = (
            [
                {"content": "https://assets.example/first.glb"},
                {"content": "https://assets.example/second.glb?token=2"},
            ],
            [{"content": "https://assets.example/model.usdz"}],
        )
        for outputs in invalid_outputs:
            with self.subTest(outputs=outputs), self.assertRaises(
                (RuntimeError, ValueError)
            ):
                self._execute_image_to_3d_with_outputs(outputs)

    def test_export_duplicate_or_unknown_output_format_is_rejected(self):
        invalid_outputs = (
            [
                {"content": "https://assets.example/first.usdz"},
                {"content": "https://assets.example/second.usdz?token=2"},
            ],
            [{"content": "https://assets.example/unlabelled.zip?token=zip"}],
            [{"content": "https://assets.example/cloud.ply"}],
        )
        for outputs in invalid_outputs:
            with self.subTest(outputs=outputs), self.assertRaises(
                (RuntimeError, ValueError)
            ):
                self._execute_export_with_outputs(outputs)

    def test_export_one_generic_zip_uses_the_only_unfilled_requested_zip_slot(self):
        obj_zip = "https://assets.example/chair_obj.zip?token=obj"
        generic_fbx_zip = "https://assets.example/download.zip?token=fbx"
        self.assertEqual(
            self._execute_export_with_outputs([
                {"content": generic_fbx_zip},
                {"content": obj_zip},
            ]),
            ("902", "", "", obj_zip, generic_fbx_zip),
        )

    def test_export_two_generic_zips_follow_requested_obj_fbx_order(self):
        generic_obj_zip = "https://assets.example/download.zip?token=obj"
        generic_fbx_zip = "https://assets.example/download.zip?token=fbx"
        self.assertEqual(
            self._execute_export_with_outputs([
                {"content": generic_obj_zip},
                {"content": generic_fbx_zip},
            ]),
            ("902", "", "", generic_obj_zip, generic_fbx_zip),
        )

    def test_nodes_load_api_key_from_server_environment_only(self):
        for node_class in registry.NODE_CLASS_MAPPINGS.values():
            with self.subTest(node=node_class.__name__):
                inputs = node_class.INPUT_TYPES()
                required = inputs.get("required", {})
                self.assertNotIn("api_key", inputs.get("required", {}))
                self.assertNotIn("api_key", inputs.get("optional", {}))
                self.assertNotIn("region", required)
                self.assertNotIn("timeout", required)
                self.assertIn("base_api_path", required)
                self.assertEqual(required["base_api_path"][0], "STRING")
                self.assertEqual(
                    required["base_api_path"][1]["default"],
                    "https://api.aholo3d.cn",
                )

        with patch.dict(
            os.environ, {"LUX3D_API_KEY_INTL": API_KEY}, clear=False
        ):
            self.assertEqual(
                nodes._resolve_api_key("https://api.aholo3d.com"), API_KEY
            )
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ValueError):
                nodes._resolve_api_key("https://api.aholo3d.cn")

    def test_base_api_path_maps_to_the_correct_region_and_server_key(self):
        cases = (
            (
                "https://api.aholo3d.cn",
                "LUX3D_API_KEY_CN",
                "cn",
            ),
            (
                "https://api.aholo3d.com",
                "LUX3D_API_KEY_INTL",
                "intl",
            ),
        )
        for base_api_path, variable_name, expected_region in cases:
            with self.subTest(base_api_path=base_api_path), patch.dict(
                os.environ, {variable_name: API_KEY}, clear=True
            ), patch.object(nodes, "Lux3DOpenAPIClient") as client_class:
                client = nodes._BaseOpenAPINode._client(base_api_path)
                self.assertIs(client, client_class.return_value)
                client_class.assert_called_once_with(
                    API_KEY,
                    region=expected_region,
                    timeout=30,
                )

    def test_base_api_path_rejects_aliases_and_unknown_values(self):
        for value in (
            None,
            [],
            "",
            "cn",
            "intl",
            "https://api.aholo3d.cn/",
            "https://api.aholo3d.com/global",
            "https://api.example.com",
        ):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    nodes._api_config(value)

    def test_generation_nodes_default_face_count_to_200000(self):
        for node_class in (
            nodes.Lux3DOpenAPIImageTo3D,
            nodes.Lux3DOpenAPITextTo3D,
        ):
            with self.subTest(node=node_class.__name__):
                self.assertEqual(
                    node_class.INPUT_TYPES()["required"]["face_count"][1][
                        "default"
                    ],
                    200000,
                )

    def test_image_or_url_inputs_use_one_union_field_and_string_widget(self):
        image_inputs = nodes.Lux3DOpenAPIImageTo3D.INPUT_TYPES()
        self.assertNotIn("input_mode", image_inputs["required"])
        self.assertNotIn("image_url", image_inputs["required"])
        self.assertNotIn("image_urls", image_inputs["required"])
        self.assertNotIn("optional", image_inputs)
        for index in range(1, 9):
            field_type, options = image_inputs["required"][f"image_{index}"]
            self.assertEqual(field_type, "STRING,IMAGE")
            self.assertEqual(options["widgetType"], "STRING")
            self.assertEqual(options["default"], "")
            self.assertFalse(options["multiline"])

        text_inputs = nodes.Lux3DOpenAPITextTo3D.INPUT_TYPES()
        self.assertNotIn("reference_image_url", text_inputs["required"])
        self.assertNotIn("optional", text_inputs)
        text_type, text_options = text_inputs["required"]["reference_image"]
        self.assertEqual(text_type, "STRING,IMAGE")
        self.assertEqual(text_options["widgetType"], "STRING")
        self.assertEqual(text_options["default"], "")
        self.assertFalse(text_options["multiline"])

        four_inputs = nodes.Lux3DOpenAPIImageToFourView.INPUT_TYPES()
        self.assertNotIn("image_url", four_inputs["required"])
        self.assertNotIn("optional", four_inputs)
        four_type, four_options = four_inputs["required"]["image"]
        self.assertEqual(four_type, "STRING,IMAGE")
        self.assertEqual(four_options["widgetType"], "STRING")
        self.assertEqual(four_options["default"], "")
        self.assertFalse(four_options["multiline"])

        export_inputs = nodes.Lux3DOpenAPIMultiFormatExport.INPUT_TYPES()
        export_model_type, export_model_options = export_inputs["required"][
            "model_url"
        ]
        self.assertIn("STRING", export_model_type.split(","))
        self.assertEqual(export_model_options["widgetType"], "STRING")
        self.assertNotIn("model_file", export_inputs["required"])
        self.assertNotIn("optional", export_inputs)
        self.assertNotIn(
            "model_file",
            inspect.signature(nodes.Lux3DOpenAPIMultiFormatExport.execute).parameters,
        )

    def test_local_image_inputs_are_uploaded_before_payload_submission(self):
        local_urls = [
            "https://assets.example/local-1.png",
            "https://assets.example/local-2.png",
        ]
        image = np.zeros((1, 2, 3, 3), dtype=np.float32)
        client = Mock()
        client.create_img_to_3d_task.return_value = {"c": None, "d": 201}
        client.get_task.return_value = {
            "c": None,
            "d": {
                "taskId": 201,
                "status": 3,
                "outputs": [{"content": "https://assets.example/model.glb"}],
            },
        }
        node = nodes.Lux3DOpenAPIImageTo3D()
        with patch.object(nodes, "upload_image_batch", return_value=[local_urls[0]]) as upload, patch.object(
            node, "_client", return_value=client
        ):
            result = node.execute(
                "https://api.aholo3d.cn",
                image, REFERENCE_URL, "", "", "", "", "", "",
                "G1-Turbo", 200000, "glb", "default", "default",
            )
        upload.assert_called_once_with(
            "https://api.aholo3d.cn", 30, image, "image_1", min_count=1, max_count=1
        )
        self.assertEqual(
            client.create_img_to_3d_task.call_args.args[0]["imgs"],
            [local_urls[0], REFERENCE_URL],
        )
        self.assertEqual(result[0], "201")

        text_client = Mock()
        text_client.create_text_to_3d_task.return_value = {"c": None, "d": 202}
        text_client.get_task.return_value = {
            "c": None,
            "d": {
                "taskId": 202,
                "status": 3,
                "outputs": [{"content": "https://assets.example/text.glb"}],
            },
        }
        text_node = nodes.Lux3DOpenAPITextTo3D()
        reference = np.zeros((1, 2, 3, 3), dtype=np.float32)
        with patch.object(
            nodes, "upload_image_batch", return_value=[local_urls[0]]
        ), patch.object(text_node, "_client", return_value=text_client):
            text_node.execute(
                "https://api.aholo3d.cn", "chair", "photorealistic", reference,
                "G1-Turbo", 200000, "glb", "default", "default",
            )
        self.assertEqual(
            text_client.create_text_to_3d_task.call_args.args[0]["img"],
            local_urls[0],
        )

        four_client = Mock()
        four_client.create_image_to_four_view_task.return_value = {"c": None, "d": 203}
        four_urls = [f"https://assets.example/view-{index}.png" for index in range(4)]
        four_client.get_task.return_value = {
            "c": None,
            "d": {
                "taskId": 203,
                "status": 3,
                "outputs": [{"content": json.dumps(four_urls)}],
            },
        }
        four_node = nodes.Lux3DOpenAPIImageToFourView()
        with patch.object(
            nodes, "upload_image_batch", return_value=[local_urls[0]]
        ), patch.object(four_node, "_client", return_value=four_client):
            four_node.execute(
                "https://api.aholo3d.cn", reference
            )
        self.assertEqual(
            four_client.create_image_to_four_view_task.call_args.args[0],
            {"img": local_urls[0]},
        )

    def test_text_reference_allows_empty_string_and_omits_img(self):
        client = Mock()
        client.create_text_to_3d_task.return_value = {"d": 205}
        client.get_task.return_value = {
            "d": {
                "taskId": 205,
                "status": 3,
                "outputs": [{"content": "https://assets.example/text.glb"}],
            }
        }
        node = nodes.Lux3DOpenAPITextTo3D()
        with patch.object(node, "_client", return_value=client), patch.object(
            nodes, "upload_image_batch"
        ) as upload:
            node.execute(
                "https://api.aholo3d.cn", "chair", "photorealistic", "",
                "G1-Turbo", 200000, "glb", "default", "default",
            )
        upload.assert_not_called()
        self.assertNotIn("img", client.create_text_to_3d_task.call_args.args[0])

    def test_union_inputs_reject_empty_required_and_invalid_values_before_upload(self):
        image = np.zeros((1, 2, 3, 3), dtype=np.float32)
        image_node = nodes.Lux3DOpenAPIImageTo3D()
        with patch.object(nodes, "upload_image_batch") as upload, patch.object(
            image_node, "_client"
        ) as client_factory:
            with self.assertRaises(ValueError):
                image_node.execute(
                    "https://api.aholo3d.cn",
                    image, object(), "", "", "", "", "", "",
                    "G1-Turbo", 200000, "glb", "default", "default",
                )
        upload.assert_not_called()
        client_factory.assert_not_called()

        invalid_cases = (
            lambda: nodes.Lux3DOpenAPIImageToFourView().execute(
                "https://api.aholo3d.cn", ""
            ),
            lambda: nodes.Lux3DOpenAPIImageToFourView().execute(
                "https://api.aholo3d.cn", "C:\\images\\chair.png"
            ),
            lambda: nodes.Lux3DOpenAPITextTo3D().execute(
                "https://api.aholo3d.cn", "chair", "photorealistic", object(),
                "G1-Turbo", 200000, "glb", "default", "default",
            ),
        )
        with patch.object(nodes, "upload_image_batch") as upload:
            for execute in invalid_cases:
                with self.subTest(execute=execute), self.assertRaises(ValueError):
                    execute()
        upload.assert_not_called()

    def test_image_to_3d_requires_at_least_one_of_the_eight_slots(self):
        node = nodes.Lux3DOpenAPIImageTo3D()
        with patch.object(node, "_client") as client_factory, patch.object(
            nodes, "upload_image_batch"
        ) as upload:
            with self.assertRaisesRegex(ValueError, "at least one"):
                node.execute(
                    "https://api.aholo3d.cn",
                    "", "", "", "", "", "", "", "",
                    "G1-Turbo", 200000, "glb", "default", "default",
                )
        client_factory.assert_not_called()
        upload.assert_not_called()

    def test_local_export_model_is_uploaded_and_url_is_forwarded(self):
        uploaded = "https://assets.example/local.glb"
        client = Mock()
        client.create_multi_format_export_task.return_value = {"c": None, "d": 204}
        client.get_task.return_value = {
            "c": None,
            "d": {
                "taskId": 204,
                "status": 3,
                "outputs": [{"content": "https://assets.example/model.usdz"}],
            },
        }
        node = nodes.Lux3DOpenAPIMultiFormatExport()
        with patch.object(
            nodes, "resolve_single_url_or_local_file", return_value=uploaded
        ) as resolver, patch.object(node, "_client", return_value=client):
            node.execute(
                "https://api.aholo3d.cn", "lux3d/local.glb", "usdz",
            )
        resolver.assert_called_once_with(
            "https://api.aholo3d.cn", 30, "lux3d/local.glb",
            (".glb", ".zip"), field_name="model_url",
        )
        self.assertEqual(
            client.create_multi_format_export_task.call_args.args[0],
            {"modelUrl": uploaded, "outputFormat": ["usdz"]},
        )

class Lux3DLocalAssetInputTest(unittest.TestCase):
    def fake_folder_paths(self, input_dir, output_dir, temp_dir):
        module = types.ModuleType("folder_paths")
        module.get_input_directory = lambda: str(input_dir)
        module.get_output_directory = lambda: str(output_dir)
        module.get_temp_directory = lambda: str(temp_dir)
        return module

    def test_local_file_resolution_supports_comfy_annotations_and_blocks_escape(self):
        with tempfile.TemporaryDirectory() as root_dir:
            root = Path(root_dir)
            input_dir, output_dir, temp_dir = (
                root / "input", root / "output", root / "temp"
            )
            for directory in (input_dir, output_dir, temp_dir):
                directory.mkdir()
            model = output_dir / "result.glb"
            model.write_bytes(b"glb")
            fake = self.fake_folder_paths(input_dir, output_dir, temp_dir)
            with patch.dict(sys.modules, {"folder_paths": fake}):
                self.assertEqual(
                    local_assets.resolve_input_file(
                        "result.glb [output]", (".glb",), "model_file"
                    ),
                    model.resolve(),
                )
                with self.assertRaises(ValueError):
                    local_assets.resolve_input_file(
                        "../output/result.glb", (".glb",), "model_file"
                    )

    def test_image_batch_is_png_encoded_uploaded_and_cleaned(self):
        captured_paths = []
        uploader = Mock()

        def upload_file(path, name):
            path = Path(path)
            self.assertTrue(path.is_file())
            self.assertEqual(path.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")
            captured_paths.append(path)
            return {
                "url": f"https://assets.example/{name}",
                "uploadKey": name,
            }

        uploader.upload_file.side_effect = upload_file
        image = np.zeros((2, 2, 3, 3), dtype=np.float32)
        with patch.object(local_assets, "_asset_uploader", return_value=uploader):
            urls = local_assets.upload_image_batch(
                "https://api.aholo3d.cn", 30, image, "images"
            )
        self.assertEqual(len(urls), 2)
        self.assertEqual(uploader.upload_file.call_count, 2)
        self.assertTrue(all(not path.exists() for path in captured_paths))

    def test_remote_and_local_sources_require_exactly_one_value(self):
        for remote, local in ((MODEL_GLB_URL, "lux3d/model.glb"), ("", "")):
            with self.subTest(remote=remote, local=local), self.assertRaises(ValueError):
                local_assets.validate_url_or_local_file_source(
                    remote,
                    local,
                    (".glb",),
                    url_field_name="model_url",
                    file_field_name="model_file",
                )

    def test_single_source_accepts_url_or_annotated_local_file(self):
        with tempfile.TemporaryDirectory() as root_dir:
            root = Path(root_dir)
            input_dir, output_dir, temp_dir = (
                root / "input", root / "output", root / "temp"
            )
            for directory in (input_dir, output_dir, temp_dir):
                directory.mkdir()
            model = output_dir / "result.glb"
            model.write_bytes(b"glb")
            fake = self.fake_folder_paths(input_dir, output_dir, temp_dir)
            with patch.dict(sys.modules, {"folder_paths": fake}):
                self.assertEqual(
                    local_assets.validate_single_url_or_local_file_source(
                        MODEL_GLB_URL, (".glb",), field_name="model_url"
                    ),
                    (MODEL_GLB_URL, None),
                )
                self.assertEqual(
                    local_assets.validate_single_url_or_local_file_source(
                        "result.glb [output]", (".glb",), field_name="model_url"
                    ),
                    (None, model.resolve()),
                )

    def test_single_source_uploads_local_but_passes_remote_through(self):
        with tempfile.TemporaryDirectory() as root_dir:
            root = Path(root_dir)
            input_dir, output_dir, temp_dir = (
                root / "input", root / "output", root / "temp"
            )
            for directory in (input_dir, output_dir, temp_dir):
                directory.mkdir()
            model = input_dir / "source.glb"
            model.write_bytes(b"glb")
            fake = self.fake_folder_paths(input_dir, output_dir, temp_dir)
            uploader = Mock()
            uploader.upload_file.return_value = {
                "url": "https://assets.example/uploaded.glb"
            }
            with patch.dict(sys.modules, {"folder_paths": fake}), patch.object(
                local_assets, "_asset_uploader", return_value=uploader
            ):
                self.assertEqual(
                    local_assets.resolve_single_url_or_local_file(
                        "https://api.aholo3d.cn", 30, "source.glb", (".glb",),
                        field_name="model_url",
                    ),
                    "https://assets.example/uploaded.glb",
                )
                self.assertEqual(
                    local_assets.resolve_single_url_or_local_file(
                        "https://api.aholo3d.cn", 30, MODEL_GLB_URL, (".glb",),
                        field_name="model_url",
                    ),
                    MODEL_GLB_URL,
                )
            uploader.upload_file.assert_called_once_with(model.resolve(), "source.glb")

    def test_single_source_rejects_empty_scheme_format_and_escape(self):
        cases = (
            ("", "cannot be empty"),
            ("ftp://assets.example/model.glb", "HTTP\\(S\\)"),
            ("https://assets.example/model.obj", "must use one of"),
            ("../secret.glb", "must stay inside"),
        )
        for value, message in cases:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, message):
                local_assets.validate_single_url_or_local_file_source(
                    value, (".glb",), field_name="model_url"
                )


class Lux3DAssetUploadContractTest(unittest.TestCase):
    def token_payload(self, block_size=8):
        return {
            "ousToken": OUS_TOKEN,
            "globalDomain": "https://ous.example",
            "blockSize": block_size,
        }

    def uploader(self, session, region="cn"):
        return Lux3DAssetUploader(
            API_KEY,
            region=region,
            poll_interval=0.2,
            max_wait_seconds=1,
            session=session,
        )

    def test_token_accepts_bare_and_success_envelope_shapes(self):
        for payload in (
            self.token_payload(),
            {"c": "0", "m": "", "d": self.token_payload()},
        ):
            with self.subTest(envelope="c" in payload):
                session = RecordingSession(json_response(payload))
                result = self.uploader(session).get_upload_token()
                self.assertEqual(result, self.token_payload())
                call = session.calls[0]
                self.assertEqual(call["method"], "GET")
                self.assertEqual(
                    call["url"], "https://api.aholo3d.cn/asset/v1/token"
                )
                self.assertEqual(call["headers"]["Authorization"], API_KEY)
                self.assertNotIn("Bearer", call["headers"]["Authorization"])

    def test_intl_token_uses_global_api_prefix(self):
        session = RecordingSession(json_response(self.token_payload()))
        self.uploader(session, region="intl").get_upload_token()
        self.assertEqual(
            session.calls[0]["url"],
            "https://api.aholo3d.com/global/asset/v1/token",
        )

    def test_small_file_uses_single_multipart_upload_then_status(self):
        file_bytes = b"small-file"
        expected_md5 = hashlib.md5(file_bytes).hexdigest()
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "input.bin"
            file_path.write_bytes(file_bytes)
            session = RecordingSession(
                json_response(
                    {"c": "0", "d": self.token_payload(block_size=64)}
                ),
                json_response({"c": "0", "d": {"taskId": "upload-1"}}),
                json_response(
                    {
                        "c": "0",
                        "d": {
                            "status": 5,
                            "url": "https://cdn.example/renamed.bin",
                            "uploadKey": "asset/upload/key",
                        },
                    }
                ),
            )

            result = self.uploader(session).upload_file(
                file_path, upload_name="renamed.bin"
            )

        self.assertEqual(result["url"], "https://cdn.example/renamed.bin")
        self.assertEqual(result["uploadKey"], "asset/upload/key")
        self.assertEqual(result["taskId"], "upload-1")
        self.assertEqual(result["md5"], expected_md5)
        self.assertEqual(len(session.calls), 3)

        upload_call = session.calls[1]
        self.assertEqual(upload_call["method"], "POST")
        self.assertEqual(
            urlparse(upload_call["url"]).path, "/ous/api/v2/single/upload"
        )
        self.assertEqual(upload_call["data"], {"md5": expected_md5})
        self.assertEqual(
            upload_call["files"]["file"],
            ("renamed.bin", file_bytes, "application/octet-stream"),
        )
        self.assertEqual(upload_call["headers"]["ous-token-v2"], OUS_TOKEN)
        self.assertNotIn("Authorization", upload_call["headers"])

        status_call = session.calls[2]
        self.assertEqual(status_call["method"], "GET")
        self.assertEqual(
            urlparse(status_call["url"]).path, "/ous/api/v2/upload/status"
        )

    def test_large_file_init_params_and_one_based_block_parts(self):
        file_bytes = b"abcdefghij"
        expected_md5 = hashlib.md5(file_bytes).hexdigest()
        with tempfile.TemporaryDirectory() as temp_dir:
            file_path = Path(temp_dir) / "large.bin"
            file_path.write_bytes(file_bytes)
            session = RecordingSession(
                json_response({"c": "0", "d": self.token_payload(block_size=4)}),
                json_response(
                    {
                        "c": "0",
                        "d": {
                            "taskId": "block-task",
                            "lackBlocks": ["1-3"],
                            "deduplicated": False,
                        },
                    }
                ),
                json_response({"c": "0", "d": {}}),
                json_response({"c": "0", "d": {}}),
                json_response({"c": "0", "d": {}}),
                json_response(
                    {
                        "c": "0",
                        "d": {
                            "status": 5,
                            "url": "https://cdn.example/large.bin",
                            "uploadKey": "asset/large/key",
                        },
                    }
                ),
            )
            result = self.uploader(session).upload_file(file_path)

        self.assertEqual(result["taskId"], "block-task")
        self.assertEqual(len(session.calls), 6)
        init_call = session.calls[1]
        self.assertEqual(
            urlparse(init_call["url"]).path, "/ous/api/v2/block/upload/init"
        )
        self.assertEqual(
            init_call["params"],
            {
                "md5": expected_md5,
                "blocks": 3,
                "size": len(file_bytes),
                "name": "large.bin",
            },
        )
        self.assertIsNone(init_call["data"])

        part_calls = session.calls[2:5]
        self.assertEqual([call["data"]["block"] for call in part_calls], [1, 2, 3])
        self.assertEqual(
            [call["files"]["file"][1] for call in part_calls],
            [b"abcd", b"efgh", b"ij"],
        )
        for call in part_calls:
            self.assertEqual(
                urlparse(call["url"]).path, "/ous/api/v2/block/upload/part"
            )
            self.assertEqual(call["headers"]["ous-token-v2"], OUS_TOKEN)

    def test_status_five_requires_both_url_and_upload_key(self):
        token_data = self.token_payload()
        invalid = (
            {"status": 5, "uploadKey": "key"},
            {"status": 5, "url": "https://cdn.example/file.bin"},
        )
        for status_data in invalid:
            with self.subTest(status_data=status_data):
                session = RecordingSession(
                    json_response({"c": "0", "d": status_data})
                )
                with self.assertRaises(Lux3DAPIError):
                    self.uploader(session)._poll_status(token_data)

    def test_status_six_and_eight_are_terminal_failures(self):
        for status in (6, 8):
            with self.subTest(status=status):
                session = RecordingSession(
                    json_response(
                        {
                            "c": "0",
                            "d": {
                                "status": status,
                                "errorCode": "UPLOAD_FAILED",
                                "errorMsg": "failed safely",
                            },
                        }
                    )
                )
                with self.assertRaises(Lux3DAPIError):
                    self.uploader(session)._poll_status(self.token_payload())

    def test_empty_or_missing_local_file_is_rejected_before_network(self):
        session = RecordingSession()
        with tempfile.TemporaryDirectory() as temp_dir:
            empty = Path(temp_dir) / "empty.bin"
            empty.write_bytes(b"")
            missing = Path(temp_dir) / "missing.bin"
            for value in ("", empty, missing):
                with self.subTest(value=value):
                    with self.assertRaises(ValueError):
                        self.uploader(session).upload_file(value)
        self.assertEqual(session.calls, [])

    def test_asset_errors_do_not_expose_api_or_ous_tokens(self):
        session = RecordingSession(
            requests.ConnectionError(f"Authorization: {API_KEY}; token={OUS_TOKEN}")
        )
        with self.assertRaises(Lux3DAPIError) as raised:
            self.uploader(session).get_upload_token()
        self.assertNotIn(API_KEY, str(raised.exception))
        self.assertNotIn(OUS_TOKEN, str(raised.exception))

        for payload in (
            {"c": "TOKEN_ERROR", "m": f"bad api key {API_KEY}"},
            {"c": "OUS_ERROR", "m": f"bad OUS token {OUS_TOKEN}"},
        ):
            with self.subTest(payload=payload):
                session = RecordingSession(json_response(payload))
                uploader = self.uploader(session)
                action = (
                    uploader.get_upload_token
                    if API_KEY in payload["m"]
                    else lambda: uploader._poll_status(self.token_payload())
                )
                with self.assertRaises(Lux3DAPIError) as raised:
                    action()
                self.assertNotIn(API_KEY, str(raised.exception))
                self.assertNotIn(OUS_TOKEN, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
