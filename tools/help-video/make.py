"""Render the F1 help overview clip (SentinelAddin/Resources/help/overview.webp) from the ribbon itself.

Reads every panel and button (label, icon, tooltip) out of SentinelAddin/App.cs, so the clip never
drifts from the ribbon: re-run after a ribbon change.   python tools/help-video/make.py
"""
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ADDIN = ROOT / "SentinelAddin"
OUT = ADDIN / "Resources" / "help" / "overview.webp"
W, H, CARD_MS = 1280, 720, 4500
BG, FG, MUTED, ACCENT = (20, 24, 33), (236, 239, 245), (150, 158, 176), (90, 140, 255)
F = "C:/Windows/Fonts/"
font = lambda size, bold=False: ImageFont.truetype(F + ("segoeuib.ttf" if bold else "segoeui.ttf"), size)

CALL = re.compile(r'(?:Push|Sub|Pull)\(\s*\w+,\s*"(\w+)",\s*"((?:[^"\\]|\\.)*)",\s*(?:"[\w.]+",\s*)?"(\w+)",\s*\n?\s*"((?:[^"\\]|\\.)*)"')
PANEL = re.compile(r'CreateRibbonPanel\(tab,\s*"([^"]+)"\)')


def parse(src):
    """[(panel, [(label, icon, first sentence)])] in ribbon order."""
    panels, events = [], sorted([(m.start(), "p", m) for m in PANEL.finditer(src)] +
                                [(m.start(), "b", m) for m in CALL.finditer(src)], key=lambda e: e[0])
    for _, kind, m in events:
        if kind == "p":
            panels.append((m.group(1), []))
        elif panels:
            label = m.group(2).replace("\\n", " ")
            tip = m.group(4).replace('\\"', '"').replace("▸", "›")
            first = re.split(r"(?<=[.:;])\s", tip, maxsplit=1)[0].rstrip(":;")
            panels[-1][1].append((label, m.group(3), first if len(first) <= 120 else first[:117] + "…"))
    return panels


def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        trial = (line + " " + word).strip()
        if draw.textlength(trial, font=f) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line] if line else lines


def card(title, subtitle=None, rows=()):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 6], fill=ACCENT)
    d.text((56, 40), "SENTINEL FOR REVIT", font=font(18, True), fill=ACCENT)
    d.text((56, 66), title, font=font(40, True), fill=FG)
    y = 130
    if subtitle:
        for ln in wrap(d, subtitle, font(24), W - 112):
            d.text((56, y), ln, font=font(24), fill=MUTED)
            y += 34
        y += 16
    small = len(rows) > 7
    fn, ft, step = font(19 if small else 22, True), font(15 if small else 17), 58 if small else 70
    for label, icon, tip in rows:
        p = ADDIN / "Resources" / f"{icon}32.png"
        if p.exists():
            ic = Image.open(p).convert("RGBA")
            img.paste(ic, (56, y + 4), ic)
        d.text((104, y), label, font=fn, fill=FG)
        d.text((104, y + (24 if small else 28)), wrap(d, tip, ft, W - 160)[0], font=ft, fill=MUTED)
        y += step
    d.text((56, H - 44), "Hover any Sentinel button and press F1 for its help page.", font=font(16), fill=MUTED)
    return img


def main():
    panels = parse((ADDIN / "App.cs").read_text(encoding="utf-8"))
    assert panels and all(rows for _, rows in panels), "ribbon not parsed - did App.cs Push/Pull/Sub change shape?"
    frames = [card("Your model, governed", "The Sentinel tab groups every tool by job: "
                   + ", ".join(p for p, _ in panels) + ". This tour walks the ribbon panel by panel.")]
    for name, rows in panels:
        for i in range(0, len(rows), 9):  # ponytail: split long panels at 9 rows; no scrolling
            frames.append(card(name + (" (cont.)" if i else ""), rows=rows[i:i + 9]))
    frames.append(card("Help on any button", "Hover a Sentinel button to read its tooltip, then press F1: "
                       "its help page opens in your browser. The index lists every command."))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=CARD_MS, loop=0, lossless=True)
    print(f"{OUT} - {len(frames)} cards, {sum(len(r) for _, r in panels)} buttons, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
