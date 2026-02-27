import time
import requests
import logging
from ..sso.sso_token import load_config, generate_sign_by_lux3d_code

logger = logging.getLogger("LuxRealEngine")


def render_and_poll(
        base_url: str,
        obs_render_design_id: str,
        resolution=None,
        ratio=None,
        poll_interval: int = 2,
        timeout: int = 600,
        cookies: dict | None = None,
        lux3d_api_key: str | None = None,
):
    """
    :param base_url: e.g. http://localhost:9020
    :param obs_render_design_id: Design ID
    :param resolution: Resolution
    :param ratio: Aspect ratio
    :param poll_interval: Polling interval (seconds)
    :param timeout: Timeout (seconds)
    :param cookies: Optional cookies
    :param lux3d_api_key: Invitation code (optional), used for OpenAPI signature
    """
    # Get OpenAPI signature parameters
    lux3d_code = load_config(lux3d_api_key=lux3d_api_key if lux3d_api_key else None)
    if not lux3d_code.get("ak") or not lux3d_code.get("sk") or not lux3d_code.get("appuid"):
        raise RuntimeError(
            "Missing ak/sk/appuid configuration, please provide invitation code or configure config.txt file")

    code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
    appuid = code_with_sign["appuid"]
    appkey = code_with_sign["appkey"]
    sign = code_with_sign["sign"]
    timestamp = code_with_sign["timestamp"]

    render_url = f"{base_url}/global/luxrealengine/render?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"
    poll_url = f"{base_url}/global/luxrealengine/render/status?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "python-client",
    }

    payload = {
        "baseObsRenderDesignId": obs_render_design_id,
    }

    if resolution is not None:
        payload["resolution"] = resolution
    if ratio is not None:
        payload["ratio"] = ratio

    # 1️⃣ Initiate rendering
    resp = requests.post(
        render_url,
        json=payload,
        headers=headers,
        cookies=cookies,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    if str(data.get("c")) != "0":
        raise RuntimeError(f"Render request failed: {data}")

    task_id = data["d"]
    logger.info(f">>> Render task created, taskId: {task_id}")
    start_time = time.time()

    # 2️⃣ Polling
    while True:
        if time.time() - start_time > timeout:
            raise TimeoutError(f"Render polling timeout: {task_id}")

        time.sleep(poll_interval)

        # Need to regenerate signature during polling (timestamp changes)
        code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
        appuid = code_with_sign["appuid"]
        appkey = code_with_sign["appkey"]
        sign = code_with_sign["sign"]
        timestamp = code_with_sign["timestamp"]
        poll_url_with_sign = f"{base_url}/global/luxrealengine/render/status?taskId={task_id}&appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

        poll_resp = requests.get(
            poll_url_with_sign,
            headers=headers,
            cookies=cookies,
            timeout=10,
        )
        poll_resp.raise_for_status()
        poll_data = poll_resp.json()

        code = str(poll_data.get("c"))

        if code == "0":
            return poll_data["d"]

        if code == "3001":
            continue

        if code == "3002":
            raise RuntimeError(f"Render failed: {poll_data}")

        raise RuntimeError(f"Unknown status code: {poll_data}")
