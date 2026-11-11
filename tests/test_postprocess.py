import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

from lux3d_openapi import config, local_assets
from lux3d_openapi.animation_catalog import ANIMATION_IDS
from lux3d_openapi.client import Lux3DAPIError, Lux3DOpenAPIClient
from lux3d_openapi.postprocess_contracts import *
from lux3d_openapi.postprocess_outputs import parse_retarget_result, parse_single_result, parse_retopology_result
from lux3d_openapi.postprocess_nodes import Lux3DOpenAPIAnimationRetarget, Lux3DOpenAPIArticulation, Lux3DOpenAPIPartSplit, Lux3DOpenAPIAutoRig, Lux3DOpenAPIRetopology
from lux3d_openapi.task_polling import wait_for_task_terminal

CN = "https://api.aholo.cn"
URL = "https://assets.example/model.glb?signature=test"
IDS = ["Walk_Loop", "Idle_Loop"]

def result(content, status=3):
    return {"c": "0", "d": {"taskId": 42, "status": status, "outputs": [{"content": content}]}}

def retopology_result(contents, status=3, task_id=42, **data_fields):
    data = {
        "taskId": task_id,
        "status": status,
        "outputs": [{"content": value} for value in contents],
        **data_fields,
    }
    return {"c": "0", "d": data}

class FakeHTTPResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        if isinstance(self.payload, BaseException):
            raise self.payload
        return self.payload

class RecordingHTTPSession:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method.upper(), "url": url, **kwargs})
        if not self.responses:
            raise AssertionError(f"Unexpected HTTP request: {method} {url}")
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response

def success(action, url=URL, fmt="glb"):
    return {"animation_id": action, "status": "success", "animationGlbUrl" if fmt == "glb" else "fbxUrl": url}

