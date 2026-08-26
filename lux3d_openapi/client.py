"""HTTP transport for the public Lux3D OpenAPI."""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

import requests


REGION_BASE_URLS = {
    "cn": "https://api.aholo3d.cn",
    "intl": "https://api.aholo3d.com/global",
}


class Lux3DAPIError(RuntimeError):
    """Sanitized Lux3D HTTP or business error."""


class Lux3DOpenAPIClient:
    def __init__(
        self,
        api_key: str,
        region: str = "cn",
        timeout: int = 30,
        session: Optional[requests.Session] = None,
    ) -> None:
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError("api_key cannot be empty")
        if region not in REGION_BASE_URLS:
            raise ValueError("region must be cn or intl")
        if isinstance(timeout, bool) or not 1 <= int(timeout) <= 300:
            raise ValueError("timeout must be between 1 and 300 seconds")

        self._api_key = api_key.strip()
        self.region = region
        self.base_url = REGION_BASE_URLS[region]
        self.timeout = int(timeout)
        self.session = session or requests.Session()

    def _sanitize_message(self, value: Any) -> str:
        message = str(value) if value is not None else ""
        if self._api_key:
            message = message.replace(self._api_key, "[REDACTED]")
        return message

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Optional[Mapping[str, Any]] = None,
        params: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        headers = {
            "Accept": "application/json",
            "Authorization": self._api_key,
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        try:
            response = self.session.request(
                method,
                self.base_url + path,
                headers=headers,
                json=dict(json_body) if json_body is not None else None,
                params=dict(params) if params is not None else None,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise Lux3DAPIError(
                f"Lux3D {method} {path} request failed ({exc.__class__.__name__})"
            ) from exc

        status_code = getattr(response, "status_code", 0)
        try:
            payload = response.json()
        except (ValueError, TypeError) as exc:
            raise Lux3DAPIError(
                f"Lux3D {method} {path} returned invalid JSON (HTTP {status_code})"
            ) from exc

        if not isinstance(payload, dict):
            raise Lux3DAPIError(
                f"Lux3D {method} {path} returned a non-object JSON response"
            )

        message = self._sanitize_message(payload.get("m"))
        code = payload.get("c")
        if not 200 <= int(status_code) < 300:
            detail = f": {message}" if message else ""
            raise Lux3DAPIError(
                f"Lux3D {method} {path} failed with HTTP {status_code}{detail}"
            )
        if code not in (None, "", "0", 0):
            detail = f": {message}" if message else ""
            raise Lux3DAPIError(
                f"Lux3D {method} {path} failed with code {code}{detail}"
            )
        return payload

    def create_img_to_3d_task(self, payload: Mapping[str, Any]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/lux3d/v1/generate/img-to-3d/task/create",
            json_body=payload,
        )

    def create_text_to_3d_task(self, payload: Mapping[str, Any]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/lux3d/v1/generate/text-to-3d/task/create",
            json_body=payload,
        )

    def create_material_transfer_task(
        self, payload: Mapping[str, Any]
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/lux3d/v1/generate/material-transfer/task/create",
            json_body=payload,
        )

    def create_image_to_four_view_task(
        self, payload: Mapping[str, Any]
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/lux3d/v1/generate/image-to-four-view/task/create",
            json_body=payload,
        )

    def create_multi_format_export_task(
        self, payload: Mapping[str, Any]
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/lux3d/v1/multi-format-export/task/create",
            json_body=payload,
        )

    def get_task(self, task_id: Any) -> Dict[str, Any]:
        return self._request(
            "GET",
            "/lux3d/v1/generate/task/get",
            params={"taskid": task_id},
        )

    def list_tasks(self, params: Mapping[str, Any]) -> Dict[str, Any]:
        return self._request(
            "GET", "/lux3d/v1/generate/task/list", params=params
        )
