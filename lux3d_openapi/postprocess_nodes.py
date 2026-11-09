"""Released Lux3D postprocessing operations, with server-only credentials."""
from __future__ import annotations

import json
import logging

from .animation_catalog import ANIMATION_IDS
from .contracts import normalize_task_id, require_text
from .local_assets import model_url_or_local_input, resolve_single_url_or_local_file, validate_single_url_or_local_file_source
from .nodes import _BaseOpenAPINode, _api_inputs
from .postprocess_contracts import (build_part_split_payload, build_articulation_payload,
    build_rig_payload, build_retarget_payload, build_mesh_retopology_payload,
    new_task_id, validate_animation_options,
    validate_mesh_retopology_options, validate_model_url)
from .postprocess_outputs import parse_single_result, parse_retarget_result, parse_retopology_result
from .task_polling import HTTP_TIMEOUT_SECONDS, wait_for_task_terminal


def _check_interrupt():
    try:
        import comfy.model_management as management
    except ImportError:
        return
    management.throw_exception_if_processing_interrupted()


class _PostprocessNode(_BaseOpenAPINode):
    FUNCTION = "execute"
    CATEGORY = "Lux3D/Postprocess"

    @classmethod
    def INPUT_TYPES(cls):
        required = _api_inputs()
        required["model_url"] = model_url_or_local_input((".glb",), tooltip="Public GLB URL, connected STRING, or a local ComfyUI GLB. Local files are uploaded before processing.")
        return {"required": required}

    @classmethod
    def _source(cls, base_api_path, model_url, *, https_only=False):
        _check_interrupt()
        remote, _ = validate_single_url_or_local_file_source(model_url, (".glb",), field_name="model_url", allow_view_url=True)
        if remote:
            validate_model_url(remote, https_only=https_only)
        # Resolve credentials before uploading, and never put them in widgets.
        client = cls._client(base_api_path)
        url = resolve_single_url_or_local_file(base_api_path, HTTP_TIMEOUT_SECONDS, model_url, (".glb",), field_name="model_url", allow_view_url=True)
        return client, validate_model_url(url, https_only=https_only)

    @classmethod
    def _create_and_finish(cls, client, create, payload):
        # An upload may finish after the user cancelled. Check again before
        # crossing the remote task/charging boundary.
        _check_interrupt()
        return cls._finish(client, create(payload))

    @staticmethod
    def _finish(client, created):
        task_id = new_task_id(created)
        logging.info("[Lux3D] created postprocessing task %s", task_id)
        response = wait_for_task_terminal(client, task_id, interruption_check=_check_interrupt)
        # Returned backend errors can echo a credential. Sanitize before parsing
        # or putting any result into execution history/browser UI.
        response = json.loads(client._sanitize_message(json.dumps(response, ensure_ascii=False)))
        return task_id, response

    @staticmethod
    def _result(task_id, result, artifacts, *, actions=None, failed=0, message=None, warnings=None):
        ui_result = {
            "task_id": task_id,
            "artifacts": artifacts,
            "actions": actions or [],
            "failed_count": failed,
        }
        if message:
            ui_result["message"] = message
        if warnings:
            ui_result["warnings"] = warnings
        return {"ui": {"lux3d_postprocess": [ui_result]}, "result": result}


class Lux3DOpenAPIPartSplit(_PostprocessNode):
    OPERATION_ID = "createPartSplitTask"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("task_id", "glb")

    def execute(self, base_api_path, model_url):
        client, url = self._source(base_api_path, model_url)
        task_id, response = self._create_and_finish(client, client.create_part_split_task, build_part_split_payload(url))
        glb, _ = parse_single_result(response, require_glb=True)
        return self._result(task_id, (task_id, glb), [{"format": "glb", "url": glb}])


