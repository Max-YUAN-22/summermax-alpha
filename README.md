# SummerMax Quant Alpha

Realtime A-share signal and interpretation MVP for quantitative market research.

Quant research brand:

`Summer` guards warmth, `Max` pursues extremes. In an uncertain market, seek deterministic alpha.

## Positioning

SummerMax Quant Alpha is a minimal decision-support app for Chinese A-share analysis. It combines:

- realtime quote snapshots
- 60-day daily technical indicators
- rule-based trend interpretation
- optional GPT interpretation through the OpenAI API

This project does not execute trades. It is intentionally limited to analysis and signal support.

## Project Structure

```text
summermax-alpha/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── app.js
│   └── index.html
└── README.md
```

## Features

- Input a 6-digit A-share stock code such as `300059`
- Fetch realtime quote data from `AKShare stock_zh_a_spot_em`
- Fetch 60 trading-day historical data from `AKShare stock_zh_a_hist`
- Compute `MA5`, `MA10`, `MA20`
- Return rule-based analysis and close-session bias
- Optionally call OpenAI for GPT interpretation
- Keep response structure ready for chat tool integration

## API Endpoints

### `GET /health`

Returns service status and whether `OPENAI_API_KEY` is configured.

### `GET /quote/realtime?code=300059`

Returns the latest realtime quote snapshot.

### `GET /stock?code=300059&use_llm=false`

Returns:

- realtime quote snapshot
- technical indicators
- rule-based analysis
- optional GPT analysis

### `GET /analysis/close?code=300059&use_llm=false`

Returns the same stock snapshot plus a close-session bias block.

This is for end-of-session decision support only. It does not place orders.

## Example Response

```json
{
  "code": "300059",
  "name": "东方财富",
  "realtime": {
    "code": "300059",
    "name": "东方财富",
    "price": 12.34,
    "change_percent": 1.25,
    "change_amount": 0.15,
    "volume": 4567890.0,
    "amount": 876543210.0,
    "amplitude": 3.21,
    "high": 12.5,
    "low": 12.1,
    "open": 12.2,
    "pre_close": 12.19,
    "turnover_rate": 2.45,
    "pe_ratio": 18.2,
    "pb_ratio": 2.9,
    "quote_time": "2026-06-18 14:58:00"
  },
  "indicators": {
    "close": 12.28,
    "ma5": 12.11,
    "ma10": 11.98,
    "ma20": 11.42,
    "volume": 3456789.0,
    "date": "2026-06-17"
  },
  "analysis": {
    "engine": "rules_v2",
    "summary": "bullish short-term",
    "detail": "MA5 is above MA10, which suggests short-term upward momentum.",
    "signals": [
      "MA5 > MA10",
      "Realtime price > MA20",
      "Intraday strength >= 2%"
    ],
    "next_step": "This block can be replaced or augmented by a GPT analysis layer."
  },
  "llm_analysis": {
    "engine": "gpt-5",
    "status": "ok",
    "content": {
      "summary": "short-term momentum remains constructive",
      "detail": "Price is above medium-term average and intraday strength is positive, but this is still only a short-horizon signal.",
      "risk": "Late-session reversal risk remains.",
      "action_bias": "monitor into close"
    }
  }
}
```

## Run Backend Locally

### 1. Create a virtual environment

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
```

On Windows:

```bash
.venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Optional for GPT analysis:

```bash
export OPENAI_API_KEY="your_api_key"
export OPENAI_MODEL="gpt-5"
export OPENAI_BASE_URL="https://api.openai.com/v1"
```

`OPENAI_BASE_URL` is optional. Only set it if you are using a compatible proxy or gateway.

### 4. Start the API

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Test the API

```bash
curl "http://127.0.0.1:8000/health"
curl "http://127.0.0.1:8000/quote/realtime?code=300059"
curl "http://127.0.0.1:8000/stock?code=300059"
curl "http://127.0.0.1:8000/stock?code=300059&use_llm=true"
curl "http://127.0.0.1:8000/analysis/close?code=300059&use_llm=true"
```

## Frontend

The frontend is plain static HTML and JavaScript, so it can be deployed to GitHub Pages.

When you open the page:

- enter your deployed backend base URL
- enter a stock code
- enable GPT analysis only if your backend has `OPENAI_API_KEY`
- click `Analyze`

## Deploy Backend to Railway

### Railway settings

- Root directory: `summermax-alpha/backend`
- Install command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Railway environment variables

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL` only if needed

## Deploy Backend to Render

### Render settings

- Root directory: `summermax-alpha/backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Render environment variables

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL` only if needed

## Deploy Frontend to GitHub Pages

### Option 1

- push the repository to GitHub
- publish the `frontend` folder through your preferred GitHub Pages workflow

### Option 2

- copy `frontend` contents to a dedicated `gh-pages` branch root
- publish that branch with GitHub Pages

## Chat Tool Integration Direction

This backend is already structured for later chat tool integration. For example, a chat agent can call:

- `GET /quote/realtime?code=300059`
- `GET /stock?code=300059&use_llm=true`
- `GET /analysis/close?code=300059&use_llm=true`

That is the correct way to let a chat assistant read current A-share market data before producing analysis.

## Important Limits

- AKShare is convenient for MVPs, research, and prototypes, but it is not a guaranteed institutional market-data feed
- This app does not solve A-share `T+1`; it only helps produce better same-day analysis before the close
- This app does not include auto-trading, brokerage integration, or order execution
- GPT output should be treated as interpretation, not as a trading engine
