import json
import os
import re
import time
from typing import Any, Dict, Optional

import requests


DEFAULT_TIMEOUT = 20
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
}
DEFAULT_BASE_URL = os.getenv("WAIZAO_BASE_URL", "http://api.waizaowang.com/doc").rstrip("/")


def get_token() -> Optional[str]:
    token = os.getenv("WAIZAO_TOKEN", "").strip()
    return token or None


def is_configured() -> bool:
    return bool(get_token())


def request_api(endpoint: str, params: Dict[str, Any], method: str = "post") -> Dict[str, Any]:
    token = get_token()
    if not token:
        raise ValueError("WAIZAO_TOKEN is not configured.")

    payload = {key: value for key, value in params.items() if value not in (None, "")}
    payload["token"] = token
    payload.setdefault("fields", "all")
    payload["export"] = 1
    payload.setdefault("filter", "")

    url = f"{DEFAULT_BASE_URL}/{endpoint}"
    response = (
        requests.get(url, params=payload, headers=DEFAULT_HEADERS, timeout=DEFAULT_TIMEOUT)
        if method.lower() == "get"
        else requests.post(url, params=payload, headers=DEFAULT_HEADERS, timeout=DEFAULT_TIMEOUT)
    )
    response.raise_for_status()
    parsed = parse_response_body(response.text)

    return {
        "endpoint": endpoint,
        "request": {k: v for k, v in payload.items() if k != "token"},
        "source": "waizaowang.api",
        "data": parsed,
        "raw": response.text if not isinstance(parsed, (dict, list)) else None,
    }


def parse_response_body(text: str) -> Any:
    cleaned = text.strip()
    if not cleaned:
        return ""

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return cleaned


def get_pankou(codes: str) -> Dict[str, Any]:
    root_url = f"https://hq.sinajs.cn/rn={int(time.time() * 1000)}&list={codes}"
    response = requests.get(
        root_url,
        headers={
            **DEFAULT_HEADERS,
            "Host": "hq.sinajs.cn",
            "Referer": "https://finance.sina.com.cn/",
        },
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    text = response.content.decode("GBK")
    rows = re.findall(r'="(.*?)";', text)
    data = []
    for index, row in enumerate(rows):
        if len(row) <= 1:
            continue
        parts = row.split(",")
        data.append(
            {
                "symbol": codes.split(",")[index] if index < len(codes.split(",")) else None,
                "name": parts[0] if parts else "",
                "raw_fields": parts[:33],
            }
        )

    return {
        "endpoint": "get_pankou",
        "request": {"code": codes},
        "source": "sina.spider",
        "data": data,
        "raw": None,
    }
