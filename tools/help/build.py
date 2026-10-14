"""Build the Sentinel F1 help into SentinelAddin/Resources/help/ (shipped with the add-in).

The tool tree (panels > buttons > pulldown items, labels, icons, tooltips) is read from SentinelAddin/App.cs;
the detailed text per tool comes from Resources/help/content.json. Writes one self-contained page per button,
index.html and the overview clip overview.webp. Re-run after a ribbon or content change:

    python tools/help/build.py
"""
import base64
import html
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ADDIN = ROOT / "SentinelAddin"
HELP = ADDIN / "Resources" / "help"
E = html.escape


def icon(name):
    """32 px ribbon icon as a data URI, so every page stands alone."""
    p = ADDIN / "Resources" / f"{name}32.png"
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() if p.exists() else ""

PANEL = re.compile(r'var (\w+) = app\.CreateRibbonPanel\(tab,\s*"([^"]+)"\)')
CALL = re.compile(r'(?:var (\w+) = )?(Push|Pull|Sub)\(\s*(\w+),\s*"(\w+)",\s*"((?:[^"\\]|\\.)*)",\s*(?:"[\w.]+",\s*)?"(\w+)",\s*\n?\s*"((?:[^"\\]|\\.)*)"')


def unq(s):
    return s.replace('\\"', '"').replace("\\n", " ")


def parse(src):
    """Ordered panels: [{name, items:[{id, label, icon, tooltip, children:[...]}]}] and a flat id -> item map."""
    panels, by_var, tools = [], {}, {}
    events = sorted([(m.start(), m) for m in PANEL.finditer(src)] + [(m.start(), m) for m in CALL.finditer(src)],
                    key=lambda e: e[0])
    for _, m in events:
        if m.re is PANEL:
            by_var[m.group(1)] = {"name": m.group(2), "items": []}
            panels.append(by_var[m.group(1)])
            continue
        var, kind, parent, tid, label, icon, tip = m.groups()
        item = {"id": tid, "label": unq(label), "icon": icon, "tooltip": unq(tip), "children": [], "kind": kind}
        owner = by_var[parent]
        item["panel"] = owner["panel"] if "panel" in owner else owner["name"]
        item["parent"] = owner.get("id")
        (owner["children"] if "children" in owner else owner["items"]).append(item)
        if var:
            by_var[var] = item
        tools[tid] = item
    return panels, tools


CSS = """:root{--bg:#fff;--fg:#1d2330;--muted:#5d6577;--line:#dfe3ea;--side:#f6f7f9;--link:#2a55c9;--here:#e6edff;--code:#f1f3f6}
@media (prefers-color-scheme:dark){:root{--bg:#161a22;--fg:#e8ebf1;--muted:#9aa3b5;--line:#2c3240;--side:#1c212b;--link:#8fb0ff;--here:#24304d;--code:#232937}}
*{box-sizing:border-box}body{margin:0;font:15px/1.6 "Segoe UI",system-ui,sans-serif;color:var(--fg);background:var(--bg)}
header{display:flex;align-items:center;gap:16px;padding:10px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
header b{font-size:16px}header input{margin-left:auto;width:260px;max-width:45vw;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.wrap{display:flex;align-items:flex-start}
nav{width:300px;flex:none;position:sticky;top:53px;height:calc(100vh - 53px);overflow:auto;padding:14px 8px 40px 12px;background:var(--side);border-right:1px solid var(--line);font-size:14px}
nav details>summary{list-style:none;cursor:pointer;padding:3px 4px;display:flex;gap:8px;align-items:baseline}
nav details>summary::-webkit-details-marker{display:none}
nav details>summary::before{content:"+";width:12px;flex:none;font-weight:600}nav details[open]>summary::before{content:"\\2212"}
nav .kids{margin-left:20px}nav a{color:var(--link);text-decoration:none;display:block;padding:3px 4px;border-radius:4px}
nav summary a{display:inline;padding:0}nav a:hover{text-decoration:underline}nav .here{background:var(--here);font-weight:600}
nav .panel>summary{color:var(--fg);font-weight:500}
main{flex:1;min-width:0;max-width:900px;padding:24px 40px 80px}
.crumb{font-size:13px;color:var(--muted)}.crumb a{color:var(--link)}
h1{display:flex;align-items:center;gap:12px;font-size:28px;margin:8px 0 6px}h1 img{width:32px;height:32px}
.lead{font-size:17px;color:var(--muted);margin:0 0 18px}
h2{font-size:19px;margin:30px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line)}
ol li,ul li{margin:5px 0}dl{margin:0}dt{font-weight:600;margin-top:10px}dd{margin:2px 0 0 18px;color:var(--fg)}
.tip{border-left:3px solid var(--link);background:var(--code);padding:10px 14px;margin:14px 0;border-radius:0 6px 6px 0}
.media{max-width:100%;border:1px solid var(--line);border-radius:8px;margin:8px 0 4px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.cards a{display:flex;gap:10px;padding:10px;border:1px solid var(--line);border-radius:8px;color:var(--fg);text-decoration:none}
.cards a:hover{border-color:var(--link)}.cards img{width:32px;height:32px}.cards small{display:block;color:var(--muted)}
@media (max-width:760px){nav{display:none}main{padding:16px}}"""

