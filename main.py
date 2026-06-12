"""
main.py — Unified Perception Engine · live perception backend.

Endpoints
  GET  /            → health + backend info (yolo vs synthetic)
  WS   /ws/perception → streams JSON frames at a target FPS:
        {
          type: "frame",
          frame: int, fps: float, w: int, h: int,
          jpeg: "<base64>",            # downscaled scene for the UI
          detections: [{id,label,conf,cx,cy,w,h,tone}],   # normalised coords
          entities:   [{entityId,force,kind,location,marking,confidence}], # DIS-style
          risk: "LOW|MEDIUM|HIGH",
          counts: {label: n}
        }

Config (env):
  UPE_SOURCE   video file path, or "0" for webcam   (default: sample/sample.mp4)
  UPE_WEIGHTS  YOLO weights                          (default: yolov8n.pt)
  UPE_FPS      target stream fps                     (default: 12)
  UPE_WIDTH    downscale width for stream            (default: 640)

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations
import os, base64, asyncio, time
import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from perception import Detector
from risk import score_scene, to_entity_state

SOURCE = os.environ.get("UPE_SOURCE", "sample/sample.mp4")
TARGET_FPS = float(os.environ.get("UPE_FPS", "12"))
WIDTH = int(os.environ.get("UPE_WIDTH", "640"))

app = FastAPI(title="UPE Live Perception")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

detector = Detector()


@app.get("/")
def health():
    return {"status": "ok", "backend": detector.backend, "source": SOURCE,
            "target_fps": TARGET_FPS, "stream_width": WIDTH}


def _open_capture():
    src = 0 if SOURCE == "0" else SOURCE
    cap = cv2.VideoCapture(src)
    return cap


@app.websocket("/ws/perception")
async def perception(ws: WebSocket):
    await ws.accept()
    cap = _open_capture()
    if not cap or not cap.isOpened():
        await ws.send_json({"type": "error", "message": f"cannot open source '{SOURCE}'"})
        await ws.close()
        return

    frame_no = 0
    period = 1.0 / TARGET_FPS
    t_prev = time.time()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:  # loop the clip for a continuous demo
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            frame_no += 1

            # downscale for inference + transport
            h0, w0 = frame.shape[:2]
            scale = WIDTH / float(w0)
            frame = cv2.resize(frame, (WIDTH, int(h0 * scale)))
            H, W = frame.shape[:2]

            dets = detector.infer(frame, W, H)
            meta = score_scene(dets)
            entities = [to_entity_state(d) for d in dets]

            ok_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
            jpeg_b64 = base64.b64encode(buf).decode("ascii") if ok_enc else None

            now = time.time()
            fps = round(1.0 / max(1e-3, now - t_prev), 1)
            t_prev = now

            await ws.send_json({
                "type": "frame", "frame": frame_no, "fps": fps, "w": W, "h": H,
                "jpeg": jpeg_b64, "detections": dets, "entities": entities,
                "risk": meta["risk"], "counts": meta["counts"],
                "backend": detector.backend,
            })
            await asyncio.sleep(period)
    except WebSocketDisconnect:
        pass
    finally:
        cap.release()
