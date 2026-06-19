import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import akshare as ak
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

import waizao_client


def load_local_env() -> None:
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


load_local_env()


APP_NAME = "SummerMax Quant Alpha API"
APP_VERSION = "0.2.1"
DEFAULT_LLM_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
SHANGHAI_TZ = timezone(timedelta(hours=8))
NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

app = FastAPI(
    title=APP_NAME,
    description="Realtime A-share quote analysis API with rule-based and GPT-ready interpretation.",
    version=APP_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.path.isdir(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.middleware("http")
async def disable_frontend_caching(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in {"/", "/workspace", "/debug", "/scan"} or path.startswith("/app/"):
        for key, value in NO_CACHE_HEADERS.items():
            response.headers[key] = value
    return response

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
}
STOCK_UNIVERSE_CACHE: Dict[str, Any] = {
    "data": None,
    "loaded_at": None,
}
STOCK_UNIVERSE_TTL = timedelta(minutes=30)

# Per-code caches to avoid redundant AKShare + LLM calls
HISTORY_CACHE: Dict[str, Any] = {}
HISTORY_CACHE_TTL = timedelta(minutes=5)
SNAPSHOT_BASE_CACHE: Dict[str, Any] = {}
SNAPSHOT_BASE_CACHE_TTL = timedelta(minutes=3)
CURATED_FOCUS_LIST = [
    {"code": "600519", "name": "贵州茅台"},
    {"code": "300750", "name": "宁德时代"},
    {"code": "000858", "name": "五粮液"},
    {"code": "601318", "name": "中国平安"},
    {"code": "600036", "name": "招商银行"},
    {"code": "300059", "name": "东方财富"},
    {"code": "601012", "name": "隆基绿能"},
    {"code": "002594", "name": "比亚迪"},
]


def get_openai_client() -> Optional[OpenAI]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    base_url = os.getenv("OPENAI_BASE_URL")
    if base_url:
        return OpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key)


def normalize_history_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        raise ValueError("No historical stock data returned from data source.")

    if "date" not in df.columns and "日期" not in df.columns:
        df = df.reset_index()

    renamed = df.rename(
        columns={
            "日期": "date",
            "开盘": "open",
            "最高": "high",
            "最低": "low",
            "收盘": "close",
            "成交量": "volume",
            "date": "date",
            "open": "open",
            "high": "high",
            "low": "low",
            "close": "close",
            "volume": "volume",
            "index": "date",
        }
    )

    required = {"date", "close", "volume"}
    if not required.issubset(renamed.columns):
        raise ValueError("Unexpected historical data format returned from AKShare.")

    normalized = renamed.copy()
    normalized = normalized.loc[:, [column for column in ["date", "open", "high", "low", "close", "volume"] if column in normalized.columns]]
    normalized["date"] = pd.to_datetime(normalized["date"])
    for field in ["open", "high", "low", "close", "volume"]:
        if field in normalized.columns:
            normalized[field] = pd.to_numeric(normalized[field], errors="coerce")

    if "open" not in normalized.columns:
        normalized["open"] = normalized["close"]
    if "high" not in normalized.columns:
        normalized["high"] = normalized["close"]
    if "low" not in normalized.columns:
        normalized["low"] = normalized["close"]
    normalized = normalized.dropna(subset=["date", "open", "high", "low", "close", "volume"]).sort_values("date")

    if normalized.empty:
        raise ValueError("Historical stock data is empty after normalization.")

    return normalized


def to_market_symbol(code: str) -> str:
    if code.startswith(("4", "8")):
        return f"bj{code}"
    if code.startswith(("5", "6", "9")):
        return f"sh{code}"
    return f"sz{code}"


def to_secid(code: str) -> str:
    if code.startswith(("5", "6", "9")):
        return f"1.{code}"
    return f"0.{code}"


def fetch_stock_history_from_em(code: str, start_date: datetime, end_date: datetime) -> pd.DataFrame:
    raw_df = ak.stock_zh_a_hist(
        symbol=code,
        period="daily",
        start_date=start_date.strftime("%Y%m%d"),
        end_date=end_date.strftime("%Y%m%d"),
        adjust="qfq",
    )
    return normalize_history_dataframe(raw_df)


def fetch_stock_history_from_sina(code: str, start_date: datetime, end_date: datetime) -> pd.DataFrame:
    raw_df = ak.stock_zh_a_daily(
        symbol=to_market_symbol(code),
        start_date=start_date.strftime("%Y%m%d"),
        end_date=end_date.strftime("%Y%m%d"),
        adjust="qfq",
    )
    return normalize_history_dataframe(raw_df)


def normalize_waizao_history_payload(payload: Any) -> pd.DataFrame:
    if isinstance(payload, dict):
        for key in ("data", "list", "rows", "result"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break

    if not isinstance(payload, list) or not payload:
        raise ValueError("Unexpected Waizao history payload.")

    df = pd.DataFrame(payload)
    renamed = df.rename(
        columns={
            "date": "date",
            "tradeDate": "date",
            "day": "date",
            "openPrice": "open",
            "open": "open",
            "highPrice": "high",
            "high": "high",
            "lowPrice": "low",
            "low": "low",
            "closePrice": "close",
            "close": "close",
            "volume": "volume",
            "vol": "volume",
            "成交量": "volume",
        }
    )

    required = {"date", "close", "volume"}
    if not required.issubset(renamed.columns):
        raise ValueError("Waizao payload does not contain date/close/volume fields.")

    normalized = renamed.copy()
    normalized = normalized.loc[:, [column for column in ["date", "open", "high", "low", "close", "volume"] if column in normalized.columns]]
    normalized["date"] = pd.to_datetime(normalized["date"])
    for field in ["open", "high", "low", "close", "volume"]:
        if field in normalized.columns:
            normalized[field] = pd.to_numeric(normalized[field], errors="coerce")

    if "open" not in normalized.columns:
        normalized["open"] = normalized["close"]
    if "high" not in normalized.columns:
        normalized["high"] = normalized["close"]
    if "low" not in normalized.columns:
        normalized["low"] = normalized["close"]
    normalized = normalized.dropna(subset=["date", "open", "high", "low", "close", "volume"]).sort_values("date")
    if normalized.empty:
        raise ValueError("Waizao history payload is empty after normalization.")
    return normalized


def fetch_stock_history_from_waizao(code: str, start_date: datetime, end_date: datetime) -> pd.DataFrame:
    result = waizao_client.request_api(
        "getDayKLine",
        params={
            "type": 1,
            "code": code,
            "ktype": 101,
            "fq": 1,
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "fields": "all",
            "filter": "",
        },
        method="post",
    )
    return normalize_waizao_history_payload(result["data"])


def fetch_stock_history(code: str) -> tuple[pd.DataFrame, str]:
    end_date = datetime.today()
    start_date = end_date - timedelta(days=120)
    errors: List[str] = []

    try:
        return fetch_stock_history_from_em(code, start_date, end_date).tail(60).reset_index(drop=True), "akshare.stock_zh_a_hist"
    except Exception as exc:
        errors.append(f"eastmoney history failed: {exc}")

    try:
        return fetch_stock_history_from_sina(code, start_date, end_date).tail(60).reset_index(drop=True), "akshare.stock_zh_a_daily"
    except Exception as exc:
        errors.append(f"sina history failed: {exc}")

    try:
        return fetch_stock_history_from_waizao(code, start_date, end_date).tail(60).reset_index(drop=True), "waizaowang.getDayKLine"
    except Exception as exc:
        errors.append(f"waizao history failed: {exc}")

    raise ValueError(f"Failed to fetch historical stock data: {' | '.join(errors)}")


def fetch_stock_history_cached(code: str) -> tuple[pd.DataFrame, str]:
    """Return cached history DataFrame when fresh; otherwise fetch and cache."""
    entry = HISTORY_CACHE.get(code)
    if entry and datetime.now() - entry["loaded_at"] < HISTORY_CACHE_TTL:
        return entry["df"].copy(), entry["source"]
    df, source = fetch_stock_history(code)
    HISTORY_CACHE[code] = {"df": df, "source": source, "loaded_at": datetime.now()}
    return df.copy(), source


def fetch_multiperiod_history_from_em(code: str, period: str) -> pd.DataFrame:
    end_date = datetime.now()
    start_date = end_date - timedelta(days=45 if period == "60" else 12)
    raw_df = ak.stock_zh_a_hist_min_em(
        symbol=code,
        start_date=start_date.strftime("%Y-%m-%d %H:%M:%S"),
        end_date=end_date.strftime("%Y-%m-%d %H:%M:%S"),
        period=period,
        adjust="",
    )
    if raw_df is None or raw_df.empty:
        raise ValueError("No multi-period history returned from Eastmoney.")

    renamed = raw_df.rename(
        columns={
            "时间": "date",
            "开盘": "open",
            "最高": "high",
            "最低": "low",
            "收盘": "close",
            "成交量": "volume",
            "成交额": "amount",
            "换手率": "turnover_rate",
        }
    )
    required = {"date", "open", "high", "low", "close", "volume"}
    if not required.issubset(renamed.columns):
        raise ValueError("Unexpected multi-period history format.")

    normalized = renamed.loc[:, [column for column in ["date", "open", "high", "low", "close", "volume", "amount", "turnover_rate"] if column in renamed.columns]].copy()
    normalized["date"] = pd.to_datetime(normalized["date"])
    for field in ["open", "high", "low", "close", "volume", "amount", "turnover_rate"]:
        if field in normalized.columns:
            normalized[field] = pd.to_numeric(normalized[field], errors="coerce")
    normalized = normalized.dropna(subset=["date", "open", "high", "low", "close", "volume"]).sort_values("date")
    if normalized.empty:
        raise ValueError("Multi-period history is empty after normalization.")
    return normalized.tail(160).reset_index(drop=True)


def normalize_intraday_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        raise ValueError("No intraday data returned from data source.")

    renamed = df.rename(
        columns={
            "时间": "datetime",
            "日期时间": "datetime",
            "day": "datetime",
            "date": "datetime",
            "close": "close",
            "收盘": "close",
            "成交量": "volume",
            "volume": "volume",
        }
    )

    required = {"datetime", "close"}
    if not required.issubset(renamed.columns):
        raise ValueError("Unexpected intraday data format.")

    normalized = renamed.copy()
    normalized["datetime"] = pd.to_datetime(normalized["datetime"])
    normalized["close"] = pd.to_numeric(normalized["close"], errors="coerce")
    if "volume" in normalized.columns:
        normalized["volume"] = pd.to_numeric(normalized["volume"], errors="coerce")
    else:
        normalized["volume"] = 0
    normalized = normalized.dropna(subset=["datetime", "close"]).sort_values("datetime")
    if normalized.empty:
        raise ValueError("Intraday data is empty after normalization.")
    return normalized.loc[:, ["datetime", "close", "volume"]]


def normalize_waizao_intraday_payload(payload: Any) -> pd.DataFrame:
    if isinstance(payload, dict):
        for key in ("data", "list", "rows", "result"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list) or not payload:
        raise ValueError("Unexpected Waizao intraday payload.")

    df = pd.DataFrame(payload)
    renamed = df.rename(
        columns={
            "date": "datetime",
            "datetime": "datetime",
            "time": "datetime",
            "tradeDate": "datetime",
            "close": "close",
            "closePrice": "close",
            "volume": "volume",
            "vol": "volume",
        }
    )

    if not {"datetime", "close"}.issubset(renamed.columns):
        raise ValueError("Waizao intraday payload missing datetime/close.")

    normalized = renamed.copy()
    normalized["datetime"] = pd.to_datetime(normalized["datetime"])
    normalized["close"] = pd.to_numeric(normalized["close"], errors="coerce")
    normalized["volume"] = pd.to_numeric(normalized.get("volume", 0), errors="coerce").fillna(0)
    normalized = normalized.dropna(subset=["datetime", "close"]).sort_values("datetime")
    if normalized.empty:
        raise ValueError("Waizao intraday payload is empty after normalization.")
    return normalized.loc[:, ["datetime", "close", "volume"]]


def fetch_intraday_bars_from_em(code: str) -> pd.DataFrame:
    raw_df = ak.stock_zh_a_hist_min_em(symbol=code, period="15", adjust="")
    return normalize_intraday_dataframe(raw_df)


def fetch_intraday_bars_from_waizao(code: str) -> pd.DataFrame:
    now = datetime.now()
    start = now.replace(hour=9, minute=30, second=0, microsecond=0)
    end = now
    result = waizao_client.request_api(
        "getHourKLine",
        params={
            "type": 1,
            "code": code,
            "ktype": 15,
            "startDate": start.strftime("%Y-%m-%d %H:%M:%S"),
            "endDate": end.strftime("%Y-%m-%d %H:%M:%S"),
            "fields": "all",
            "filter": "",
        },
        method="post",
    )
    return normalize_waizao_intraday_payload(result["data"])


def compute_intraday_context(df: pd.DataFrame) -> Dict[str, Any]:
    working = df.copy().tail(32).reset_index(drop=True)
    working["ema8"] = compute_ema(working["close"], 8)
    working["ema21"] = compute_ema(working["close"], 21)

    latest = working.iloc[-1]
    first = working.iloc[0]
    session_change_percent = None
    if first["close"]:
        session_change_percent = round(((latest["close"] - first["close"]) / first["close"]) * 100, 2)

    last4_high = round(float(working["close"].tail(4).max()), 2)
    last4_low = round(float(working["close"].tail(4).min()), 2)

    return {
        "latest_close": round(float(latest["close"]), 2),
        "ema8": round(float(latest["ema8"]), 2),
        "ema21": round(float(latest["ema21"]), 2),
        "intraday_trend": "bullish" if latest["ema8"] > latest["ema21"] else "neutral_or_bearish",
        "session_change_percent": session_change_percent,
        "bars_count": int(len(working)),
        "last4_range_high": last4_high,
        "last4_range_low": last4_low,
        "last_bar_time": latest["datetime"].strftime("%Y-%m-%d %H:%M:%S"),
    }


def fetch_intraday_context(code: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    errors: List[str] = []

    try:
        bars = fetch_intraday_bars_from_em(code)
        return compute_intraday_context(bars), "akshare.stock_zh_a_hist_min_em"
    except Exception as exc:
        errors.append(f"eastmoney intraday failed: {exc}")

    try:
        bars = fetch_intraday_bars_from_waizao(code)
        return compute_intraday_context(bars), "waizaowang.getHourKLine"
    except Exception as exc:
        errors.append(f"waizao intraday failed: {exc}")

    return None, " | ".join(errors) if errors else None


def normalize_realtime_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        raise ValueError("No realtime quote data returned from data source.")

    return df.copy()


def build_realtime_payload(row: pd.Series, code: str, source: str) -> Dict[str, Any]:
    return {
        "code": code,
        "name": str(row.get("名称", "")),
        "price": safe_float(row.get("最新价")),
        "change_percent": safe_float(row.get("涨跌幅")),
        "change_amount": safe_float(row.get("涨跌额")),
        "volume": safe_float(row.get("成交量")),
        "amount": safe_float(row.get("成交额")),
        "amplitude": safe_float(row.get("振幅")),
        "high": safe_float(row.get("最高")),
        "low": safe_float(row.get("最低")),
        "open": safe_float(row.get("今开")),
        "pre_close": safe_float(row.get("昨收")),
        "turnover_rate": safe_float(row.get("换手率")),
        "pe_ratio": safe_float(row.get("市盈率-动态")),
        "pb_ratio": safe_float(row.get("市净率")),
        "quote_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": source,
    }


def scaled_float(value: Any, divisor: float = 100) -> Optional[float]:
    raw = safe_float(value)
    if raw is None:
        return None
    return round(raw / divisor, 2)


def fetch_realtime_quote_from_eastmoney_direct(code: str) -> Dict[str, Any]:
    response = requests.get(
        "https://push2.eastmoney.com/api/qt/stock/get",
        params={
            "secid": to_secid(code),
            "fields": "f43,f44,f45,f46,f47,f48,f57,f58,f60,f168,f169,f170",
        },
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") or {}
    if not data:
        raise ValueError("No Eastmoney direct quote payload returned.")

    return {
        "code": str(data.get("f57") or code),
        "name": str(data.get("f58") or ""),
        "price": scaled_float(data.get("f43")),
        "change_percent": scaled_float(data.get("f170")),
        "change_amount": scaled_float(data.get("f169")),
        "volume": safe_float(data.get("f47")),
        "amount": safe_float(data.get("f48")),
        "amplitude": None,
        "high": scaled_float(data.get("f44")),
        "low": scaled_float(data.get("f45")),
        "open": scaled_float(data.get("f46")),
        "pre_close": scaled_float(data.get("f60")),
        "turnover_rate": scaled_float(data.get("f168")),
        "pe_ratio": None,
        "pb_ratio": None,
        "quote_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "eastmoney.push2.direct",
    }


def fetch_market_snapshot_from_eastmoney(limit: int = 80) -> pd.DataFrame:
    response = requests.get(
        "https://82.push2.eastmoney.com/api/qt/clist/get",
        params={
            "pn": 1,
            "pz": limit,
            "po": 1,
            "np": 1,
            "ut": "bd1d9ddb04089700cf9c27f6f7426281",
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
            "fields": "f2,f3,f5,f6,f8,f12,f14,f20",
        },
        headers=DEFAULT_HEADERS,
        timeout=12,
    )
    response.raise_for_status()
    payload = response.json()
    diff = ((payload.get("data") or {}).get("diff")) or []
    if not diff:
        raise ValueError("No market snapshot data returned from Eastmoney.")

    rows = []
    for item in diff:
        rows.append(
            {
                "code": str(item.get("f12") or ""),
                "name": str(item.get("f14") or ""),
                "最新价": safe_float(item.get("f2")),
                "涨跌幅": safe_float(item.get("f3")),
                "成交量": safe_float(item.get("f5")),
                "成交额": safe_float(item.get("f6")),
                "换手率": safe_float(item.get("f8")),
                "总市值": safe_float(item.get("f20")),
            }
        )

    return pd.DataFrame(rows)


def build_curated_focus_dataframe() -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for item in CURATED_FOCUS_LIST:
        try:
            quote = fetch_realtime_quote(item["code"])
            rows.append(
                {
                    "code": item["code"],
                    "name": quote.get("name") or item["name"],
                    "最新价": quote.get("price"),
                    "涨跌幅": quote.get("change_percent"),
                    "成交额": quote.get("amount"),
                    "换手率": quote.get("turnover_rate"),
                    "总市值": None,
                }
            )
        except Exception:
            rows.append(
                {
                    "code": item["code"],
                    "name": item["name"],
                    "最新价": None,
                    "涨跌幅": None,
                    "成交额": None,
                    "换手率": None,
                    "总市值": None,
                }
            )
    return pd.DataFrame(rows)


def fetch_realtime_quote_from_sina_direct(code: str) -> Dict[str, Any]:
    symbol = to_market_symbol(code)
    response = requests.get(
        f"https://hq.sinajs.cn/list={symbol}",
        headers={
            **DEFAULT_HEADERS,
            "Referer": "https://finance.sina.com.cn/",
        },
        timeout=10,
    )
    response.raise_for_status()
    text = response.text
    if "=" not in text:
        raise ValueError("Unexpected Sina quote response.")
    quote = text.split("=", 1)[1].strip().strip(";").strip('"')
    parts = quote.split(",")
    if len(parts) < 32:
        raise ValueError("Incomplete Sina quote response.")

    price = safe_float(parts[3])
    pre_close = safe_float(parts[2])
    change_amount = round(price - pre_close, 2) if price is not None and pre_close is not None else None
    change_percent = round((change_amount / pre_close) * 100, 2) if change_amount is not None and pre_close else None

    return {
        "code": code,
        "name": parts[0],
        "price": price,
        "change_percent": change_percent,
        "change_amount": change_amount,
        "volume": safe_float(parts[8]),
        "amount": safe_float(parts[9]),
        "amplitude": None,
        "high": safe_float(parts[4]),
        "low": safe_float(parts[5]),
        "open": safe_float(parts[1]),
        "pre_close": pre_close,
        "turnover_rate": None,
        "pe_ratio": None,
        "pb_ratio": None,
        "quote_time": f"{parts[30]} {parts[31]}",
        "source": "sina.hq.direct",
    }


def fetch_realtime_quote_from_em(code: str) -> Dict[str, Any]:
    realtime_df = normalize_realtime_dataframe(ak.stock_zh_a_spot_em())
    matched = realtime_df[realtime_df["代码"].astype(str) == code]
    if matched.empty:
        raise ValueError("Invalid stock code or realtime quote not available.")
    return build_realtime_payload(matched.iloc[0], code, "akshare.stock_zh_a_spot_em")


def fetch_realtime_quote_from_individual(code: str) -> Dict[str, Any]:
    info_df = ak.stock_individual_info_em(symbol=code)
    if info_df is None or info_df.empty:
        raise ValueError("No individual quote data returned from data source.")

    info_map = dict(zip(info_df.iloc[:, 0], info_df.iloc[:, 1]))
    return {
        "code": code,
        "name": str(info_map.get("股票简称", "")),
        "price": safe_float(info_map.get("最新")),
        "change_percent": safe_float(info_map.get("涨跌幅")),
        "change_amount": safe_float(info_map.get("涨跌额")),
        "volume": safe_float(info_map.get("总手")),
        "amount": safe_float(info_map.get("成交额")),
        "amplitude": safe_float(info_map.get("振幅")),
        "high": safe_float(info_map.get("最高")),
        "low": safe_float(info_map.get("最低")),
        "open": safe_float(info_map.get("今开")),
        "pre_close": safe_float(info_map.get("昨收")),
        "turnover_rate": safe_float(info_map.get("换手率")),
        "pe_ratio": safe_float(info_map.get("市盈率(动态)")),
        "pb_ratio": safe_float(info_map.get("市净率")),
        "quote_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "akshare.stock_individual_info_em",
    }


def fetch_realtime_quote(code: str) -> Dict[str, Any]:
    errors: List[str] = []

    try:
        return fetch_realtime_quote_from_eastmoney_direct(code)
    except Exception as exc:
        errors.append(f"eastmoney direct failed: {exc}")

    try:
        return fetch_realtime_quote_from_sina_direct(code)
    except Exception as exc:
        errors.append(f"sina direct failed: {exc}")

    try:
        return fetch_realtime_quote_from_em(code)
    except Exception as exc:
        errors.append(f"spot_em failed: {exc}")

    try:
        return fetch_realtime_quote_from_individual(code)
    except Exception as exc:
        errors.append(f"individual_info_em failed: {exc}")

    raise ValueError(f"Failed to fetch realtime quote data: {' | '.join(errors)}")


def build_chart_payload(df: pd.DataFrame) -> Dict[str, Any]:
    working = df.copy().reset_index(drop=True)
    working["ma5"] = working["close"].rolling(window=5).mean()
    working["ma20"] = working["close"].rolling(window=20).mean()

    points: List[Dict[str, Any]] = []
    for _, row in working.tail(60).iterrows():
        points.append(
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "open": round(float(row["open"]), 2),
                "high": round(float(row["high"]), 2),
                "low": round(float(row["low"]), 2),
                "close": round(float(row["close"]), 2),
                "volume": round(float(row["volume"]), 2),
                "ma5": round(float(row["ma5"]), 2) if pd.notna(row["ma5"]) else None,
                "ma20": round(float(row["ma20"]), 2) if pd.notna(row["ma20"]) else None,
            }
        )

    return {
        "series": points,
        "summary": {
            "period_days": len(points),
            "high": round(float(working["close"].tail(60).max()), 2),
            "low": round(float(working["close"].tail(60).min()), 2),
        },
    }


def build_multiperiod_chart_payload(df: pd.DataFrame, period: str) -> Dict[str, Any]:
    working = df.copy().reset_index(drop=True)
    working["ma5"] = working["close"].rolling(window=5).mean()
    working["ma20"] = working["close"].rolling(window=20).mean()

    points: List[Dict[str, Any]] = []
    for _, row in working.tail(120).iterrows():
        points.append(
            {
                "date": row["date"].strftime("%Y-%m-%d %H:%M"),
                "open": round(float(row["open"]), 2),
                "high": round(float(row["high"]), 2),
                "low": round(float(row["low"]), 2),
                "close": round(float(row["close"]), 2),
                "volume": round(float(row["volume"]), 2),
                "amount": round(float(row["amount"]), 2) if pd.notna(row.get("amount")) else None,
                "turnover_rate": round(float(row["turnover_rate"]), 2) if pd.notna(row.get("turnover_rate")) else None,
                "ma5": round(float(row["ma5"]), 2) if pd.notna(row["ma5"]) else None,
                "ma20": round(float(row["ma20"]), 2) if pd.notna(row["ma20"]) else None,
            }
        )

    period_label = {"15": "15m", "60": "60m"}.get(period, period)
    return {
        "series": points,
        "summary": {
            "period_label": period_label,
            "bars": len(points),
            "high": round(float(working["high"].tail(120).max()), 2),
            "low": round(float(working["low"].tail(120).min()), 2),
        },
    }


def to_market_prefix(code: str) -> str:
    if code.startswith(("5", "6", "9")):
        return "sh"
    if code.startswith(("4", "8")):
        return "bj"
    return "sz"


def fetch_stock_fund_flow(code: str) -> Dict[str, Any]:
    market = to_market_prefix(code)
    errors: List[str] = []

    try:
        detail_df = ak.stock_individual_fund_flow(stock=code, market=market)
        if detail_df is None or detail_df.empty:
            raise ValueError("No individual fund-flow detail returned.")
        latest = detail_df.iloc[-1]
        series = []
        for _, row in detail_df.tail(10).iterrows():
            series.append(
                {
                    "date": str(row["日期"]),
                    "main_net_inflow": safe_float(row["主力净流入-净额"]),
                    "main_net_ratio": safe_float(row["主力净流入-净占比"]),
                    "super_net_inflow": safe_float(row["超大单净流入-净额"]),
                    "large_net_inflow": safe_float(row["大单净流入-净额"]),
                    "medium_net_inflow": safe_float(row["中单净流入-净额"]),
                    "small_net_inflow": safe_float(row["小单净流入-净额"]),
                    "change_percent": safe_float(row["涨跌幅"]),
                    "close": safe_float(row["收盘价"]),
                }
            )
        return {
            "status": "ok",
            "latest": {
                "date": str(latest["日期"]),
                "main_net_inflow": safe_float(latest["主力净流入-净额"]),
                "main_net_ratio": safe_float(latest["主力净流入-净占比"]),
                "super_net_inflow": safe_float(latest["超大单净流入-净额"]),
                "large_net_inflow": safe_float(latest["大单净流入-净额"]),
                "medium_net_inflow": safe_float(latest["中单净流入-净额"]),
                "small_net_inflow": safe_float(latest["小单净流入-净额"]),
            },
            "series": series,
            "source": "akshare.stock_individual_fund_flow",
        }
    except Exception as exc:
        errors.append(f"individual fund flow failed: {exc}")

    try:
        rank_df = ak.stock_main_fund_flow(symbol="沪深A股")
        matched = rank_df[rank_df["代码"].astype(str) == code]
        if matched.empty:
            raise ValueError("No main-fund-flow ranking entry for this code.")
        row = matched.iloc[0]
        return {
            "status": "fallback_rank",
            "latest": {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "main_net_inflow": None,
                "main_net_ratio": safe_float(row["今日排行榜-主力净占比"]),
                "super_net_inflow": None,
                "large_net_inflow": None,
                "medium_net_inflow": None,
                "small_net_inflow": None,
            },
            "ranking": {
                "today_rank": safe_float(row["今日排行榜-今日排名"]),
                "today_change": safe_float(row["今日排行榜-今日涨跌"]),
                "five_day_main_ratio": safe_float(row["5日排行榜-主力净占比"]),
                "five_day_rank": safe_float(row["5日排行榜-5日排名"]),
                "ten_day_main_ratio": safe_float(row["10日排行榜-主力净占比"]),
                "ten_day_rank": safe_float(row["10日排行榜-10日排名"]),
                "sector": str(row["所属板块"]),
            },
            "series": [],
            "source": "akshare.stock_main_fund_flow",
        }
    except Exception as exc:
        errors.append(f"main fund flow failed: {exc}")

    return {
        "status": "error",
        "detail": " | ".join(errors) if errors else "No fund-flow data available.",
        "series": [],
        "latest": {},
    }


def generate_assistant_reply(code: str, question: str) -> Dict[str, Any]:
    snapshot = build_snapshot(code, include_llm=False)
    client = get_openai_client()
    if client is None:
        return {
            "status": "error",
            "content": "LLM is not configured.",
            "snapshot": snapshot,
        }

    try:
        response = client.chat.completions.create(
            model=DEFAULT_LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an A-share stock research assistant. "
                        "Answer follow-up questions using the supplied stock snapshot. "
                        "Be concise, factual, and practical. Do not promise profits."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "stock_snapshot": {
                                "code": snapshot["code"],
                                "name": snapshot["name"],
                                "realtime": snapshot["realtime"],
                                "indicators": snapshot["indicators"],
                                "scorecard": snapshot["scorecard"],
                                "risk_assessment": snapshot["risk_assessment"],
                                "final_decision": snapshot["final_decision"],
                                "analysis": snapshot["analysis"],
                            },
                            "follow_up_question": question,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0.2,
        )
        text = ""
        if response.choices and response.choices[0].message:
            text = (response.choices[0].message.content or "").strip()
        return {
            "status": "ok",
            "content": text,
            "snapshot": snapshot,
        }
    except Exception as exc:
        return {
            "status": "error",
            "content": str(exc),
            "snapshot": snapshot,
        }


def get_stock_universe() -> pd.DataFrame:
    loaded_at = STOCK_UNIVERSE_CACHE.get("loaded_at")
    cached = STOCK_UNIVERSE_CACHE.get("data")
    if cached is not None and loaded_at and datetime.now() - loaded_at < STOCK_UNIVERSE_TTL:
        return cached

    errors: List[str] = []

    # Primary: lightweight code+name list cached in-process, covers all A-shares (SH/SZ/BJ)
    try:
        df = ak.stock_info_a_code_name()
        if df is None or df.empty:
            raise ValueError("stock_info_a_code_name returned empty data.")
        col_map = {}
        for col in df.columns:
            if "代码" in col:
                col_map[col] = "code"
            elif "简称" in col or "名称" in col:
                col_map[col] = "name"
        normalized = df.rename(columns=col_map)[["code", "name"]].copy()
        normalized["code"] = normalized["code"].astype(str).str.zfill(6)
        normalized["name"] = normalized["name"].astype(str)
        STOCK_UNIVERSE_CACHE["data"] = normalized
        STOCK_UNIVERSE_CACHE["loaded_at"] = datetime.now()
        return normalized
    except Exception as exc:
        errors.append(f"stock_info_a_code_name failed: {exc}")

    # Fallback: full spot data (heavier, may be rate-limited)
    try:
        df = ak.stock_zh_a_spot_em()
        if df is None or df.empty:
            raise ValueError("AKShare returned empty A-share universe.")
        normalized = df.rename(columns={"代码": "code", "名称": "name"})[["code", "name"]].copy()
        normalized["code"] = normalized["code"].astype(str)
        normalized["name"] = normalized["name"].astype(str)
        STOCK_UNIVERSE_CACHE["data"] = normalized
        STOCK_UNIVERSE_CACHE["loaded_at"] = datetime.now()
        return normalized
    except Exception as exc:
        errors.append(f"akshare spot_em failed: {exc}")

    curated = build_curated_focus_dataframe()
    if curated is not None and not curated.empty:
        STOCK_UNIVERSE_CACHE["data"] = curated
        STOCK_UNIVERSE_CACHE["loaded_at"] = datetime.now()
        return curated

    raise ValueError(f"Failed to load A-share universe: {' | '.join(errors)}")


def build_market_quicklist_item(row: pd.Series) -> Dict[str, Any]:
    return {
        "code": str(row.get("code", "")),
        "name": str(row.get("name", "")),
        "price": safe_float(row.get("最新价")),
        "change_percent": safe_float(row.get("涨跌幅")),
        "amount": safe_float(row.get("成交额")),
        "turnover_rate": safe_float(row.get("换手率")),
        "market_cap": safe_float(row.get("总市值")),
    }


def get_market_quicklists(limit: int = 8) -> Dict[str, List[Dict[str, Any]]]:
    universe = get_stock_universe()

    def sort_block(column: str, ascending: bool, fallback: Optional[pd.Series] = None) -> List[Dict[str, Any]]:
        if column not in universe.columns:
            return []

        working = universe.copy()
        working[column] = pd.to_numeric(working[column], errors="coerce")
        working = working.dropna(subset=[column])
        if fallback is not None:
            working = working.loc[fallback(working)]
        working = working.sort_values(column, ascending=ascending).head(limit)
        return [build_market_quicklist_item(row) for _, row in working.iterrows()]

    return {
        "top_gainers": sort_block("涨跌幅", ascending=False, fallback=lambda df: df["涨跌幅"] > 0),
        "top_losers": sort_block("涨跌幅", ascending=True, fallback=lambda df: df["涨跌幅"] < 0),
        "active_turnover": sort_block("成交额", ascending=False),
        "large_caps": sort_block("总市值", ascending=False),
    }


def safe_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, pd.NA)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(0)


def compute_ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def compute_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    working = df.copy()
    working["ma5"] = working["close"].rolling(window=5).mean()
    working["ma10"] = working["close"].rolling(window=10).mean()
    working["ma20"] = working["close"].rolling(window=20).mean()
    working["ma25"] = working["close"].rolling(window=25).mean()
    working["ma55"] = working["close"].rolling(window=55).mean()
    working["vol5"] = working["volume"].rolling(window=5).mean()
    working["vol60"] = working["volume"].rolling(window=60).mean()
    working["rsi14"] = compute_rsi(working["close"], 14)
    working["ema12"] = compute_ema(working["close"], 12)
    working["ema26"] = compute_ema(working["close"], 26)
    working["macd_diff"] = working["ema12"] - working["ema26"]
    working["macd_dea"] = working["macd_diff"].ewm(span=9, adjust=False).mean()
    working["macd_hist"] = (working["macd_diff"] - working["macd_dea"]) * 2

    low_n = working["close"].rolling(window=9, min_periods=9).min()
    high_n = working["close"].rolling(window=9, min_periods=9).max()
    rsv = ((working["close"] - low_n) / (high_n - low_n).replace(0, pd.NA)) * 100
    working["kdj_k"] = rsv.ewm(com=2, adjust=False).mean().fillna(50)
    working["kdj_d"] = working["kdj_k"].ewm(com=2, adjust=False).mean().fillna(50)
    working["kdj_j"] = (3 * working["kdj_k"] - 2 * working["kdj_d"]).fillna(50)

    latest = working.iloc[-1]

    required = [
        "ma5",
        "ma10",
        "ma20",
        "ma25",
        "ma55",
        "vol5",
        "vol60",
        "rsi14",
        "macd_diff",
        "macd_dea",
        "macd_hist",
        "kdj_k",
        "kdj_d",
        "kdj_j",
    ]
    if any(pd.isna(latest[col]) for col in required):
        raise ValueError("Not enough trading data to compute moving averages.")

    return {
        "close": round(float(latest["close"]), 2),
        "ma5": round(float(latest["ma5"]), 2),
        "ma10": round(float(latest["ma10"]), 2),
        "ma20": round(float(latest["ma20"]), 2),
        "ma25": round(float(latest["ma25"]), 2),
        "ma55": round(float(latest["ma55"]), 2),
        "volume": round(float(latest["volume"]), 2),
        "vol5": round(float(latest["vol5"]), 2),
        "vol60": round(float(latest["vol60"]), 2),
        "rsi14": round(float(latest["rsi14"]), 2),
        "volume_ratio": round(float(latest["volume"] / latest["vol5"]), 2) if latest["vol5"] else None,
        "macd_diff": round(float(latest["macd_diff"]), 4),
        "macd_dea": round(float(latest["macd_dea"]), 4),
        "macd_hist": round(float(latest["macd_hist"]), 4),
        "kdj_k": round(float(latest["kdj_k"]), 2),
        "kdj_d": round(float(latest["kdj_d"]), 2),
        "kdj_j": round(float(latest["kdj_j"]), 2),
        "date": latest["date"].strftime("%Y-%m-%d"),
    }


def build_model_signals(snapshot: Dict[str, Any]) -> List[Dict[str, Any]]:
    indicators = snapshot["indicators"]
    realtime = snapshot["realtime"]
    models: List[Dict[str, Any]] = []

    ma25_60_score = 0
    ma25_60_signals: List[str] = []
    if indicators["ma5"] > indicators["ma25"]:
        ma25_60_score += 1
        ma25_60_signals.append("MA5 > MA25")
    if indicators["vol5"] > indicators["vol60"]:
        ma25_60_score += 1
        ma25_60_signals.append("VOL5 > VOL60")
    if abs(indicators["ma5"] - indicators["ma25"]) / max(indicators["ma25"], 0.01) < 0.01:
        ma25_60_signals.append("MA5 close to MA25")

    models.append(
        {
            "id": "ma5_25_vol5_60",
            "name": "MA5-25 / VOL5-60",
            "bias": "bullish" if ma25_60_score >= 2 else "neutral",
            "score": ma25_60_score,
            "signals": ma25_60_signals,
        }
    )

    rsi_bias = "neutral"
    rsi_signals: List[str] = [f"RSI14={indicators['rsi14']}"]
    rsi_score = 0
    if 50 <= indicators["rsi14"] <= 70:
        rsi_bias = "bullish"
        rsi_score = 1
        rsi_signals.append("RSI14 in bullish momentum range")
    elif indicators["rsi14"] < 30:
        rsi_bias = "oversold_rebound_watch"
        rsi_signals.append("RSI14 below 30")
    elif indicators["rsi14"] > 70:
        rsi_bias = "overbought_watch"
        rsi_signals.append("RSI14 above 70")

    models.append(
        {
            "id": "rsi14_70",
            "name": "RSI14-70",
            "bias": rsi_bias,
            "score": rsi_score,
            "signals": rsi_signals,
        }
    )

    ma20_55_score = 0
    ma20_55_signals: List[str] = []
    if indicators["ma20"] > indicators["ma55"]:
        ma20_55_score += 1
        ma20_55_signals.append("MA20 > MA55")
    if realtime["price"] is not None and realtime["price"] > indicators["ma20"]:
        ma20_55_score += 1
        ma20_55_signals.append("Realtime price > MA20")

    models.append(
        {
            "id": "ma20_55_trend",
            "name": "MA20-55 Trend",
            "bias": "bullish" if ma20_55_score >= 2 else "neutral",
            "score": ma20_55_score,
            "signals": ma20_55_signals,
        }
    )

    macd_score = 0
    macd_signals: List[str] = []
    if indicators["macd_diff"] > indicators["macd_dea"]:
        macd_score += 1
        macd_signals.append("MACD DIFF > DEA")
    if indicators["macd_hist"] > 0:
        macd_score += 1
        macd_signals.append("MACD histogram > 0")

    models.append(
        {
            "id": "macd_trend",
            "name": "MACD Trend",
            "bias": "bullish" if macd_score >= 2 else "neutral",
            "score": macd_score,
            "signals": macd_signals,
        }
    )

    kdj_score = 0
    kdj_signals: List[str] = [f"K={indicators['kdj_k']}", f"D={indicators['kdj_d']}", f"J={indicators['kdj_j']}"]
    if indicators["kdj_k"] > indicators["kdj_d"]:
        kdj_score += 1
        kdj_signals.append("KDJ K > D")
    if indicators["kdj_j"] < 20:
        kdj_signals.append("KDJ J in oversold zone")
    elif indicators["kdj_j"] > 80:
        kdj_signals.append("KDJ J in overbought zone")

    models.append(
        {
            "id": "kdj_momentum",
            "name": "KDJ Momentum",
            "bias": "bullish" if kdj_score >= 1 else "neutral",
            "score": kdj_score,
            "signals": kdj_signals,
        }
    )

    activity_score = 0
    activity_signals: List[str] = []
    if indicators["volume_ratio"] is not None and indicators["volume_ratio"] >= 1.2:
        activity_score += 1
        activity_signals.append("Volume ratio >= 1.2")
    turnover_rate = realtime.get("turnover_rate")
    if turnover_rate is not None and turnover_rate >= 2:
        activity_score += 1
        activity_signals.append("Turnover rate >= 2")

    models.append(
        {
            "id": "activity_filter",
            "name": "Volume Ratio / Turnover",
            "bias": "active" if activity_score >= 1 else "quiet",
            "score": activity_score,
            "signals": activity_signals,
        }
    )

    return models


def build_rule_analysis(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    indicators = snapshot["indicators"]
    realtime = snapshot["realtime"]
    signals: List[str] = []
    models = build_model_signals(snapshot)
    aggregate_score = sum(model["score"] for model in models)

    if indicators["ma5"] > indicators["ma10"]:
        summary = "bullish short-term"
        detail = "MA5 is above MA10, which suggests short-term upward momentum."
        signals.append("MA5 > MA10")
    else:
        summary = "weak short-term trend"
        detail = "MA5 is below or equal to MA10, which suggests weaker short-term momentum."
        signals.append("MA5 <= MA10")

    realtime_price = realtime["price"] if realtime["price"] is not None else indicators["close"]
    if realtime_price > indicators["ma20"]:
        signals.append("Realtime price > MA20")
    else:
        signals.append("Realtime price <= MA20")

    if realtime.get("change_percent") is not None:
        if realtime["change_percent"] >= 2:
            signals.append("Intraday strength >= 2%")
        elif realtime["change_percent"] <= -2:
            signals.append("Intraday weakness <= -2%")

    if aggregate_score >= 4:
        summary = "multi-model bullish"
        detail = "Multiple rule models are aligned on the long side."
    elif aggregate_score <= 1:
        summary = "weak or mixed setup"
        detail = "The current rule models do not show a strong aligned setup."

    return {
        "engine": "rules_v3",
        "summary": summary,
        "detail": detail,
        "signals": signals,
        "models": models,
        "aggregate_score": aggregate_score,
        "next_step": "This block can be replaced or augmented by a GPT analysis layer.",
    }


def build_technical_analysis(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    rule_analysis = build_rule_analysis(snapshot)
    return {
        "summary": rule_analysis["summary"],
        "detail": rule_analysis["detail"],
        "aggregate_score": rule_analysis["aggregate_score"],
        "signals": rule_analysis["signals"],
        "models": rule_analysis["models"],
        "engine": rule_analysis["engine"],
    }


def build_risk_assessment(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    indicators = snapshot["indicators"]
    realtime = snapshot["realtime"]
    risks: List[str] = ["A-share T+1 settlement constraint applies."]
    level = "medium"

    if realtime.get("change_percent") is not None and abs(realtime["change_percent"]) >= 5:
        risks.append("Large intraday move increases reversal risk.")
        level = "high"

    if indicators["rsi14"] > 70:
        risks.append("RSI14 is in overbought territory.")
        level = "high"
    elif indicators["rsi14"] < 30:
        risks.append("RSI14 is in oversold territory; rebound setups can still fail.")

    if realtime.get("turnover_rate") is not None and realtime["turnover_rate"] < 1:
        risks.append("Low turnover rate may reduce signal reliability.")

    return {
        "level": level,
        "items": risks,
    }


def build_final_decision(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    technical = build_technical_analysis(snapshot)
    risk = build_risk_assessment(snapshot)

    bias = "watch"
    if technical["aggregate_score"] >= 5 and risk["level"] != "high":
        bias = "bullish_watch"
    elif technical["aggregate_score"] <= 2:
        bias = "avoid_chasing"

    return {
        "bias": bias,
        "note": "Decision support only. No automated execution.",
    }


def build_scorecard(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    indicators = snapshot["indicators"]
    realtime = snapshot["realtime"]
    intraday = snapshot.get("intraday")

    trend_score = 25
    if indicators["ma5"] > indicators["ma10"] > indicators["ma20"]:
        trend_score = 85
    elif indicators["ma5"] > indicators["ma10"]:
        trend_score = 68
    elif indicators["ma5"] < indicators["ma10"] < indicators["ma20"]:
        trend_score = 25
    else:
        trend_score = 48

    momentum_score = 50
    if indicators["macd_diff"] > indicators["macd_dea"] and indicators["rsi14"] >= 50:
        momentum_score = 76
    elif indicators["rsi14"] < 40:
        momentum_score = 34

    flow_score = 50
    if indicators["volume_ratio"] is not None and indicators["volume_ratio"] >= 1.2:
        flow_score += 15
    if realtime.get("turnover_rate") is not None and realtime["turnover_rate"] >= 2:
        flow_score += 15
    flow_score = min(flow_score, 90)

    risk_score = 40
    if snapshot["risk_assessment"]["level"] == "high":
        risk_score = 78
    elif snapshot["risk_assessment"]["level"] == "medium":
        risk_score = 52
    if indicators["rsi14"] > 70:
        risk_score = max(risk_score, 72)

    intraday_score = None
    if intraday:
        intraday_score = 72 if intraday["intraday_trend"] == "bullish" else 38

    components = {
        "trend": trend_score,
        "momentum": momentum_score,
        "flow": flow_score,
        "risk": risk_score,
    }
    if intraday_score is not None:
        components["intraday"] = intraday_score

    positive_scores = [trend_score, momentum_score, flow_score]
    if intraday_score is not None:
        positive_scores.append(intraday_score)

    total_score = round((sum(positive_scores) / len(positive_scores)) * 0.75 + (100 - risk_score) * 0.25, 1)

    return {
        "total": total_score,
        "components": components,
        "grading": (
            "A" if total_score >= 80 else
            "B" if total_score >= 65 else
            "C" if total_score >= 50 else
            "D"
        ),
    }


def build_llm_context(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    technical = snapshot["technical_analysis"]
    return {
        "market": "CN-A",
        "task": "realtime_stock_prediction_analysis",
        "objective": (
            "Assess the most likely short-term directional bias for this stock using the "
            "realtime quote, 60-day indicators, rule-analysis output, and risk block."
        ),
        "constraints": [
            "No guarantee language.",
            "No claims of certainty.",
            "No automated execution instructions.",
            "Focus on intraday to short swing trading interpretation.",
        ],
        "required_output_schema": {
            "direction": "bullish | neutral | bearish",
            "confidence": "integer 0-100",
            "timeframe": "intraday | 1-3d | 1-2w",
            "scorecard": {
                "trend": "integer 0-100",
                "momentum": "integer 0-100",
                "flow": "integer 0-100",
                "risk": "integer 0-100",
                "overall": "integer 0-100",
            },
            "thesis": "one concise paragraph",
            "bull_case": "short text",
            "bear_case": "short text",
            "key_levels": {
                "support": ["string or number"],
                "resistance": ["string or number"],
            },
            "catalysts": ["short bullet item"],
            "risks": ["short bullet item"],
            "action_bias": "watch_pullback | breakout_watch | avoid_chasing | reduce_risk | neutral_wait",
            "referee": "final balancing sentence",
        },
        "snapshot_summary": {
            "code": snapshot["code"],
            "name": snapshot["name"],
            "realtime": snapshot["realtime"],
            "indicators": snapshot["indicators"],
            "intraday": snapshot.get("intraday"),
            "technical_analysis": {
                "summary": technical["summary"],
                "detail": technical["detail"],
                "aggregate_score": technical["aggregate_score"],
                "signals": technical["signals"],
            },
            "scorecard": snapshot["scorecard"],
            "risk_assessment": snapshot["risk_assessment"],
            "final_decision": snapshot["final_decision"],
        },
    }


def build_llm_prompt(snapshot: Dict[str, Any]) -> str:
    return (
        "You are a disciplined realtime stock analysis assistant focused on Chinese A-shares. "
        "Return valid JSON only. "
        "Base your answer on the provided snapshot. "
        "Use concise professional language suitable for a decision-support dashboard.\n\n"
        f"{json.dumps(build_llm_context(snapshot), ensure_ascii=False)}"
    )


def generate_llm_analysis(snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    client = get_openai_client()
    if client is None:
        return None

    try:
        response = client.chat.completions.create(
            model=DEFAULT_LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a disciplined realtime A-share market analysis assistant. "
                        "You reason like a senior discretionary trader but stay factual. "
                        "Return valid JSON only, matching the user-provided schema exactly."
                    ),
                },
                {
                    "role": "user",
                    "content": build_llm_prompt(snapshot),
                },
            ],
            temperature=0.2,
        )
        text = ""
        if response.choices and response.choices[0].message:
            text = (response.choices[0].message.content or "").strip()

        if not text:
            return {
                "engine": DEFAULT_LLM_MODEL,
                "status": "empty",
                "content": None,
            }

        try:
            parsed = json.loads(text)
            return {
                "engine": DEFAULT_LLM_MODEL,
                "status": "ok",
                "content": parsed,
                "summary": {
                    "direction": parsed.get("direction"),
                    "confidence": parsed.get("confidence"),
                    "timeframe": parsed.get("timeframe"),
                    "action_bias": parsed.get("action_bias"),
                },
            }
        except json.JSONDecodeError:
            return {
                "engine": DEFAULT_LLM_MODEL,
                "status": "raw_text",
                "content": {
                    "summary": "model returned non-JSON output",
                    "detail": text,
                },
            }
    except Exception as exc:
        return {
            "engine": DEFAULT_LLM_MODEL,
            "status": "error",
            "content": {
                "summary": "LLM request failed",
                "detail": str(exc),
            },
        }


def build_snapshot(code: str, include_llm: bool) -> Dict[str, Any]:
    # Use cached base snapshot when fresh (avoids repeat AKShare + indicator work)
    base_entry = SNAPSHOT_BASE_CACHE.get(code)
    if base_entry and datetime.now() - base_entry["loaded_at"] < SNAPSHOT_BASE_CACHE_TTL:
        snapshot = {**base_entry["snapshot"]}
    else:
        history_df, history_source = fetch_stock_history_cached(code)
        indicators = compute_indicators(history_df)
        chart = build_chart_payload(history_df)
        realtime = fetch_realtime_quote(code)
        intraday_context, intraday_source = fetch_intraday_context(code)
        core_snapshot = {
            "code": code,
            "realtime": realtime,
            "indicators": indicators,
            "intraday": intraday_context,
        }
        technical_analysis = build_technical_analysis(core_snapshot)
        risk_assessment = build_risk_assessment(core_snapshot)
        final_decision = build_final_decision(core_snapshot)
        scorecard = build_scorecard(
            {
                **core_snapshot,
                "technical_analysis": technical_analysis,
                "risk_assessment": risk_assessment,
                "final_decision": final_decision,
            }
        )
        close_signal = {
            "engine": "close_signal_v1",
            "bias": "hold_for_review" if final_decision.get("bias") == "bullish_watch" else "reduce_risk",
            "note": "Tail-session decision support only. Not investment advice.",
        }

        snapshot = {
            "code": code,
            "name": realtime["name"],
            "realtime": realtime,
            "indicators": indicators,
            "chart": chart,
            "intraday": intraday_context,
            "analysis": technical_analysis,
            "technical_analysis": technical_analysis,
            "risk_assessment": risk_assessment,
            "final_decision": final_decision,
            "scorecard": scorecard,
            "close_signal": close_signal,
            "meta": {
                "market": "CN-A",
                "history_source": history_source,
                "realtime_source": realtime.get("source"),
                "intraday_source": intraday_source,
                "lookback_trading_days": 60,
                "adjustment": "qfq",
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "llm_enabled": include_llm,
            },
        }
        # Cache the base snapshot (without LLM) for subsequent calls
        SNAPSHOT_BASE_CACHE[code] = {"snapshot": {**snapshot, "llm_analysis": None}, "loaded_at": datetime.now()}

    snapshot["llm_analysis"] = generate_llm_analysis(snapshot) if include_llm else None
    return snapshot


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "llm_configured": bool(os.getenv("OPENAI_API_KEY")),
        "waizao_configured": waizao_client.is_configured(),
    }


@app.get("/")
def frontend_index() -> FileResponse:
    home_path = os.path.join(FRONTEND_DIR, "home.html")
    if not os.path.exists(home_path):
        raise HTTPException(status_code=404, detail="Frontend home.html not found.")
    return FileResponse(home_path, headers=NO_CACHE_HEADERS)


@app.get("/workspace")
def frontend_workspace() -> FileResponse:
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend index.html not found.")
    return FileResponse(index_path, headers=NO_CACHE_HEADERS)


@app.get("/debug")
def frontend_debug() -> FileResponse:
    debug_path = os.path.join(FRONTEND_DIR, "debug.html")
    if not os.path.exists(debug_path):
        raise HTTPException(status_code=404, detail="Frontend debug.html not found.")
    return FileResponse(debug_path, headers=NO_CACHE_HEADERS)


@app.get("/scan")
def frontend_scan() -> FileResponse:
    scan_path = os.path.join(FRONTEND_DIR, "scan.html")
    if not os.path.exists(scan_path):
        raise HTTPException(status_code=404, detail="Frontend scan.html not found.")
    return FileResponse(scan_path, headers=NO_CACHE_HEADERS)


@app.get("/quote/realtime")
def get_realtime(code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$")) -> Dict[str, Any]:
    try:
        realtime = fetch_realtime_quote(code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    return {
        "code": code,
        "name": realtime["name"],
        "realtime": realtime,
        "meta": {
            "market": "CN-A",
            "source": "akshare.stock_zh_a_spot_em",
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    }


@app.get("/stock")
def get_stock(
    code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    use_llm: bool = Query(False),
) -> Dict[str, Any]:
    try:
        return build_snapshot(code, include_llm=use_llm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/chart/multiperiod")
def get_multiperiod_chart(
    code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    period: str = Query("daily", pattern=r"^(daily|60|15)$"),
) -> Dict[str, Any]:
    try:
        if period == "daily":
            history_df, source = fetch_stock_history(code)
            chart = build_chart_payload(history_df)
        else:
            history_df = fetch_multiperiod_history_from_em(code, period=period)
            source = f"akshare.stock_zh_a_hist_min_em.{period}"
            chart = build_multiperiod_chart_payload(history_df, period=period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    return {
        "code": code,
        "period": period,
        "chart": chart,
        "meta": {
            "source": source,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
    }


@app.get("/fund-flow/stock")
def get_stock_fund_flow_endpoint(
    code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
) -> Dict[str, Any]:
    try:
        payload = fetch_stock_fund_flow(code)
        return {
            "code": code,
            **payload,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/assistant/chat")
def assistant_chat(
    code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    question: str = Query(..., min_length=2),
) -> Dict[str, Any]:
    try:
        payload = generate_assistant_reply(code, question)
        return {
            "code": code,
            "question": question,
            **payload,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/analysis/close")
def get_close_analysis(
    code: str = Query(..., min_length=6, max_length=6, pattern=r"^\d{6}$"),
    use_llm: bool = Query(False),
) -> Dict[str, Any]:
    try:
        snapshot = build_snapshot(code, include_llm=use_llm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    recommendation = {
        "engine": "close_signal_v1",
        "bias": "hold_for_review" if snapshot["final_decision"]["bias"] == "bullish_watch" else "reduce_risk",
        "note": "Tail-session decision support only. This API does not execute trades.",
    }

    return {
        **snapshot,
        "close_signal": recommendation,
    }


@app.get("/watchlist/analyze")
def analyze_watchlist(
    codes: str = Query(..., description="Comma-separated 6-digit stock codes"),
    use_llm: bool = Query(False),
) -> Dict[str, Any]:
    parsed_codes = [code.strip() for code in codes.split(",") if code.strip()]
    if not parsed_codes:
        raise HTTPException(status_code=400, detail="No stock codes provided.")

    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []

    for code in parsed_codes[:20]:
        if not code.isdigit() or len(code) != 6:
            errors.append({"code": code, "detail": "Invalid 6-digit stock code."})
            continue
        try:
            results.append(build_snapshot(code, include_llm=use_llm))
        except ValueError as exc:
            errors.append({"code": code, "detail": str(exc)})

    return {
        "results": results,
        "errors": errors,
        "meta": {
            "requested_count": len(parsed_codes),
            "processed_count": len(results),
            "error_count": len(errors),
        },
    }


@app.get("/stocks/search")
def search_stocks(
    q: str = Query(..., min_length=1, description="Stock code or company name keyword"),
    limit: int = Query(12, ge=1, le=50),
) -> Dict[str, Any]:
    try:
        universe = get_stock_universe()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    keyword = q.strip().lower()
    matched = universe[
        universe["code"].str.lower().str.contains(keyword, na=False)
        | universe["name"].str.lower().str.contains(keyword, na=False)
    ].head(limit)

    return {
        "query": q,
        "results": [
            {"code": row["code"], "name": row["name"]}
            for _, row in matched.iterrows()
        ],
        "meta": {
            "count": int(len(matched)),
        },
    }


@app.get("/market/quicklists")
def get_market_quicklists_endpoint(
    limit: int = Query(8, ge=4, le=20),
) -> Dict[str, Any]:
    try:
        lists = get_market_quicklists(limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    return {
        "lists": lists,
        "meta": {
            "market": "CN-A",
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "limit": limit,
        },
    }


@app.get("/waizao/pankou")
def get_waizao_pankou(
    code: str = Query(..., min_length=8, description="Market symbol list such as sz000001,sh600000"),
) -> Dict[str, Any]:
    try:
        return waizao_client.get_pankou(code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/waizao/day-kline")
def get_waizao_day_kline(
    code: str = Query(..., description="Single 6-digit A-share stock code"),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    fq: int = Query(1, description="0 no adjust, 1 qfq, 2 hfq"),
) -> Dict[str, Any]:
    try:
        return waizao_client.request_api(
            "getDayKLine",
            {
                "type": 1,
                "code": code,
                "ktype": 101,
                "fq": fq,
                "startDate": start_date,
                "endDate": end_date,
                "fields": "all",
                "filter": "",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/waizao/hour-kline")
def get_waizao_hour_kline(
    code: str = Query(..., description="Single 6-digit A-share stock code"),
    start_date: str = Query(..., description="YYYY-MM-DD HH:mm:ss"),
    end_date: str = Query(..., description="YYYY-MM-DD HH:mm:ss"),
    ktype: int = Query(60, description="5, 15, 30, 60"),
) -> Dict[str, Any]:
    try:
        return waizao_client.request_api(
            "getHourKLine",
            {
                "type": 1,
                "code": code,
                "ktype": ktype,
                "startDate": start_date,
                "endDate": end_date,
                "fields": "all",
                "filter": "",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/waizao/minute-kline")
def get_waizao_minute_kline(
    code: str = Query(..., description="Single 6-digit A-share stock code"),
    start_date: str = Query(..., description="YYYY-MM-DD HH:mm:ss"),
    end_date: str = Query(..., description="YYYY-MM-DD HH:mm:ss"),
) -> Dict[str, Any]:
    try:
        return waizao_client.request_api(
            "getMinuteKLine",
            {
                "type": 1,
                "code": code,
                "startDate": start_date,
                "endDate": end_date,
                "fields": "all",
                "filter": "",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


@app.get("/waizao/base-info")
def get_waizao_base_info(
    code: str = Query(..., description="Single or multiple stock codes separated by commas"),
) -> Dict[str, Any]:
    try:
        return waizao_client.request_api(
            "getBaseInfo",
            {
                "type": 1,
                "code": code,
                "fields": "all",
                "filter": "",
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc


# ══════════════════════════════════════════════════════════════════════════════
#  Market Overview, Sector Browser, and Open AI Chat
# ══════════════════════════════════════════════════════════════════════════════

def fetch_index_quotes_sina() -> List[Dict[str, Any]]:
    """Real-time quotes for major A-share indices via Sina hq."""
    index_keys = [
        {"code": "000001", "name": "上证指数", "key": "s_sh000001"},
        {"code": "399001", "name": "深证成指", "key": "s_sz399001"},
        {"code": "399006", "name": "创业板指", "key": "s_sz399006"},
    ]
    symbols = ",".join(idx["key"] for idx in index_keys)
    url = f"http://hq.sinajs.cn/list={symbols}"
    headers = {**DEFAULT_HEADERS, "Referer": "https://finance.sina.com.cn"}
    resp = requests.get(url, headers=headers, timeout=8)
    text = resp.text

    results = []
    for idx in index_keys:
        match = re.search(rf'hq_str_{idx["key"]}="([^"]*)"', text)
        if match:
            parts = match.group(1).split(",")
            if len(parts) >= 4:
                results.append({
                    "code": idx["code"],
                    "name": parts[0] or idx["name"],
                    "price": safe_float(parts[1]),
                    "change": safe_float(parts[2]),
                    "change_percent": safe_float(parts[3]),
                })
                continue
        results.append({"code": idx["code"], "name": idx["name"], "price": None, "change_percent": None})
    return results


# Sector code cache populated by fetch_sector_list(); avoids a second HTTP call in
# fetch_sector_stocks() when the caller already rendered the sector list.
SECTOR_CODE_CACHE: Dict[str, str] = {}


def fetch_sector_list() -> List[Dict[str, Any]]:
    """Industry sectors via direct EastMoney push API (bypasses AKShare which sends no headers)."""
    url = "https://17.push2.eastmoney.com/api/qt/clist/get"
    params = {
        "pn": "1",
        "pz": "100",
        "po": "1",
        "np": "1",
        "ut": "bd1d9ddb04089700cf9c27f6f7426281",
        "fltt": "2",
        "invt": "2",
        "fid": "f3",
        "fs": "m:90 t:2 f:!50",
        "fields": "f3,f6,f12,f14,f104,f105,f128,f136",
    }
    headers = {
        **DEFAULT_HEADERS,
        "Referer": "https://quote.eastmoney.com/center/boardlist.html",
        "Accept": "application/json, text/plain, */*",
    }
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    diffs = (resp.json().get("data") or {}).get("diff") or []
    if not diffs:
        raise ValueError("EastMoney sector API returned empty diff list.")

    results = []
    for item in diffs:
        name = str(item.get("f14") or "")
        code = str(item.get("f12") or "")
        if name and code:
            SECTOR_CODE_CACHE[name] = code
        results.append({
            "name": name,
            "code": code,
            "change_percent": safe_float(item.get("f3")),
            "amount": safe_float(item.get("f6")),
            "rise_count": int(item.get("f104") or 0),
            "fall_count": int(item.get("f105") or 0),
            "leader": str(item.get("f128") or ""),
            "leader_change": safe_float(item.get("f136")),
        })
    results.sort(key=lambda x: (x["change_percent"] is not None, x["change_percent"] or 0), reverse=True)
    return results


def fetch_sector_stocks(sector_name: str) -> List[Dict[str, Any]]:
    """Stocks in a sector via direct EastMoney push API."""
    board_code = SECTOR_CODE_CACHE.get(sector_name)
    if not board_code:
        # Populate cache via a sector list fetch, then retry.
        fetch_sector_list()
        board_code = SECTOR_CODE_CACHE.get(sector_name)
    if not board_code:
        raise ValueError(f"Unknown sector (no board code found): {sector_name}")

    url = "https://29.push2.eastmoney.com/api/qt/clist/get"
    params = {
        "pn": "1",
        "pz": "100",
        "po": "1",
        "np": "1",
        "ut": "bd1d9ddb04089700cf9c27f6f7426281",
        "fltt": "2",
        "invt": "2",
        "fid": "f3",
        "fs": f"b:{board_code}+f:!50+s:z",
        "fields": "f2,f3,f5,f6,f8,f12,f14",
    }
    headers = {
        **DEFAULT_HEADERS,
        "Referer": f"https://data.eastmoney.com/bkzj/{board_code}.html",
        "Accept": "application/json, text/plain, */*",
    }
    resp = requests.get(url, params=params, headers=headers, timeout=15)
    resp.raise_for_status()
    diffs = (resp.json().get("data") or {}).get("diff") or []

    results = []
    for item in diffs:
        results.append({
            "code": str(item.get("f12") or "").zfill(6),
            "name": str(item.get("f14") or ""),
            "price": safe_float(item.get("f2")),
            "change_percent": safe_float(item.get("f3")),
            "amount": safe_float(item.get("f6")),
            "turnover_rate": safe_float(item.get("f8")),
        })
    results.sort(key=lambda x: (x["change_percent"] is not None, x["change_percent"] or 0), reverse=True)
    return results


def extract_stock_mentions(message: str, universe: pd.DataFrame) -> List[Dict[str, str]]:
    """Find A-share stock names or codes mentioned in message (max 3)."""
    found: Dict[str, str] = {}

    # 6-digit code matches
    for code_match in re.findall(r"\b(\d{6})\b", message):
        row = universe[universe["code"] == code_match]
        if not row.empty and code_match not in found:
            found[code_match] = str(row.iloc[0]["name"])

    # Stock name matches (longer names first to avoid short-name false positives)
    name_code_pairs = sorted(
        zip(universe["name"].tolist(), universe["code"].tolist()),
        key=lambda x: len(x[0]),
        reverse=True,
    )
    for name, code in name_code_pairs:
        if len(found) >= 3:
            break
        if len(name) >= 2 and name in message and code not in found:
            found[code] = name

    return [{"code": code, "name": name} for code, name in found.items()]


# ── New endpoints ──────────────────────────────────────────────────────────────

@app.get("/market/overview")
def get_market_overview() -> Dict[str, Any]:
    errors: List[str] = []
    indices: List[Dict[str, Any]] = []
    hot_sectors: List[Dict[str, Any]] = []

    try:
        indices = fetch_index_quotes_sina()
    except Exception as exc:
        errors.append(f"indices: {exc}")

    try:
        sectors = fetch_sector_list()
        hot_sectors = sectors[:5]
    except Exception as exc:
        errors.append(f"sectors: {exc}")

    return {
        "indices": indices,
        "hot_sectors": hot_sectors,
        "errors": errors,
        "generated_at": datetime.now(tz=SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M"),
    }


@app.get("/market/sectors")
def get_market_sectors() -> Dict[str, Any]:
    try:
        sectors = fetch_sector_list()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    return {
        "sectors": sectors,
        "count": len(sectors),
        "generated_at": datetime.now(tz=SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M"),
    }


@app.get("/market/sector/stocks")
def get_sector_stocks(
    name: str = Query(..., min_length=1, description="Sector name in Chinese, e.g. 新能源车"),
) -> Dict[str, Any]:
    try:
        stocks = fetch_sector_stocks(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Internal server error: {exc}") from exc

    return {
        "sector": name,
        "stocks": stocks,
        "count": len(stocks),
        "generated_at": datetime.now(tz=SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M"),
    }


class ChatPayload(BaseModel):
    message: str
    history: List[Dict[str, str]] = []


@app.post("/chat")
def open_chat(payload: ChatPayload) -> Dict[str, Any]:
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    client = get_openai_client()
    if not client:
        raise HTTPException(status_code=503, detail="LLM not configured on this server.")

    # Extract stock mentions and fetch real-time data for each
    stock_contexts: List[Dict[str, Any]] = []
    try:
        universe = get_stock_universe()
        mentions = extract_stock_mentions(message, universe)
        for m in mentions:
            ctx: Dict[str, Any] = {"code": m["code"], "name": m["name"]}
            try:
                realtime = fetch_realtime_quote(m["code"])
                ctx.update({
                    "price": realtime.get("price"),
                    "change_percent": realtime.get("change_percent"),
                    "high": realtime.get("high"),
                    "low": realtime.get("low"),
                    "amount": realtime.get("amount"),
                    "turnover_rate": realtime.get("turnover_rate"),
                    "pe_ratio": realtime.get("pe_ratio"),
                })
            except Exception:
                pass
            stock_contexts.append(ctx)
    except Exception:
        pass

    # Build system prompt
    now_str = datetime.now(tz=SHANGHAI_TZ).strftime("%Y-%m-%d %H:%M")
    lines = [
        f"你是专业的A股投资分析助手，当前时间 {now_str}（北京时间）。",
        "结合下方实时行情数据给出清晰、有逻辑的分析。不要模糊推辞，直接给出判断依据和建议。",
        "回答控制在300字以内，结构清晰。所有分析仅供参考，不构成投资建议。",
    ]
    if stock_contexts:
        lines.append("\n【实时行情】")
        for s in stock_contexts:
            price_str = str(s["price"]) if s.get("price") is not None else "暂无"
            chg = s.get("change_percent")
            chg_str = f"{chg:+.2f}%" if chg is not None else "-"
            amount = s.get("amount")
            amount_str = f"{amount / 1e8:.1f}亿" if amount else "-"
            pe = s.get("pe_ratio")
            pe_str = f" PE{pe:.1f}" if pe else ""
            lines.append(f"  {s['name']}（{s['code']}）: 现价{price_str} 今日{chg_str} 成交额{amount_str}{pe_str}")

    system_prompt = "\n".join(lines)

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for h in payload.history[-10:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", DEFAULT_LLM_MODEL),
            messages=messages,
            max_tokens=600,
            temperature=0.7,
        )
        reply = resp.choices[0].message.content
        return {
            "content": reply,
            "stocks_fetched": [{"code": s["code"], "name": s["name"]} for s in stock_contexts],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM error: {exc}") from exc
