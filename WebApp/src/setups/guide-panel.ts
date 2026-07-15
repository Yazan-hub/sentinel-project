import * as OBC from "@thatopen/components";

/**
 * Guide — an interactive, in-app teaching interface. Explains what Sentinel is (goal, idea, use) and
 * every feature + how to use it, navigable by lifecycle stage. Read-only content panel; docked as the
 * "Guide" sidebar tab. Pure DOM, self-contained.
 */

interface Topic { id: string; stage: string; title: string; body: string; }

const OVERVIEW = `
<h2>Sentinel — a project-delivery operating system</h2>
<p><b>The idea.</b> A construction project is normally scattered across 15–30 disconnected tools, and the
office standards that should bind them live in PDFs nobody enforces. Sentinel makes the project <b>one
governed dataset</b>: every dimension (2D–7D) is a <i>view</i> of the same model, and the standard is
<i>executable code</i> that's enforced at every step.</p>
<p><b>The goal.</b> Manage a project <b>A→Z — from tendering to handover — in one place</b>, so nothing is
re-typed or re-checked at each hand-off, and the owner receives a living asset record instead of a pile of
PDFs.</p>
<p><b>How it's used.</b> Load your model, install your office standard, and work the lifecycle left-to-right
down the sidebar: <b>Tender → Design → Coordination → Construction → Handover → Operate</b>. At each stage
boundary a <b>gate</b> checks the standard and only lets you advance when it's met.</p>
<div class="tip">Tip: the sidebar is ordered like the project lifecycle. Start at <b>Project</b> (the command
center), then follow the stages downward. Every panel reads the <i>same</i> model, so numbers never disagree.</div>
`;