class PostprocessContractsTest(unittest.TestCase):
    def test_released_camelcase_contracts_and_catalog(self):
        self.assertEqual(len(ANIMATION_IDS), 85)
        self.assertEqual(len(set(ANIMATION_IDS)), 85)
        self.assertEqual(build_part_split_payload(URL), {"glbUrl": URL})
        self.assertEqual(build_articulation_payload(URL, " Open lid "), {"glbUrl": URL, "prompt": "Open lid"})
        self.assertEqual(build_rig_payload(URL), {"modelUrl": URL})
        self.assertEqual(build_retarget_payload(URL, json.dumps(IDS)), {"rigModelUrl": URL, "animationIds": IDS, "animationOutputMode": "separate", "outFormat": "glb", "animateInPlace": False})

    def test_retopology_payload_uses_only_public_fields_and_optional_content_id(self):
        self.assertEqual(
            build_mesh_retopology_payload(URL, 5000),
            {
                "modelUrl": URL,
                "faceLimit": 5000,
                "quad": True,
                "bakeTextures": False,
                "textureSize": 2048,
            },
        )
        self.assertEqual(
            build_mesh_retopology_payload(
                URL, 1000000, False, True, 4096, " quote-123 "
            ),
            {
                "modelUrl": URL,
                "faceLimit": 1000000,
                "quad": False,
                "bakeTextures": True,
                "textureSize": 4096,
                "contentId": "quote-123",
            },
        )
        for face_limit, quad in (
            (1000, True),
            (500000, True),
            (2000, False),
            (1000000, False),
        ):
            with self.subTest(face_limit=face_limit, quad=quad):
                validate_mesh_retopology_options(face_limit, quad)

    def test_retopology_rejects_invalid_values_before_upload_or_create(self):
        invalid = (
            {"face_limit": 0},
            {"face_limit": True},
            {"face_limit": 5000.0},
            {"face_limit": "5000"},
            {"face_limit": 999},
            {"face_limit": 500001},
            {"face_limit": 1999, "quad": False},
            {"face_limit": 1000001, "quad": False},
            {"face_limit": 5000, "quad": 1},
            {"face_limit": 5000, "bake_textures": "true"},
            {"face_limit": 5000, "texture_size": True},
            {"face_limit": 5000, "texture_size": 1000},
            {"face_limit": 5000, "content_id": 123},
        )
        with patch.object(Lux3DOpenAPIRetopology, "_source") as source:
            for controls in invalid:
                values = {
                    "face_limit": 5000,
                    "quad": True,
                    "bake_textures": False,
                    "texture_size": 2048,
                    "content_id": "",
                }
                values.update(controls)
                with self.subTest(controls=controls), self.assertRaises(ValueError):
                    Lux3DOpenAPIRetopology().execute(CN, "invalid.glb", **values)
            source.assert_not_called()

    def test_retopology_model_url_must_be_public_http_glb(self):
        for url in (
            "file:///tmp/model.glb",
            "https://localhost/model.glb",
            "https://localhost./model.glb",
            "https://127.0.0.1/model.glb",
            "https://127.0.0.1./model.glb",
            "https://host.local./model.glb",
            "https://user:pass@assets.example/model.glb",
            "https://assets.example/model.obj",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                build_mesh_retopology_payload(url, 5000)

    def test_invalid_controls_never_upload_or_create(self):
        with patch("lux3d_openapi.postprocess_nodes.resolve_single_url_or_local_file") as upload, patch.object(Lux3DOpenAPIAnimationRetarget, "_client") as client:
            for ids in ('[]', '["Walk_Loop","Walk_Loop"]', '["walk_loop"]', json.dumps(list(ANIMATION_IDS)[:11])):
                with self.subTest(ids=ids), self.assertRaises(ValueError):
                    Lux3DOpenAPIAnimationRetarget().execute(CN, "test.glb", ids)
            with self.assertRaises(ValueError):
                Lux3DOpenAPIArticulation().execute(CN, "test.glb", " ")
            upload.assert_not_called()
            client.assert_not_called()

    def test_sources_and_create_envelope(self):
        for url in ("https://127.0.0.1/a.glb", "https://[::1]/a.glb", "https://localhost/a.glb", "https://user:pass@example.com/a.glb", "https://assets.example/a.zip", "file:///a.glb"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_model_url(url)
        with self.assertRaises(ValueError):
            build_rig_payload(URL.replace("https:", "http:"))
        for response in ({"c":"0","d":"42"}, {"c":"0","d":True}, {"c":"error","d":42}, {"d":42}):
            with self.assertRaises((ValueError, RuntimeError)):
                new_task_id(response)

    def test_partial_failure_order_and_shared_url(self):
        actions = [success(IDS[1]), {"animation_id": IDS[0], "status": "failed", "error": {"code": "MODEL_INVALID", "message": "bad anatomy"}}]
        parsed, urls, count = parse_retarget_result(result(json.dumps({"actions":actions})), IDS, "glb")
        self.assertEqual([a["animation_id"] for a in parsed], IDS)
        self.assertEqual((urls, count), ([URL], 1))
        actions = [success(action) for action in reversed(IDS)]
        parsed, urls, count = parse_retarget_result(result(json.dumps({"actions":actions})), IDS, "glb")
        self.assertEqual((urls, count), ([URL], 0))

    def test_bad_action_associations_and_format_rejected(self):
        cases = [[success(IDS[0])], [success(IDS[0]),success(IDS[0])], [success("unknown"),success(IDS[0])], [success(IDS[0],fmt="fbx"),success(IDS[1])], [dict(success(IDS[0]), error="bad"),success(IDS[1])], [{"animation_id":a,"status":"failed","error":"bad"} for a in IDS]]
        for actions in cases:
            with self.subTest(actions=actions), self.assertRaises((ValueError, RuntimeError)):
                parse_retarget_result(result(json.dumps({"actions":actions})), IDS, "glb")
        with self.assertRaises(RuntimeError):
            parse_retarget_result(result(json.dumps([success(a) for a in IDS])), IDS, "glb")

    def test_failed_terminal_preserves_error_and_articulation_format(self):
        with self.assertRaisesRegex(RuntimeError, "MODEL_INVALID"):
            parse_single_result(result(json.dumps({"error":{"code":"MODEL_INVALID","message":"bad"}}),4))
        url = "https://assets.example/articulation.zip"
        self.assertEqual(parse_single_result(result(url)), (url, "zip"))
        with self.assertRaises(RuntimeError):
            parse_single_result(result(url), require_glb=True)

    def test_articulation_returns_two_outputs_and_keeps_download_artifact(self):
        self.assertEqual(Lux3DOpenAPIArticulation.RETURN_TYPES, ("STRING", "STRING"))
        self.assertEqual(Lux3DOpenAPIArticulation.RETURN_NAMES, ("task_id", "result_url"))
        for fmt in ("glb", "zip"):
            with self.subTest(fmt=fmt):
                url = f"https://assets.example/articulation.{fmt}"
                client = Lux3DOpenAPIClient("test-secret-never-log")
                client.create_articulation_task = Mock(return_value={"c": "0", "d": 42})
                client.get_task = Mock(return_value=result(url))
                with patch.object(Lux3DOpenAPIArticulation, "_client", return_value=client):
                    output = Lux3DOpenAPIArticulation().execute(CN, URL, "Open the lid")
                self.assertEqual(output["result"], ("42", url))
                self.assertEqual(
                    output["ui"]["lux3d_postprocess"][0]["artifacts"],
                    [{"format": fmt, "url": url}],
                )
                client.create_articulation_task.assert_called_once_with(
                    {"glbUrl": URL, "prompt": "Open the lid"}
                )

    def test_null_missing_and_empty_failure_outputs_preserve_diagnostics(self):
        for status, state in ((4, "failed"), (6, "cancelled")):
            for outputs in ("omitted", None, []):
                data={"taskId":42,"status":status,"error":{"code":"MODEL_INVALID","message":"Model is not eligible for rigging"}}
                if outputs != "omitted": data["outputs"]=outputs
                response={"c":"0","d":data}
                for parser in (parse_single_result, lambda value:parse_retarget_result(value,IDS,"glb")):
                    with self.subTest(status=status,outputs=outputs), self.assertRaisesRegex(RuntimeError,f"42 {state}.*MODEL_INVALID"):
                        parser(response)
        response={"c":"0","m":"SERVER_CANCEL_REASON","d":{"taskId":42,"status":6,"outputs":None}}
        with self.assertRaisesRegex(RuntimeError,"SERVER_CANCEL_REASON"):
            parse_single_result(response)

    def test_failure_redaction_and_all_failed_action_reasons(self):
        client=Lux3DOpenAPIClient("diagnostic-secret-never-log")
        client.create_rig_task=Mock(return_value={"c":"0","d":42})
        client.get_task=Mock(return_value={"c":"0","d":{"taskId":42,"status":4,"outputs":None,"error":{"code":"MODEL_INVALID","message":"diagnostic-secret-never-log rejected"}}})
        with patch.object(Lux3DOpenAPIAutoRig,"_client",return_value=client), self.assertRaises(RuntimeError) as error:
            Lux3DOpenAPIAutoRig().execute(CN,URL)
        self.assertNotIn("diagnostic-secret-never-log",str(error.exception))
        self.assertIn("MODEL_INVALID",str(error.exception))
        self.assertIn("42 failed",str(error.exception))
        actions=[{"animation_id":action,"status":"failed","error":{"code":"MOTION_UNAVAILABLE","message":"rejected"}} for action in IDS]
        with self.assertRaises(RuntimeError) as error:
            parse_retarget_result(result(json.dumps({"actions":actions}),4),IDS,"glb")
        self.assertTrue(all(action in str(error.exception) for action in IDS))

    def test_node_executes_with_real_client_double_and_sanitizes_error(self):
        client = Lux3DOpenAPIClient("test-secret-never-log")
        actions = [success(IDS[0]), {"animation_id":IDS[1], "status":"failed", "error":"test-secret-never-log rejected"}]
        client.create_retarget_task = Mock(return_value={"c":"0","d":42})
        client.get_task = Mock(return_value=result(json.dumps({"actions":actions})))
        with patch.object(Lux3DOpenAPIAnimationRetarget,"_client", return_value=client):
            output = Lux3DOpenAPIAnimationRetarget().execute(CN, URL, json.dumps(IDS))
        self.assertEqual(output["result"][:3], ("42",URL,""))
        self.assertNotIn("test-secret-never-log", json.dumps(output))
        self.assertIn("[REDACTED]", output["result"][3])
        self.assertEqual(client.create_retarget_task.call_count, 1)

    def test_terminal_id_and_user_interrupt(self):
        client = Mock(timeout=30)
        client.get_task.return_value = result(URL)
        with self.assertRaisesRegex(RuntimeError,"different task ID"):
            wait_for_task_terminal(client, 43)
        check = Mock(side_effect=RuntimeError("interrupted"))
        client.get_task.reset_mock()
        with self.assertRaisesRegex(RuntimeError,"interrupted"):
            wait_for_task_terminal(client,42,interruption_check=check)
        client.get_task.assert_not_called()

    def test_cancel_during_upload_prevents_remote_creation(self):
        client = Mock()
        cancelled = False
        def upload(*args, **kwargs):
            nonlocal cancelled
            cancelled = True
            return URL
        def check():
            if cancelled:
                raise RuntimeError("interrupted during upload")
        with patch.object(Lux3DOpenAPIPartSplit, "_client", return_value=client), patch("lux3d_openapi.postprocess_nodes._check_interrupt", side_effect=check), patch("lux3d_openapi.postprocess_nodes.validate_single_url_or_local_file_source", return_value=(None, Path("local.glb"))), patch("lux3d_openapi.postprocess_nodes.resolve_single_url_or_local_file", side_effect=upload):
            with self.assertRaisesRegex(RuntimeError, "interrupted during upload"):
                Lux3DOpenAPIPartSplit().execute(CN, "local.glb")
        client.create_part_split_task.assert_not_called()

    def test_preview_urls_cannot_escape_or_choose_remote_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/"model.glb").write_bytes(b"glTFfixture")
            with patch.object(local_assets,"_comfy_directories",return_value={"input":root,"output":root,"temp":root}):
                remote,path=local_assets.validate_single_url_or_local_file_source("/view?filename=model.glb&type=output",(".glb",),field_name="model",allow_view_url=True)
                self.assertIsNone(remote)
                self.assertEqual(path,root/"model.glb")
                for url in ("/view?filename=model.glb&filename=other.glb", "/view?filename=model.glb&type=remote", "/view?filename=model.glb&subfolder=..", "/view?filename=%2Fetc%2Fpasswd", "/view?filename=model.glb&url=https://example.com/a.glb"):
                    with self.subTest(url=url), self.assertRaises(ValueError):
                        local_assets.validate_single_url_or_local_file_source(url,(".glb",),field_name="model",allow_view_url=True)

    def test_keychain_region_and_environment_precedence(self):
        completed=Mock(returncode=0,stdout="test-key\n")
        with patch.dict(os.environ,{},clear=True), patch.object(config.sys,"platform","darwin"), patch.object(config.subprocess,"run",return_value=completed) as read:
            self.assertEqual(config.resolve_api_key(CN),"test-key")
            self.assertIn("lux3d-api-key",read.call_args.args[0])
            config.resolve_api_key("https://api.aholo3d.com")
            self.assertIn("lux3d-api-key-intl",read.call_args.args[0])
            read.reset_mock()
            with patch.dict(os.environ,{"LUX3D_API_KEY_CN":"env-key"}):
                self.assertEqual(config.resolve_api_key(CN),"env-key")
            read.assert_not_called()


class RetopologyOutputContractTest(unittest.TestCase):
    GLB = "https://assets.example/retopology.glb?token=glb"
    OBJ = "https://assets.example/retopology.obj?token=obj"
    ZIP = "https://assets.example/retopology.zip?token=zip"

    def test_fixed_slots_preserve_glb_obj_and_optional_zip_order(self):
        self.assertEqual(
            parse_retopology_result(retopology_result([self.GLB, self.OBJ, ""])),
            (self.GLB, self.OBJ, ""),
        )
        self.assertEqual(
            parse_retopology_result(
                retopology_result([self.GLB, self.OBJ, self.ZIP])
            ),
            (self.GLB, self.OBJ, self.ZIP),
        )

    def test_fixed_slots_reject_missing_reordering_and_bad_artifacts(self):
        invalid_slots = (
            [self.GLB, self.OBJ],
            [self.GLB, self.OBJ, "", ""],
            [self.OBJ, self.GLB, ""],
            [self.GLB, "", self.ZIP],
            [self.GLB, self.OBJ, "NOT_REQUESTED"],
            [self.GLB, self.OBJ, "https://assets.example/file.glb"],
            [self.GLB, self.OBJ, "file:///tmp/result.zip"],
            [self.GLB, self.OBJ, "https://localhost/result.zip"],
        )
        for slots in invalid_slots:
            with self.subTest(slots=slots), self.assertRaises((ValueError, RuntimeError)):
                parse_retopology_result(retopology_result(slots))

        for outputs in (
            None,
            [{"content": self.GLB}, {"content": self.OBJ}, {}],
            [{"content": self.GLB}, {"content": self.OBJ}, {"content": None}],
            ["not-an-output", {"content": self.OBJ}, {"content": ""}],
        ):
            response = {"c": "0", "d": {"taskId": 42, "status": 3, "outputs": outputs}}
            with self.subTest(outputs=outputs), self.assertRaises(RuntimeError):
                parse_retopology_result(response)

    def test_failed_and_cancelled_results_keep_server_diagnostics(self):
        for status, state in ((4, "failed"), (6, "cancelled")):
            response = retopology_result(
                [],
                status=status,
                errorMessage="MODEL_INVALID: static GLB required",
            )
            with self.subTest(status=status), self.assertRaisesRegex(
                RuntimeError, f"42 {state}.*MODEL_INVALID"
            ):
                parse_retopology_result(response)


class RetopologyNodeContractTest(unittest.TestCase):
    GLB = RetopologyOutputContractTest.GLB
    OBJ = RetopologyOutputContractTest.OBJ
    ZIP = RetopologyOutputContractTest.ZIP

    def test_node_registers_expected_controls_and_outputs(self):
        node = Lux3DOpenAPIRetopology
        self.assertEqual(node.OPERATION_ID, "createMeshRetopologyTask")
        self.assertEqual(node.CATEGORY, "Lux3D/Postprocess")
        self.assertEqual(node.RETURN_NAMES, ("task_id", "glb", "OBJ Untextured", "OBJ Textured"))
        inputs = node.INPUT_TYPES()["required"]
        self.assertEqual(inputs["face_limit"][1]["default"], 0)
        self.assertEqual(inputs["quad"][1]["default"], True)
        self.assertEqual(inputs["bake_textures"][1]["default"], False)
        self.assertEqual(inputs["texture_size"][0], [512, 1024, 2048, 4096])
        self.assertEqual(inputs["texture_size"][1]["default"], 2048)
        self.assertEqual(inputs["content_id"][1]["default"], "")

    def test_two_regions_send_real_http_create_bodies_and_slot_results(self):
        cases = (
            {
                "region": "cn",
                "base": CN,
                "face_limit": 1000,
                "quad": True,
                "bake_textures": False,
                "texture_size": 2048,
                "content_id": "",
                "outputs": [self.GLB, self.OBJ, ""],
                "path": "/lux3d/v1/mesh-retopology/task/create",
            },
            {
                "region": "intl",
                "base": "https://api.aholo3d.com/global",
                "face_limit": 1000000,
                "quad": False,
                "bake_textures": True,
                "texture_size": 4096,
                "content_id": "quote-55",
                "outputs": [self.GLB, self.OBJ, ""],
                "path": "/global/lux3d/v1/mesh-retopology/task/create",
            },
        )
        for index, case in enumerate(cases, start=1):
            with self.subTest(region=case["region"]):
                session = RecordingHTTPSession(
                    FakeHTTPResponse({"c": "0", "d": 100 + index}),
                    FakeHTTPResponse(retopology_result(case["outputs"], task_id=100 + index)),
                )
                client = Lux3DOpenAPIClient(
                    f"{case['region']}-secret", region=case["region"], session=session
                )
                values = {
                    key: case[key]
                    for key in (
                        "face_limit",
                        "quad",
                        "bake_textures",
                        "texture_size",
                        "content_id",
                    )
                }
                with patch.object(Lux3DOpenAPIRetopology, "_client", return_value=client):
                    output = Lux3DOpenAPIRetopology().execute(
                        case["base"], URL, **values
                    )

                create, get = session.calls
                self.assertEqual(create["method"], "POST")
                self.assertTrue(create["url"].endswith(case["path"]))
                self.assertEqual(
                    create["headers"]["Authorization"], f"{case['region']}-secret"
                )
                self.assertNotEqual(
                    create["headers"]["Authorization"],
                    f"Bearer {case['region']}-secret",
                )
                expected_body = {
                    "modelUrl": URL,
                    "faceLimit": case["face_limit"],
                    "quad": case["quad"],
                    "bakeTextures": case["bake_textures"],
                    "textureSize": case["texture_size"],
                }
                if case["content_id"]:
                    expected_body["contentId"] = case["content_id"]
                self.assertEqual(create["json"], expected_body)
                self.assertEqual(
                    get["params"], {"taskid": str(100 + index)}
                )
                self.assertEqual(output["result"], (str(100 + index), self.GLB, self.OBJ, ""))
                ui_result = output["ui"]["lux3d_postprocess"][0]
                self.assertEqual(
                    ui_result["artifacts"],
                    [{"format": "glb", "url": self.GLB}, {"format": "obj", "url": self.OBJ}],
                )
                if case["bake_textures"]:
                    self.assertEqual(
                        ui_result["message"],
                        "Geometry results are available, but the requested texture package was not generated.",
                    )
                    self.assertEqual(ui_result["warnings"], [ui_result["message"]])
                else:
                    self.assertEqual(ui_result["message"], "Retopology completed. GLB and OBJ geometry results are available.")
                    self.assertNotIn("warnings", ui_result)

    def test_resume_queries_only_original_task_and_ignores_create_inputs(self):
        session = RecordingHTTPSession(
            FakeHTTPResponse(
                retopology_result([self.GLB, self.OBJ, ""], task_id=7321)
            )
        )
        client = Lux3DOpenAPIClient("resume-secret", session=session)
        with patch.object(Lux3DOpenAPIRetopology, "_client", return_value=client), patch.object(
            Lux3DOpenAPIRetopology, "_source"
        ) as source:
            output = Lux3DOpenAPIRetopology().execute(
                CN,
                "not a URL; model is unused for recovery",
                face_limit=0,
                quad="stale control",
                bake_textures=True,
                texture_size=17,
                content_id=123,
                resume_task_id="7321",
            )
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(session.calls[0]["method"], "GET")
        self.assertEqual(session.calls[0]["params"], {"taskid": "7321"})
        source.assert_not_called()
        self.assertEqual(output["result"], ("7321", self.GLB, self.OBJ, ""))
        self.assertTrue(output["ui"]["lux3d_postprocess"][0]["warnings"])

    def test_resume_query_error_keeps_task_id_and_does_not_create(self):
        session = RecordingHTTPSession(requests.Timeout("network unavailable"))
        client = Lux3DOpenAPIClient("resume-secret", session=session)
        with patch.object(Lux3DOpenAPIRetopology, "_client", return_value=client):
            with self.assertRaisesRegex(RuntimeError, "task ID 9876.*resume_task_id"):
                Lux3DOpenAPIRetopology().execute(
                    CN, "ignored", bake_textures=False, resume_task_id="9876"
                )
        self.assertEqual([call["method"] for call in session.calls], ["GET"])

    def test_cancel_after_create_preserves_exception_type_and_task_id(self):
        class UserCancel(BaseException):
            pass

        session = RecordingHTTPSession(FakeHTTPResponse({"c": "0", "d": 2468}))
        client = Lux3DOpenAPIClient("cancel-secret", session=session)
        with patch.object(
            Lux3DOpenAPIRetopology,
            "_client",
            return_value=client,
        ), patch(
            "lux3d_openapi.postprocess_nodes._check_interrupt",
            side_effect=[None, None, UserCancel("cancelled")],
        ):
            with self.assertRaises(UserCancel) as raised:
                Lux3DOpenAPIRetopology().execute(CN, URL, face_limit=5000)
        self.assertIn("2468", str(raised.exception))
        self.assertIn("resume_task_id", str(raised.exception))
        self.assertEqual([call["method"] for call in session.calls], ["POST"])

    def test_bad_success_result_preserves_task_id_and_resume_hint(self):
        api_key = "result-secret"
        session = RecordingHTTPSession(
            FakeHTTPResponse({"c": "0", "d": 8642}),
            FakeHTTPResponse(
                retopology_result(
                    ["https://assets.example/wrong.obj", self.OBJ, ""],
                    task_id=8642,
                )
            ),
        )
        client = Lux3DOpenAPIClient(api_key, session=session)
        with patch.object(
            Lux3DOpenAPIRetopology, "_source", return_value=(client, URL)
        ):
            with self.assertRaisesRegex(
                RuntimeError, "task ID 8642.*resume_task_id"
            ) as raised:
                Lux3DOpenAPIRetopology().execute(CN, URL, face_limit=5000)
        self.assertIn(".glb", str(raised.exception))
        self.assertNotIn(api_key, str(raised.exception))

    def test_uncertain_create_responses_warn_and_never_post_twice(self):
        cases = (
            ("network timeout", requests.Timeout("request timed out")),
            ("HTTP 502 response", FakeHTTPResponse({"c": "SERVER_ERROR"}, 502)),
            ("invalid JSON", FakeHTTPResponse(ValueError("invalid JSON"))),
            ("non-object JSON", FakeHTTPResponse(["unexpected"])),
            ("missing task ID", FakeHTTPResponse({"c": "0", "d": True})),
            ("invalid task ID", FakeHTTPResponse({"c": "0", "d": "not-an-id"})),
        )
        for label, response in cases:
            with self.subTest(case=label):
                session = RecordingHTTPSession(response)
                client = Lux3DOpenAPIClient("create-secret", session=session)
                with patch.object(
                    Lux3DOpenAPIRetopology,
                    "_source",
                    return_value=(client, URL),
                ):
                    with self.assertRaisesRegex(
                        RuntimeError, "creation .*outcome is unknown.*task history"
                    ) as raised:
                        Lux3DOpenAPIRetopology().execute(
                            CN, URL, face_limit=5000
                        )
                self.assertIn("do not retry", str(raised.exception))
                self.assertIn("resume_task_id", str(raised.exception))
                self.assertEqual(
                    [call["method"] for call in session.calls], ["POST"]
                )

    def test_explicit_http_and_business_errors_are_not_unknown_creates(self):
        cases = (
            (
                "HTTP 400",
                FakeHTTPResponse({"c": "BAD_REQUEST", "m": "invalid"}, 400),
                "HTTP 400",
            ),
            (
                "business error",
                FakeHTTPResponse({"c": "INVALID_PARAMETER", "m": "bad input"}),
                "INVALID_PARAMETER",
            ),
        )
        for label, response, diagnostic in cases:
            with self.subTest(case=label):
                session = RecordingHTTPSession(response)
                client = Lux3DOpenAPIClient("known-error-secret", session=session)
                with patch.object(
                    Lux3DOpenAPIRetopology,
                    "_source",
                    return_value=(client, URL),
                ):
                    with self.assertRaises(Lux3DAPIError) as raised:
                        Lux3DOpenAPIRetopology().execute(
                            CN, URL, face_limit=5000
                        )
                self.assertFalse(raised.exception.outcome_unknown)
                self.assertIn(diagnostic, str(raised.exception))
                self.assertNotIn("outcome is unknown", str(raised.exception))
                self.assertNotIn("task history", str(raised.exception))
                self.assertEqual(
                    [call["method"] for call in session.calls], ["POST"]
                )

if __name__ == "__main__":
    unittest.main()
