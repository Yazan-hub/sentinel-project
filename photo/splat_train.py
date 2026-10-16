"""sentinel-splat-train 0.1.0 (MA-7-19 Stage B): Sentinel's own short Gaussian-splat trainer on gsplat.rasterization.

Trains on blurred, registered copies only (the office RTX 4060; no cloud), SH degree 0, and writes a standard 3DGS binary .ply that the
bridge admits as `splat` (evidence-logic.mjs splatHeaderRefusal). Runs under the private Python 3.10 of path A only:

    %APPDATA%\\Sentinel\\py310\\python.exe photo/splat_train.py [<out.ply>]     (the synthetic self-check; prints one JSON line)

The bridge job (images + poses from 7-17 registration) waits until registration exists; train() and write_ply() are its whole interface.
Camera convention: viewmats are world-to-camera 4x4 in OpenCV axes (x right, y down, z forward), Ks are 3x3 pixel intrinsics.
"""
import importlib.metadata
import json
import math
import os
import sys
import time

VERSION = "0.1.0"
LIB = os.path.join(os.environ.get("APPDATA", ""), "Sentinel", "photo-lib310")
if os.path.isdir(LIB) and LIB not in sys.path:
    sys.path.insert(0, LIB)  # path A: the hash-pinned wheels (survey/requirements-ma7-py310.txt) first, so the shared user site never decides

import numpy as np  # noqa: E402
import torch  # noqa: E402
from gsplat import rasterization  # noqa: E402

C0 = 0.28209479177387814  # SH degree-0 basis constant: f_dc = (rgb - 0.5) / C0
ALLOW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "licence-check", "allow.json")
PLY_PROPS = ["x", "y", "z", "nx", "ny", "nz", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]


def _render(p, viewmats, Ks, w, h):
    img, _, _ = rasterization(p["means"], p["quats"], torch.exp(p["log_scales"]), torch.sigmoid(p["opacity_logits"]),
                              torch.sigmoid(p["rgb_logits"]), viewmats, Ks, w, h)
    return img  # [C, H, W, 3], black background


def train(images, viewmats, Ks, steps=7000, n=100_000, seed_points=None, box=(-1.0, 1.0), seed=0, lr=None):
    """images [V,H,W,3] float 0..1, viewmats [V,4,4], Ks [V,3,3] (tensors or arrays). One view per step, L1 loss, Adam.
    Seeds from seed_points [M,3] (sampled to n) or uniformly in box. Returns (params dict on the GPU, loss history list).
    ponytail: fixed Gaussian count, no densify/prune; gsplat's DefaultStrategy is the upgrade when real scenes need detail."""
    dev = torch.device("cuda")
    g = torch.Generator(device="cpu").manual_seed(seed)
    images, viewmats, Ks = (torch.as_tensor(a, dtype=torch.float32).to(dev) for a in (images, viewmats, Ks))
    V, H, W, _ = images.shape
    if seed_points is not None:
        pts = torch.as_tensor(np.asarray(seed_points), dtype=torch.float32)
        means = pts[torch.randint(len(pts), (n,), generator=g)] + 0.01 * torch.randn(n, 3, generator=g)
    else:
        means = box[0] + (box[1] - box[0]) * torch.rand(n, 3, generator=g)
    extent = float((means.max(0).values - means.min(0).values).norm())
    s0 = math.log(extent / n ** (1 / 3) / 2)  # start each Gaussian about half its share of the scene
    p = {"means": means, "quats": torch.tensor([1.0, 0, 0, 0]).repeat(n, 1), "log_scales": torch.full((n, 3), s0),
         "opacity_logits": torch.full((n,), -2.0), "rgb_logits": torch.zeros(n, 3)}
    p = {k: v.to(dev).requires_grad_(True) for k, v in p.items()}
    lr = lr or {"means": 1.6e-3 * extent, "quats": 1e-3, "log_scales": 5e-3, "opacity_logits": 5e-2, "rgb_logits": 2.5e-2}
    opt = torch.optim.Adam([{"params": [p[k]], "lr": lr[k]} for k in p], eps=1e-15)
    hist = []
    for _ in range(steps):
        i = int(torch.randint(V, (1,), generator=g))
        loss = (_render(p, viewmats[i:i + 1], Ks[i:i + 1], W, H)[0] - images[i]).abs().mean()
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        hist.append(float(loss))
    return p, hist


def write_ply(path, p):
    """The standard 3DGS binary little-endian layout at SH degree 0: 17 float32 per Gaussian (normals zero, quats normalised). Returns the header length."""
    with torch.no_grad():
        n = p["means"].shape[0]
        rgb = torch.sigmoid(p["rgb_logits"])
        cols = [p["means"], torch.zeros(n, 3, device=p["means"].device), (rgb - 0.5) / C0, p["opacity_logits"][:, None],
                p["log_scales"], torch.nn.functional.normalize(p["quats"], dim=1)]
        body = torch.cat(cols, 1).float().cpu().numpy().astype("<f4")
    head = "ply\nformat binary_little_endian 1.0\nelement vertex %d\n%send_header\n" % (n, "".join(f"property float {q}\n" for q in PLY_PROPS))
    with open(path, "wb") as f:
        f.write(head.encode("ascii"))
        f.write(body.tobytes())
    return len(head)


