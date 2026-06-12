# UPE Live Perception Backend — YOLOv8 + FastAPI + WebSocket

Real-time object detection and tracking, streamed to the Unified Perception
Engine frontend. This replaces the mock generators with **actual computer
vision**: YOLOv8 inference + ByteTrack persistent IDs over a live WebSocket.

## Honest maturity (TRL)

This moves the perception path from a TRL 3 mock to a **TRL 5** capability:
real model, real detections, real tracking, validated end-to-end on
representative footage in a lab setup. It is **not** TRL 6/7 — that requires
demonstration in a relevant/operational environment with calibrated sensors,
real users, and field validation. The roadmap to 6/7 is at the bottom.

## What's real vs. simulated

| Component | Status |
|-----------|--------|
| YOLOv8 detection | **Real** (Ultralytics, COCO-pretrained) |
| Multi-object tracking (ByteTrack IDs) | **Real** (`model.track(persist=True)`) |
| Frame transport (JPEG over WebSocket) | **Real** |
| Risk scoring | Real but **simple** — bbox area as monocular proximity proxy |
| Depth / distance in metres | **Approximate** — needs calibrated depth (MiDaS/stereo/LiDAR) |
| PPE classes (helmet/vest/boots) | **Requires custom weights** — COCO has only `person` |
| DIS-style entity schema | Real shape, **demonstration-grade** (not a certified HLA/DIS stack) |

## Install & run

```bash
cd upe-backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt                        # installs torch + ultralytics (large, one-time)

# point it at a video file, a webcam, or an RTSP/CCTV stream
export UPE_SOURCE=sample/sample.mp4    # or "0" for webcam, or rtsp://...
uvicorn main:app --host 0.0.0.0 --port 8000
```

On first run Ultralytics downloads `yolov8n.pt` automatically (needs internet
once). After that it runs offline. Open `http://localhost:8000/` to confirm
`"backend": "yolo:yolov8n.pt"` — if it says `synthetic(no-weights)`, the weights
didn't download yet.

### Config (environment variables)
| Var | Default | Meaning |
|-----|---------|---------|
| `UPE_SOURCE` | `sample/sample.mp4` | video path, `0` (webcam), or RTSP URL |
| `UPE_WEIGHTS` | `yolov8n.pt` | any YOLOv8 `.pt` (swap in custom PPE weights here) |
| `UPE_FPS` | `12` | target stream FPS |
| `UPE_WIDTH` | `640` | downscale width for inference + transport |

## Connect the frontend

The frontend ships a **Live Perception (YOLO)** module (`src/LivePerception.tsx`)
that connects to `ws://localhost:8000/ws/perception`, renders the live video +
real detection boxes, and shows a CONNECTED / DISCONNECTED badge with the active
backend (`yolo:...` vs `synthetic`). Start the backend, open the app, select
**Live Perception (YOLO)** in the sidebar.

To change the URL (e.g. remote host), edit the `url` prop on `<LivePerception />`.

## Files
- `main.py` — FastAPI app + `/ws/perception` streaming loop
- `perception.py` — YOLOv8 detector wrapper (graceful synthetic fallback if weights missing)
- `risk.py` — risk scoring + DIS-style `EntityState` mapping
- `requirements.txt` — pinned deps
- `sample/sample.mp4` — generated test clip so you can run with zero setup
- `LivePerception.tsx` — the frontend consumer component (copy into the app's `src/`)

## Verified
- YOLOv8n architecture builds (226 layers, 80 classes) and runs a real forward pass.
- Decode → risk-scoring → DIS-entity pipeline produces correct output
  (person near centre → `danger` → scene `HIGH`).
- FastAPI app boots; `/` and `/ws/perception` routes live.
- WebSocket streams real JPEG-encoded frames + normalised detections + entities
  + risk at the target FPS to a connected client (smoke-tested end-to-end).

## Roadmap to TRL 6/7
1. **Calibrated depth** — replace bbox-area proxy with MiDaS/Depth-Anything or
   stereo/LiDAR for true metric distance and reliable collision risk.
2. **Custom PPE weights** — train YOLOv8 on a PPE dataset for real helmet/vest/boot
   compliance (set `UPE_WEIGHTS`).
3. **Edge deployment** — run on representative hardware (e.g. Jetson / RTX edge box)
   against live RTSP cameras in a relevant environment.
4. **Certified interop** — promote the DIS-style schema to a real HLA/DIS bridge
   for JSE compatibility.
5. **Field trial** — operational-environment demonstration with real users → TRL 7.
