import time
import requests
import json
from typing import Optional, Dict
from ..sso.sso_token import load_config, generate_sign_by_lux3d_code

def build_render_design_and_poll(
        base_url: str,
        url_map: Optional[Dict[str, str]] = None,  # [Modified] Changed to url_map
        base_render_design_id: Optional[str] = None,  # [Added] New base id
        poll_interval: int = 2,
        timeout: int = 120,
        cookies: Optional[dict] = None,
        lux3d_api_key: Optional[str] = None,
) -> str:
    """
    Request to create RenderDesign and poll for results.
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

    create_url = f"{base_url}/global/luxrealengine/renderdesign/create?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"
    poll_url = f"{base_url}/global/luxrealengine/renderdesign/poll?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

    headers = {
        "Accept": "application/json",
        "User-Agent": "python-client",
    }

    # Construct request parameters
    data_payload = {}

    # Build urlMap JSON string
    if url_map:
        data_payload['urlMap'] = json.dumps(url_map)

    # Pass baseObsRenderDesignId
    if base_render_design_id:
        data_payload['baseObsRenderDesignId'] = base_render_design_id

    print(f"Requesting creation: {create_url} with params: {data_payload}")

    # Initiate request (Java interface uses @RequestParam, requests data parameter defaults to form-urlencoded, meeting requirements)
    resp = requests.post(
        create_url,
        data=data_payload,
        headers=headers,
        cookies=cookies,
        timeout=30
    )
    resp.raise_for_status()
    resp_data = resp.json()

    if str(resp_data.get("c")) != "0":
        raise RuntimeError(f"Create request failed. API Response: {resp_data}")

    task_id = resp_data.get("d")
    if not task_id:
        raise RuntimeError("API returned success but taskId is missing.")

    print(f"Task created successfully. TaskId: {task_id}")

    # 4. Poll for results
    start_time = time.time()
    while True:
        if time.time() - start_time > timeout:
            raise TimeoutError(f"Polling timeout after {timeout}s. TaskId: {task_id}")
        time.sleep(poll_interval)
        try:
            # Need to regenerate signature during polling (timestamp changes)
            code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
            appuid = code_with_sign["appuid"]
            appkey = code_with_sign["appkey"]
            sign = code_with_sign["sign"]
            timestamp = code_with_sign["timestamp"]
            poll_url_with_sign = f"{base_url}/global/luxrealengine/renderdesign/poll?taskId={task_id}&appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

            poll_resp = requests.get(
                poll_url_with_sign,
                headers=headers,
                cookies=cookies,
                timeout=10
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()
            code = str(poll_data.get("c"))

            if code == "0":
                result_design_id = poll_data.get("d")
                print(f"Task completed. Result ID: {result_design_id}")
                return result_design_id
            elif code == "3001":
                continue
            elif code == "3002":
                msg = poll_data.get('m', 'task failed')
                raise RuntimeError(f"Task failed with code 3002: {msg}")
            else:
                raise RuntimeError(f"Unknown status code: {code}, Response: {poll_data}")
        except requests.RequestException as e:
            print(f"Network error during polling: {e}")
            raise e


def update_render_design_and_poll(
        base_url: str,
        obs_render_design_id: str,
        url_map: Optional[Dict[str, str]] = None,
        poll_interval: int = 2,
        timeout: int = 120,
        cookies: Optional[dict] = None,
        lux3d_api_key: Optional[str] = None,
) -> str:
    """
    Request to update RenderDesign and poll for results.
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

    replace_url = f"{base_url}/global/luxrealengine/model/replace?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"
    poll_url = f"{base_url}/global/luxrealengine/model/replace/status?appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

    headers = {
        "Accept": "application/json",
        "User-Agent": "python-client",
    }

    # Construct request parameters
    params = {}

    # Pass baseObsRenderDesignId
    params['baseObsRenderDesignId'] = obs_render_design_id

    # Build urlMap JSON string
    if url_map:
        params['urlMap'] = json.dumps(url_map)

    print(f"Requesting update: {replace_url} with params: {params}")

    # Initiate update request
    resp = requests.post(
        replace_url,
        params=params,
        headers=headers,
        cookies=cookies,
        timeout=30
    )
    resp.raise_for_status()
    resp_data = resp.json()

    if str(resp_data.get("c")) != "0":
        raise RuntimeError(f"Update request failed. API Response: {resp_data}")

    task_id = resp_data.get("d")
    if not task_id:
        raise RuntimeError("API returned success but taskId is missing.")

    print(f"Update task created successfully. TaskId: {task_id}")

    # Poll for results
    start_time = time.time()
    while True:
        if time.time() - start_time > timeout:
            raise TimeoutError(f"Polling timeout after {timeout}s. TaskId: {task_id}")
        time.sleep(poll_interval)
        try:
            # Need to regenerate signature during polling (timestamp changes)
            code_with_sign = generate_sign_by_lux3d_code(lux3d_code)
            appuid = code_with_sign["appuid"]
            appkey = code_with_sign["appkey"]
            sign = code_with_sign["sign"]
            timestamp = code_with_sign["timestamp"]
            poll_url_with_sign = f"{base_url}/global/luxrealengine/model/replace/status?taskId={task_id}&appuid={appuid}&appkey={appkey}&sign={sign}&timestamp={timestamp}"

            poll_resp = requests.get(
                poll_url_with_sign,
                headers=headers,
                cookies=cookies,
                timeout=10
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()
            code = str(poll_data.get("c"))

            if code == "0":
                print(f"Update task completed. Design ID: {obs_render_design_id}")
                return obs_render_design_id
            elif code == "3001":
                continue
            elif code == "3002":
                msg = poll_data.get('m', 'update task failed')
                raise RuntimeError(f"Update task failed with code 3002: {msg}")
            else:
                raise RuntimeError(f"Unknown status code: {code}, Response: {poll_data}")
        except requests.RequestException as e:
            print(f"Network error during polling: {e}")
            raise e
