"""Asset token + OUS V2 upload workflow used by Lux3D URL inputs."""

from __future__ import annotations

import hashlib
import io
import math
import os
import time
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Set
from urllib.parse import urlparse

import requests

from .client import Lux3DAPIError, REGION_BASE_URLS


SUCCESS_STATUS = 5
FAILED_STATUSES = {6, 8}


class Lux3DAssetUploader:
    """Upload one local file using the documented Asset/OUS workflow."""

    def __init__(
        self,
        api_key: str,
        region: str = "cn",
        timeout: int = 30,
        poll_interval: float = 0.5,
        max_wait_seconds: int = 120,
        session: Optional[requests.Session] = None,
    ) -> None:
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError("api_key cannot be empty")
        if region not in REGION_BASE_URLS:
            raise ValueError("region must be cn or intl")
        if isinstance(timeout, bool) or not 1 <= int(timeout) <= 300:
            raise ValueError("timeout must be between 1 and 300 seconds")
        if isinstance(poll_interval, bool) or float(poll_interval) < 0.2:
            raise ValueError("poll_interval must be at least 0.2 seconds")
        if (
            isinstance(max_wait_seconds, bool)
            or not 1 <= int(max_wait_seconds) <= 120
        ):
            raise ValueError("max_wait_seconds must be between 1 and 120")

        self._api_key = api_key.strip()
        self.region = region
        self.api_base_url = REGION_BASE_URLS[region]
        self.timeout = int(timeout)
        self.poll_interval = float(poll_interval)
        self.max_wait_seconds = int(max_wait_seconds)
        self.session = session or requests.Session()

    def _sanitize_message(
        self,
        value: Any,
        headers: Optional[Mapping[str, str]] = None,
    ) -> str:
        message = str(value) if value is not None else ""
        secrets = [self._api_key]
        if headers:
            for header_name in ("Authorization", "ous-token-v2"):
                secret = headers.get(header_name)
                if secret:
                    secrets.append(secret)
        for secret in secrets:
            message = message.replace(secret, "[REDACTED]")
        return message

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        params: Optional[Mapping[str, Any]] = None,
        data: Optional[Mapping[str, Any]] = None,
        files: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        path = urlparse(url).path
        try:
            response = self.session.request(
                method,
                url,
                headers=dict(headers or {}),
                params=dict(params) if params is not None else None,
                data=dict(data) if data is not None else None,
                files=files,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise Lux3DAPIError(
                f"Asset {method} {path} request failed ({exc.__class__.__name__})"
            ) from exc

        status_code = getattr(response, "status_code", 0)
        try:
            payload = response.json()
        except (TypeError, ValueError) as exc:
            raise Lux3DAPIError(
                f"Asset {method} {path} returned invalid JSON (HTTP {status_code})"
            ) from exc
        if not isinstance(payload, dict):
            raise Lux3DAPIError(
                f"Asset {method} {path} returned a non-object JSON response"
            )
        if not 200 <= int(status_code) < 300:
            message = self._sanitize_message(
                payload.get("message") or payload.get("m") or "", headers
            )
            detail = f": {message}" if message else ""
            raise Lux3DAPIError(
                f"Asset {method} {path} failed with HTTP {status_code}{detail}"
            )
        return payload

    def _unwrap_envelope(
        self,
        payload: Mapping[str, Any],
        operation: str,
        headers: Optional[Mapping[str, str]] = None,
    ) -> Any:
        if "c" not in payload:
            return payload
        code = payload.get("c")
        if code not in (None, "", "0", 0):
            message = self._sanitize_message(
                payload.get("m") or "unknown error", headers
            )
            raise Lux3DAPIError(f"{operation} failed with code {code}: {message}")
        return payload.get("d")

    def get_upload_token(self) -> Dict[str, Any]:
        payload = self._request_json(
            "GET",
            self.api_base_url + "/asset/v1/token",
            headers={"Accept": "application/json", "Authorization": self._api_key},
        )
        data = self._unwrap_envelope(
            payload,
            "Asset token",
            {"Authorization": self._api_key},
        )
        if not isinstance(data, dict):
            raise Lux3DAPIError("Asset token response is missing token data")

        token = data.get("ousToken")
        domain = data.get("globalDomain")
        block_size = data.get("blockSize")
        if not isinstance(token, str) or not token.strip():
            raise Lux3DAPIError("Asset token response is missing ousToken")
        if not isinstance(domain, str):
            raise Lux3DAPIError("Asset token response is missing globalDomain")
        parsed_domain = urlparse(domain)
        if parsed_domain.scheme.lower() != "https" or not parsed_domain.netloc:
            raise Lux3DAPIError("Asset globalDomain must be a valid HTTPS origin")
        if (
            isinstance(block_size, bool)
            or not isinstance(block_size, int)
            or block_size <= 0
        ):
            raise Lux3DAPIError("Asset token response contains an invalid blockSize")
        return {
            "ousToken": token.strip(),
            "globalDomain": domain.rstrip("/"),
            "blockSize": block_size,
        }

    @staticmethod
    def _file_md5(file_path: Path) -> str:
        digest = hashlib.md5()
        with file_path.open("rb") as file_obj:
            while True:
                chunk = file_obj.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _validate_local_file(file_path: Any) -> Path:
        if not isinstance(file_path, (str, os.PathLike)) or not str(file_path).strip():
            raise ValueError("file_path cannot be empty")
        path = Path(file_path).expanduser().resolve()
        if not path.is_file():
            raise ValueError(f"file_path does not point to a readable file: {path}")
        if path.stat().st_size <= 0:
            raise ValueError("file_path cannot be an empty file")
        return path

    @staticmethod
    def _normalize_upload_name(file_path: Path, upload_name: Optional[str]) -> str:
        name = Path(upload_name).name if upload_name else file_path.name
        if not name or name in (".", ".."):
            raise ValueError("upload filename cannot be empty")
        return name

    def _ous_headers(self, token: str) -> Dict[str, str]:
        return {"Accept": "application/json", "ous-token-v2": token}

    def _single_upload(
        self,
        file_path: Path,
        upload_name: str,
        md5_value: str,
        token_data: Mapping[str, Any],
    ) -> Dict[str, Any]:
        with file_path.open("rb") as file_obj:
            payload = self._request_json(
                "POST",
                token_data["globalDomain"] + "/ous/api/v2/single/upload",
                headers=self._ous_headers(token_data["ousToken"]),
                data={"md5": md5_value},
                files={
                    "file": (upload_name, file_obj, "application/octet-stream")
                },
            )
        data = self._unwrap_envelope(
            payload,
            "OUS single upload",
            {"ous-token-v2": token_data["ousToken"]},
        )
        return data if isinstance(data, dict) else {}

    def _block_init(
        self,
        upload_name: str,
        file_size: int,
        md5_value: str,
        blocks: int,
        token_data: Mapping[str, Any],
    ) -> Dict[str, Any]:
        payload = self._request_json(
            "POST",
            token_data["globalDomain"] + "/ous/api/v2/block/upload/init",
            headers=self._ous_headers(token_data["ousToken"]),
            params={
                "md5": md5_value,
                "blocks": blocks,
                "size": file_size,
                "name": upload_name,
            },
        )
        data = self._unwrap_envelope(
            payload,
            "OUS block upload init",
            {"ous-token-v2": token_data["ousToken"]},
        )
        if not isinstance(data, dict):
            raise Lux3DAPIError("OUS block upload init response is missing d")
        return data

    @staticmethod
    def _expand_lack_blocks(value: Any, block_count: int) -> Set[int]:
        if value is None or value == []:
            return set(range(1, block_count + 1))
        if not isinstance(value, list):
            raise Lux3DAPIError("OUS lackBlocks must be an array")

        blocks: Set[int] = set()
        for item in value:
            text = str(item).strip()
            if not text:
                continue
            if "-" in text:
                start_text, end_text = text.split("-", 1)
                if not start_text.isdigit() or not end_text.isdigit():
                    raise Lux3DAPIError("OUS lackBlocks contains an invalid range")
                start, end = int(start_text), int(end_text)
                if start > end:
                    raise Lux3DAPIError("OUS lackBlocks contains a reversed range")
                blocks.update(range(start, end + 1))
            elif text.isdigit():
                blocks.add(int(text))
            else:
                raise Lux3DAPIError("OUS lackBlocks contains an invalid block")
        if any(block < 1 or block > block_count for block in blocks):
            raise Lux3DAPIError("OUS lackBlocks contains an out-of-range block")
        return blocks

    def _upload_part(
        self,
        file_obj: Any,
        upload_name: str,
        block_number: int,
        block_size: int,
        token_data: Mapping[str, Any],
    ) -> None:
        file_obj.seek((block_number - 1) * block_size)
        chunk = file_obj.read(block_size)
        if not chunk:
            raise Lux3DAPIError(f"local block {block_number} is empty")
        payload = self._request_json(
            "POST",
            token_data["globalDomain"] + "/ous/api/v2/block/upload/part",
            headers=self._ous_headers(token_data["ousToken"]),
            data={"block": block_number},
            files={
                "file": (
                    f"{upload_name}.part{block_number}",
                    io.BytesIO(chunk),
                    "application/octet-stream",
                )
            },
        )
        self._unwrap_envelope(
            payload,
            f"OUS block upload part {block_number}",
            {"ous-token-v2": token_data["ousToken"]},
        )

    def _poll_status(self, token_data: Mapping[str, Any]) -> Dict[str, Any]:
        started = time.monotonic()
        while True:
            payload = self._request_json(
                "GET",
                token_data["globalDomain"] + "/ous/api/v2/upload/status",
                headers=self._ous_headers(token_data["ousToken"]),
            )
            data = self._unwrap_envelope(
                payload,
                "OUS upload status",
                {"ous-token-v2": token_data["ousToken"]},
            )
            if not isinstance(data, dict):
                raise Lux3DAPIError("OUS upload status response is missing d")
            status = data.get("status")
            if status == SUCCESS_STATUS:
                url = data.get("url")
                upload_key = data.get("uploadKey")
                if not isinstance(url, str) or not url.strip():
                    raise Lux3DAPIError("successful OUS status is missing url")
                if not isinstance(upload_key, str) or not upload_key.strip():
                    raise Lux3DAPIError("successful OUS status is missing uploadKey")
                return data
            if status in FAILED_STATUSES:
                error_code = self._sanitize_message(
                    data.get("errorCode"),
                    {"ous-token-v2": token_data["ousToken"]},
                )
                error_message = self._sanitize_message(
                    data.get("errorMsg") or data.get("errorInfo") or "",
                    {"ous-token-v2": token_data["ousToken"]},
                )
                detail = f" ({error_message})" if error_message else ""
                raise Lux3DAPIError(
                    f"OUS upload failed with status {status}, code {error_code}{detail}"
                )
            elapsed = time.monotonic() - started
            if elapsed >= self.max_wait_seconds:
                raise TimeoutError(
                    "OUS upload did not finish within "
                    f"{self.max_wait_seconds} seconds"
                )
            time.sleep(min(self.poll_interval, self.max_wait_seconds - elapsed))

    def upload_file(
        self, file_path: Any, upload_name: Optional[str] = None
    ) -> Dict[str, Any]:
        path = self._validate_local_file(file_path)
        file_size = path.stat().st_size
        filename = self._normalize_upload_name(path, upload_name)
        md5_value = self._file_md5(path)
        token_data = self.get_upload_token()
        block_size = token_data["blockSize"]

        task_data: Dict[str, Any]
        if file_size <= block_size:
            task_data = self._single_upload(
                path, filename, md5_value, token_data
            )
        else:
            blocks = int(math.ceil(file_size / block_size))
            task_data = self._block_init(
                filename, file_size, md5_value, blocks, token_data
            )
            if not task_data.get("deduplicated"):
                wanted_blocks = self._expand_lack_blocks(
                    task_data.get("lackBlocks"), blocks
                )
                with path.open("rb") as file_obj:
                    for block_number in sorted(wanted_blocks):
                        self._upload_part(
                            file_obj,
                            filename,
                            block_number,
                            block_size,
                            token_data,
                        )

        result = self._poll_status(token_data)
        result.setdefault("md5", md5_value)
        task_id = task_data.get("taskId") or task_data.get("obsTaskId")
        if task_id is not None:
            result.setdefault("taskId", task_id)
        return result
