#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

cd "$BACKEND_DIR"
exec /opt/anaconda3/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
