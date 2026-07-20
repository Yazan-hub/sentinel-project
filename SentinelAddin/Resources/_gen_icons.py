"""Generate Sentinel ribbon icons — flat accent badges, one distinct glyph per tool.
Renders each at 256px then downsamples to 32 + 16 (LANCZOS) for crisp small icons.
Colour-coded by panel family. Also writes a contact sheet for visual verification."""
import math, os
from PIL import Image, ImageDraw

OUT = r"C:\Users\yazan\Claude\Projects\Co BIM Assistant\sentinel-project\SentinelAddin\Resources"
S = 256
W = (255, 255, 255, 255)
WD = (255, 255, 255, 235)

# ---- families (accent base colours) ----
TEAL   = (13, 148, 136)     # Coordinate
AMBER  = (214, 122, 12)     # Validate
GREEN  = (22, 163, 74)      # Publish
EMER   = (5, 150, 105)      # Governed Publish (flagship, distinct emerald)
VIOLET = (124, 58, 237)     # Standards & Build

def lighten(c, t): return tuple(int(c[i] + (255 - c[i]) * t) for i in range(3))
def darken(c, t):  return tuple(int(c[i] * (1 - t)) for i in range(3))

def tile(base):
    """Rounded badge with a subtle vertical gradient in the accent hue."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    top, bot = lighten(base, 0.22), darken(base, 0.06)
    grad = Image.new("RGB", (1, S))
    for y in range(S):
        t = y / (S - 1)
        grad.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    grad = grad.resize((S, S))
    mask = Image.new("L", (S, S), 0)
    m = int(S * 0.085)
    ImageDraw.Draw(mask).rounded_rectangle([m, m, S - m, S - m], radius=int(S * 0.26), fill=255)
    img.paste(grad.convert("RGBA"), (0, 0), mask)
    return img

def P(*fs):  # fractions -> pixel points
    return [(fs[i] * S, fs[i + 1] * S) for i in range(0, len(fs), 2)]
def R(x0, y0, x1, y1): return [x0 * S, y0 * S, x1 * S, y1 * S]

wln = int(S * 0.072)          # standard stroke width
def dot(d, x, y, r, fill=W): d.ellipse([x*S-r*S, y*S-r*S, x*S+r*S, y*S+r*S], fill=fill)
def arrow(d, x0, y0, x1, y1, head=0.09, w=None):
    w = w or wln
    d.line(P(x0, y0, x1, y1), fill=W, width=w)
    ang = math.atan2(y1 - y0, x1 - x0)
    for s in (2.5, -2.5):
        d.line([(x1*S, y1*S), ((x1 - head*math.cos(ang - s))*S, (y1 - head*math.sin(ang - s))*S)], fill=W, width=w)

# ---------- glyphs ----------
def g_dashboard(d):
    d.rounded_rectangle(R(.24,.26,.76,.74), radius=int(S*.05), outline=W, width=wln)
    d.line(P(.42,.26,.42,.74), fill=W, width=wln)
    d.line(P(.52,.40,.68,.40), fill=W, width=int(wln*.8))
    d.line(P(.52,.52,.68,.52), fill=W, width=int(wln*.8))
def g_requests(d):
    arrow(d, .30,.41,.70,.41); arrow(d, .70,.59,.30,.59)
def g_issues(d):
    d.rounded_rectangle(R(.24,.26,.76,.60), radius=int(S*.08), outline=W, width=wln)
    d.polygon(P(.36,.60,.36,.72,.50,.60), fill=W)
    d.line(P(.50,.34,.50,.46), fill=W, width=wln); dot(d,.50,.53,.028)
def g_clash(d):
    for a in range(0,360,45):
        r0,r1=(.10,.26) if a%90==0 else (.10,.20)
        d.line(P(.5+r0*math.cos(math.radians(a)),.5+r0*math.sin(math.radians(a)),
                 .5+r1*math.cos(math.radians(a)),.5+r1*math.sin(math.radians(a))), fill=W, width=wln)
    dot(d,.5,.5,.075)
def g_clashreg(d):
    for i,y in enumerate((.34,.5,.66)):
        d.rectangle(R(.28,y-.03,.34,y+.03), fill=W)
        d.line(P(.40,y,.72,y), fill=W, width=int(wln*.8))
def g_flag(d):
    d.line(P(.34,.24,.34,.78), fill=W, width=wln)
    d.polygon(P(.34,.26,.70,.34,.34,.46), fill=W)
def g_scan(d):
    d.ellipse(R(.28,.28,.60,.60), outline=W, width=wln)
    d.line(P(.585,.585,.74,.74), fill=W, width=int(wln*1.15))
def g_scorecard(d):
    d.arc(R(.24,.30,.76,.82), 180, 360, fill=W, width=wln)
    d.line(P(.50,.56,.66,.40), fill=W, width=wln); dot(d,.50,.56,.045)
def g_rules(d):
    d.rounded_rectangle(R(.28,.26,.72,.76), radius=int(S*.05), outline=W, width=wln)
    d.rounded_rectangle(R(.42,.20,.58,.30), radius=int(S*.03), fill=W)
    for y in (.44,.58):
        d.line(P(.36,y,.40,y+.03), fill=W, width=int(wln*.7)); d.line(P(.40,y+.03,.46,y-.03), fill=W, width=int(wln*.7))
        d.line(P(.52,y,.64,y), fill=W, width=int(wln*.7))
def g_ifcgate(d):  # shield + check
    d.polygon(P(.50,.24,.72,.32,.72,.54,.50,.76,.28,.54,.28,.32), outline=W, width=wln)
    d.line(P(.40,.50,.47,.58,.62,.40), fill=W, width=wln)
def g_preflight(d):  # paper plane
    d.polygon(P(.26,.50,.76,.28,.58,.74,.48,.56), outline=W, width=int(wln*.9))
    d.line(P(.76,.28,.48,.56), fill=W, width=int(wln*.7))
def g_gate(d):  # seal/certificate
    d.ellipse(R(.30,.24,.62,.56), outline=W, width=wln)
    d.line(P(.39,.40,.45,.47,.55,.33), fill=W, width=int(wln*.85))
    d.polygon(P(.38,.54,.34,.74,.46,.64), fill=W); d.polygon(P(.54,.54,.58,.74,.46,.64), fill=W)
def g_family(d):  # puzzle piece
    d.rounded_rectangle(R(.30,.34,.70,.72), radius=int(S*.04), outline=W, width=wln)
    d.ellipse(R(.60,.42,.78,.60), fill=W)   # knob out (right)
    d.ellipse(R(.42,.26,.58,.42), fill=W)   # knob up
def g_heal(d):  # wand + sparkle
    d.line(P(.32,.72,.60,.44), fill=W, width=int(wln*1.15))
    for dx,dy,l in ((.66,.30,.05),):
        pass
    cx,cy=.66,.32
    for a in range(0,360,90):
        d.line(P(cx,cy,cx+.075*math.cos(math.radians(a)),cy+.075*math.sin(math.radians(a))), fill=W, width=int(wln*.7))
    dot(d,.50,.30,.022); dot(d,.74,.54,.022)
def g_mep(d):  # opening in wall
    d.rounded_rectangle(R(.28,.30,.72,.70), radius=int(S*.03), outline=W, width=wln)
    d.ellipse(R(.42,.42,.58,.58), outline=W, width=int(wln*.8))
    d.line(P(.20,.50,.80,.50), fill=W, width=int(wln*.7))
def g_govern(d):  # shield + up arrow (flagship)
    d.polygon(P(.50,.22,.74,.31,.74,.55,.50,.78,.26,.55,.26,.31), outline=W, width=int(wln*1.05))
    arrow(d, .50,.62,.50,.38, head=.11, w=int(wln*1.0))
def cloud(d, y=.0):
    d.ellipse(R(.30,.44+y,.50,.64+y), fill=W); d.ellipse(R(.42,.38+y,.66,.62+y), fill=W)
    d.ellipse(R(.56,.46+y,.74,.64+y), fill=W); d.rectangle(R(.34,.54+y,.70,.64+y), fill=W)
def g_publish(d):
    cloud(d, .06);
    d.polygon(P(.50,.24,.62,.40,.38,.40), fill=W); d.rectangle(R(.455,.36,.545,.52), fill=W)
def g_autopublish(d):
    cloud(d, .08)
    d.arc(R(.36,.24,.64,.52), 300, 210, fill=W, width=int(wln*.9))
    d.polygon(P(.36,.30,.30,.40,.44,.40), fill=W)
def g_sheets(d):
    d.rounded_rectangle(R(.36,.24,.70,.66), radius=int(S*.04), outline=W, width=int(wln*.85))
    d.rounded_rectangle(R(.28,.34,.62,.76), radius=int(S*.04), fill=None, outline=W, width=int(wln*.85))
    # repaint front over back overlap
    d.rounded_rectangle(R(.28,.34,.62,.76), radius=int(S*.04), outline=W, width=int(wln*.85))
def g_standards(d):  # columns / library
    d.polygon(P(.50,.24,.76,.36,.24,.36), fill=W)
    for x in (.30,.47,.64): d.rectangle(R(x,.40,x+.06,.66), fill=W)
    d.rectangle(R(.24,.68,.76,.74), fill=W)
def g_setup(d):  # gear (cog outline)
    teeth=8; ro,ri,rt=.28,.20,.12; cx,cy=.5,.5; pts=[]
    for i in range(teeth*2):
        a=math.pi*i/teeth; r=ro if i%2==0 else ri
        pts+= [cx+r*math.cos(a), cy+r*math.sin(a)]
    d.polygon(P(*pts), outline=W, width=int(wln*.9))
    d.ellipse(R(cx-rt,cy-rt,cx+rt,cy+rt), outline=W, width=int(wln*.9))
def g_office(d):  # building blocks
    for (x,y) in ((.30,.52),(.44,.52),(.58,.52),(.37,.38),(.51,.38),(.44,.24)):
        d.rounded_rectangle(R(x,y,x+.12,y+.12), radius=int(S*.015), outline=W, width=int(wln*.75))
def g_apply(d):  # stamp
    d.rounded_rectangle(R(.42,.24,.58,.36), radius=int(S*.03), fill=W)
    d.polygon(P(.36,.56,.64,.56,.56,.40,.44,.40), fill=W)
    d.rectangle(R(.28,.66,.72,.74), fill=W)
def g_ingest(d):  # doc + inbound arrow
    d.polygon(P(.50,.24,.72,.24,.72,.76,.38,.76,.38,.38), outline=W, width=int(wln*.85))
    d.line(P(.50,.24,.50,.38,.38,.38), fill=W, width=int(wln*.7))
    arrow(d, .20,.56,.44,.56, head=.07, w=int(wln*.85))
def g_ghost(d):
    d.pieslice(R(.30,.24,.70,.64), 180, 360, fill=W)
    d.rectangle(R(.30,.44,.70,.68), fill=W)
    for x in (.36,.52): d.polygon(P(x,.68,x+.08,.68,x+.04,.76), fill=W)  # wavy bottom
    d.polygon(P(.44,.68,.52,.68,.48,.76), fill=W)
    dot(d,.42,.46,.028, fill=(255,255,255,0)); dot(d,.58,.46,.028, fill=(255,255,255,0))
def g_roi(d):  # ascending bars + arrow
    for x,h in ((.30,.14),(.44,.24),(.58,.34)):
        d.rectangle(R(x,.72-h,x+.09,.72), fill=W)
    arrow(d, .30,.44,.66,.28, head=.09, w=int(wln*.8))

ICONS = [
    ("dashboard", TEAL, g_dashboard), ("requests", TEAL, g_requests), ("issues", TEAL, g_issues),
    ("clash", TEAL, g_clash), ("clashreg", TEAL, g_clashreg), ("flag", TEAL, g_flag),
    ("scan", AMBER, g_scan), ("scorecard", AMBER, g_scorecard), ("rules", AMBER, g_rules),
    ("ifcgate", AMBER, g_ifcgate), ("preflight", AMBER, g_preflight), ("gate", AMBER, g_gate),
    ("family", AMBER, g_family), ("heal", AMBER, g_heal), ("mep", AMBER, g_mep),
    ("govern", EMER, g_govern), ("publish", GREEN, g_publish), ("autopublish", GREEN, g_autopublish),
    ("sheets", GREEN, g_sheets),
    ("standards", VIOLET, g_standards), ("setup", VIOLET, g_setup), ("office", VIOLET, g_office),
    ("apply", VIOLET, g_apply), ("ingest", VIOLET, g_ingest), ("ghost", VIOLET, g_ghost),
    ("roi", VIOLET, g_roi),
]

os.makedirs(OUT, exist_ok=True)
rendered = {}
for name, base, glyph in ICONS:
    img = tile(base)
    # ghost eyes need to punch through -> draw glyph on the tile with an alpha-cutting draw
    d = ImageDraw.Draw(img, "RGBA")
    glyph(d)
    rendered[name] = img
    for sz in (32, 16):
        img.resize((sz, sz), Image.LANCZOS).save(os.path.join(OUT, f"{name}{sz}.png"))

# contact sheet
cols = 6; rows = math.ceil(len(ICONS)/cols); cell = 96; pad = 14
sheet = Image.new("RGBA", (cols*cell, rows*cell), (28,28,34,255))
sd = ImageDraw.Draw(sheet)
for i,(name,_,_) in enumerate(ICONS):
    ix,iy = (i%cols)*cell, (i//cols)*cell
    ic = rendered[name].resize((cell-2*pad, cell-2*pad), Image.LANCZOS)
    sheet.alpha_composite(ic, (ix+pad, iy+pad-6))
    sd.text((ix+6, iy+cell-16), name, fill=(200,200,205,255))
sheet.save(os.path.join(os.path.dirname(__file__), "contact_sheet.png"))
print(f"wrote {len(ICONS)} icons x (32,16) to Resources/ + contact_sheet.png")
