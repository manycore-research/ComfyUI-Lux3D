# -*- coding: utf-8 -*-
"""
Read ak/sk/appuid from config.txt and call Kujiale OpenAPI to obtain SSO token.
Request method is consistent with Java example: URL Query parameters + MD5 signature, POST empty body.
Support parsing configuration from invitation code (lux3d_api_key), prioritize node input, otherwise read from local file.
"""
import os
import time
import logging
import hashlib
import urllib.parse
import requests
from .invitation_code import parse_invitation_code, InvitationCodeError

logger = logging.getLogger("LuxRealEngine")

# Current file directory (sso/), parent directory is comfyui-lux3d
_PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(os.path.dirname(_PACKAGE_DIR), "config.txt")
SSO_TOKEN_URL = "https://openapi.kujiale.com/v2/sso/token"


def load_config(lux3d_api_key=None):
    """
    Load configuration, prioritize invitation code (lux3d_api_key), otherwise read from local file.

    Args:
        lux3d_api_key: Optional invitation code string (Base64 encoded), if provided will be parsed and used first

    Returns:
        dict {"ak": str, "sk": str, "appuid": str}, missing items are None.
    """
    result = {"ak": None, "sk": None, "appuid": None}

    # Prioritize parsing from invitation code
    if lux3d_api_key and lux3d_api_key.strip():
        try:
            parsed = parse_invitation_code(lux3d_api_key.strip())
            result["ak"] = parsed.get("ak")
            result["sk"] = parsed.get("sk")
            result["appuid"] = parsed.get("appuid")
            logger.info(">>> Successfully parsed configuration from invitation code")
            return result
        except InvitationCodeError as e:
            logger.warning(f"Invitation code parsing failed: {e}, will try reading from local file")
        except Exception as e:
            logger.warning(f"Invitation code parsing exception: {e}, will try reading from local file")

    # If invitation code parsing fails or not provided, read from local file (file content may also be invitation code)
    if not os.path.isfile(CONFIG_PATH):
        logger.warning(f"config.txt not found: {CONFIG_PATH}")
        return result
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f]
        # First try to parse file content as invitation code (take first non-empty, non-comment line)
        for line in lines:
            if line and not line.startswith("#"):
                try:
                    if "=" in line:
                        key, _, value = line.partition("=")
                        key = key.strip().lower()
                        if key == "lux3d_api_key":
                            value = value.strip()
                            parsed = parse_invitation_code(value)
                            result["ak"] = parsed.get("ak")
                            result["sk"] = parsed.get("sk")
                            result["appuid"] = parsed.get("appuid")
                            logger.info(f">>> Successfully parsed configuration from local file invitation code {line}")
                            return result
                except (InvitationCodeError, Exception):
                    break
        # If not invitation code, parse as key=value
        for line in lines:
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                key = key.strip().lower()
                value = value.strip()
                if key in result:
                    result[key] = value
        logger.info(">>> Read configuration from local file")
        # Check if result has all values, not None
        if not all(result.values()):
            logger.warning(f"Failed to parse configuration from local file invitation code")
    except Exception as e:
        logger.warning(f"Failed to read config.txt: {e}")
    return result


def _md5_sign(app_secret, app_key, appuid, timestamp):
    """
    sign = md5(appSecret + appkey + appuid + timestamp)
    """
    raw = app_secret + app_key + appuid + str(timestamp)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def fetch_sso_token(ak, sk, appuid):
    """
    Call Kujiale OpenAPI https://openapi.kujiale.com/v2/sso/token to obtain token.
    Consistent with Java doRequest: URL Path/Query parameter authentication, POST method, Content-Type: application/json.
    Input parameters: ak(appkey), sk(appSecret), appuid (all strings).
    Returns: token string, returns None on failure.
    """
    if not ak or not sk or not appuid:
        logger.warning("fetch_sso_token: ak/sk/appuid missing, skip token request")
        return None
    try:
        timestamp = int(time.time() * 1000)
        sign = _md5_sign(sk, ak, appuid, timestamp)
        query = {
            "appuid": appuid,
            "dest": 0,
            "appkey": ak,
            "timestamp": timestamp,
            "sign": sign,
        }
        url = SSO_TOKEN_URL + "?" + urllib.parse.urlencode(query)
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json;charset=utf-8"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        # Compatible with multiple response formats: data.token / token / d (some Kujiale interfaces use c/d/m)
        token = (data.get("data") or {}).get("token") or data.get("token") or data.get("d")
        if token:
            logger.info(">>> SSO token obtained successfully")
            return token
        logger.warning(f"SSO token response missing token field: {data}")
        return None
    except requests.RequestException as e:
        logger.warning(f"SSO token request failed: {e}")
        return None
    except Exception as e:
        logger.warning(f"SSO token parse error: {e}")
        return None


def get_sso_token(lux3d_api_key=None):
    """
    Read config and obtain SSO token. Called by LuxRealEngine before sending iframe updates.

    Args:
        lux3d_api_key: Optional invitation code string (Base64 encoded), if provided will be parsed and used first

    Returns: token string or None.
    """
    cfg = load_config(lux3d_api_key)
    return fetch_sso_token(cfg.get("ak"), cfg.get("sk"), cfg.get("appuid"))


def test_get_sso_token():
    """
    Test get_sso_token: read config, request SSO token and print results.
    Returns: True indicates token obtained, False indicates failure.
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    cfg = load_config()
    print("Config:", {k: (v[:4] + "..." if v and len(v) > 4 else (v or "(empty)")) for k, v in cfg.items()})
    if not all(cfg.values()):
        print("FAIL: ak/sk/appuid not configured completely, please check config.txt")
        return False
    token = get_sso_token()
    if token:
        print("OK: token obtained successfully, length =", len(token))
        return True
    print("FAIL: failed to obtain token, please check network and Kujiale interface")
    return False


def generate_sign_by_lux3d_code(lux3d_code):
    # Interface request parameter: timestamp
    timestamp = str(int(round(time.time() * 1000)))
    # Interface request parameter: appKey
    appKey = lux3d_code['ak']
    # Interface request parameter: appSecret
    appSecret = lux3d_code['sk']
    appuid = lux3d_code['appuid']
    sign_string = appSecret + appKey + appuid + timestamp
    # MD5 signature
    a = hashlib.md5()
    a.update(sign_string.encode(encoding='utf-8'))
    sign = a.hexdigest()
    return {
        'appkey': appKey,
        'appuid': appuid,
        'timestamp': timestamp,
        'sign': sign
    }


if __name__ == "__main__":
    ok = test_get_sso_token()
    exit(0 if ok else 1)
