"""
perception.py — real YOLOv8 detection + tracking.

Uses Ultralytics YOLOv8 (COCO-pretrained by default). model.track() gives
persistent IDs via ByteTrack, so downstream we get real multi-object tracking,
not just per-frame boxes.

If ultralytics/torch are not installed yet, Detector falls back to a clearly
labelled synthetic generator so the server still boots — but the real path is
YOLO. Set UPE_WEIGHTS to a custom .pt (e.g. a PPE-trained model) to swap classes.
"""
from __future__ import annotations
import os, math, random, time
from typing import List, Dict, Any

# COCO classes we surface as "vehicles" vs "people" for risk logic
VEHICLE = {"car", "truck", "bus", "motorcycle", "bicycle", "train"}
PERSON = {"person"}

try:
    from ultralytics import YOLO  # noqa
    _HAS_YOLO = True
except Exception:  # torch/ultralytics not present yet
    _HAS_YOLO = False


class Detector:
    def __init__(self, weights: str | None = None):
        self.weights = weights or os.environ.get("UPE_WEIGHTS", "yolov8n.pt")
        self.backend = "synthetic"
        self.model = None
        self.names: Dict[int, str] = {}
        if _HAS_YOLO:
            try:
                # downloads weights on first run (needs network the first time)
                self.model = YOLO(self.weights)
                self.names = self.model.names
                self.backend = f"yolo:{self.weights}"
            except Exception as e:  # weights unavailable (offline / blocked)
                print(f"[perception] YOLO weights '{self.weights}' unavailable "
                      f"({e}); falling back to synthetic. Run once online to fetch weights.")
                self.model = None
                self.backend = "synthetic(no-weights)"

    # returns normalised detections: cx,cy,w,h in [0,1]
    def infer(self, frame, W: int, H: int) -> List[Dict[str, Any]]:
        if self.model is None:
            return self._synthetic(W, H)
        res = self.model.track(frame, persist=True, verbose=False)[0]
        out: List[Dict[str, Any]] = []
        if res.boxes is None:
            return out
        for b in res.boxes:
            cx, cy, w, h = (float(v) for v in b.xywh[0].tolist())
            cls = int(b.cls)
            label = self.names.get(cls, str(cls))
            out.append({
                "id": int(b.id) if b.id is not None else None,
                "label": label,
                "conf": round(float(b.conf), 3),
                "cx": cx / W, "cy": cy / H, "w": w / W, "h": h / H,
            })
        return out

    # only used when YOLO isn't installed — clearly synthetic
    def _synthetic(self, W: int, H: int) -> List[Dict[str, Any]]:
        t = time.time()
        out = []
        for i, lab in enumerate(["person", "car", "truck"]):
            out.append({
                "id": i + 1, "label": lab, "conf": round(0.7 + 0.2 * random.random(), 3),
                "cx": 0.25 + 0.25 * i + 0.05 * math.sin(t + i),
                "cy": 0.55 + 0.05 * math.cos(t + i),
                "w": 0.12, "h": 0.22,
            })
        return out