SEARCH_JS = """<script>const q=document.getElementById('q');q.addEventListener('input',()=>{const t=q.value.toLowerCase();
document.querySelectorAll('nav a').forEach(a=>{const hit=!t||a.textContent.toLowerCase().includes(t);a.style.display=hit?'':'none';
if(t&&hit){let d=a.closest('details');while(d){d.open=true;d=d.parentElement.closest('details');}}});});</script>"""


def tree(panels, here):
    def node(it):
        cls = ' class="here"' if it["id"] == here else ""
        link = f'<a href="{it["id"]}.html"{cls}>{E(it["label"])}</a>'
        if not it["children"]:
            return link
        is_open = here == it["id"] or any(c["id"] == here for c in it["children"])
        kids = "".join(node(c) for c in it["children"])
        return f'<details{" open" if is_open else ""}><summary>{link}</summary><div class="kids">{kids}</div></details>'

    out = []
    for p in panels:
        is_open = here == "index" or any(it["id"] == here or any(c["id"] == here for c in it["children"]) for it in p["items"])
        out.append(f'<details class="panel"{" open" if is_open else ""}><summary>{E(p["name"])}</summary>'
                   f'<div class="kids">{"".join(node(it) for it in p["items"])}</div></details>')
    home = ' class="here"' if here == "index" else ""
    return f'<nav><a href="index.html"{home}>Sentinel for Revit Help</a>{"".join(out)}</nav>'


def clip(name):
    for ext in (".mp4", ".webp", ".gif"):
        if (HELP / (name + ext)).exists():
            return (f'<video class="media" src="{name}{ext}" controls muted loop></video>' if ext == ".mp4"
                    else f'<img class="media" src="{name}{ext}" alt="Walkthrough">')
    return ""


def page(title, panels, here, body):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{E(title)} | Sentinel Help</title><style>{CSS}</style></head><body>'
            f'<header><b>Sentinel for Revit Help</b><input id="q" type="search" placeholder="Filter tools" aria-label="Filter tools"></header>'
            f'<div class="wrap">{tree(panels, here)}<main>{body}</main></div>{SEARCH_JS}</body></html>')


def tool_page(it, c, tools, panels):
    crumb = ['<a href="index.html">Help</a>', E(it["panel"])]
    if it["parent"]:
        crumb.append(f'<a href="{it["parent"]}.html">{E(tools[it["parent"]]["label"])}</a>')
    b = [f'<div class="crumb">{" › ".join(crumb)}</div>',
         f'<h1><img src="{icon(it["icon"])}" alt="">{E(it["label"])}</h1>',
         f'<p class="lead">{E(c["summary"])}</p>', clip(it["id"])]
    b += [f"<p>{E(p)}</p>" for p in c["overview"]]
    if it["children"]:
        b.append('<h2>Tools in this group</h2><div class="cards">' + "".join(
            f'<a href="{k["id"]}.html"><img src="{icon(k["icon"])}" alt=""><span>{E(k["label"])}<small>{E(CONTENT[k["id"]]["summary"])}</small></span></a>'
            for k in it["children"]) + "</div>")
    if c["prerequisites"]:
        b.append("<h2>Before you start</h2><ul>" + "".join(f"<li>{E(x)}</li>" for x in c["prerequisites"]) + "</ul>")
    if c["inputs"]:
        b.append("<h2>What you provide</h2><dl>" + "".join(f"<dt>{E(x['name'])}</dt><dd>{E(x['desc'])}</dd>" for x in c["inputs"]) + "</dl>")
    if c["steps"]:
        b.append("<h2>How to use it</h2><ol>" + "".join(f"<li>{E(x)}</li>" for x in c["steps"]) + "</ol>")
    if c["results"]:
        b.append("<h2>What you get</h2><ul>" + "".join(f"<li>{E(x)}</li>" for x in c["results"]) + "</ul>")
    if c["tips"]:
        b.append("<h2>Tips and limits</h2>" + "".join(f'<div class="tip">{E(x)}</div>' for x in c["tips"]))
    rel = [r for r in c["related"] if r in tools and r != it["id"]]
    if rel:
        b.append("<h2>Related tools</h2><ul>" + "".join(
            f'<li><a href="{r}.html">{E(tools[r]["label"])}</a> — {E(CONTENT[r]["summary"])}</li>' for r in rel) + "</ul>")
    b.append(f'<h2>Ribbon tooltip</h2><p class="crumb">{E(it["tooltip"])}</p>')
    return page(it["label"], panels, it["id"], "".join(b))


