#!/usr/bin/env bash
set -e
python -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -r requirements.txt
export UPE_SOURCE="${UPE_SOURCE:-sample/sample.mp4}"
uvicorn main:app --host 0.0.0.0 --port 8000