class Lux3DOpenAPIArticulation(_PostprocessNode):
    OPERATION_ID = "createArticulationTask"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("task_id", "result_url")

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"]["prompt"] = ("STRING", {"default": "", "multiline": True, "tooltip": "Describe the joint and desired motion."})
        return inputs

    def execute(self, base_api_path, model_url, prompt):
        prompt = require_text(prompt, "prompt")
        client, url = self._source(base_api_path, model_url)
        task_id, response = self._create_and_finish(client, client.create_articulation_task, build_articulation_payload(url, prompt))
        result_url, result_format = parse_single_result(response)
        return self._result(task_id, (task_id, result_url), [{"format": result_format, "url": result_url}])


class Lux3DOpenAPIAutoRig(_PostprocessNode):
    OPERATION_ID = "createRigTask"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("task_id", "glb")

    def execute(self, base_api_path, model_url):
        client, url = self._source(base_api_path, model_url, https_only=True)
        task_id, response = self._create_and_finish(client, client.create_rig_task, build_rig_payload(url))
        glb, _ = parse_single_result(response, require_glb=True)
        return self._result(task_id, (task_id, glb), [{"format": "glb", "url": glb}])


class Lux3DOpenAPIAnimationRetarget(_PostprocessNode):
    OPERATION_ID = "createRetargetTask"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "glb", "fbx", "actions_json")

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"].update({
            "animation_ids": ("STRING", {"default": '["Walk_Loop"]', "multiline": True, "tooltip": "1–10 unique, case-sensitive catalog IDs. Use Add action, JSON array, or one per line.", "lux3d_animation_ids": list(ANIMATION_IDS)}),
            "output_mode": (["separate", "combined"], {"default": "separate"}),
            "out_format": (["glb", "fbx"], {"default": "glb"}),
            "animate_in_place": ("BOOLEAN", {"default": False}),
        })
        return inputs

    def execute(self, base_api_path, model_url, animation_ids, output_mode="separate", out_format="glb", animate_in_place=False):
        ids = validate_animation_options(animation_ids, output_mode, out_format, animate_in_place)
        client, url = self._source(base_api_path, model_url, https_only=True)
        payload = build_retarget_payload(url, json.dumps(ids), output_mode, out_format, animate_in_place)
        task_id, response = self._create_and_finish(client, client.create_retarget_task, payload)
        actions, urls, failed = parse_retarget_result(response, ids, out_format)
        first = urls[0]
        return self._result(task_id, (task_id, first if out_format == "glb" else "", first if out_format == "fbx" else "", json.dumps({"actions": actions}, ensure_ascii=False)), [{"format": out_format, "url": url} for url in urls], actions=actions, failed=failed)