def tools():
    """The receipt: sentinel-splat-train, the Python, every library in photo-lib310 (version from its own metadata, licence as read into
    tools/licence-check/allow.json), what torch/gsplat bundle, and the CUDA runtime torch reports. A library allow.json does not name stops
    the job: a new pin is a new licence read."""
    with open(ALLOW, encoding="utf-8") as f:
        allow = json.load(f)["python"]
    by = {k.lower().replace("_", "-"): v for k, v in allow.items()}
    out = [{"name": "sentinel-splat-train", "version": VERSION, "licence": "LicenseRef-Sentinel"},
           {"name": "python", "version": sys.version.split()[0], "licence": by["python"]["licence"]}]
    for d in sorted(importlib.metadata.distributions(path=[LIB]), key=lambda d: d.metadata["Name"].lower()):
        name, ver = d.metadata["Name"], d.version
        a = by.get(name.lower().replace("_", "-"))
        if not a:
            raise RuntimeError(f"{name} {ver} is in photo-lib310 but not in allow.json - read its licence first")
        out.append({"name": name, "version": ver, "licence": a["licence"]})
        for c in a.get("carries", []):
            if name.lower() != "torch" or ("cu124" in ver) == ("12.4" in c["name"]):  # torch: only the runtime this wheel bundles
                out.append({"name": c["name"], "version": ver, "licence": c["licence"]})
    out.append({"name": "NVIDIA CUDA runtime (as torch reports it)", "version": torch.version.cuda, "licence": "NVIDIA-Software-Licence"})
    return out


def _look_at(eye):
    """World-to-camera (OpenCV axes) for a camera at eye looking at the origin, world z up."""
    f = -eye / np.linalg.norm(eye)
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    R = np.stack([r, np.cross(f, r), f])  # rows: camera x right, y down, z forward
    m = np.eye(4)
    m[:3, :3], m[:3, 3] = R, -R @ eye
    return m


def _psnr(a, b):
    return float(-10 * torch.log10(((a - b) ** 2).mean()))


def self_check(out_path=None):
    """400 known Gaussians, 12 ring cameras; train on 10 from random init, judge on 2 held-out views."""
    import re
    torch.manual_seed(1)
    dev, W, H, n_true, n, steps = "cuda", 128, 128, 400, 2000, 3000
    truth = {"means": torch.rand(n_true, 3) * 1.6 - 0.8, "quats": torch.nn.functional.normalize(torch.randn(n_true, 4), dim=1),
             "log_scales": torch.log(torch.rand(n_true, 3) * 0.06 + 0.02), "opacity_logits": torch.full((n_true,), 2.0),
             "rgb_logits": torch.randn(n_true, 3) * 1.5}
    truth = {k: v.to(dev) for k, v in truth.items()}
    ang = np.linspace(0, 2 * np.pi, 12, endpoint=False)
    vm = torch.tensor(np.stack([_look_at(np.array([3.5 * math.cos(a), 3.5 * math.sin(a), 1.2 * math.sin(3 * a)])) for a in ang]),
                      dtype=torch.float32, device=dev)
    K = torch.tensor([[150.0, 0, W / 2], [0, 150.0, H / 2], [0, 0, 1]], device=dev).repeat(12, 1, 1)
    with torch.no_grad():
        imgs = _render(truth, vm, K, W, H).clamp(0, 1)
    tr, held = [0, 1, 2, 4, 5, 6, 7, 8, 10, 11], [3, 9]
    p0, _ = train(imgs[tr], vm[tr], K[tr], steps=0, n=n, seed=7)
    with torch.no_grad():
        before = _psnr(_render(p0, vm[held], K[held], W, H), imgs[held])
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()
    p, hist = train(imgs[tr], vm[tr], K[tr], steps=steps, n=n, seed=7)
    torch.cuda.synchronize()
    secs = time.time() - t0
    with torch.no_grad():
        after = _psnr(_render(p, vm[held], K[held], W, H), imgs[held])
    out_path = out_path or os.path.join(os.environ.get("TEMP", "."), "sentinel-splat-selfcheck.ply")
    head_len = write_ply(out_path, p)
    size = os.path.getsize(out_path)
    with open(out_path, "rb") as f:
        head = f.read(4096).decode("latin1")
    props = set(re.findall(r"^property\s+\S+\s+(\S+)\s*$", head[:head.index("end_header")], re.M))
    first, last = sum(hist[:100]) / 100, sum(hist[-100:]) / 100
    r = {"steps": steps, "gaussians": n, "seconds": round(secs, 1), "peak_vram_mb": round(torch.cuda.max_memory_allocated() / 2**20, 1),
         "psnr_before": round(before, 2), "psnr_after": round(after, 2), "loss_first100": round(first, 4), "loss_last100": round(last, 4),
         "ply_bytes": size, "gpu": torch.cuda.get_device_name(0)}
    assert after - before > 6, r
    assert last < first / 2, r
    assert {"opacity", "scale_0", "rot_0"} <= props, props  # the bridge's splatHeaderRefusal rule
    assert size == head_len + n * 17 * 4, r
    assert any(t["name"] == "gsplat" and t["licence"] == "Apache-2.0" for t in tools())
    return r


if __name__ == "__main__":
    print(json.dumps({"ok": True, "version": VERSION, **self_check(sys.argv[1] if len(sys.argv) > 1 else None), "tools": tools()}))
