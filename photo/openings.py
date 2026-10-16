"""sentinel-openings 0.1.0 (MA-7-20 core): is a ghost door/window seen in a registered photo? Advice only - it never creates anything.

Grounding DINO tiny proposes "door." / "window." boxes, SAM 2.1 hiera-small refines each box to a mask, and a ghost opening's 3D rectangle is
projected through the photo's camera (K + world-to-camera) and judged "seen" by IoU with a detection of the same label, else "not seen".
A detection that meets no ghost is listed "no ghost - not filed". Weights are read from the local folders only, each checked by its sha256
prefix (the bridge's WEIGHTS in WebApp/bridge/licence-logic.mjs); HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE are set before transformers is
imported (R29), so nothing touches the network at load. Runs on the Python 3.14 stack in %APPDATA%\\Sentinel\\photo-lib (D-7-19: PyTorch +
transformers, no ONNX conversions). The job wiring waits for registration (7-17): no photo has a camera pose yet.

    python openings.py --detect <photo.jpg>     prints one JSON line {"ok", "detections", "ms", "vram_mb", "tools"}

Units: corners in mm in the model's world frame; the world-to-camera matrix maps mm to camera mm (x right, y down, z forward, OpenCV);
K in pixels. Numpy only for the geometry, so the projection is testable without torch.
"""
import hashlib
import importlib.metadata
import json
import os
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"  # R29: before any transformers / huggingface_hub import
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import numpy as np  # noqa: E402

VERSION = "0.1.0"
MODELS = os.environ.get("SENTINEL_MA7_MODELS") or os.path.join(os.path.expanduser("~"), "SentinelData", "models-ma7")
# folder -> sha256 prefix of model.safetensors; equals WEIGHTS in licence-logic.mjs (grounding-dino-tiny:main, sam2.1-hiera-small:main)
WEIGHTS = {"grounding-dino-tiny": ("1a2412ef99bd", "Apache-2.0"), "sam2.1-hiera-small": ("0a4067b11ce1", "Apache-2.0")}
PROMPT = "door. window."
LABELS = ("door", "window")
BOX_SCORE = 0.30  # Grounding DINO box threshold (its README uses 0.35-0.4; lower here: a person reads the advice)
TEXT_SCORE = 0.25
SEEN_IOU = 0.30  # projected ghost box vs detection box; loose because a registered pose is off by a few cm
MIN_IN_FRAME = 0.5  # a ghost with less than half its projected box inside the photo is "not in view" (the photo is not asked)

_loaded = None


def _sha_prefix(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def _folder(name):
    d = os.path.join(MODELS, name)
    want = WEIGHTS[name][0]
    got = _sha_prefix(os.path.join(d, "model.safetensors"))
    if got != want:
        raise RuntimeError(f"{name}: model.safetensors sha256 {got}... is not the accepted {want}... - not loaded")
    return d


def load(device=None):
    """Both models from the local folders (sha-checked), on CUDA when there is one. Cached for the process."""
    global _loaded
    if _loaded:
        return _loaded
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor, Sam2Model
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    dino_dir, sam_dir = _folder("grounding-dino-tiny"), _folder("sam2.1-hiera-small")
    _loaded = {
        "torch": torch, "device": device,
        "dino_proc": AutoProcessor.from_pretrained(dino_dir, local_files_only=True),
        "dino": AutoModelForZeroShotObjectDetection.from_pretrained(dino_dir, local_files_only=True).to(device).eval(),
        "sam": Sam2Model.from_pretrained(sam_dir, local_files_only=True).to(device).eval(),
    }
    return _loaded


def _label(text):
    t = (text or "").lower()
    return next((l for l in LABELS if l in t), None)


def detect(image):
    """A PIL image (RGB) -> [{label, score, box [x0, y0, x1, y1] px, mask_area px}], best first. Labels other than door/window are dropped."""
    m = load()
    torch = m["torch"]
    W, H = image.size
    with torch.inference_mode():
        inp = m["dino_proc"](images=image, text=PROMPT, return_tensors="pt").to(m["device"])
        out = m["dino"](**inp)
        r = m["dino_proc"].post_process_grounded_object_detection(
            out, inp.input_ids, threshold=BOX_SCORE, text_threshold=TEXT_SCORE, target_sizes=[(H, W)])[0]
        dets = []
        for box, score, text in zip(r["boxes"].tolist(), r["scores"].tolist(), r.get("text_labels") or r["labels"]):
            lab = _label(text)
            if lab:
                x0, y0, x1, y1 = (max(0.0, min(v, lim)) for v, lim in zip(box, (W, H, W, H)))
                dets.append({"label": lab, "score": round(score, 3), "box": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)]})
        if dets:  # one SAM 2.1 pass with every box as a prompt; the best of its masks per box
            # Sam2Processor needs torchvision (not in the lib), so the SAM 2.1 input is built here: 1024x1024 resize, ImageNet norm, boxes scaled
            import numpy as np
            px = torch.from_numpy(np.asarray(image.resize((1024, 1024)), dtype=np.float32) / 255.0).permute(2, 0, 1)
            px = ((px - torch.tensor([0.485, 0.456, 0.406])[:, None, None]) / torch.tensor([0.229, 0.224, 0.225])[:, None, None])[None].to(m["device"])
            bx = torch.tensor([d["box"] for d in dets], dtype=torch.float32) * torch.tensor([1024 / W, 1024 / H, 1024 / W, 1024 / H])
            so = m["sam"](pixel_values=px, input_boxes=bx[None].to(m["device"]), multimask_output=False)
            lo = so.pred_masks.reshape(len(dets), 1, *so.pred_masks.shape[-2:]).float().cpu()
            masks = torch.nn.functional.interpolate(lo, size=(H, W), mode="bilinear", align_corners=False) > 0.0  # (n, 1, H, W) bool
            for d, mk in zip(dets, masks):
                d["mask_area"] = int(mk[0].sum())
    return sorted(dets, key=lambda d: -d["score"])