def index_page(panels):
    b = ["<h1>Sentinel for Revit</h1>",
         '<p class="lead">Sentinel governs a Revit model against its web project: the rules, standards and delivery contract '
         "installed there judge the model, every governed action is recorded on the project ledger, and AI proposals wait "
         "for a person to approve them.</p>", clip("overview"),
         "<p>Hover any Sentinel button on the ribbon and press <b>F1</b> to open its page here. Use the tree on the left, "
         "or the filter box, to move between tools.</p>"]
    for p in panels:
        flat = [x for it in p["items"] for x in [it] + it["children"]]
        b.append(f'<h2>{E(p["name"])}</h2><div class="cards">' + "".join(
            f'<a href="{x["id"]}.html"><img src="{icon(x["icon"])}" alt=""><span>{E(x["label"])}<small>{E(CONTENT[x["id"]]["summary"])}</small></span></a>'
            for x in flat) + "</div>")
    return page("Contents", panels, "index", "".join(b))


# ── overview clip: one card per panel, from the same tree ──────────────────────────────────────────
W, H, CARD_MS = 1280, 720, 4500
BG, FG, MUTED, ACCENT = (20, 24, 33), (236, 239, 245), (150, 158, 176), (90, 140, 255)
font = lambda size, bold=False: ImageFont.truetype("C:/Windows/Fonts/" + ("segoeuib.ttf" if bold else "segoeui.ttf"), size)


def wrap(d, text, f, width):
    lines, line = [], ""
    for w in text.split():
        t = (line + " " + w).strip()
        if d.textlength(t, font=f) <= width:
            line = t
        else:
            lines.append(line)
            line = w
    return lines + [line] if line else lines


def card(title, subtitle=None, rows=()):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 6], fill=ACCENT)
    d.text((56, 40), "SENTINEL FOR REVIT", font=font(18, True), fill=ACCENT)
    d.text((56, 66), title, font=font(40, True), fill=FG)
    y = 130
    for ln in wrap(d, subtitle, font(24), W - 112) if subtitle else []:
        d.text((56, y), ln, font=font(24), fill=MUTED)
        y += 34
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


def overview(panels):
    frames = [card("Your model, governed", "The Sentinel tab groups every tool by job: "
                   + ", ".join(p["name"] for p in panels) + ". This tour walks the ribbon panel by panel.")]
    for p in panels:
        rows = [(x["label"], x["icon"], CONTENT[x["id"]]["summary"]) for it in p["items"] for x in [it] + it["children"]]
        for i in range(0, len(rows), 9):  # ponytail: split long panels at 9 rows; no scrolling
            frames.append(card(p["name"] + (" (cont.)" if i else ""), rows=rows[i:i + 9]))
    frames.append(card("Help on any button", "Hover a Sentinel button to read its tooltip, then press F1: its help "
                       "page opens with what the tool does, what it needs, how to use it and the full tool tree."))
    frames[0].save(HELP / "overview.webp", save_all=True, append_images=frames[1:], duration=CARD_MS, loop=0, lossless=True)
    return len(frames)


CONTENT = {}


def main():
    panels, tools = parse((ADDIN / "App.cs").read_text(encoding="utf-8"))
    CONTENT.update(json.loads((HELP / "content.json").read_text(encoding="utf-8")))
    missing = sorted(set(tools) - set(CONTENT))
    assert not missing, f"content.json has no entry for: {missing}"
    keys = {"summary", "overview", "prerequisites", "inputs", "steps", "results", "tips", "related"}
    bad = [t for t in tools if not keys <= set(CONTENT[t])]
    assert not bad, f"content.json entries missing fields: {bad}"
    HELP.mkdir(parents=True, exist_ok=True)
    cards = overview(panels)
    for it in tools.values():
        (HELP / f"{it['id']}.html").write_text(tool_page(it, CONTENT[it["id"]], tools, panels), encoding="utf-8")
    (HELP / "index.html").write_text(index_page(panels), encoding="utf-8")
    print(f"{len(tools)} tool pages + index, {cards} clip cards -> {HELP}")


if __name__ == "__main__":
    sys.exit(main())
