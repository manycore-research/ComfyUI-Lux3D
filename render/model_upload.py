"""Model upload module, handling hunyuan3 model file upload and caching logic"""

from pathlib import Path
from typing import Dict, Optional, Tuple
import json
import logging
import time
import traceback

from ..upload.upload import upload_file

logger = logging.getLogger("LuxRealEngine")

# Upload cache validity period: 2 days (seconds)
CACHE_TTL_SECONDS = 2 * 24 * 60 * 60
# Key for "by path" mapping in cache JSON
CACHE_KEY_BY_PATH = "by_path"


def upload_models_with_cache(
    file_paths: Dict[str, Optional[str]],
    upload_cache: str,
    base_api_path: str,
    lux3d_api_key: Optional[str] = None,
) -> Tuple[Dict[str, str], str]:
    """
    Handle model upload with caching support to avoid duplicate uploads.
    Cache is stored by path, same file can be reused regardless of slot position or deletion and re-addition, no need to re-upload.
    Cache validity period is 2 days, will re-upload after expiration.

    Args:
        file_paths: Mapping from field name to local path, e.g. {"file_input_1": "/path/to/file"}
        upload_cache: JSON formatted cache string, format: {"by_path": {"path": {"url": "...", "ts": timestamp}, ...}}
        base_api_path: API base path
        lux3d_api_key: Invitation code (optional), used for OpenAPI signature

    Returns:
        Tuple[uploaded_urls, new_cache_json]:
            - uploaded_urls: Mapping from field name to uploaded URL
            - new_cache_json: Updated cache JSON string (stored by path, includes timestamp)
    """
    now = time.time()

    def _is_valid_entry(entry) -> Optional[str]:
        """Extract url from cache entry, return None if expired or incorrect format."""
        if isinstance(entry, dict) and "url" in entry and "ts" in entry:
            if (now - entry["ts"]) < CACHE_TTL_SECONDS:
                return entry["url"]
        return None

    # Parse upload cache: by path -> {url, ts}
    path_cache = {}
    if upload_cache and upload_cache != "{}":
        try:
            raw = json.loads(upload_cache)
            if isinstance(raw.get(CACHE_KEY_BY_PATH), dict):
                for path, val in raw[CACHE_KEY_BY_PATH].items():
                    url = _is_valid_entry(val)
                    if url:
                        path_cache[path] = {"url": url, "ts": val["ts"]}
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Failed to parse upload_cache: {upload_cache}")
            path_cache = {}

    uploaded_urls = {}

    for field_name, current_path in file_paths.items():
        if not current_path:
            continue

        cached_url = _is_valid_entry(path_cache.get(current_path))

        if cached_url:
            logger.info(f">>> Skip upload for {field_name}, using cached URL {cached_url}")
            uploaded_url = cached_url
        else:
            logger.info(f">>> Uploading {field_name}: {current_path}")
            try:
                file_path = Path(current_path)
                if not file_path.exists():
                    logger.error(f"File not found: {current_path}")
                    continue

                result = upload_file(
                    guid="comfyui-model-upload",
                    file_path=file_path,
                    base_api_path=base_api_path,
                    lux3d_api_key=lux3d_api_key,
                    on_progress=lambda current, total: logger.debug(
                        f"Upload progress: {current}/{total} ({current*100//total}%)"
                    )
                )

                # Extract url from response result
                uploaded_url = result.get("d", {}).get("url")
                if not uploaded_url:
                    logger.error(f"Upload failed for {field_name}, no URL in response: {result}")
                    continue

                logger.info(f">>> Upload success for {field_name}: {uploaded_url}")
                path_cache[current_path] = {"url": uploaded_url, "ts": time.time()}

            except Exception as e:
                logger.error(f">>> Upload failed for {field_name}: {current_path}")
                logger.error(f">>> Error Type: {type(e).__name__}")
                logger.error(f">>> Error Message: {str(e)}")

                # If it's UploadError, record detailed information
                if hasattr(e, 'code') and hasattr(e, 'message'):
                    logger.error(f">>> Error Code: {e.code}")
                    logger.error(f">>> Error Message: {e.message}")
                    if hasattr(e, 'extra') and e.extra:
                        logger.error(f">>> Error Extra Info: {json.dumps(e.extra, ensure_ascii=False)}")

                # Record stack trace
                logger.error(f">>> Traceback:\n{traceback.format_exc()}")
                continue

        uploaded_urls[field_name] = uploaded_url

    # Only persist unexpired entries
    by_path_out = {
        path: val
        for path, val in path_cache.items()
        if isinstance(val, dict) and "ts" in val and (now - val["ts"]) < CACHE_TTL_SECONDS
    }
    return uploaded_urls, json.dumps({CACHE_KEY_BY_PATH: by_path_out})
