"""
File upload tool - supports single file and multipart upload
Supports automatic token refresh and progress callback
"""

#  upload.py
#  Copyright 2026 Qunhe Tech, all rights reserved.
#  Qunhe PROPRIETARY/CONFIDENTIAL, any form of usage is subject to approval.

import time
import json
import hashlib
import traceback
import logging
from pathlib import Path
from typing import Callable, Optional, Dict, Any, List, Tuple
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# Import signature related functions
from ..sso.sso_token import load_config, generate_sign_by_lux3d_code

logger = logging.getLogger("LuxRealEngine")

# OUS V2 API paths (see OUS V2 API documentation)
API_ENDPOINTS = {
    "single_upload": "/ous/api/v2/single/upload",
    "multipart_init": "/ous/api/v2/block/upload/init",
    "multipart_upload": "/ous/api/v2/block/upload/part",
    "upload_status": "/ous/api/v2/upload/status",
}

# V2 authentication header name
OUS_TOKEN_HEADER = "ous-token-v2"


class UploadError(Exception):
    """Base class for upload errors"""

    def __init__(self, code: str, message: str, extra: Optional[Dict[str, Any]] = None,
                 cause: Optional[Exception] = None):
        super().__init__(message)
        self.code = str(code)
        self.message = message
        self.extra = extra or {}
        self.cause = cause
        if cause:
            self.__cause__ = cause

    def __str__(self):
        base_msg = f"[{self.code}] {self.message}"
        if self.cause:
            base_msg += f"\nCause: {type(self.cause).__name__}: {str(self.cause)}"
        return base_msg


def calculate_file_md5(file_path: Path) -> str:
    """Calculate file MD5 hash"""
    md5_hash = hashlib.md5()
    with file_path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            md5_hash.update(chunk)
    return md5_hash.hexdigest()


def create_error(code: Any, message: Any, extra: Optional[Dict[str, Any]] = None,
                 cause: Optional[Exception] = None) -> UploadError:
    """Create standard error object"""
    return UploadError(
        str(code or "ServerError"),
        str(message or "Unknown error"),
        extra,
        cause
    )


