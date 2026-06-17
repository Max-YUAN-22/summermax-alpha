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

    if "date" not in df.columns and "日期" not in df.columns:
        df = df.reset_index()

    renamed = df.rename(
        columns={
            "日期": "date",
            "收盘": "close",
            "成交量": "volume",
            "date": "date",
            "close": "close",
            "volume": "volume",
            "index": "date",
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


def to_market_symbol(code: str) -> str:
    if code.startswith(("4", "8")):
        return f"bj{code}"
    if code.startswith(("5", "6", "9")):
        return f"sh{code}"
    return f"sz{code}"


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

    raise ValueError(f"Failed to fetch historical stock data: {' | '.join(errors)}")


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
        return fetch_realtime_quote_from_em(code)
    except Exception as exc:
        errors.append(f"spot_em failed: {exc}")

    try:
        return fetch_realtime_quote_from_individual(code)
    except Exception as exc:
        errors.append(f"individual_info_em failed: {exc}")

    raise ValueError(f"Failed to fetch realtime quote data: {' | '.join(errors)}")


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


def build_llm_prompt(snapshot: Dict[str, Any]) -> str:
    return (
        "You are a disciplined A-share market analysis assistant. "
        "Given the JSON snapshot below, produce a short analysis in JSON with keys: "
        "bull_case, bear_case, referee. "
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
                        "Return concise JSON only with keys bull_case, bear_case, referee."
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
    history_df, history_source = fetch_stock_history(code)
    indicators = compute_indicators(history_df)
    realtime = fetch_realtime_quote(code)
    core_snapshot = {
        "code": code,
        "realtime": realtime,
        "indicators": indicators,
    }
    technical_analysis = build_technical_analysis(core_snapshot)
    risk_assessment = build_risk_assessment(core_snapshot)
    final_decision = build_final_decision(core_snapshot)

    snapshot = {
        "code": code,
        "name": realtime["name"],
        "realtime": realtime,
        "indicators": indicators,
        "analysis": technical_analysis,
        "technical_analysis": technical_analysis,
        "risk_assessment": risk_assessment,
        "final_decision": final_decision,
        "meta": {
            "market": "CN-A",
            "history_source": history_source,
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
