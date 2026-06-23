import hashlib
import json
import os
import re
import secrets
import smtplib
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

import jwt as pyjwt
import akshare as ak
import pandas as pd
import requests
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
try:
    import anthropic as _anthropic
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False
from pydantic import BaseModel


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

# ── Auth constants ────────────────────────────────────────────────────────────

DB_PATH = os.path.join(BACKEND_DIR, "summermax.db")
JWT_SECRET = os.getenv("JWT_SECRET", "summermax-dev-secret-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 7
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "false").lower() == "true"

# ── Database ──────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            email        TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'user',
            is_verified  INTEGER NOT NULL DEFAULT 1,
            created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS verification_codes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT NOT NULL,
            code       TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used       INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT NOT NULL,
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            ts         INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS portfolio (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT NOT NULL,
            code       TEXT NOT NULL,
            name       TEXT NOT NULL,
            buy_price  REAL NOT NULL,
            shares     REAL NOT NULL DEFAULT 0,
            buy_date   TEXT NOT NULL DEFAULT (date('now')),
            note       TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS usage_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            email      TEXT NOT NULL,
            action     TEXT NOT NULL DEFAULT 'chat',
            cost       INTEGER NOT NULL DEFAULT 1,
            model      TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    conn.commit()

    # Migrate: add balance + llm_model columns if they don't exist yet
    for col, dfn in [("balance", "INTEGER NOT NULL DEFAULT 100"),
                     ("llm_model", "TEXT NOT NULL DEFAULT ''")]:
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} {dfn}")
            conn.commit()
        except Exception:
            pass  # column already exists

    # Seed admin accounts from env vars
    for i in (1, 2):
        email = os.getenv(f"ADMIN_EMAIL_{i}", "").strip().lower()
        password = os.getenv(f"ADMIN_PASSWORD_{i}", "").strip()
        if email and password:
            pw_hash = _hash_password(password)
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO users (email, password_hash, role) VALUES (?, ?, 'admin')",
                    (email, pw_hash),
                )
                conn.commit()
            except Exception:
                pass

    conn.close()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(32)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
    return f"{salt}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, dk_hex = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
        return secrets.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def _create_token(email: str, role: str) -> str:
    payload = {
        "sub": email,
        "role": role,
        "exp": datetime.now(tz=SHANGHAI_TZ) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def _get_token_from_header(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return _decode_token(authorization[7:])


def _send_verification_email(to_email: str, code: str) -> bool:
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", os.getenv("SMTP_PASSWORD", ""))
    from_name = os.getenv("SMTP_FROM_NAME", "SummerMax Alpha")

    if not host or not user:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"【SummerMax Alpha】注册验证码 {code}"
    msg["From"] = f"{from_name} <{user}>"
    msg["To"] = to_email
    body = (
        f"您好！\n\n"
        f"您的 SummerMax Alpha 注册验证码是：\n\n"
        f"    {code}\n\n"
        f"验证码 10 分钟内有效，请勿泄露给他人。\n\n"
        f"如非本人操作，请忽略此邮件。\n\n"
        f"— SummerMax Alpha 团队"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
        return True
    except Exception:
        return False


# ── Auth Pydantic models ──────────────────────────────────────────────────────

class SendCodeRequest(BaseModel):
    email: str


class RegisterRequest(BaseModel):
    email: str
    code: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class SaveHistoryRequest(BaseModel):
    messages: List[Dict[str, Any]]


class AddPositionRequest(BaseModel):
    code: str
    name: str
    buy_price: float
    shares: float = 0
    note: str = ""


# ── Auth endpoints ────────────────────────────────────────────────────────────


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

# Initialize DB (creates tables + seeds admin accounts)
init_db()


@app.middleware("http")
async def disable_frontend_caching(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in {"/", "/workspace", "/debug", "/scan"} or path.startswith("/app/"):
        for key, value in NO_CACHE_HEADERS.items():
            response.headers[key] = value
    return response


# ── Health / keep-alive ───────────────────────────────────────────────────────

@app.get("/ping")
def ping() -> Dict[str, str]:
    return {"status": "ok"}


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/auth/send-code")
def auth_send_code(payload: SendCodeRequest) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="邮箱格式不正确")

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")

    code = str(secrets.randbelow(1_000_000)).zfill(6)
    expires_at = (datetime.now(tz=SHANGHAI_TZ) + timedelta(minutes=10)).isoformat()

    # Invalidate all previous codes for this email
    conn.execute("UPDATE verification_codes SET used = 1 WHERE email = ?", (email,))
    conn.execute(
        "INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)",
        (email, code, expires_at),
    )
    conn.commit()
    conn.close()

    smtp_configured = bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER"))
    if smtp_configured:
        sent = _send_verification_email(email, code)
        if not sent:
            raise HTTPException(status_code=500, detail="邮件发送失败，请联系管理员")
        return {"message": "验证码已发送到您的邮箱，10 分钟内有效"}
    else:
        # Dev mode: return code directly
        return {"message": f"[开发模式] 验证码：{code}（SMTP 未配置，仅供测试）", "dev_code": code}


@app.post("/auth/register")
def auth_register(payload: RegisterRequest) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    code = payload.code.strip()

    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="密码至少需要 8 位")

    conn = get_db()
    now_iso = datetime.now(tz=SHANGHAI_TZ).isoformat()
    vc = conn.execute(
        "SELECT id FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1",
        (email, code, now_iso),
    ).fetchone()
    if not vc:
        conn.close()
        raise HTTPException(status_code=400, detail="验证码错误或已过期，请重新获取")

    conn.execute("UPDATE verification_codes SET used = 1 WHERE id = ?", (vc["id"],))
    pw_hash = _hash_password(payload.password)
    try:
        conn.execute(
            "INSERT INTO users (email, password_hash, role, is_verified) VALUES (?, ?, 'user', 1)",
            (email, pw_hash),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")
    conn.close()

    token = _create_token(email, "user")
    return {"token": token, "email": email, "role": "user", "message": "注册成功，欢迎使用 SummerMax Alpha"}


@app.post("/auth/login")
def auth_login(payload: LoginRequest) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    password = payload.password

    # Check admin accounts from env vars first (works without any database)
    for i in (1, 2):
        admin_email = os.getenv(f"ADMIN_EMAIL_{i}", "").strip().lower()
        admin_pw = os.getenv(f"ADMIN_PASSWORD_{i}", "").strip()
        if admin_email and email == admin_email:
            if not admin_pw or not secrets.compare_digest(password, admin_pw):
                raise HTTPException(status_code=401, detail="邮箱或密码错误")
            token = _create_token(email, "admin")
            return {"token": token, "email": email, "role": "admin", "message": "登录成功"}

    # Fall back to database for regular registered users
    try:
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        if user and _verify_password(password, user["password_hash"]):
            token = _create_token(email, user["role"])
            return {"token": token, "email": email, "role": user["role"], "message": "登录成功"}
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="邮箱或密码错误")


@app.get("/auth/me")
def auth_me(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="未登录或 Token 已过期")
    email = claims["sub"]
    role = claims.get("role", "user")
    balance = 999999  # admin gets unlimited display
    llm_model = ""
    if role != "admin":
        try:
            conn = get_db()
            row = conn.execute("SELECT balance, llm_model FROM users WHERE email = ?", (email,)).fetchone()
            conn.close()
            if row:
                balance = row["balance"]
                llm_model = row["llm_model"] or ""
        except Exception:
            pass
    return {"email": email, "role": role, "balance": balance, "llm_model": llm_model}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@app.post("/user/change-password")
def change_password(payload: ChangePasswordRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    user = conn.execute("SELECT password_hash FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    if not _verify_password(payload.current_password, user["password_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if len(payload.new_password) < 8:
        conn.close()
        raise HTTPException(status_code=400, detail="新密码至少需要 8 位")
    new_hash = _hash_password(payload.new_password)
    conn.execute("UPDATE users SET password_hash = ? WHERE email = ?", (new_hash, email))
    conn.commit()
    conn.close()
    return {"ok": True, "message": "密码修改成功"}


class UserSettingsRequest(BaseModel):
    llm_model: Optional[str] = None


@app.get("/user/settings")
def get_user_settings(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    try:
        conn = get_db()
        row = conn.execute("SELECT balance, llm_model FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()
        if row:
            return {"balance": row["balance"], "llm_model": row["llm_model"] or ""}
    except Exception:
        pass
    return {"balance": 0, "llm_model": ""}


@app.put("/user/settings")
def update_user_settings(payload: UserSettingsRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    allowed_models = {"", "claude-sonnet-4-6", "gpt-5.5"}
    model = (payload.llm_model or "").strip()
    if model not in allowed_models:
        raise HTTPException(status_code=400, detail=f"不支持的模型: {model}")
    try:
        conn = get_db()
        conn.execute("UPDATE users SET llm_model = ? WHERE email = ?", (model, email))
        conn.commit()
        conn.close()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True, "llm_model": model}


@app.get("/admin/users")
def admin_list_users(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims or claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    conn = get_db()
    rows = conn.execute(
        "SELECT id, email, role, balance, llm_model, created_at FROM users ORDER BY id ASC"
    ).fetchall()
    conn.close()
    return {"users": [dict(r) for r in rows]}


class AdminBalanceRequest(BaseModel):
    email: str
    delta: int  # positive = add, negative = deduct


@app.post("/admin/balance")
def admin_adjust_balance(payload: AdminBalanceRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims or claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    conn = get_db()
    user = conn.execute("SELECT balance FROM users WHERE email = ?", (payload.email.strip().lower(),)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    new_balance = max(0, user["balance"] + payload.delta)
    conn.execute("UPDATE users SET balance = ? WHERE email = ?", (new_balance, payload.email.strip().lower()))
    conn.commit()
    conn.close()
    return {"ok": True, "email": payload.email, "new_balance": new_balance}


@app.get("/admin/usage")
def admin_usage_log(
    limit: int = 50,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims or claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    conn = get_db()
    rows = conn.execute(
        "SELECT email, action, cost, model, created_at FROM usage_log ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return {"logs": [dict(r) for r in rows]}


@app.get("/user/usage")
def user_usage_log(
    limit: int = 20,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    rows = conn.execute(
        "SELECT action, cost, model, created_at FROM usage_log WHERE email = ? ORDER BY id DESC LIMIT ?",
        (email, limit),
    ).fetchall()
    conn.close()
    return {"usage": [dict(r) for r in rows]}


# ── Per-user chat history ─────────────────────────────────────────────────────

@app.get("/user/history")
def get_user_history(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    rows = conn.execute(
        "SELECT role, content, ts FROM chat_history WHERE email = ? ORDER BY ts ASC LIMIT 100",
        (email,),
    ).fetchall()
    conn.close()
    return {"messages": [{"role": r["role"], "content": r["content"], "ts": r["ts"]} for r in rows]}


@app.post("/user/history")
def save_user_history(payload: SaveHistoryRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    for msg in payload.messages:
        role = str(msg.get("role", ""))
        content = str(msg.get("content", ""))
        ts = int(msg.get("ts") or 0)
        if role in ("user", "assistant") and content:
            conn.execute(
                "INSERT INTO chat_history (email, role, content, ts) VALUES (?, ?, ?, ?)",
                (email, role, content, ts),
            )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/user/history")
def clear_user_history(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    conn.execute("DELETE FROM chat_history WHERE email = ?", (email,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Per-user portfolio ────────────────────────────────────────────────────────

@app.get("/user/portfolio")
def get_portfolio(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    rows = conn.execute(
        "SELECT id, code, name, buy_price, shares, buy_date, note FROM portfolio WHERE email = ? ORDER BY id DESC",
        (email,),
    ).fetchall()
    conn.close()
    return {"positions": [dict(r) for r in rows]}


@app.post("/user/portfolio")
def add_portfolio_position(payload: AddPositionRequest, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    buy_date = datetime.now(tz=SHANGHAI_TZ).strftime("%Y-%m-%d")
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO portfolio (email, code, name, buy_price, shares, buy_date, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (email, payload.code.strip(), payload.name.strip(), payload.buy_price, payload.shares, buy_date, payload.note.strip()),
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": new_id, "ok": True}


@app.delete("/user/portfolio/{position_id}")
def delete_portfolio_position(position_id: int, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    claims = _get_token_from_header(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="请先登录")
    email = claims["sub"]
    conn = get_db()
    conn.execute("DELETE FROM portfolio WHERE id = ? AND email = ?", (position_id, email))
    conn.commit()
    conn.close()
    return {"ok": True}



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


def get_anthropic_client() -> Optional[Any]:
    if not _ANTHROPIC_AVAILABLE:
        return None
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    base_url = os.getenv("ANTHROPIC_BASE_URL")
    if base_url:
        return _anthropic.Anthropic(api_key=api_key, base_url=base_url)
    return _anthropic.Anthropic(api_key=api_key)


def is_claude_model(model: str) -> bool:
    return model.startswith("claude")


def openai_tools_to_anthropic(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert OpenAI function-calling tool spec to Anthropic tool spec."""
    result = []
    for t in tools:
        fn = t.get("function", {})
        result.append({
            "name": fn["name"],
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}, "required": []}),
        })
    return result


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
    raise NotImplementedError


def fetch_stock_history_from_waizao(code: str, start_date: datetime, end_date: datetime) -> pd.DataFrame:
    raise NotImplementedError


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
    # For 60min use 60 days of history; for 15min use 15 days
    lookback_days = 60 if period == "60" else 15
    start_date = end_date - timedelta(days=lookback_days)

    errors: list = []

    # Try different date-format variants (AKShare version differences)
    for date_fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        for adj in ("", "qfq"):
            try:
                raw_df = ak.stock_zh_a_hist_min_em(
                    symbol=code,
                    start_date=start_date.strftime(date_fmt),
                    end_date=end_date.strftime(date_fmt),
                    period=period,
                    adjust=adj,
                )
                if raw_df is not None and not raw_df.empty:
                    break
                errors.append(f"empty result (fmt={date_fmt}, adj={adj})")
            except Exception as exc:
                errors.append(f"exception (fmt={date_fmt}, adj={adj}): {exc}")
                raw_df = None
        else:
            continue
        break
    else:
        raise ValueError(f"All intraday fetch attempts failed: {'; '.join(errors)}")

    if raw_df is None or raw_df.empty:
        raise ValueError(f"No intraday data returned. Attempts: {'; '.join(errors)}")

    # Normalise column names (AKShare may return Chinese or English headers)
    col_map = {
        "时间": "date", "日期时间": "date", "datetime": "date",
        "开盘": "open", "open": "open",
        "最高": "high", "high": "high",
        "最低": "low", "low": "low",
        "收盘": "close", "close": "close",
        "成交量": "volume", "volume": "volume",
        "成交额": "amount", "amount": "amount",
        "换手率": "turnover_rate", "turnover_rate": "turnover_rate",
    }
    renamed = raw_df.rename(columns={c: col_map[c] for c in raw_df.columns if c in col_map})

    required = {"date", "open", "high", "low", "close", "volume"}
    missing = required - set(renamed.columns)
    if missing:
        raise ValueError(f"Missing columns after rename: {missing}. Got: {list(renamed.columns)}")

    keep = [c for c in ["date", "open", "high", "low", "close", "volume", "amount", "turnover_rate"] if c in renamed.columns]
    normalized = renamed[keep].copy()
    normalized["date"] = pd.to_datetime(normalized["date"])
    for field in ["open", "high", "low", "close", "volume", "amount", "turnover_rate"]:
        if field in normalized.columns:
            normalized[field] = pd.to_numeric(normalized[field], errors="coerce")
    normalized = normalized.dropna(subset=["date", "open", "high", "low", "close", "volume"]).sort_values("date")
    if normalized.empty:
        raise ValueError("Intraday data empty after normalization.")
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
    raise NotImplementedError


def fetch_intraday_bars_from_em(code: str) -> pd.DataFrame:
    raw_df = ak.stock_zh_a_hist_min_em(symbol=code, period="15", adjust="")
    return normalize_intraday_dataframe(raw_df)


def fetch_intraday_bars_from_waizao(code: str) -> pd.DataFrame:
    raise NotImplementedError


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


FUNDAMENTALS_CACHE: Dict[str, Any] = {}
FUNDAMENTALS_CACHE_TTL = timedelta(hours=4)


def fetch_stock_fundamentals(code: str) -> Dict[str, Any]:
    """Fetch key financial ratios for a stock via AKShare (quarterly data, cached 4h)."""
    entry = FUNDAMENTALS_CACHE.get(code)
    if entry and datetime.now() - entry["loaded_at"] < FUNDAMENTALS_CACHE_TTL:
        return entry["data"]

    def _safe_ratio(val: Any) -> Optional[float]:
        if val is None:
            return None
        try:
            if pd.isna(val):
                return None
        except Exception:
            pass
        try:
            s = str(val).replace("%", "").strip()
            return round(float(s), 2)
        except (ValueError, TypeError):
            return None

    try:
        df = ak.stock_financial_analysis_indicator(symbol=code)
        if df is None or df.empty:
            return {"error": "暂无财务数据", "code": code}
        latest = df.iloc[-1]
        result: Dict[str, Any] = {
            "code": code,
            "report_date": str(latest.get("报告期", "")),
            "eps": _safe_ratio(latest.get("每股收益")),
            "roe": _safe_ratio(latest.get("净资产收益率")),
            "gross_margin": _safe_ratio(latest.get("销售毛利率")),
            "debt_ratio": _safe_ratio(latest.get("资产负债率")),
            "current_ratio": _safe_ratio(latest.get("流动比率")),
            "quick_ratio": _safe_ratio(latest.get("速动比率")),
            "revenue_growth": _safe_ratio(latest.get("营业收入同比增长率")),
            "profit_growth": _safe_ratio(latest.get("净利润同比增长率")),
            "pe": _safe_ratio(latest.get("市盈率-动态")),
            "pb": _safe_ratio(latest.get("市净率")),
        }
        FUNDAMENTALS_CACHE[code] = {"data": result, "loaded_at": datetime.now()}
        return result
    except Exception as exc:
        return {"error": str(exc), "code": code}


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
        import traceback as _tb
        detail = f"{exc} | {_tb.format_exc()[-400:]}"
        raise HTTPException(status_code=500, detail=detail) from exc

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
def get_waizao_pankou(code: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="waizao API removed")


@app.get("/waizao/day-kline")
def get_waizao_day_kline(code: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="waizao API removed")


@app.get("/waizao/hour-kline")
def get_waizao_hour_kline(code: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="waizao API removed")


@app.get("/waizao/minute-kline")
def get_waizao_minute_kline(code: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="waizao API removed")


@app.get("/waizao/base-info")
def get_waizao_base_info(code: str = Query(...)) -> Dict[str, Any]:
    raise HTTPException(status_code=410, detail="waizao API removed")


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
_SECTOR_LIST_CACHE: Dict[str, Any] = {"data": None, "loaded_at": None}
_SECTOR_LIST_TTL = timedelta(minutes=10)


def fetch_sector_list() -> List[Dict[str, Any]]:
    """Industry sectors via direct EastMoney push API (bypasses AKShare which sends no headers)."""
    entry = _SECTOR_LIST_CACHE
    if entry["data"] and entry["loaded_at"] and datetime.now() - entry["loaded_at"] < _SECTOR_LIST_TTL:
        return entry["data"]
    url = "https://82.push2.eastmoney.com/api/qt/clist/get"
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
    _SECTOR_LIST_CACHE["data"] = results
    _SECTOR_LIST_CACHE["loaded_at"] = datetime.now()
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

    url = "https://82.push2.eastmoney.com/api/qt/clist/get"
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


CHINESE_NUM_MAP = {
    "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}


def _last_trading_day_on_or_before(d: datetime) -> datetime:
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _prev_trading_days(d: datetime, n: int) -> datetime:
    count = 0
    while count < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            count += 1
    return d


def detect_historical_date(message: str) -> Optional[datetime]:
    """Return the trading date a message refers to, or None for today/future/unknown."""
    now = datetime.now(tz=SHANGHAI_TZ).replace(tzinfo=None)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def cn_to_int(s: str) -> Optional[int]:
        return CHINESE_NUM_MAP.get(s) or (int(s) if s.isdigit() else None)

    # "N个交易日前"
    m = re.search(r"([一两二三四五六七八九十\d]+)\s*个?交易日前", message)
    if m:
        n = cn_to_int(m.group(1))
        if n:
            return _prev_trading_days(today, n)

    # "N天前"
    m = re.search(r"([一两二三四五六七八九十\d]+)\s*天前", message)
    if m:
        n = cn_to_int(m.group(1))
        if n:
            return _last_trading_day_on_or_before(today - timedelta(days=n))

    # "昨天", "昨日"
    if re.search(r"昨[天日]", message):
        return _last_trading_day_on_or_before(today - timedelta(days=1))

    # "前天"
    if "前天" in message:
        return _last_trading_day_on_or_before(today - timedelta(days=2))

    # "上周X"
    weekday_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
    m = re.search(r"上[周週]([一二三四五六日天])", message)
    if m:
        target_wd = weekday_map.get(m.group(1))
        if target_wd is not None:
            days_back = (today.weekday() - target_wd) % 7 or 7
            return _last_trading_day_on_or_before(today - timedelta(days=days_back))

    # "6月18日" / "06/18"
    m = re.search(r"(\d{1,2})[月/](\d{1,2})[日号]?", message)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        for year in (now.year, now.year - 1):
            try:
                d = datetime(year, month, day)
                if d < today:
                    return _last_trading_day_on_or_before(d)
            except ValueError:
                pass

    # "2026-06-18" / "2026/06/18"
    m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", message)
    if m:
        try:
            d = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if d < today:
                return _last_trading_day_on_or_before(d)
        except ValueError:
            pass

    return None


def fetch_historical_market_overview(target_date: datetime) -> Dict[str, Any]:
    """Fetch historical index data for a past date via AKShare."""
    date_str = target_date.strftime("%Y%m%d")
    result: Dict[str, Any] = {
        "date": target_date.strftime("%Y-%m-%d"),
        "indices": [],
    }
    for symbol, name in [("000001", "上证指数"), ("399001", "深证成指"), ("399006", "创业板指")]:
        try:
            df = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date=date_str, end_date=date_str)
            if df is not None and not df.empty:
                row = df.iloc[-1]
                result["indices"].append({
                    "name": name,
                    "open": safe_float(row.get("开盘")),
                    "close": safe_float(row.get("收盘")),
                    "high": safe_float(row.get("最高")),
                    "low": safe_float(row.get("最低")),
                    "change_percent": safe_float(row.get("涨跌幅")),
                    "volume": safe_float(row.get("成交量")),
                    "amount": safe_float(row.get("成交额")),
                })
        except Exception:
            pass
    return result


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


# ── Full market snapshot cache (powers screen_stocks tool) ────────────────────

FULL_MARKET_CACHE: Dict[str, Any] = {"data": None, "loaded_at": None}
FULL_MARKET_TTL = timedelta(minutes=15)
_CACHE_LOCK = threading.Lock()
_FETCH_IN_PROGRESS = threading.Event()


def _fetch_market_data() -> List[Dict[str, Any]]:
    """Fetch all A-shares from AKShare (primary) or EastMoney (fallback).
    Called outside the lock so concurrent requests get stale cache, not blocked."""
    stocks: List[Dict[str, Any]] = []

    # Primary: AKShare one-shot (returns ~5500 stocks)
    try:
        df = ak.stock_zh_a_spot_em()
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                code = str(row.get("代码") or "").zfill(6)
                if not code or code == "000000":
                    continue
                price = safe_float(row.get("最新价")) or 0
                if price <= 0:
                    continue
                chg = safe_float(row.get("涨跌幅")) or 0
                vol_ratio = safe_float(row.get("量比")) or 0
                turnover = safe_float(row.get("换手率")) or 0
                amount = safe_float(row.get("成交额")) or 0
                pe_ratio = safe_float(row.get("市盈率-动态"))
                pb_ratio = safe_float(row.get("市净率"))
                # Qlib-style composite quality score:
                # reward moderate gain + high vol_ratio + healthy turnover
                # penalise near-limit stocks (>9%) and very low volume
                quality = 0.0
                if 0 < chg < 9:
                    quality += min(chg, 7) * 0.3
                if vol_ratio > 1:
                    quality += min(vol_ratio, 5) * 0.4
                if 2 <= turnover <= 15:
                    quality += turnover * 0.15
                if amount >= 1e8:
                    quality += 1.0
                stocks.append({
                    "code": code,
                    "name": str(row.get("名称") or ""),
                    "price": price,
                    "change_percent": chg,
                    "amount": amount,
                    "turnover_rate": turnover,
                    "vol_ratio": vol_ratio,
                    "pe_ratio": pe_ratio,
                    "pb_ratio": pb_ratio,
                    "rise_speed": safe_float(row.get("涨速")) or 0,
                    "quality_score": round(quality, 2),
                })
    except Exception:
        pass

    # Fallback: EastMoney direct pagination
    if not stocks:
        _fs = "m:0+t:6,m:0+t:13,m:0+t:80,m:1+t:2,m:1+t:23"
        seen: set = set()
        for page in range(1, 13):
            try:
                resp = requests.get(
                    "https://82.push2.eastmoney.com/api/qt/clist/get",
                    params={
                        "pn": page, "pz": "500", "po": "1", "np": "1",
                        "ut": "bd1d9ddb04089700cf9c27f6f7426281",
                        "fltt": "2", "invt": "2", "fid": "f3", "fs": _fs,
                        "fields": "f2,f3,f6,f8,f10,f11,f12,f14",
                    },
                    headers={**DEFAULT_HEADERS, "Referer": "https://quote.eastmoney.com/center/boardlist.html"},
                    timeout=12,
                )
                resp.raise_for_status()
                diffs = (resp.json().get("data") or {}).get("diff") or []
                if not diffs:
                    break
                for item in diffs:
                    code = str(item.get("f12") or "").zfill(6)
                    if not code or code == "000000" or code in seen:
                        continue
                    seen.add(code)
                    price = safe_float(item.get("f2")) or 0
                    if price <= 0:
                        continue
                    chg = safe_float(item.get("f3")) or 0
                    vol_ratio = safe_float(item.get("f10")) or 0
                    turnover = safe_float(item.get("f8")) or 0
                    amount = safe_float(item.get("f6")) or 0
                    quality = 0.0
                    if 0 < chg < 9:
                        quality += min(chg, 7) * 0.3
                    if vol_ratio > 1:
                        quality += min(vol_ratio, 5) * 0.4
                    if 2 <= turnover <= 15:
                        quality += turnover * 0.15
                    if amount >= 1e8:
                        quality += 1.0
                    stocks.append({
                        "code": code,
                        "name": str(item.get("f14") or ""),
                        "price": price,
                        "change_percent": chg,
                        "amount": amount,
                        "turnover_rate": turnover,
                        "vol_ratio": vol_ratio,
                        "rise_speed": safe_float(item.get("f11")) or 0,
                        "quality_score": round(quality, 2),
                    })
            except Exception:
                break

    return stocks


def get_full_market_snapshot() -> List[Dict[str, Any]]:
    entry = FULL_MARKET_CACHE
    # Return cached data if still fresh
    if entry["data"] and entry["loaded_at"] and datetime.now() - entry["loaded_at"] < FULL_MARKET_TTL:
        return entry["data"]
    # If another thread is already fetching, return stale cache immediately
    if not _FETCH_IN_PROGRESS.is_set():
        _FETCH_IN_PROGRESS.set()
        try:
            stocks = _fetch_market_data()
            if stocks:
                with _CACHE_LOCK:
                    FULL_MARKET_CACHE["data"] = stocks
                    FULL_MARKET_CACHE["loaded_at"] = datetime.now()
        finally:
            _FETCH_IN_PROGRESS.clear()
    return FULL_MARKET_CACHE.get("data") or []



def _prewarm_market_cache() -> None:
    try:
        get_full_market_snapshot()
    except Exception:
        pass
    try:
        fetch_sector_list()
    except Exception:
        pass


threading.Thread(target=_prewarm_market_cache, daemon=True).start()


# ── Chat tool definitions ─────────────────────────────────────────────────────

CHAT_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "screen_stocks",
            "description": (
                "从全量A股中按条件筛选股票。支持涨跌幅、成交额、换手率、量比过滤和排序。"
                "例如：筛换手率3-10%且涨幅2-8%且成交额>1亿的强势股。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "min_change_pct": {"type": "number", "description": "最小涨跌幅(%)，如 2.0"},
                    "max_change_pct": {"type": "number", "description": "最大涨跌幅(%)，如 9.9"},
                    "min_amount": {"type": "number", "description": "最小成交额(元)，如 1e8=1亿"},
                    "min_turnover_pct": {"type": "number", "description": "最小换手率(%)"},
                    "max_turnover_pct": {"type": "number", "description": "最大换手率(%)"},
                    "min_vol_ratio": {"type": "number", "description": "最小量比"},
                    "min_pe": {"type": "number", "description": "最小市盈率（动态PE），如 5"},
                    "max_pe": {"type": "number", "description": "最大市盈率（动态PE），如 30，过滤高估值"},
                    "max_pb": {"type": "number", "description": "最大市净率，如 3"},
                    "sort_by": {
                        "type": "string",
                        "enum": ["quality_score", "change_percent", "amount", "turnover_rate", "vol_ratio"],
                        "description": "排序字段，尾盘选股推荐用 quality_score（综合因子得分），其次 change_percent",
                    },
                    "limit": {"type": "integer", "description": "返回数量，默认30，最多50"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_data",
            "description": (
                "获取某只A股的完整分析数据：实时行情、60日技术指标（MA/RSI/MACD/KDJ）、"
                "综合评分、技术信号、风险评估和操作建议。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "6位A股代码，如 '600519'"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sector_overview",
            "description": "获取今日全部行业板块涨跌排名，包含成交额、涨跌家数、领涨股，用于判断资金方向和板块轮动。",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sector_stocks",
            "description": "获取指定行业板块内所有个股的今日实时行情，用于板块内选股。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sector_name": {
                        "type": "string",
                        "description": "板块中文名，如 '半导体'、'新能源车'、'人工智能'、'创新药'",
                    },
                },
                "required": ["sector_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_capital_flow",
            "description": "获取某只股票近10日主力资金净流入/流出趋势，判断机构持续进场还是出逃。",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "6位A股代码"},
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fundamentals",
            "description": (
                "获取某只A股的核心财务指标：ROE、毛利率、资产负债率、EPS、营收/净利润增速、PE、PB。"
                "用于在技术指标之外验证基本面质量，避免推荐财务恶化的股票。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "6位A股代码，如 '600519'"},
                },
                "required": ["code"],
            },
        },
    },
]


def execute_tool_call(name: str, args: Dict[str, Any], market_context: Optional[Dict[str, Any]]) -> Any:
    if name == "screen_stocks":
        try:
            stocks = get_full_market_snapshot()
        except Exception:
            stocks = []
        if not stocks and market_context:
            stocks = list(market_context.get("top_movers") or [])
        if not stocks:
            return {
                "total_matched": 0, "stocks": [],
                "data_status": "unavailable",
                "note": "全市场行情数据当前不可用（可能是数据源故障或非交易时段）。请勿重试，直接告知用户数据无法获取，不要编造股票。",
            }
        universe = [s for s in stocks if (s.get("price") or 0) > 0 and s.get("name")]
        result = universe
        min_chg = args.get("min_change_pct")
        max_chg = args.get("max_change_pct")
        min_amt = args.get("min_amount")
        min_turn = args.get("min_turnover_pct")
        max_turn = args.get("max_turnover_pct")
        min_volr = args.get("min_vol_ratio")
        if min_chg is not None:
            result = [s for s in result if (s.get("change_percent") or 0) >= min_chg]
        if max_chg is not None:
            result = [s for s in result if (s.get("change_percent") or 0) <= max_chg]
        if min_amt is not None:
            result = [s for s in result if (s.get("amount") or 0) >= min_amt]
        if min_turn is not None:
            result = [s for s in result if (s.get("turnover_rate") or 0) >= min_turn]
        if max_turn is not None:
            result = [s for s in result if (s.get("turnover_rate") or 0) <= max_turn]
        if min_volr is not None:
            result = [s for s in result if (s.get("vol_ratio") or 0) >= min_volr]
        min_pe = args.get("min_pe")
        max_pe = args.get("max_pe")
        max_pb = args.get("max_pb")
        if min_pe is not None:
            result = [s for s in result if s.get("pe_ratio") is not None and s["pe_ratio"] >= min_pe]
        if max_pe is not None:
            result = [s for s in result if s.get("pe_ratio") is not None and 0 < s["pe_ratio"] <= max_pe]
        if max_pb is not None:
            result = [s for s in result if s.get("pb_ratio") is not None and 0 < s["pb_ratio"] <= max_pb]
        sort_key = args.get("sort_by", "quality_score")
        result.sort(key=lambda x: x.get(sort_key) or 0, reverse=True)
        limit = min(int(args.get("limit", 30)), 50)
        return {
            "total_matched": len(result),
            "universe_size": len(universe),
            "data_status": "ok",
            "stocks": result[:limit],
        }

    if name == "get_stock_data":
        code = str(args.get("code", "")).strip().zfill(6)
        try:
            snap = build_snapshot(code, include_llm=False)
            return {
                "code": code,
                "name": snap.get("name"),
                "realtime": snap.get("realtime"),
                "indicators": snap.get("indicators"),
                "scorecard": snap.get("scorecard"),
                "analysis": {
                    "summary": (snap.get("analysis") or {}).get("summary"),
                    "signals": (snap.get("analysis") or {}).get("signals"),
                    "aggregate_score": (snap.get("analysis") or {}).get("aggregate_score"),
                },
                "risk": snap.get("risk_assessment"),
                "final_decision": snap.get("final_decision"),
            }
        except Exception as exc:
            return {"error": str(exc), "code": code}

    if name == "get_sector_overview":
        try:
            return {"sectors": fetch_sector_list()[:35]}
        except Exception as exc:
            return {"error": str(exc)}

    if name == "get_sector_stocks":
        sector_name = str(args.get("sector_name", ""))
        try:
            stocks = fetch_sector_stocks(sector_name)
            return {"sector": sector_name, "count": len(stocks), "stocks": stocks[:50]}
        except Exception as exc:
            return {"error": str(exc), "sector": sector_name}

    if name == "get_capital_flow":
        code = str(args.get("code", "")).strip().zfill(6)
        try:
            return fetch_stock_fund_flow(code)
        except Exception as exc:
            return {"error": str(exc), "code": code}

    if name == "get_fundamentals":
        code = str(args.get("code", "")).strip().zfill(6)
        return fetch_stock_fundamentals(code)

    return {"error": f"Unknown tool: {name}"}


# ── New endpoints ──────────────────────────────────────────────────────────────

@app.get("/market/stocks")
def get_market_stocks() -> Dict[str, Any]:
    """Full A-share market snapshot — proxied from EastMoney with server-side cache."""
    try:
        stocks = get_full_market_snapshot()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Market data fetch failed: {exc}") from exc
    return {
        "stocks": stocks,
        "count": len(stocks),
        "cached_at": FULL_MARKET_CACHE.get("loaded_at", datetime.now()).strftime("%Y-%m-%d %H:%M:%S")
        if FULL_MARKET_CACHE.get("loaded_at") else None,
    }


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
    market_context: Optional[Dict[str, Any]] = None


_TOOL_STATUS: Dict[str, str] = {
    "screen_stocks": "正在筛选全市场股票…",
    "get_stock_data": "正在获取个股技术指标…",
    "get_sector_overview": "正在拉取行业板块排名…",
    "get_sector_stocks": "正在获取板块内个股行情…",
    "get_capital_flow": "正在获取主力资金流向…",
    "get_fundamentals": "正在获取财务基本面数据…",
}


@app.post("/chat")
def open_chat(payload: ChatPayload, authorization: Optional[str] = Header(None)):
    claims = _get_token_from_header(authorization)

    # If REQUIRE_AUTH is enabled, validate JWT
    if REQUIRE_AUTH and not claims:
        raise HTTPException(status_code=401, detail="请先登录再使用 AI 分析师")

    # Resolve user-preferred model and enforce balance (skip for admin / unauthenticated)
    user_email: Optional[str] = claims["sub"] if claims else None
    user_role: str = claims.get("role", "user") if claims else "user"
    preferred_model: str = ""

    if user_email and user_role != "admin":
        try:
            conn = get_db()
            row = conn.execute("SELECT balance, llm_model FROM users WHERE email = ?", (user_email,)).fetchone()
            conn.close()
            if row:
                if row["balance"] <= 0:
                    raise HTTPException(status_code=402, detail="积分不足，请联系管理员充值")
                preferred_model = row["llm_model"] or ""
        except HTTPException:
            raise
        except Exception:
            pass

    active_model = preferred_model or os.getenv("OPENAI_MODEL", DEFAULT_LLM_MODEL)

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Route to the right provider based on model prefix
    use_anthropic = is_claude_model(active_model)
    if use_anthropic:
        client = get_anthropic_client()
        if not client:
            raise HTTPException(status_code=503, detail="Claude API 未配置（请在 Render 环境变量中设置 ANTHROPIC_API_KEY）")
    else:
        client = get_openai_client()
        if not client:
            raise HTTPException(status_code=503, detail="OpenAI API 未配置（请设置 OPENAI_API_KEY）")

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

    # Build system prompt — time-aware trading session context
    now = datetime.now(tz=SHANGHAI_TZ)
    now_str = now.strftime("%Y-%m-%d %H:%M")
    weekday = now.weekday()  # 0=Mon, 6=Sun
    h, m = now.hour, now.minute
    is_weekday = 0 <= weekday <= 4

    if is_weekday and ((h == 9 and m >= 30) or (10 <= h < 11) or (h == 11 and m < 30)):
        session_note = "当前为早盘时段（9:30-11:30）。给出今日早盘可布局的标的，注意不要追高开。"
    elif is_weekday and (h == 13 or (h == 14 and m < 0)):
        session_note = "当前为午后开盘时段。分析午后盘面走势延续性，给出下午可操作方向。"
    elif is_weekday and (h == 14 or (h == 13 and m >= 30)):
        session_note = (
            "⚡ 当前为尾盘黄金时段（13:30-15:00）！"
            "优先筛选今日尾盘适合买入、大概率明日或后日继续上涨的标的。"
            "买在尾盘、吃隔夜涨幅是核心策略。"
        )
    elif is_weekday and h == 15:
        session_note = "今日收盘。复盘今日格局，给出明日开盘重点关注的标的和布局逻辑。"
    else:
        session_note = "当前非交易时段，基于最近交易日数据给出下一交易日开盘关注标的。"

    lines = [
        f"你是专业的A股短中线投资分析助手，当前时间 {now_str}（北京时间）。",
        session_note,
        "【数据范围】系统今日已拉取全量A股实时行情（5000+只），数据列在下方。",
        "【工具能力】你有权主动调用以下工具获取实时数据，无需等用户提供：",
        "  • screen_stocks —— 从5000+只A股中按涨幅/成交额/换手率/量比/质量分筛选，sort_by=quality_score可按综合因子排序",
        "  • get_stock_data —— 获取某只股票的完整技术指标（RSI/MACD/KDJ/均线）、综合评分、操作建议",
        "  • get_sector_overview —— 获取全部行业板块今日涨跌排名、资金流向、领涨股",
        "  • get_sector_stocks —— 获取某板块内所有个股今日行情",
        "  • get_capital_flow —— 获取某股票近10日主力资金净流入趋势",
        "  • get_fundamentals —— 获取某股票的财务基本面：ROE/PE/PB/毛利率/资产负债率/净利润增速（验证基本面质量必用）",
        "【选股因子规则（参考Qlib/Backtrader量化框架）】",
        "  尾盘/隔夜选股必须同时满足：",
        "  ① 涨幅 +2%~+7%（避开涨停板/跌停板，避免追高）",
        "  ② 量比 ≥ 1.5（成交量放大，有主力参与）",
        "  ③ 换手率 3%~15%（流动性合理，避开过冷/过热）",
        "  ④ 成交额 ≥ 1亿（流动性门槛）",
        "  ⑤ sort_by=quality_score 排序，取前20名后再用 get_stock_data 验证RSI<75（未超买）",
        "  ⑥ 高质量选股可用 get_fundamentals 验证：ROE>10%、净利润增速>0%、资产负债率<70%",
        "  严禁推荐：涨幅>9%的涨停股、ST股、今日首日上市股、量比<0.5的缩量股",
        "【重要规则】",
        "  (1) 绝不要求用户手动粘贴或提供行情数据——你有工具可以自己拿",
        "  (2) 推荐股票必须走完：screen_stocks筛选 → get_stock_data验证RSI/MACD → 给出推荐，不能凭空编造",
        "  (3) 若 screen_stocks 返回 data_status='unavailable'，立即停止重试，告知用户数据源不可用",
        "  (4) 若缺少某日个股数据（如历史日期），如实说明并基于可用数据作答",
        "",
        "每次推荐股票必须包含以下结构（不能省略）：",
        "  股票代码 + 名称 + 当前价格 + 今日涨幅",
        "  看多逻辑（必须引用实际数据：量比X/换手率X%/RSI=X/MACD状态）",
        "  建议买入价区间（结合当前价格给具体数字）",
        "  T+1 目标价 / T+2 目标价（预计涨幅%）",
        "  止损价位（明确数字，跌破立即出）",
        "  退出条件",
        "",
        "用中文回答，结构清晰。仅供参考，不构成投资建议。",
    ]
    if payload.market_context:
        mc = payload.market_context
        total = mc.get("total_stocks")
        indices = mc.get("indices") or []
        if indices:
            idx_parts = []
            for idx in indices[:4]:
                chg = idx.get("change_percent")
                chg_s = f"{chg:+.2f}%" if chg is not None else "-"
                idx_parts.append(f"{idx.get('name', '')} {idx.get('price', '-')} ({chg_s})")
            lines.append(f"\n【今日市场】{' | '.join(idx_parts)}")
        sectors = mc.get("hot_sectors") or []
        if sectors:
            sec_parts = [f"{s.get('name', '')} {s.get('change_percent', 0):+.2f}%" for s in sectors[:5] if s.get("name")]
            if sec_parts:
                lines.append(f"【热门板块】{' | '.join(sec_parts)}")
        movers = mc.get("top_movers") or []
        if movers:
            scope = f"全市场 {total} 只 A 股中精选" if total else "精选"
            lines.append(f"\n【{scope}活跃个股（今日实时数据）】")
            for m in movers:
                code = m.get("code", "")
                name = m.get("name", "")
                chg = m.get("change_percent")
                chg_s = f"{chg:+.2f}%" if chg is not None else "-"
                amount = m.get("amount")
                amount_s = f"{amount/1e8:.1f}亿" if amount and amount >= 1e6 else (f"{amount/1e4:.0f}万" if amount else "-")
                turn = m.get("turnover_rate")
                turn_s = f" 换手{turn:.1f}%" if turn else ""
                volr = m.get("vol_ratio")
                volr_s = f" 量比{volr:.1f}" if volr and volr > 0 else ""
                lines.append(f"  {name}({code}) {chg_s} 成交{amount_s}{turn_s}{volr_s}")
    if stock_contexts:
        lines.append("\n【个股实时行情】")
        for s in stock_contexts:
            price_str = str(s["price"]) if s.get("price") is not None else "暂无"
            chg = s.get("change_percent")
            chg_str = f"{chg:+.2f}%" if chg is not None else "-"
            amount = s.get("amount")
            amount_str = f"{amount / 1e8:.1f}亿" if amount else "-"
            pe = s.get("pe_ratio")
            pe_str = f" PE{pe:.1f}" if pe else ""
            lines.append(f"  {s['name']}（{s['code']}）: 现价{price_str} 今日{chg_str} 成交额{amount_str}{pe_str}")

    # Auto-detect historical date references and inject index data
    hist_date = detect_historical_date(message)
    if hist_date:
        try:
            hist = fetch_historical_market_overview(hist_date)
            if hist["indices"]:
                lines.append(f"\n【{hist['date']} 大盘收盘数据（AKShare）】")
                for idx in hist["indices"]:
                    chg = idx.get("change_percent")
                    chg_s = f"{chg:+.2f}%" if chg is not None else "-"
                    amount = idx.get("amount")
                    amount_s = f" 成交额{amount/1e8:.0f}亿" if amount else ""
                    lines.append(f"  {idx['name']}: 收{idx.get('close', '-')} {chg_s}{amount_s}")
                lines.append("  （注：该日个股完整行情数据未在系统实时库中，以上为指数层面数据。尾盘个股推荐请基于当日盘面情绪和技术特征推断，不得编造具体价格。）")
        except Exception:
            pass

    system_prompt = "\n".join(lines)

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for h in payload.history[-10:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    def _deduct_credit() -> None:
        if user_email and user_role != "admin":
            try:
                conn = get_db()
                conn.execute("UPDATE users SET balance = MAX(0, balance - 1) WHERE email = ?", (user_email,))
                conn.execute(
                    "INSERT INTO usage_log (email, action, cost, model) VALUES (?, 'chat', 1, ?)",
                    (user_email, active_model),
                )
                conn.commit()
                conn.close()
            except Exception:
                pass

    def _sse(obj: Dict[str, Any]) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False, default=str)}\n\n"

    def _generate():
        reply_parts: List[str] = []
        try:
            if use_anthropic:
                # ── Anthropic: non-streaming tool rounds, then streaming final ──
                anthropic_tools = openai_tools_to_anthropic(CHAT_TOOLS)
                ant_system = system_prompt
                ant_msgs: List[Dict[str, Any]] = [
                    {"role": m["role"], "content": m["content"]}
                    for m in messages if m["role"] != "system"
                ]
                for _round in range(5):
                    yield _sse({"type": "status", "msg": "AI 正在思考…"})
                    resp = client.messages.create(
                        model=active_model, system=ant_system,
                        messages=ant_msgs, tools=anthropic_tools, max_tokens=2000,
                    )
                    if resp.stop_reason == "tool_use":
                        tool_use_blocks = [b for b in resp.content if b.type == "tool_use"]
                        text_blocks = [b for b in resp.content if b.type == "text"]
                        ant_msgs.append({
                            "role": "assistant",
                            "content": [{"type": "text", "text": b.text} for b in text_blocks]
                                       + [{"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
                                          for b in tool_use_blocks],
                        })
                        tool_results = []
                        for b in tool_use_blocks:
                            yield _sse({"type": "status", "msg": _TOOL_STATUS.get(b.name, f"正在调用 {b.name}…")})
                            result = execute_tool_call(b.name, b.input, payload.market_context)
                            tool_results.append({
                                "type": "tool_result", "tool_use_id": b.id,
                                "content": json.dumps(result, ensure_ascii=False, default=str),
                            })
                        ant_msgs.append({"role": "user", "content": tool_results})
                    else:
                        break
                # Streaming final response (no tools)
                with client.messages.stream(
                    model=active_model, system=ant_system,
                    messages=ant_msgs, max_tokens=2000,
                ) as stream:
                    for text in stream.text_stream:
                        reply_parts.append(text)
                        yield _sse({"type": "token", "text": text})

            else:
                # ── OpenAI: non-streaming tool rounds, then streaming final ────
                for _round in range(5):
                    yield _sse({"type": "status", "msg": "AI 正在思考…"})
                    resp = client.chat.completions.create(
                        model=active_model, messages=messages,
                        tools=CHAT_TOOLS, tool_choice="auto",
                        max_tokens=2000, temperature=0.7,
                    )
                    choice = resp.choices[0]
                    if choice.finish_reason == "tool_calls":
                        tool_calls = choice.message.tool_calls or []
                        messages.append({
                            "role": "assistant",
                            "content": choice.message.content or "",
                            "tool_calls": [
                                {"id": tc.id, "type": "function",
                                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                                for tc in tool_calls
                            ],
                        })
                        for tc in tool_calls:
                            try:
                                args = json.loads(tc.function.arguments or "{}")
                            except json.JSONDecodeError:
                                args = {}
                            yield _sse({"type": "status", "msg": _TOOL_STATUS.get(tc.function.name, f"正在调用 {tc.function.name}…")})
                            result = execute_tool_call(tc.function.name, args, payload.market_context)
                            messages.append({
                                "role": "tool", "tool_call_id": tc.id,
                                "content": json.dumps(result, ensure_ascii=False, default=str),
                            })
                    else:
                        break
                # Streaming final response (no tools)
                stream = client.chat.completions.create(
                    model=active_model, messages=messages,
                    max_tokens=2000, temperature=0.7, stream=True,
                )
                for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        text = chunk.choices[0].delta.content
                        reply_parts.append(text)
                        yield _sse({"type": "token", "text": text})

            reply = "".join(reply_parts)
            _deduct_credit()
            yield _sse({
                "type": "done",
                "stocks": [{"code": s["code"], "name": s["name"]} for s in stock_contexts],
            })

        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