def make_request(
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        timeout_ms: Optional[int] = None,
        auto_refresh_token: bool = False,
        refresh_token_fn: Optional[Callable[[], str]] = None
) -> Dict[str, Any]:
    """
    Unified HTTP request wrapper
    Supports automatic token refresh
    """
    timeout = (timeout_ms / 1000.0) if timeout_ms else None

    # Log request information (hide sensitive information)
    safe_headers = {k: v for k, v in (headers or {}).items() if k.lower() not in ['authorization', 'ous-token-v2']}
    logger.debug(f"HTTP Request: {method} {url}")
    logger.debug(f"Headers: {safe_headers}")
    if data and not files:
        logger.debug(f"Data: {data}")
    if params:
        logger.debug(f"Params: {params}")

    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            data=data,
            files=files,
            params=params,
            timeout=timeout
        )

        # Log response status
        logger.debug(f"Response Status: {response.status_code}")

        # Handle 401 error - token expired (V2 uses ous-token-v2)
        if response.status_code == 401 and auto_refresh_token and refresh_token_fn and headers:
            logger.warning(f"Token expired (401), attempting refresh for {url}")
            new_token = refresh_token_fn()
            headers[OUS_TOKEN_HEADER] = new_token

            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                data=data,
                files=files,
                params=params,
                timeout=timeout
            )
            logger.debug(f"Retry Response Status: {response.status_code}")

        response.raise_for_status()
        return response.json()

    except requests.HTTPError as e:
        # Detailed HTTP error logging
        status_code = e.response.status_code if e.response else None
        try:
            error_data = e.response.json()
            error_code = error_data.get("c", "Unknown")
            error_msg = error_data.get("m", "Unknown error")
            logger.error(f"HTTP Error [{status_code}]: {method} {url}")
            logger.error(f"Error Code: {error_code}, Message: {error_msg}")
            logger.error(f"Full Response: {json.dumps(error_data, ensure_ascii=False)}")
            raise create_error(error_code, error_msg, extra={"status_code": status_code, "url": url, "method": method},
                               cause=e)
        except json.JSONDecodeError:
            response_text = e.response.text[:500] if e.response else str(e)
            logger.error(f"HTTP Error [{status_code}]: {method} {url}")
            logger.error(f"Response Text: {response_text}")
            raise create_error("HTTPError", f"HTTP {status_code}: {str(e)}",
                               extra={"status_code": status_code, "url": url, "response_text": response_text}, cause=e)

    except Exception as e:
        logger.error(f"Request Error: {method} {url}")
        logger.error(f"Error Type: {type(e).__name__}")
        logger.error(f"Error Message: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise create_error("RequestError", str(e), cause=e)


def fetch_token_and_domain(base_api_path: Optional[str] = None, guid: Optional[str] = None,
                           lux3d_api_key: Optional[str] = None) -> Tuple[str, str, int]:
    """
    Get upload token, global domain and chunk threshold (OUS V2)
    Token response directly contains blockSize, no need to call chunk rule interface again.

    Args:
        base_api_path: API base path (used to build token acquisition URL)
        guid: Upload configuration GUID (bound during V2 Token generation, recommended to pass)
        lux3d_api_key: Invitation code (optional), used for OpenAPI signature

    Returns:
        (ous_token, global_domain, block_size) tuple
    """
    # Use /global/luxrealengine/upload/token/v2 (internal interface, not exposed externally)
    url = f"{base_api_path}/global/luxrealengine/upload/token/v2"

    # Add OpenAPI signature parameters
    lux3d_code = load_config(lux3d_api_key=lux3d_api_key if lux3d_api_key else None)
    if not lux3d_code.get("ak") or not lux3d_code.get("sk") or not lux3d_code.get("appuid"):
        raise create_error("ConfigError",
                           "Missing ak/sk/appuid configuration, please provide invitation code or configure config.txt file")

    code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
    appuid = code_with_sign["appuid"]
    appkey = code_with_sign["appkey"]
    sign = code_with_sign["sign"]
    timestamp = code_with_sign["timestamp"]

    # Uniformly build query parameters
    params = []
    if guid:
        params.append(f"guid={guid}")
    params.append(f"appuid={appuid}")
    params.append(f"appkey={appkey}")
    params.append(f"sign={sign}")
    params.append(f"timestamp={timestamp}")

    url += "?" + "&".join(params)

    logger.info(f">>> Fetching upload token from: {url}")
    logger.debug(f">>> Request params: guid={guid}, appuid={appuid}, timestamp={timestamp}")

    headers = {
        "Accept": "application/json"
    }

    try:
        result = make_request("POST", url, headers=headers)
    except Exception as e:
        logger.error(f">>> Failed to fetch upload token")
        logger.error(f">>> Base API Path: {base_api_path}")
        logger.error(f">>> GUID: {guid}")
        logger.error(f">>> Has lux3d_api_key: {bool(lux3d_api_key)}")
        raise

    if result.get("c") != "0":
        error_code = result.get("c", "Unknown")
        error_msg = result.get("m", "Unknown error")
        logger.error(f">>> Token fetch failed: Code={error_code}, Message={error_msg}")
        logger.error(f">>> Full response: {json.dumps(result, ensure_ascii=False)}")
        raise create_error(error_code, error_msg, extra={"response": result})

    # Print result
    logger.info(f">>> upload token Result: {result}")
    data = result.get("d") or {}
    token = data.get("ousToken")
    global_domain = data.get("globalDomain")
    block_size = int(data.get("blockSize") or (5 * 1024 * 1024))  # Default 5MB, consistent with documentation

    if not token or not global_domain:
        logger.error(f">>> Invalid token response: token={'***' if token else None}, domain={global_domain}")
        logger.error(f">>> Full response data: {json.dumps(data, ensure_ascii=False)}")
        raise create_error("InvalidResponse", "Missing ousToken or globalDomain", extra={"response_data": data})

    logger.info(f">>> Token fetched successfully: domain={global_domain}, block_size={block_size}")

    return token, global_domain, block_size


def upload_single_file(
        domain: str,
        md5: str,
        file_path: Path,
        ous_token: str,
        metadata: Optional[Dict[str, Any]] = None,
        custom_prefix: Optional[str] = None,
        custom_filename: Optional[str] = None,
        auto_refresh_token: bool = False,
        refresh_token_fn: Optional[Callable[[], str]] = None
) -> str:
    """
    Single file upload (small files, OUS V2)
    V2 doesn't pass guid in request, bound by Token.

    Returns:
        Task ID (taskId)
    """
    url = f"{domain}{API_ENDPOINTS['single_upload']}"

    with file_path.open("rb") as f:
        files = {"file": (file_path.name, f)}
        data = {"md5": md5}
        if metadata:
            data["metadata"] = json.dumps(metadata)
        if custom_prefix:
            data["customPrefix"] = custom_prefix
        if custom_filename:
            data["customFilename"] = custom_filename

        result = make_request(
            "POST", url,
            headers={OUS_TOKEN_HEADER: ous_token},
            data=data,
            files=files,
            auto_refresh_token=auto_refresh_token,
            refresh_token_fn=refresh_token_fn
        )

    if result.get("c") == "0":
        d = result.get("d") or {}
        task_id = d.get("taskId") or d.get("obsTaskId")
        if task_id:
            return task_id

    raise create_error(result.get("c"), result.get("m"))


def init_multipart_upload(
        domain: str,
        md5: str,
        total_blocks: int,
        file_size: int,
        filename: str,
        ous_token: str,
        metadata: Optional[Dict[str, Any]] = None,
        custom_prefix: Optional[str] = None,
        custom_filename: Optional[str] = None,
        auto_refresh_token: bool = False,
        refresh_token_fn: Optional[Callable[[], str]] = None
) -> str:
    """
    Initialize multipart upload (OUS V2)
    V2 doesn't pass guid in request, bound by Token. Response returns taskId.

    Returns:
        Task ID (taskId)
    """
    url = f"{domain}{API_ENDPOINTS['multipart_init']}"

    data = {
        "md5": md5,
        "blocks": str(total_blocks),
        "size": str(file_size),
        "name": filename,
    }
    if metadata:
        data["metadata"] = json.dumps(metadata)
    if custom_prefix:
        data["customPrefix"] = custom_prefix
    if custom_filename:
        data["customFilename"] = custom_filename

    result = make_request(
        "POST", url,
        headers={OUS_TOKEN_HEADER: ous_token},
        data=data,
        auto_refresh_token=auto_refresh_token,
        refresh_token_fn=refresh_token_fn
    )

    if result.get("c") == "0":
        d = result.get("d") or {}
        task_id = d.get("taskId") or d.get("obsTaskId")
        if task_id:
            return task_id

    raise create_error(result.get("c"), result.get("m"))


def upload_file_part(
        domain: str,
        part_index: int,
        part_data: bytes,
        part_filename: str,
        ous_token: str,
        auto_refresh_token: bool = False,
        refresh_token_fn: Optional[Callable[[], str]] = None
):
    """
    Upload single chunk (OUS V2, from memory)
    V2 doesn't pass guid/obstaskid, bound by Token; block is chunk index, starting from 1.

    Args:
        part_index: Chunk index (starting from 1)
        part_data: Chunk binary data
        part_filename: Chunk filename (for identification)
    """
    url = f"{domain}{API_ENDPOINTS['multipart_upload']}"

    files = {"file": (part_filename, BytesIO(part_data))}
    data = {"block": str(part_index)}

    result = make_request(
        "POST", url,
        headers={OUS_TOKEN_HEADER: ous_token},
        data=data,
        files=files,
        auto_refresh_token=auto_refresh_token,
        refresh_token_fn=refresh_token_fn
    )

    if result.get("c") != "0":
        raise create_error(result.get("c"), result.get("m"))


def poll_upload_status(
        domain: str,
        ous_token: str,
        interval_ms: int = 1000,
        timeout_ms: int = 60000,
        auto_refresh_token: bool = False,
        refresh_token_fn: Optional[Callable[[], str]] = None
) -> Dict[str, Any]:
    """
    Poll query upload status (OUS V2)
    V2 doesn't need to pass taskId, Token already binds task. Polling interval recommended 200ms or above.

    Status codes: 5=success, 6=failed, 8=manually aborted (all final states)
    """
    url = f"{domain}{API_ENDPOINTS['upload_status']}"
    headers = {
        "Content-Type": "application/json",
        OUS_TOKEN_HEADER: ous_token
    }

    start_time = time.time()
    interval_sec = max(interval_ms / 1000.0, 0.2)  # Documentation recommends 200ms or above
    timeout_sec = timeout_ms / 1000.0

    while True:
        result = make_request(
            "GET", url,
            headers=headers,
            auto_refresh_token=auto_refresh_token,
            refresh_token_fn=refresh_token_fn
        )

        if result.get("c") != "0":
            raise create_error(result.get("c"), result.get("m"))

        data = result.get("d") or {}
        status = int(data.get("status", 0))

        # 5=success, 6=failed, 8=manually aborted (final states)
        if status in (5, 6, 8):
            return {
                "c": result.get("c", "0"),
                "m": result.get("m", ""),
                "d": data
            }

        elapsed = time.time() - start_time
        if elapsed >= timeout_sec:
            raise create_error("QueryTimeout", f"Status query timeout ({timeout_ms}ms)")

        time.sleep(interval_sec)


class FilePartition:
    """File chunk management (preload mode)"""

    def __init__(self, file_path: Path, block_size: int):
        self.file_path = file_path
        self.block_size = block_size
        self.file_size = file_path.stat().st_size
        self.total_parts = (self.file_size + block_size - 1) // block_size

        # Preload all chunks to memory
        self.parts_data: List[bytes] = []
        self._load_all_parts()

    def _load_all_parts(self):
        """Load all chunks to memory at once"""
        with self.file_path.open("rb") as f:
            for i in range(self.total_parts):
                start_offset = i * self.block_size
                end_offset = min(start_offset + self.block_size, self.file_size)
                read_size = end_offset - start_offset

                f.seek(start_offset)
                part_data = f.read(read_size)
                self.parts_data.append(part_data)

    def get_part_data(self, part_index: int) -> bytes:
        """
        Get data of specified chunk (numbered from 1)

        Args:
            part_index: Chunk index (1-based)

        Returns:
            Binary data of the chunk
        """
        if part_index < 1 or part_index > self.total_parts:
            raise ValueError(f"Chunk index {part_index} out of range [1, {self.total_parts}]")

        return self.parts_data[part_index - 1]

    def get_part_size(self, part_index: int) -> int:
        """Get chunk size"""
        if part_index < 1 or part_index > self.total_parts:
            raise ValueError(f"Chunk index {part_index} out of range [1, {self.total_parts}]")

        return len(self.parts_data[part_index - 1])


def upload_file(
        guid: str,
        file_path: Path,
        base_api_path: Optional[str] = None,
        refresh_token_fn: Optional[Callable[[], str]] = None,
        chunk_parallel_limit: int = 2,  # V2 recommends no more than 2 concurrent chunks for same file
        chunk_retry_times: int = 3,
        query_interval_ms: int = 1000,
        query_timeout_ms: int = 60000,
        metadata: Optional[Dict[str, Any]] = None,
        on_progress: Optional[Callable[[int, int], None]] = None,
        lux3d_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main file upload function (OUS V2)

    Process:
        1. Get token, global domain and chunk threshold (token response contains blockSize, no need to call chunk rule interface)
        2. Choose single file or multipart upload based on file size
        3. Poll query upload status (V2 binds task by Token, no need to pass taskId)

     Args:
        guid: File unique identifier (only for server-side token generation, not sent to OUS with request)
        file_path: File path
        base_api_path: API base path (used to get token)
        refresh_token_fn: Token refresh callback function
        chunk_parallel_limit: Number of concurrent chunk uploads (V2 recommends no more than 2)
        chunk_retry_times: Number of chunk upload retries
        query_interval_ms: Status query interval (milliseconds, recommended >= 200)
        query_timeout_ms: Status query timeout (milliseconds)
        metadata: File metadata
        on_progress: Progress callback (uploaded bytes, total bytes)
        lux3d_api_key: Invitation code (optional), used for OpenAPI signature

    Returns:
        Final upload status (including url, uploadKey, status, etc.)
    """
    if not file_path.exists():
        raise create_error("FileNotFound", f"File not found: {file_path}")

    file_size = file_path.stat().st_size
    if file_size == 0:
        raise create_error("EmptyFile", "File size is 0")

    logger.info(f">>> Starting upload for file: {file_path.name} (size: {file_size} bytes)")

    # Step 1: Get token, global domain and chunk threshold (V2 returns once, no chunk rule interface needed)
    try:
        logger.info(f">>>  Fetching upload token...")
        ous_token, global_domain, block_size = fetch_token_and_domain(base_api_path, guid=guid,
                                                                      lux3d_api_key=lux3d_api_key)
        logger.info(f">>>  Token fetched successfully")
    except Exception as e:
        logger.error(f">>> Failed to fetch upload token")
        logger.error(f">>> File: {file_path}")
        logger.error(f">>> Base API Path: {base_api_path}")
        logger.error(f">>> GUID: {guid}")
        raise
    upload_domain = global_domain.rstrip("/")
    file_md5 = calculate_file_md5(file_path)
    auto_refresh = bool(refresh_token_fn)

    # Step 2: Single file or multipart upload
    if file_size <= block_size:
        upload_single_file(
            upload_domain, file_md5, file_path, ous_token,
            metadata=metadata,
            auto_refresh_token=auto_refresh,
            refresh_token_fn=refresh_token_fn
        )
        if on_progress:
            on_progress(file_size, file_size)
    else:
        _upload_file_in_parts(
            file_path=file_path,
            file_size=file_size,
            file_md5=file_md5,
            block_size=block_size,
            upload_domain=upload_domain,
            ous_token=ous_token,
            metadata=metadata,
            parallel_limit=chunk_parallel_limit,
            retry_times=chunk_retry_times,
            auto_refresh=auto_refresh,
            refresh_token_fn=refresh_token_fn,
            on_progress=on_progress
        )

    # Step 3: Poll status (V2 doesn't need taskId, Token already binds)
    final_status = poll_upload_status(
        upload_domain, ous_token,
        interval_ms=query_interval_ms,
        timeout_ms=query_timeout_ms,
        auto_refresh_token=auto_refresh,
        refresh_token_fn=refresh_token_fn
    )

    return final_status


def _upload_file_in_parts(
        file_path: Path,
        file_size: int,
        file_md5: str,
        block_size: int,
        upload_domain: str,
        ous_token: str,
        metadata: Optional[Dict[str, Any]],
        parallel_limit: int,
        retry_times: int,
        auto_refresh: bool,
        refresh_token_fn: Optional[Callable[[], str]],
        on_progress: Optional[Callable[[int, int], None]]
) -> None:
    """
    Multipart upload implementation (OUS V2, internal function)
    V2 chunk index starts from 1; Token binds task, no need to pass guid/taskId in part request.
    """
    partition = FilePartition(file_path, block_size)
    total_parts = partition.total_parts

    init_multipart_upload(
        upload_domain, file_md5,
        total_parts, file_size, file_path.name,
        ous_token,
        metadata=metadata,
        auto_refresh_token=auto_refresh,
        refresh_token_fn=refresh_token_fn
    )

    uploaded_bytes = 0
    upload_lock = __import__('threading').Lock()

    def upload_single_part(part_index: int):
        """Upload single chunk (V2 block starts from 1, with retry)"""
        nonlocal uploaded_bytes
        part_size = partition.get_part_size(part_index)
        part_filename = f"{file_path.name}.part-{part_index}"

        for attempt in range(retry_times):
            try:
                part_data = partition.get_part_data(part_index)
                upload_file_part(
                    upload_domain,
                    part_index,
                    part_data,
                    part_filename,
                    ous_token,
                    auto_refresh_token=auto_refresh,
                    refresh_token_fn=refresh_token_fn
                )
                with upload_lock:
                    uploaded_bytes += part_size
                    if on_progress:
                        on_progress(uploaded_bytes, file_size)
                return
            except Exception as e:
                if attempt == retry_times - 1:
                    raise create_error(
                        "PartUploadFailed",
                        f"Chunk {part_index} upload failed: {str(e)}",
                        cause=e
                    )
                time.sleep(0.5 * (attempt + 1))

    with ThreadPoolExecutor(max_workers=parallel_limit) as executor:
        futures = [
            executor.submit(upload_single_part, i)
            for i in range(1, total_parts + 1)
        ]
        for future in as_completed(futures):
            exc = future.exception()
            if exc:
                raise exc