const TOPICS: Topic[] = [
  { id: "project", stage: "Overview", title: "Project — Command Center", body: `
<p><b>What it is.</b> The home screen: your project's lifecycle rail + live KPIs (health, compliance, open
issues, cost) + the current <b>stage gate</b>.</p>
<p><b>How to use it.</b></p><ol>
<li>Press ↻ to aggregate the latest KPIs from the model + service.</li>
<li>Read the gate: green ✓ = met, amber ! = not yet.</li>
<li>When all checks pass, press <b>Advance stage</b> — it moves the project forward only if the standard allows.</li></ol>
<div class="tip">This is the payoff of the whole platform: standards-as-code gating the lifecycle.</div>` },

  { id: "copilot", stage: "Overview", title: "Copilot — grounded assistant", body: `
<p><b>What it is.</b> A chat assistant that answers from your project's <i>real</i> data (QA, cost, issues) and
cites its sources — it never guesses. Optional local LLM (Ollama) adds free-form phrasing.</p>
<p><b>How to use it.</b> Tap a suggestion or type a question: "What's the model health?", "How many walls fail
naming?", "Total cost?". Answers with elements offer an <b>Isolate</b> button to highlight them in the 3D view.</p>` },

  { id: "guide", stage: "Overview", title: "Guide (this panel)", body: `
<p><b>What it is.</b> This teaching interface. Pick any feature on the left to learn what it does and how to
use it, grouped by lifecycle stage.</p>` },

  { id: "tender", stage: "Tender", title: "Tender — BoQ-driven bidding", body: `
<p><b>What it is.</b> The front of the lifecycle. The tender scope <i>is</i> the model's Bill of Quantities, so
bids are compared against a model-derived estimate.</p>
<p><b>How to use it.</b></p><ol>
<li><b>New → Create from model BoQ</b> — takes the scope + estimate straight from the 5D take-off.</li>
<li>Open it → <b>Enter a bid</b> (bidder + per-line rates, pre-filled with the estimate).</li>
<li>Add more bids → the comparison table highlights the <b>lowest price per line</b> and the total variance.</li>
<li><b>Award</b> the winner — logged with a full history.</li></ol>` },

  { id: "model", stage: "Design", title: "Explorer · Assets · Data", body: `
<p><b>What they are.</b> The base viewer: <b>Assets</b> loads models (IFC / .frag), <b>Explorer</b> is the
model tree + properties, <b>Data</b> is the tabular view.</p>
<p><b>How to use it.</b> Start in <b>Assets</b> → add your model. It appears in the 3D viewer that every panel
shares. Everything else reads from it.</p>` },

  { id: "standards", stage: "Design", title: "Standards — the marketplace", body: `
<p><b>What it is.</b> A marketplace of office/regional standards packs. <b>Installing a pack makes it the
project's rulebook</b> — QA, the Copilot and every gate immediately enforce it.</p>
<p><b>How to use it.</b></p><ol>
<li><b>Install</b> a pack (e.g. BDS House Standard) → it becomes the active ruleset.</li>
<li><b>Fork</b> a pack to adapt it; <b>Publish</b> your current standard to share it.</li>
<li>Edit the rules themselves in Revit (Standards Engine), then re-publish a new version.</li></ol>` },

  { id: "qa", stage: "Design", title: "QA — standards scan", body: `
<p><b>What it is.</b> Scans the model against the installed standard and scores it (grade + %).</p>
<p><b>How to use it.</b> Press <b>Scan</b> → read the grade and the violations by domain. Click any violation
to isolate + zoom to the offending element. Fix, re-scan, watch the score rise.</p>` },

  { id: "cost", stage: "Design", title: "Cost · 5D — model-driven BoQ", body: `
<p><b>What it is.</b> Quantities pulled from the model priced against an editable rate library — so the cost
plan can't drift from design. Includes change tracking.</p>
<p><b>How to use it.</b></p><ol>
<li><b>Take off ▶</b> → a grouped Bill of Quantities + total.</li>
<li>Edit any <b>rate</b> → it reprices instantly (rates save to the project).</li>
<li><b>Baseline</b> the cost; later, change the model, take off again, press <b>Δ</b> to see the cost impact per line.</li>
<li>Click a line → isolate its elements. <b>CSV</b> exports the BoQ.</li></ol>
<div class="tip">Banners flag elements with no quantities or no rate — gaps are shown, never hidden.</div>` },

  { id: "carbon", stage: "Design", title: "6D — embodied carbon", body: `
<p><b>What it is.</b> The same quantities × carbon factors → whole-project embodied carbon, hotspots and
intensity (kgCO₂e/m²).</p>
<p><b>How to use it.</b> <b>Take off ▶</b> → total tCO₂e + a hotspot chart. Edit factors to match your EPD data
(defaults are indicative). Click a line to isolate. Export CSV.</p>` },

  { id: "timeline", stage: "Construction", title: "4D — sequence simulation", body: `
<p><b>What it is.</b> Turns the programme into a view of the model — scrub the timeline and watch the building
rise.</p>
<p><b>How to use it.</b></p><ol>
<li>Choose <b>Trade</b> (by discipline) or <b>Level</b> (floor-by-floor), then <b>Generate</b> — or import a P6/MSP CSV.</li>
<li>Drag the scrubber or press ▶: done = shown, active = highlighted, not-started = hidden.</li>
<li>Click a task → isolate its elements.</li></ol>` },

  { id: "issues", stage: "Coordination", title: "Issues (BCF)", body: `
<p><b>What it is.</b> Zero-licence coordination issues that sync two-way with the Revit plugin.</p>
<p><b>How to use it.</b> Select an element in the 3D view → <b>＋ New</b> → fill in the details → Send. It appears
in the list here <i>and</i> in the Revit BCF window, which zooms straight to the element + camera. Filter by
status / type / priority; open one for full details, comments and history.</p>` },

  { id: "rfis", stage: "Coordination", title: "RFIs / approvals", body: `
<p><b>What it is.</b> Requests for Information as first-class objects: raise → answer → approve & close, with a
history trail.</p>
<p><b>How to use it.</b> Select elements to link them, <b>Raise</b> an RFI (subject, discipline, assignee,
question). The responder <b>answers</b> it (auto-moves to Answered); a coordinator <b>Approves & closes</b> it.</p>
<div class="tip">Open RFIs block the coordination gate — you can't advance with them unresolved.</div>` },

  { id: "cobie", stage: "Handover", title: "7D — handover / COBie", body: `
<p><b>What it is.</b> The asset register the FM team uses: maintainable components + their FM data, scored for
handover readiness, exportable as COBie.</p>
<p><b>How to use it.</b> <b>Assets ▶</b> → readiness % + coverage bars (serial / manufacturer / warranty / install
date). Red chips show what's missing on each asset. <b>COBie</b> exports the register. Readiness ≥ 95% is
required to pass the handover gate.</p>
<div class="tip">On a design model this reads low — correct: those fields get filled during construction.</div>` },

  { id: "owner", stage: "Operate", title: "Owner / FM portal", body: `
<p><b>What it is.</b> The read-only stakeholder view — the golden thread the owner receives.</p>
<p><b>How to use it.</b> It shows the project at a glance (readiness, health, value, carbon, open items) from the
saved snapshot — no model needed. <b>Load from model</b> to search the asset register and locate any component
in 3D.</p>` },
];