class Lux3DOpenAPIRetopology(_PostprocessNode):
    """Create or resume the public three-artifact mesh retopology task."""

    OPERATION_ID = "createMeshRetopologyTask"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("task_id", "glb", "OBJ Untextured", "OBJ Textured")

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs["required"].update({
            "face_limit": (
                "INT",
                {
                    "default": 0,
                    "min": 0,
                    "max": 1000000,
                    "step": 1,
                    "tooltip": (
                        "Required. Enter 1000–500000 for quad, or "
                        "2000–1000000 for triangle. 0 means not set and is rejected."
                    ),
                },
            ),
            "quad": ("BOOLEAN", {"default": True}),
            "bake_textures": (
                "BOOLEAN",
                {
                    "default": False,
                    "tooltip": "For recovery, keep this equal to the original request to report a missing texture ZIP accurately.",
                },
            ),
            "texture_size": (
                [512, 1024, 2048, 4096],
                {"default": 2048},
            ),
            "content_id": (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Optional business correlation value; leave blank when not provided.",
                },
            ),
            "resume_task_id": (
                "STRING",
                {
                    "default": "",
                    "multiline": False,
                    "tooltip": "Optional: enter an existing task ID to query it again without uploading or creating a task.",
                },
            ),
        })
        return inputs

    @staticmethod
    def _wait_recoverably(client, task_id):
        interruption = []

        def check_interruption():
            try:
                _check_interrupt()
            except BaseException as exc:
                interruption.append(exc)
                raise

        try:
            response = wait_for_task_terminal(
                client, task_id, interruption_check=check_interruption
            )
        except BaseException as exc:
            if interruption and exc is interruption[-1]:
                detail = client._sanitize_message(str(exc))
                recovery = (
                    f"Save task ID {task_id}; enter it in resume_task_id "
                    "to continue querying the same task."
                )
                try:
                    exc.args = (f"{detail}. {recovery}" if detail else recovery,)
                    if hasattr(exc, "add_note"):
                        exc.add_note(recovery)
                except Exception:
                    pass
                raise
            if not isinstance(exc, Exception):
                raise
            detail = client._sanitize_message(str(exc))
            raise RuntimeError(
                f"Lux3D task ID {task_id} could not be confirmed. Save this task ID "
                f"and enter it in resume_task_id to continue querying the same task. "
                f"{detail}"
            ) from exc
        response = json.loads(
            client._sanitize_message(json.dumps(response, ensure_ascii=False))
        )
        return response

    @classmethod
    def _render_result(cls, task_id, response, bake_textures, client):
        try:
            glb, obj, obj_zip = parse_retopology_result(response)
        except Exception as exc:
            detail = client._sanitize_message(str(exc))
            raise RuntimeError(
                f"Lux3D task ID {task_id} returned a result that could not be "
                f"accepted. Enter this ID in resume_task_id to query the same "
                f"task again. {detail}"
            ) from exc
        artifacts = [
            {"format": "glb", "url": glb},
            {"format": "obj", "url": obj},
        ]
        if obj_zip:
            artifacts.append({"format": "zip", "url": obj_zip})

        warnings = []
        if bake_textures and not obj_zip:
            message = "Geometry results are available, but the requested texture package was not generated."
            warnings.append(
                "Geometry results are available, but the requested texture package was not generated."
            )
        elif obj_zip:
            message = "Retopology completed. GLB, OBJ, and ZIP artifacts are available."
        else:
            message = "Retopology completed. GLB and OBJ geometry results are available."

        return cls._result(
            task_id,
            (task_id, glb, obj, obj_zip),
            artifacts,
            message=message,
            warnings=warnings,
        )

    def execute(
        self,
        base_api_path,
        model_url,
        face_limit=0,
        quad=True,
        bake_textures=False,
        texture_size=2048,
        content_id="",
        resume_task_id="",
    ):
        if resume_task_id is not None and str(resume_task_id).strip():
            # A resume only needs the original task ID and the original bake
            # flag used to explain an empty optional ZIP result. It must not
            # inspect or upload the current model widget or validate stale
            # create-task controls.
            task_id = normalize_task_id(resume_task_id)
            if type(bake_textures) is not bool:
                raise ValueError("bake_textures must be a boolean when resuming a task")
            client = self._client(base_api_path)
            response = self._wait_recoverably(client, task_id)
            return self._render_result(task_id, response, bake_textures, client)

        validate_mesh_retopology_options(
            face_limit, quad, bake_textures, texture_size, content_id
        )
        client, url = self._source(base_api_path, model_url)
        payload = build_mesh_retopology_payload(
            url, face_limit, quad, bake_textures, texture_size, content_id
        )
        _check_interrupt()
        try:
            created = client.create_mesh_retopology_task(payload)
        except Exception as exc:
            if not getattr(exc, "outcome_unknown", False):
                raise
            detail = client._sanitize_message(str(exc))
            raise RuntimeError(
                "Lux3D retopology task creation outcome is unknown. Check the "
                "Lux3D task history before submitting again; do not retry the "
                "create request yet. If you find the task ID, enter it in "
                f"resume_task_id. {detail}"
            ) from exc
        try:
            task_id = new_task_id(created)
        except Exception as exc:
            detail = client._sanitize_message(str(exc))
            raise RuntimeError(
                "Lux3D retopology task creation returned no usable task ID, "
                "so its outcome is unknown. Check the Lux3D task history before "
                "submitting again; do not retry the create request yet. If you "
                f"find the task ID, enter it in resume_task_id. {detail}"
            ) from exc
        logging.info("[Lux3D] created retopology task %s", task_id)
        response = self._wait_recoverably(client, task_id)
        return self._render_result(task_id, response, bake_textures, client)
