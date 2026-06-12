"""
risk.py — turn raw detections into risk tone + an aggregate scene risk,
and map detections to a DIS-style entity-state record (the interoperability
nod toward JSE / HLA-DIS for the wargaming context).

Risk uses bounding-box area as a monocular proximity proxy: a large box means
the object is close to camera. This is a deliberately simple, explainable rule
— real deployment would fuse calibrated depth (MiDaS / stereo / LiDAR).
"""
from __future__ import annotations
from typing import List, Dict, Any

PERSON = {"person"}
VEHICLE = {"car", "truck", "bus", "motorcycle", "bicycle", "train"}


def tone_for(det: Dict[str, Any]) -> str:
    area = det["w"] * det["h"]
    near_centre = abs(det["cx"] - 0.5) < 0.25
    if det["label"] in PERSON and area > 0.05 and near_centre:
        return "danger"
    if area > 0.12:
        return "danger"
    if area > 0.05:
        return "warn"
    return "ok"


def score_scene(dets: List[Dict[str, Any]]) -> Dict[str, Any]:
    tones = [tone_for(d) for d in dets]
    for d, t in zip(dets, tones):
        d["tone"] = t
    if "danger" in tones:
        risk = "HIGH"
    elif "warn" in tones:
        risk = "MEDIUM"
    else:
        risk = "LOW"
    counts: Dict[str, int] = {}
    for d in dets:
        counts[d["label"]] = counts.get(d["label"], 0) + 1
    return {"risk": risk, "counts": counts}


# DIS-style force allocation (purely for interop demonstration)
def to_entity_state(det: Dict[str, Any]) -> Dict[str, Any]:
    label = det["label"]
    force = "NEUTRAL" if label in PERSON else "UNKNOWN" if label in VEHICLE else "OTHER"
    return {
        "entityId": det.get("id"),
        "force": force,
        "kind": label,
        "location": {"x": round(det["cx"], 4), "y": round(det["cy"], 4)},
        "marking": f"{label}-{det.get('id')}",
        "confidence": det["conf"],
    }