const STAGES = ["Overview", "Tender", "Design", "Construction", "Coordination", "Handover", "Operate"];

export function guidePanel(_components: OBC.Components): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:grid;grid-template-columns:9.5rem 1fr;height:100%;background:#141419;color:#e7e9ee;font:13px system-ui;border-radius:.5rem;overflow:hidden";

  // styles for content
  const style = document.createElement("style");
  style.textContent =
    ".gd-nav{overflow:auto;border-right:1px solid #2a2a30;padding:.5rem .4rem;background:#101014}" +
    ".gd-stage{font:600 9.5px ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:#7c8598;margin:.6rem .3rem .25rem}" +
    ".gd-item{display:block;width:100%;text-align:left;border:0;background:none;color:#c7ccd6;font:500 12px system-ui;padding:.3rem .45rem;border-radius:.35rem;cursor:pointer}" +
    ".gd-item:hover{background:#1c1c24}.gd-item[aria-current=true]{background:#6528d7;color:#fff}" +
    ".gd-body{overflow:auto;padding:1.1rem 1.3rem;max-width:60ch}" +
    ".gd-body h2{font-size:1.15rem;margin:0 0 .6rem;letter-spacing:-.01em}" +
    ".gd-body p{margin:.5rem 0;line-height:1.6;color:#cdd2db}.gd-body b{color:#fff}" +
    ".gd-body ol{margin:.5rem 0;padding-left:1.2rem;color:#cdd2db;line-height:1.6}.gd-body li{margin:.2rem 0}" +
    ".gd-body .tip{margin-top:.9rem;padding:.6rem .7rem;border:1px solid #6528d755;background:#6528d715;border-radius:.4rem;font-size:12px;color:#d7d2f0}" +
    ".gd-badge{display:inline-block;font:600 10px ui-monospace,Consolas,monospace;color:#a78bfa;border:1px solid #6528d755;border-radius:100px;padding:.1rem .5rem;margin-bottom:.6rem}";
  root.appendChild(style);

  const nav = document.createElement("div"); nav.className = "gd-nav";
  const body = document.createElement("div"); body.className = "gd-body";

  const items: HTMLButtonElement[] = [];
  const select = (id: string, badge: string, html: string) => {
    items.forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
    body.innerHTML = (badge ? `<span class="gd-badge">${badge}</span>` : "") + html;
    body.scrollTop = 0;
  };

  // Start-here
  const start = document.createElement("button"); start.className = "gd-item"; start.dataset.id = "overview";
  start.textContent = "▸ Start here"; start.style.fontWeight = "600";
  start.addEventListener("click", () => select("overview", "", OVERVIEW));
  nav.appendChild(start); items.push(start);

  for (const stage of STAGES) {
    const inStage = TOPICS.filter((t) => t.stage === stage);
    if (!inStage.length) continue;
    const h = document.createElement("div"); h.className = "gd-stage"; h.textContent = stage; nav.appendChild(h);
    for (const t of inStage) {
      const b = document.createElement("button"); b.className = "gd-item"; b.dataset.id = t.id; b.textContent = t.title;
      b.addEventListener("click", () => select(t.id, `${t.stage} · how to use`, t.body));
      nav.appendChild(b); items.push(b);
    }
  }

  root.appendChild(nav); root.appendChild(body);
  select("overview", "", OVERVIEW);
  return root;
}
