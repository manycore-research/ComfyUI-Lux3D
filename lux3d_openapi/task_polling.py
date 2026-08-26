"""Shared polling for Lux3D asynchronous OpenAPI tasks."""

from __future__ import annotations

import json
import time
from typing import Any, List, Mapping, Tuple

from .contracts import (
    extract_output_contents,
    normalize_task_id,
    parse_task_data,
    validate_public_url,
)


# HTTP calls use a bounded request timeout. Task completion has a separate,
# longer deadline because generation/export operations are asynchronous.
HTTP_TIMEOUT_SECONDS = 30
POLL_INTERVAL_SECONDS = 15.0
MAX_POLL_ATTEMPTS = 60
POLL_TIMEOUT_SECONDS = 900.0


def _task_failure_detail(
    response: Mapping[str, Any], data: Mapping[str, Any]
) -> str:
    for value in (
        response.get("m"),
        data.get("message"),
        data.get("errorMessage"),
        data.get("error"),
    ):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def wait_for_task_result(
    client: Any,
    task_id: Any,
    *,
    poll_interval: float = POLL_INTERVAL_SECONDS,
    max_attempts: int = MAX_POLL_ATTEMPTS,
    poll_timeout: float = POLL_TIMEOUT_SECONDS,
    expected_output_count: int | None = None,
    require_json_array_content: bool = False,
) -> Tuple[Mapping[str, Any], List[str]]:
    """Poll ``get_task`` until success and return its final response + URLs.

    Public task statuses are 0 (initialized), 1 (running), 3 (succeeded),
    4 (failed), and 6 (cancelled). The first lookup is immediate and the last
    attempt never sleeps, giving 60 status checks over roughly 15 minutes.
    """

    normalized_task_id = normalize_task_id(task_id)
    if isinstance(poll_interval, bool) or float(poll_interval) <= 0:
        raise ValueError("poll_interval must be greater than zero")
    if isinstance(max_attempts, bool) or int(max_attempts) < 1:
        raise ValueError("max_attempts must be at least one")
    if isinstance(poll_timeout, bool) or float(poll_timeout) <= 0:
        raise ValueError("poll_timeout must be greater than zero")
    if expected_output_count is not None and (
        isinstance(expected_output_count, bool) or expected_output_count < 1
    ):
        raise ValueError("expected_output_count must be at least one")

    deadline = time.monotonic() + float(poll_timeout)
    for attempt in range(int(max_attempts)):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(
                f"Lux3D task {normalized_task_id} timed out after "
                f"{float(poll_timeout):g} seconds"
            )

        # Keep each GET within both the normal 30-second HTTP bound and the
        # remaining task deadline. Lux3DOpenAPIClient exposes this value for
        # requests; mocks/alternate clients without a numeric timeout are left
        # unchanged.
        original_http_timeout = getattr(client, "timeout", None)
        adjust_http_timeout = type(original_http_timeout) in (int, float)
        if adjust_http_timeout:
            client.timeout = max(
                0.001,
                min(float(HTTP_TIMEOUT_SECONDS), float(remaining)),
            )
        try:
            response = client.get_task(normalized_task_id)
        finally:
            if adjust_http_timeout:
                client.timeout = original_http_timeout

        if time.monotonic() > deadline:
            raise TimeoutError(
                f"Lux3D task {normalized_task_id} timed out after "
                f"{float(poll_timeout):g} seconds"
            )
        if not isinstance(response, Mapping):
            raise RuntimeError(
                f"Lux3D task {normalized_task_id} returned an invalid response"
            )
        data = parse_task_data(response)
        response_task_id = normalize_task_id(data.get("taskId"))
        if response_task_id != normalized_task_id:
            raise RuntimeError(
                "Lux3D task lookup returned a different task ID: "
                f"expected {normalized_task_id}, got {response_task_id}"
            )

        status = data["status"]
        if status == 3:
            outputs = data.get("outputs", [])
            if require_json_array_content:
                if len(outputs) != 1 or not isinstance(outputs[0], Mapping):
                    raise RuntimeError(
                        f"Lux3D task {normalized_task_id} must return one "
                        "four-view output object containing a JSON array string"
                    )
                content = outputs[0].get("content")
                if not isinstance(content, str):
                    raise RuntimeError(
                        f"Lux3D task {normalized_task_id} four-view content "
                        "must be a JSON array string"
                    )
                try:
                    parsed_content = json.loads(content)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(
                        f"Lux3D task {normalized_task_id} four-view content "
                        "must be a JSON array string"
                    ) from exc
                if not isinstance(parsed_content, list) or not all(
                    isinstance(value, str) for value in parsed_content
                ):
                    raise RuntimeError(
                        f"Lux3D task {normalized_task_id} four-view content "
                        "must contain only URL strings"
                    )
                raw_urls = parsed_content
            else:
                raw_urls = extract_output_contents(outputs)
                raw_urls = [
                    value
                    for value in raw_urls
                    if value.strip().upper() != "NOT_REQUESTED"
                ]
            if not raw_urls:
                raise RuntimeError(
                    f"Lux3D task {normalized_task_id} succeeded without outputs"
                )
            urls = [
                validate_public_url(value, "task output") for value in raw_urls
            ]
            if (
                expected_output_count is not None
                and len(urls) != expected_output_count
            ):
                raise RuntimeError(
                    f"Lux3D task {normalized_task_id} returned {len(urls)} "
                    f"output URLs; expected {expected_output_count}"
                )
            return response, urls

        if status in (4, 6):
            state = "failed" if status == 4 else "cancelled"
            detail = _task_failure_detail(response, data)
            suffix = f": {detail}" if detail else ""
            raise RuntimeError(
                f"Lux3D task {normalized_task_id} {state} "
                f"(status={status}){suffix}"
            )

        # parse_task_data has already rejected every status except 0/1/3/4/6.
        if attempt < int(max_attempts) - 1:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(
                    f"Lux3D task {normalized_task_id} timed out after "
                    f"{float(poll_timeout):g} seconds"
                )
            time.sleep(min(float(poll_interval), remaining))

    raise TimeoutError(
        f"Lux3D task {normalized_task_id} did not finish after "
        f"{int(max_attempts)} status checks"
    )


__all__ = [
    "HTTP_TIMEOUT_SECONDS",
    "MAX_POLL_ATTEMPTS",
    "POLL_INTERVAL_SECONDS",
    "POLL_TIMEOUT_SECONDS",
    "wait_for_task_result",
]
