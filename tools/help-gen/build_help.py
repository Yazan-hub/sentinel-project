"""Build Sentinel's F1 help: one HTML page and one short MP4 per ribbon tool.

Usage:  python3 tools/help-gen/build_help.py [--no-video]
Reads   tools/help-gen/tools.json and SentinelAddin/Resources/<icon>32.png
Writes  SentinelAddin/Help/{index.html, help.css, <id>.html, videos/<id>.mp4}
Needs   Pillow and ffmpeg (libx264) on PATH. Output is deterministic for the same inputs.
"""
import html, json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RES = os.path.join(ROOT, "SentinelAddin", "Resources")
OUT = os.path.join(ROOT, "SentinelAddin", "Help")
W, H, FPS = 960, 540, 15
BG, INK, MUTED, ACCENT, RIBBON = (246, 248, 251), (22, 30, 46), (92, 104, 124), (0, 112, 192), (226, 232, 240)

def font(size, bold=False):
    for p in ([ "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold else ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F_H1, F_H2, F_TXT, F_SM, F_NUM = font(40, True), font(24, True), font(28), font(18), font(64, True)
F_BTN = font(15)

def icon(name, size):
    p = os.path.join(RES, name + "32.png")
    img = Image.open(p).convert("RGBA") if os.path.exists(p) else Image.new("RGBA", (32, 32), ACCENT + (255,))
    return img.resize((size, size), Image.LANCZOS)

def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        t = (line + " " + word).strip()
        if draw.textlength(t, font=f) <= width: line = t
        else: lines.append(line); line = word
    if line: lines.append(line)
    return lines

def ribbon(d, img, tool, glow):
    """A simplified Sentinel ribbon tab with the tool's button highlighted."""
    d.rectangle([0, 0, W, 34], fill=(40, 52, 72))
    d.text((16, 7), "Sentinel", font=F_SM, fill=(255, 255, 255))
    d.rectangle([0, 34, W, 128], fill=RIBBON)
    d.text((16, 106), tool["panel"], font=F_SM, fill=MUTED)
    label = tool["title"]
    while d.textlength(label, font=F_BTN) > 150: label = label[:-2].rstrip() + "…"
    cx = W - 110
    if glow > 0:
        r = int(2 + 4 * glow)
        d.rounded_rectangle([cx - 84 - r, 38 - r, cx + 84 + r, 124 + r // 2], radius=10, outline=ACCENT, width=3)
    img.paste(ic := icon(tool["icon"], 48), (cx - 24, 44), ic)
    d.text((cx, 100), label, font=F_BTN, fill=INK, anchor="mt")
    return (cx, 70)

def frame_title(tool, t):
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    ribbon(d, img, tool, abs(((t * 2) % 2) - 1))
    img.paste(ic := icon(tool["icon"], 96), (60, 190), ic)
    d.text((180, 195), tool["title"], font=F_H1, fill=INK)
    for i, ln in enumerate(wrap(d, tool["summary"], F_TXT, W - 240)[:4]):
        d.text((180, 255 + i * 38), ln, font=F_TXT, fill=MUTED)
    return img

def frame_step(tool, i, n, step, t):
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    target = ribbon(d, img, tool, 1.0 if i == 0 else 0)
    d.text((60, 175), str(i + 1), font=F_NUM, fill=ACCENT)
    d.text((140, 190), f"Step {i + 1} of {n}", font=F_H2, fill=MUTED)
    lines = wrap(d, step, F_TXT, W - 200)
    shown = max(1, int(len(" ".join(lines)) * min(1.0, t * 1.6)))  # typewriter reveal
    y, used = 250, 0
    for ln in lines:
        part = ln[: max(0, shown - used)]; used += len(ln) + 1
        d.text((140, y), part, font=F_TXT, fill=INK); y += 40
    for k in range(n):  # progress dots
        c = ACCENT if k <= i else (200, 208, 220)
        d.ellipse([W / 2 - n * 14 + k * 28, H - 50, W / 2 - n * 14 + k * 28 + 14, H - 36], fill=c)
    if i == 0:  # cursor travels to the button
        k = min(1.0, t * 1.4); cx, cy = 480 + (target[0] - 480) * k, 420 + (target[1] - 420) * k
        d.polygon([(cx, cy), (cx, cy + 26), (cx + 7, cy + 19), (cx + 18, cy + 19)], fill=INK, outline=(255, 255, 255))
    return img

def frame_outro(tool, t):
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    ribbon(d, img, tool, 0)
    d.text((W / 2, 250), "Hover any Sentinel button and press F1", font=F_H2, fill=INK, anchor="mm")
    d.text((W / 2, 295), "for its help page and video.", font=F_TXT, fill=MUTED, anchor="mm")
    return img

def fade(img, a):
    return img if a >= 1 else Image.blend(Image.new("RGB", (W, H), BG), img, max(0.0, a))

def video(tool, path):
    scenes = [(2.5, lambda t: frame_title(tool, t))]
    n = len(tool["steps"])
    for i, s in enumerate(tool["steps"]):
        scenes.append((3.2, lambda t, i=i, s=s: frame_step(tool, i, n, s, t)))
    scenes.append((2.0, lambda t: frame_outro(tool, t)))
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                          "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1",
                          "-fflags", "+bitexact", "-flags:v", "+bitexact", path], stdin=subprocess.PIPE)
    for dur, render in scenes:
        frames = int(dur * FPS)
        for f in range(frames):
            t = f / frames
            a = min(1.0, f / 4, (frames - 1 - f) / 4 + 0.25)
            p.stdin.write(fade(render(t), a).tobytes())
    p.stdin.close()
    if p.wait() != 0: sys.exit(f"ffmpeg failed for {tool['id']}")

CSS = """:root{--bg:#f6f8fb;--card:#fff;--ink:#161e2e;--muted:#5c687c;--accent:#0070c0;--line:#e2e8f0}
@media (prefers-color-scheme:dark){:root{--bg:#10151f;--card:#18202d;--ink:#e6ebf2;--muted:#9aa6b8;--accent:#4aa3e8;--line:#2a3445}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 "Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{background:#283448;color:#fff;padding:12px 24px;display:flex;gap:16px;align-items:center}
header a{color:#fff;text-decoration:none}header .crumb{opacity:.75;font-size:14px}
main{max-width:920px;margin:0 auto;padding:24px 16px 48px}
h1{display:flex;gap:14px;align-items:center;margin:0 0 6px}h1 img{width:40px;height:40px}
.path{color:var(--muted);margin:0 0 18px}.summary{font-size:18px}
video{width:100%;border-radius:10px;border:1px solid var(--line);background:#000;margin:12px 0 24px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 22px;margin:0 0 16px}
h2{font-size:18px;margin:0 0 8px}ol,ul{margin:0;padding-left:22px}li{margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.grid a{display:flex;gap:10px;align-items:center;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:8px;color:var(--ink);text-decoration:none}
.grid a:hover{border-color:var(--accent)}.grid img{width:24px;height:24px}
footer{color:var(--muted);font-size:13px;text-align:center;margin-top:32px}"""

def page(title, body, crumb):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · Sentinel Help</title><link rel="stylesheet" href="help.css"></head>
<body><header><a href="index.html"><b>Sentinel Help</b></a><span class="crumb">{crumb}</span></header><main>{body}
<footer>Sentinel for Revit · press F1 on any Sentinel ribbon button to open its page</footer></main></body></html>
"""

def main():
    tools = json.load(open(os.path.join(os.path.dirname(__file__), "tools.json"), encoding="utf-8"))
    os.makedirs(os.path.join(OUT, "videos"), exist_ok=True); os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
    open(os.path.join(OUT, "help.css"), "w", encoding="utf-8", newline="\n").write(CSS + "\n")
    for t in tools:
        icon(t["icon"], 32).save(os.path.join(OUT, "icons", t["icon"] + ".png"))
        e = html.escape
        steps = "".join(f"<li>{e(s)}</li>" for s in t["steps"])
        notes = "".join(f"<li>{e(s)}</li>" for s in t["notes"])
        body = (f'<h1><img src="icons/{t["icon"]}.png" alt="">{e(t["title"])}</h1><p class="path">Sentinel ▸ {e(t["panel"])}</p>'
                f'<p class="summary">{e(t["summary"])}</p>'
                f'<video src="videos/{t["id"]}.mp4" controls autoplay muted playsinline></video>'
                f'<section><h2>How to use it</h2><ol>{steps}</ol></section>'
                + (f'<section><h2>Good to know</h2><ul>{notes}</ul></section>' if notes else ""))
        open(os.path.join(OUT, t["id"] + ".html"), "w", encoding="utf-8", newline="\n").write(page(t["title"], body, e(t["panel"])))
        if "--no-video" not in sys.argv:
            video(t, os.path.join(OUT, "videos", t["id"] + ".mp4")); print("video", t["id"])
    groups = {}
    for t in tools: groups.setdefault(t["panel"].split(" ▸ ")[0], []).append(t)
    body = "<h1>Sentinel Help</h1><p class=\"summary\">Every Sentinel ribbon tool, with a short video. Press F1 while hovering a button in Revit to jump straight to its page.</p>"
    for g, ts in groups.items():
        body += f'<section id="{html.escape(g)}"><h2>{html.escape(g)}</h2><div class="grid">' + "".join(
            f'<a href="{t["id"]}.html"><img src="icons/{t["icon"]}.png" alt="">{html.escape(t["title"])}</a>' for t in ts) + "</div></section>"
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n").write(page("Index", body, "All tools"))

if __name__ == "__main__":
    main()