def project(corners_mm, K, world_to_cam, size):
    """4 corners (mm, world) -> {"quad": 4 [u, v], "box": clipped [x0, y0, x1, y1], "in_frame": fraction of the box inside} or None when a
    corner is at or behind the camera or nothing lands inside the photo. size = (width, height) px."""
    P = np.c_[np.asarray(corners_mm, float), np.ones(4)] @ np.asarray(world_to_cam, float).T
    if np.any(P[:, 2] <= 0):
        return None
    uv = ((P[:, :3] / P[:, 2:3]) @ np.asarray(K, float).T)[:, :2]
    x0, y0 = uv.min(0)
    x1, y1 = uv.max(0)
    W, H = size
    cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if cx1 <= cx0 or cy1 <= cy0:
        return None
    full = (x1 - x0) * (y1 - y0)
    return {"quad": uv.tolist(), "box": [float(cx0), float(cy0), float(cx1), float(cy1)],
            "in_frame": float((cx1 - cx0) * (cy1 - cy0) / full) if full > 0 else 0.0}


def iou(a, b):
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def judge(ghosts, camera, detections, evidence_id):
    """ghosts: [{"id", "label": door|window, "corners_mm": 4x3}]; camera: {"K", "world_to_cam", "size"}. Returns
    (verdicts, unmatched): a verdict per ghost the photo sees - "seen in <ev> (detector, advice)" or "not seen" - and the detections no
    ghost took, each "no ghost - not filed". Read-only: nothing is written or created. Each detection goes to at most one ghost (best IoU)."""
    verdicts, taken = [], set()
    for g in ghosts:
        p = project(g["corners_mm"], camera["K"], camera["world_to_cam"], camera["size"])
        if not p or p["in_frame"] < MIN_IN_FRAME:
            continue  # this photo does not see the ghost: it is not asked
        best = max(((iou(p["box"], d["box"]), i) for i, d in enumerate(detections) if d["label"] == g["label"] and i not in taken),
                   default=(0.0, None))
        v = {"ghost": g["id"], "evidence": evidence_id, "projected": [round(x, 1) for x in p["box"]], "iou": round(best[0], 3), "advice": True}
        if best[1] is not None and best[0] >= SEEN_IOU:
            taken.add(best[1])
            v.update(state="seen", words=f"seen in {evidence_id} (detector, advice)", detection=detections[best[1]])
        else:
            v.update(state="not seen", words="not seen")
        verdicts.append(v)
    unmatched = [{**d, "words": "no ghost - not filed"} for i, d in enumerate(detections) if i not in taken]
    return verdicts, unmatched


def tools():
    """The receipt (OD-2): sentinel-openings, both models with their sha256 prefixes and licences, transformers and torch (licences from
    their own metadata)."""
    out = [{"name": "sentinel-openings", "version": VERSION, "licence": "LicenseRef-Sentinel"}]
    out += [{"name": n, "version": "main", "sha256": s, "licence": l} for n, (s, l) in WEIGHTS.items()]
    for dist in ("transformers", "torch"):
        md = importlib.metadata.metadata(dist)
        out.append({"name": dist, "version": md["Version"], "licence": md.get("License-Expression") or md.get("License") or "not declared"})
    return out


def main(argv):
    try:
        if len(argv) != 3 or argv[1] != "--detect":
            raise ValueError("usage: openings.py --detect <photo.jpg>")
        from PIL import Image
        img = Image.open(argv[2]).convert("RGB")
        t0 = time.perf_counter()
        m = load()
        t1 = time.perf_counter()
        dets = detect(img)
        t2 = time.perf_counter()
        torch = m["torch"]
        vram = torch.cuda.max_memory_allocated() / 2**20 if torch.cuda.is_available() else 0
        print(json.dumps({"ok": True, "size": img.size, "detections": dets, "device": m["device"], "vram_mb": round(vram),
                          "ms": {"load": round((t1 - t0) * 1000), "detect": round((t2 - t1) * 1000)}, "version": VERSION, "tools": tools()}))
        return 0
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
