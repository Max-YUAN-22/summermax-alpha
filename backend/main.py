import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import akshare as ak
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI


APP_NAME = "SummerMax Quant Alpha API"
APP_VERSION = "0.2.0"
DEFAULT_LLM_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

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

    renamed = df.rename(
        columns={
            "日期": "date",
            "收盘": "close",
            "成交量": "volume",
        }
    )

    required = {"date", "close", "volume"}
    if not required.issubset(renamed.columns):
        raise ValueError("Unexpected historical data format returned from AKShare.")

    normalized = renamed.loc[:, ["date", "close", "volume"]].copy()
    normalized["date"] = pd.to_datetime(normalized["date"])
    normalized["close"] = pd.to_numeric(normalized["close"], errors="coerce")
    normalized["volume"] = pd.to_numeric(normalized["volume"], errors="coerce")
    normalized = normalized.dropna(subset=["date", "close", "volume"]).sort_values("date")

    if normalized.empty:
        raise ValueError("Historical stock data is empty after normalization.")

    return normalized


def fetch_stock_history(code: str) -> pd.DataFrame:
    end_date = datetime.today()
    start_date = end_date - timedelta(days=120)

    try:
        raw_df = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start_date.strftime("%Y%m%d"),
            end_date=end_date.strftime("%Y%m%d"),
            adjust="qfq",
        )
    except Exception as exc:
        raise ValueError(f"Failed to fetch historical stock data: {exc}") from exc

    return normalize_history_dataframe(raw_df).tail(60).reset_index(drop=True)


def normalize_realtime_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        raise ValueError("No realtime quote data returned from data source.")

    return df.copy()


def fetch_realtime_quote(code: str) -> Dict[str, Any]:
    try:
        realtime_df = normalize_realtime_dataframe(ak.stock_zh_a_spot_em())
    except Exception as exc:
        raise ValueError(f"Failed to fetch realtime quote data: {exc}") from exc

    matched = realtime_df[realtime_df["代码"].astype(str) == code]
    if matched.empty:
        raise ValueError("Invalid stock code or realtime quote not available.")

    row = matched.iloc[0]

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
    }


def safe_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def compute_indicators(df: pd.DataFrame) -> Dict[str, Any]:
    working = df.copy()
    working["ma5"] = working["close"].rolling(window=5).mean()
    working["ma10"] = working["close"].rolling(window=10).mean()
    working["ma20"] = working["close"].rolling(window=20).mean()

    latest = working.iloc[-1]

    if pd.isna(latest["ma5"]) or pd.isna(latest["ma10"]) or pd.isna(latest["ma20"]):
        raise ValueError("Not enough trading data to compute moving averages.")

    return {
        "close": round(float(latest["close"]), 2),
        "ma5": round(float(latest["ma5"]), 2),
        "ma10": round(float(latest["ma10"]), 2),
        "ma20": round(float(latest["ma20"]), 2),
        "volume": round(float(latest["volume"]), 2),
        "date": latest["date"].strftime("%Y-%m-%d"),
    }


def build_rule_analysis(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    indicators = snapshot["indicators"]
    realtime = snapshot["realtime"]
    signals: List[str] = []

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

    return {
        "engine": "rules_v2",
        "summary": summary,
        "detail": detail,
        "signals": signals,
        "next_step": "This block can be replaced or augmented by a GPT analysis layer.",
    }


def build_llm_prompt(snapshot: Dict[str, Any]) -> str:
    return (
        "You are a disciplined A-share market analysis assistant. "
        "Given the JSON snapshot below, produce a short analysis in JSON with keys: "
        "summary, detail, risk, action_bias. "
        "Do not provide execution instructions, guarantees, or promises. "
        "Keep it factual, concise, and suitable for a decision-support dashboard.\n\n"
        f"{json.dumps(snapshot, ensure_ascii=False)}"
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
                        "You are a disciplined A-share market analysis assistant. "
                        "Return concise JSON only."
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
    history_df = fetch_stock_history(code)
    indicators = compute_indicators(history_df)
    realtime = fetch_realtime_quote(code)

    snapshot = {
        "code": code,
        "name": realtime["name"],
        "realtime": realtime,
        "indicators": indicators,
        "analysis": build_rule_analysis(
            {
                "code": code,
                "realtime": realtime,
                "indicators": indicators,
            }
        ),
        "meta": {
            "market": "CN-A",
            "history_source": "akshare.stock_zh_a_hist",
            "realtime_source": "akshare.stock_zh_a_spot_em",
            "lookback_trading_days": 60,
            "adjustment": "qfq",
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "llm_enabled": include_llm,
        },
    }

    snapshot["llm_analysis"] = generate_llm_analysis(snapshot) if include_llm else None
    return snapshot


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "llm_configured": bool(os.getenv("OPENAI_API_KEY")),
    }


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
        "bias": "hold_for_review" if snapshot["analysis"]["summary"] == "bullish short-term" else "reduce_risk",
        "note": "Tail-session decision support only. This API does not execute trades.",
    }

    return {
        **snapshot,
        "close_signal": recommendation,
    }
