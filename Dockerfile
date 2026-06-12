# UPE Live Perception backend — CPU container
FROM python:3.11-slim

# OpenCV runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# install torch CPU wheel first (smaller, no CUDA) then the rest
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# bake YOLO weights into the image so cold start doesn't need a download
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" || true

ENV UPE_SOURCE=sample/sample.mp4 \
    UPE_FPS=10 \
    UPE_WIDTH=512

EXPOSE 8000
# hosts inject $PORT — honour it, fall back to 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
