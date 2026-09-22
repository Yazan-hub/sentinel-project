// Documents panel — ISO 19650 project documents (BEP/EIR): create from template, edit sections,
// manage states, publish immutable versions, print/PDF via a print stylesheet. Plain-DOM like files-panel.
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";

const STATE_COLOR: Record<string, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };
type Answer = { value: "yes" | "partial" | "no"; note: string; by: string; at: string };
type Section = {
  id: string; heading: string; guidance: string; body: string; state: string; owner: string | null; bindings: Record<string, unknown>;
  // READINESS documents only (readiness-template.json)
  pillar?: "standards" | "people" | "process"; kind?: "measured" | "declared"; question?: string; answer_hint?: string;
  answer?: Answer | null; due?: string | null;
};
type Doc = { id: string; doc_type: string; title: string; status: string; sections: Section[]; updated_at: string };
type Evidence = { label: string; detail: string; ref?: string };
type CheckResult = { id: string; label: string; status: "met" | "violations" | "not_checkable" | "error"; count: number; summary: string; reason?: string; evidence: Evidence[] };
type Compliance = { document_id: string; generated_at: string; summary: Record<string, number>; sections: { section_id: string; heading: string; results: CheckResult[] }[] };
type Suggestion = { section_id: string; heading: string; suggested: { id: string; label: string; params: Record<string, unknown>; confidence: number; why: string; planned: boolean }[] };

type Comment = { id: string; section_id: string; author: string; text: string; created_at: string };

type IntegrityFinding = { section_id: string; fact: number; claim: string; reality: string; severity: "high" | "medium" | "low" };
type IntegrityReport = { findings: IntegrityFinding[]; dropped: number; grounding_used: number; generated_at: string; provider?: string; model?: string; note?: string };
const SEV_COLOR: Record<string, string> = { high: "#f87171", medium: "#eab308", low: "#9ca3af" };

function renderIntegrity(out: HTMLElement, r: IntegrityReport, doc: { sections: { id: string; heading: string }[] }) {
  out.replaceChildren();
  const banner = document.createElement("div");
  banner.textContent = `AI analysis — suggestions, not compliance facts. ${r.provider ? `${r.provider}/${r.model} · ` : ""}${new Date(r.generated_at).toLocaleString()} · grounded in ${r.grounding_used} fact(s)`;
  banner.style.cssText = "color:#93c5fd;background:#132038;border-radius:.35rem;padding:.35rem .6rem;font:10.5px system-ui;margin:.4rem 0";
  out.append(banner);

  if (r.note) {
    const n = document.createElement("div");
    n.textContent = r.note;                                // honest empty-document note
    n.style.cssText = "color:#9ca3af;padding:.3rem .6rem;font:11px system-ui";
    out.append(n);
    return;
  }
  if (r.dropped > 0) {
    const d = document.createElement("div");
    d.textContent = `${r.dropped} finding(s) discarded — the model cited no grounded fact for them.`;
    d.style.cssText = "color:#fbbf24;padding:.2rem .6rem;font:10.5px system-ui";
    out.append(d);
  }
  if (!r.findings.length) {
    const okEl = document.createElement("div");
    okEl.textContent = r.dropped > 0
      ? "0 usable findings (see discarded above) — this is NOT a clean bill of health."
      : "No contradictions found between this document and the project's configuration.";
    okEl.style.cssText = "color:#9ca3af;padding:.3rem .6rem;font:11px system-ui";
    out.append(okEl);
    return;
  }
  const headingOf = (id: string) => doc.sections.find((s) => s.id === id)?.heading || id;
  for (const f of r.findings) {
    const card = document.createElement("div");
    card.style.cssText = "border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;padding:.4rem .6rem;margin:.25rem 0";
    const head = document.createElement("div");
    const sev = document.createElement("span");
    sev.textContent = f.severity.toUpperCase();
    sev.style.cssText = `color:${SEV_COLOR[f.severity] || "#9ca3af"};font:700 10px system-ui;margin-right:.5rem`;
    const sec = document.createElement("span");
    sec.textContent = headingOf(f.section_id);
    sec.style.cssText = "color:#e5e7eb;font:600 11.5px system-ui";
    head.append(sev, sec);
    const claim = document.createElement("div");
    claim.textContent = `Document: ${f.claim}`;
    claim.style.cssText = "color:#cbd5e1;font:11px system-ui;margin-top:.2rem";
    const reality = document.createElement("div");
    reality.textContent = `Reality: ${f.reality}`;
    reality.style.cssText = "color:#93c5fd;font:11px system-ui";
    card.append(head, claim, reality);
    out.append(card);
  }
}

type ExecSection = { section_id: string; heading: string; kind: "controlling" | "declared" | "narrative"; controlling_checks: string[]; declared_checks: string[]; unknown_checks: string[]; owner: string | null; has_body: boolean };
type Executability = { document_id: string; title: string; doc_type: string; generated_at: string; score: number | null; reason?: string; summary: { sections: number; controlling: number; declared: number; narrative: number; unowned: number; empty: number }; strip: string[]; sections: ExecSection[] };

type PillarScore = {
  measured: { met: number; violation: number; not_checkable: number; unbound: number; items: ReadinessItem[] };
  declared: { yes: number; partial: number; no: number; unanswered: number; items: ReadinessItem[] };
  missing: ReadinessItem[];
};
type ReadinessItem = { section_id: string; heading: string; pillar: string; kind: string; verdict: string; reason: string; evidence: Evidence[]; answer: Answer | null; owner: string | null; due: string | null };
type PlanRow = { section_id: string; heading: string; pillar: string; kind: string; owner: string | null; due: string | null; closes_when: string; status: "open" | "overdue" | "closed" };
type Readiness = {
  document_id: string; title: string; generated_at: string;
  evidence: { snapshot: { source: { kind: string; title: string }; at: string; received_at: string } | null; scan: { doc_title: string; at: string; received_at: string } | null };
  score: { overall: PillarScore; pillars: Record<"standards" | "people" | "process", PillarScore>; unclassified: string[] };
  plan: PlanRow[];
  sections: { section_id: string; heading: string; pillar: string | null; kind: string | null; results: CheckResult[] }[];
};

/** The strip test, rendered. Plain DOM — server text never reaches innerHTML. */
function renderExecutability(out: HTMLElement, r: Executability) {
  out.replaceChildren();
  const box = document.createElement("div");
  box.style.cssText = "border:1px solid #2a2a30;background:#1b1b21;border-radius:.4rem;padding:.6rem .8rem;margin:.4rem 0";

  const head = document.createElement("div");
  const pct = document.createElement("span");
  pct.textContent = r.score === null ? "—" : `${r.score}%`;
  pct.style.cssText = `font:700 22px system-ui;color:${r.score === null ? "#9ca3af" : r.score >= 60 ? "#22c55e" : r.score >= 30 ? "#eab308" : "#f87171"}`;
  const cap = document.createElement("span");
  cap.textContent = r.score === null ? (r.reason || "nothing to score") : " of this document actually controls the project";
  cap.style.cssText = "color:#c9cfda;font:12px system-ui;margin-left:.4rem";
  head.append(pct, cap);
  box.append(head);

  const line = (label: string, n: number, color: string, note?: string) => {
    const d = document.createElement("div");
    const b = document.createElement("span");
    b.textContent = `${n}`;
    b.style.cssText = `color:${color};font:700 12px system-ui;display:inline-block;min-width:1.6rem`;
    const t = document.createElement("span");
    t.textContent = note ? `${label} — ${note}` : label;
    t.style.cssText = "color:#9ca3af;font:11.5px system-ui";
    d.append(b, t);
    d.style.cssText = "margin-top:.25rem";
    return d;
  };
  box.append(
    line("controlling clauses", r.summary.controlling, "#22c55e", "bound to a check that runs today"),
    line("declared clauses", r.summary.declared, "#eab308", "bound only to a planned check — NOT scored"),
    line("narrative clauses", r.summary.narrative, "#f87171", "control nothing Sentinel can observe"),
  );
  if (r.summary.unowned || r.summary.empty)
    box.append(line("clauses with no owner", r.summary.unowned, "#9ca3af"), line("clauses with no text", r.summary.empty, "#9ca3af"));
  out.append(box);

  if (r.strip.length) {
    const h = document.createElement("div");
    h.textContent = `What the strip test removes (${r.strip.length}):`;
    h.style.cssText = "color:#e5e7eb;font:600 11.5px system-ui;margin:.5rem 0 .2rem";
    out.append(h);
    const ul = document.createElement("div");
    for (const heading of r.strip) {
      const li = document.createElement("div");
      li.textContent = `· ${heading}`;
      li.style.cssText = "color:#9ca3af;font:11.5px system-ui;padding:.1rem 0 .1rem .4rem";
      ul.append(li);
    }
    out.append(ul);
  }
}

const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
  met: { color: "#22c55e", icon: "✓" },
  violations: { color: "#f87171", icon: "✗" },
  not_checkable: { color: "#a1a1aa", icon: "—" },
  error: { color: "#eab308", icon: "!" },
};

export function docsPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl || SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const esc = (s?: string) => (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await bfetch(`${base}/bimdocs${path}`, { headers: { "Content-Type": "application/json" }, ...init });
    if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).message || `HTTP ${r.status}`), { status: r.status });
    return r.json();
  };
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };

  // ── AI provider/model selection — shared by Draft with AI (editor view) and Check integrity
  // (document view). Same rule as the copilot panel: the panel only picks WHICH; every call still
  // goes through the bridge, where the keys live and local-default/cloud-opt-in is enforced.
  let myRole: string | null = "service";
  const canEdit = () => myRole === "service" || ["owner", "lead", "contributor"].includes(myRole ?? "");
  const canGovern = () => myRole === "service" || ["owner", "lead"].includes(myRole ?? "");

  let aiProvider = "local";
  let aiModel = ""; // "" = the provider's own default
  let aiProviders: { id: string; label: string; available: boolean; blocked?: string; note?: string }[] | null = null;
  const aiBody = () => JSON.stringify(aiModel ? { provider: aiProvider, model: aiModel } : { provider: aiProvider });
  /** A fresh picker instance for a view's bar; all instances read/write the shared selection. */
  const aiPicker = (): HTMLElement => {
    const wrap = document.createElement("span");
    wrap.style.cssText = "display:inline-flex;gap:.3rem;align-items:center";
    const selCss = "max-width:110px;background:#14141a;color:#c9cfda;border:1px solid #2c2c34;border-radius:.3rem;font:11px system-ui;padding:.2rem";
    const providerSel = document.createElement("select");
    providerSel.title = "Which AI drafts/analyses (keys stay in the bridge; local is the private default)";
    providerSel.style.cssText = selCss;
    const modelSel = document.createElement("select");
    modelSel.title = "Model (empty = provider default)";
    modelSel.style.cssText = selCss;
    const loadModels = async () => {
      modelSel.replaceChildren();
      try {
        const r = await bfetch(`${base}/ai/models?provider=${encodeURIComponent(aiProvider)}`);
        const { models } = await r.json();
        for (const m of models as string[]) modelSel.appendChild(new Option(m, m)); // Option() text is DOM-safe
        if (aiModel && (models as string[]).includes(aiModel)) modelSel.value = aiModel;
        aiModel = modelSel.value || "";
      } catch { aiModel = ""; /* provider offline — the bridge will say so honestly on use */ }
    };
    void (async () => {
      try {
        if (!aiProviders) aiProviders = (await (await bfetch(`${base}/ai/providers`)).json()).providers;
        for (const p of aiProviders!) {
          const o = new Option(p.available ? p.label : `${p.label} — unavailable`, p.id);
          o.disabled = !p.available;
          if (p.blocked || p.note) o.title = p.blocked || p.note || "";
          providerSel.appendChild(o);
        }
        providerSel.value = aiProvider;
        await loadModels();
      } catch { /* AI endpoints unreachable — buttons still work with the local default */ }
    })();
    providerSel.addEventListener("change", async () => { aiProvider = providerSel.value; aiModel = ""; await loadModels(); });
    modelSel.addEventListener("change", () => { aiModel = modelSel.value; });
    wrap.append(providerSel, modelSel);
    return wrap;
  };

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;flex:0 0 auto;min-width:0";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;min-width:0;overflow:auto;padding:.6rem";
  root.append(bar, body);

  const chip = (state: string) =>
    `<span style="display:inline-block;padding:.1rem .45rem;border-radius:.6rem;font:600 10px system-ui;color:#0b0b0e;background:${STATE_COLOR[state] || "#a1a1aa"}">${state}</span>`;
  const btn = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `border:1px solid #2c2c34;background:${primary ? "#2563eb" : "#1f1f27"};color:${primary ? "#fff" : "#c9cfda"};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`;
    return b;
  };
  const msg = (text: string, isErr = false) => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `padding:.4rem .6rem;border-radius:.35rem;margin:.4rem 0;background:${isErr ? "#3b1113" : "#132038"};color:${isErr ? "#fca5a5" : "#93c5fd"}`;
    body.prepend(d);
    setTimeout(() => d.remove(), 5000);
  };

  // ── Ingest (upload + review) ─────────────────────────────────────────────
  type Fragment = { text: string; pages: number[]; confidence: number };
  type ProposedSection = { heading: string; guidance: string; body: string; fragments: Fragment[] };
  type Unassigned = { text: string; pages: number[]; suggested_heading: string | null; confidence: number; reason: string };
  type Proposal = { proposal: { sections: ProposedSection[]; unassigned: Unassigned[] }; source: Record<string, unknown>; doc_type: string; title: string };

  const pageRef = (pages: number[]) => (pages?.length ? `p.${pages.join(", ")}` : "");

  async function runIngest(file: File) {
    body.replaceChildren();
    const busy = document.createElement("div");
    busy.textContent = `Reading ${file.name} and mapping it to the template… (a local model can take a minute)`;
    busy.style.cssText = "color:#93c5fd;padding:1rem";
    body.append(busy);
    try {
      const docType = /bep/i.test(file.name) ? "BEP" : "EIR";
      const r = await bfetch(
        `${base}/bimdocs/${encodeURIComponent(pid())}/ingest?name=${encodeURIComponent(file.name)}&doc_type=${docType}`,
        { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await file.arrayBuffer() },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
      showIngestReview(j as Proposal);
    } catch (e) {
      body.replaceChildren();
      msg(`Ingestion failed: ${(e as Error).message}`, true);
      await showList();
    }
  }

  function showIngestReview(p: Proposal) {
    const sections = p.proposal.sections.map((s) => ({ ...s }));
    const unassigned = p.proposal.unassigned.map((u) => ({ ...u, target: u.suggested_heading || "" }));

    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Review ingestion — ${p.title}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    cancel.onclick = showList;
    const accept = btn("✓ Create document", true);
    bar.append(title, cancel, accept);

    body.replaceChildren();
    const intro = document.createElement("div");
    const mapped = sections.filter((s) => s.body.trim()).length;
    intro.textContent = `${mapped}/${sections.length} sections mapped · ${unassigned.length} passage(s) need a home. Edit anything before creating the document — nothing is saved yet.`;
    intro.style.cssText = "color:#9ca3af;padding:.2rem 0 .6rem";
    body.append(intro);

    sections.forEach((s, i) => {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.5rem;background:#1b1b21";
      const head = document.createElement("div");
      head.style.cssText = "padding:.45rem .6rem;border-bottom:1px solid #2a2a30;display:flex;gap:.5rem;align-items:center";
      const headingSpan = document.createElement("span");
      headingSpan.textContent = s.heading;
      headingSpan.style.cssText = "font:600 12px system-ui;color:#eee;flex:1";
      head.append(headingSpan);
      const cites = s.fragments.map((f) => pageRef(f.pages)).filter(Boolean).join(" · ");
      const citesSpan = document.createElement("span");
      if (cites) {
        citesSpan.textContent = cites;
        citesSpan.style.cssText = "color:#6b7280;font:10px ui-monospace,Consolas,monospace";
      } else {
        citesSpan.textContent = "empty";
        citesSpan.style.cssText = "color:#71717a;font-size:10px";
      }
      head.append(citesSpan);
      const ta = document.createElement("textarea");
      ta.value = s.body;
      ta.style.cssText = "width:100%;min-height:5rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:0;border-radius:0 0 .4rem .4rem;padding:.5rem .6rem;font:12px ui-monospace,Consolas,monospace;resize:vertical";
      ta.oninput = () => { sections[i].body = ta.value; };
      card.append(head, ta);
      body.append(card);
    });

    if (unassigned.length) {
      const uHead = document.createElement("div");
      uHead.textContent = "Unassigned passages — pick a section or leave as Discard";
      uHead.style.cssText = "font:600 12px system-ui;color:#eab308;margin:.8rem 0 .4rem";
      body.append(uHead);
      unassigned.forEach((u, i) => {
        const row = document.createElement("div");
        row.style.cssText = "border:1px solid #3f3f46;border-radius:.4rem;margin-bottom:.4rem;background:#141418;padding:.5rem .6rem";
        const metaRow = document.createElement("div");
        metaRow.style.cssText = "display:flex;gap:.5rem;align-items:center;margin-bottom:.35rem";
        const metaSpan = document.createElement("span");
        metaSpan.textContent = `${pageRef(u.pages)} · ${u.reason}`;
        metaSpan.style.cssText = "color:#6b7280;font:10px ui-monospace,Consolas,monospace;flex:1";
        metaRow.append(metaSpan);
        const textDiv = document.createElement("div");
        textDiv.textContent = u.text;
        textDiv.style.cssText = "color:#cbd5e1;font:12px ui-monospace,Consolas,monospace;white-space:pre-wrap;max-height:7rem;overflow:auto";
        const sel = document.createElement("select");
        sel.style.cssText = "margin-top:.4rem;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui;width:100%";
        const discardOpt = document.createElement("option");
        discardOpt.value = "";
        discardOpt.textContent = "Discard";
        sel.append(discardOpt);
        for (const s of sections) {
          const o = document.createElement("option");
          o.value = s.heading;
          o.textContent = s.heading;
          o.selected = s.heading === u.target;
          sel.append(o);
        }
        sel.onchange = () => { unassigned[i].target = sel.value; };
        row.append(metaRow, textDiv, sel);
        body.append(row);
      });
    }

    accept.onclick = async () => {
      accept.disabled = true;
      accept.textContent = "Creating…";
      // Fold each assigned passage into the end of its chosen section, in review order — into a LOCAL
      // copy so a failed commit + retry never folds the same passages in twice (sections is untouched).
      const foldedBodies = new Map<string, string>();
      for (const u of unassigned) {
        if (!u.target) continue;
        const s = sections.find((x) => x.heading === u.target);
        if (!s) continue;
        const base = foldedBodies.has(s.heading) ? foldedBodies.get(s.heading)! : s.body;
        foldedBodies.set(s.heading, base ? `${base}\n\n${u.text}` : u.text);
      }
      try {
        const created = await api(`/${encodeURIComponent(pid())}/ingest/commit`, {
          method: "POST",
          body: JSON.stringify({
            doc_type: p.doc_type,
            title: p.title,
            source: p.source,
            sections: sections.map((s) => ({ heading: s.heading, guidance: s.guidance, body: foldedBodies.get(s.heading) ?? s.body })),
            actor: await actor(),
          }),
        });
        await showEditor(created.id);
      } catch (e) {
        accept.disabled = false;
        accept.textContent = "✓ Create document";
        msg(`Couldn't create the document: ${(e as Error).message}`, true);
      }
    };
  }

  // ── List view ─────────────────────────────────────────────────────────────
  async function showList() {
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members/me`);
      const j = await r.json().catch(() => ({}));
      // Fail CLOSED: an unanswered role question renders read-only. A signed-in non-member gets
      // `role: null` (viewer here); only the bridge's own machine path answers "service".
      myRole = r.ok ? ((j as { role?: string | null }).role ?? "viewer") : "viewer";
    } catch { myRole = "viewer"; }

    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Project Documents";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    bar.append(title);
    if (myRole === "viewer") {
      const chipEl = document.createElement("span");
      chipEl.textContent = "your role: viewer";
      chipEl.style.cssText = "color:#a1a1aa;font:600 10.5px system-ui;border:1px solid #2c2c34;border-radius:.3rem;padding:.1rem .4rem";
      bar.append(chipEl);
    }
    if (canEdit()) {
      const newBtn = btn("+ New document", true);
      newBtn.onclick = showCreate;
      const ingestBtn = btn("⇪ Ingest EIR/BEP");
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf,.docx,.txt,.md";
      fileInput.style.display = "none";
      ingestBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const f = fileInput.files?.[0];
        fileInput.value = "";
        if (f) await runIngest(f);
      };
      bar.append(ingestBtn, newBtn, fileInput);
    }
    body.replaceChildren();
    try {
      const docs: (Doc & { version_count: number })[] = await api(`/${encodeURIComponent(pid())}`);
      if (!docs.length) { body.innerHTML = `<div style="color:#71717a;padding:1rem">No documents yet — create a BEP or EIR from a template.</div>`; return; }
      for (const d of docs) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.4rem;cursor:pointer";
        row.innerHTML = `<span style="font:700 10px system-ui;color:#93c5fd;border:1px solid #2c3a55;border-radius:.3rem;padding:.1rem .35rem">${esc(d.doc_type)}</span>
          <span style="flex:1;font:600 12px system-ui;color:#eee">${esc(d.title)}</span>
          ${chip(d.status)}<span style="color:#71717a">v${d.version_count}</span>`;
        row.onclick = () => showEditor(d.id);
        body.append(row);
      }
    } catch (e: any) { msg(e.message, true); }
  }

  // ── Create view ───────────────────────────────────────────────────────────
  async function showCreate() {
    body.replaceChildren();
    const templates: { doc_type: string; title: string; sections: number }[] = await api("/templates");
    const wrap = document.createElement("div");
    wrap.style.cssText = "max-width:420px;display:flex;flex-direction:column;gap:.5rem";
    const input = document.createElement("input");
    input.placeholder = "Document title";
    input.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#eee;border-radius:.35rem;padding:.4rem .5rem";
    wrap.append(input);
    for (const t of templates) {
      const b = btn(`Create ${t.doc_type} — ${t.title} (${t.sections} sections)`);
      b.onclick = async () => {
        try {
          const doc = await api(`/${encodeURIComponent(pid())}`, { method: "POST", body: JSON.stringify({ doc_type: t.doc_type, title: input.value || t.title, actor: await actor() }) });
          showEditor(doc.id);
        } catch (e: any) { msg(e.message, true); }
      };
      wrap.append(b);
    }
    const back = btn("← Back"); back.onclick = showList; wrap.append(back);
    body.append(wrap);
  }

  /** One section's compliance chips + expandable evidence. Plain DOM (no innerHTML with server text). */
  function complianceStrip(results: CheckResult[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:.25rem;margin:.35rem 0 .1rem";
    if (!results.length) {
      const none = document.createElement("div");
      none.textContent = "No checks bound to this section.";
      none.style.cssText = "color:#52525b;font:10.5px system-ui";
      wrap.append(none);
      return wrap;
    }
    for (const r of results) {
      const st = STATUS_STYLE[r.status] || STATUS_STYLE.error;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:.4rem;font:11px system-ui";
      const chipEl = document.createElement("span");
      chipEl.textContent = `${st.icon} ${r.label}`;
      chipEl.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.25rem;padding:0 .35rem;white-space:nowrap`;
      const txt = document.createElement("span");
      txt.textContent = r.status === "not_checkable" ? (r.reason || "not checkable") : r.summary;
      txt.style.cssText = "color:#9ca3af;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      txt.title = r.status === "not_checkable" ? (r.reason || "") : r.summary;
      row.append(chipEl, txt);
      if (r.evidence.length) {
        const more = btn(`${r.evidence.length} ▾`);
        more.style.padding = ".05rem .3rem";
        const list = document.createElement("div");
        list.style.cssText = "display:none;flex-direction:column;gap:.15rem;margin:.2rem 0 .3rem 1.2rem";
        for (const e of r.evidence.slice(0, 50)) {
          const li = document.createElement("div");
          li.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#cbd5e1";
          const strong = document.createElement("span");
          strong.textContent = e.label;
          strong.style.color = "#e5e7eb";
          const rest = document.createElement("span");
          rest.textContent = ` — ${e.detail}`;
          li.append(strong, rest);
          list.append(li);
        }
        more.onclick = () => { list.style.display = list.style.display === "none" ? "flex" : "none"; };
        row.append(more);
        wrap.append(row, list);
      } else {
        wrap.append(row);
      }
    }
    return wrap;
  }

  async function showBindings(doc: Doc, section: Section, onDone: () => void) {
    const registry: { checks: { id: string; label: string; description: string }[]; planned: { id: string; label: string; reason: string }[] } =
      await api("/checks");
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Bindings — ${section.heading}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const save = btn("Save bindings", true);
    cancel.onclick = onDone;
    bar.append(title, cancel, save);

    body.replaceChildren();
    const currentChecks = (section.bindings as { checks?: { id: string; params?: Record<string, unknown> }[] })?.checks || [];
    const current = new Set(currentChecks.map((c) => c.id));
    const currentParams = new Map(currentChecks.map((c) => [c.id, c.params]));
    const boxes: { id: string; input: HTMLInputElement }[] = [];
    const addRow = (id: string, label: string, description: string, planned: boolean) => {
      const row = document.createElement("label");
      row.style.cssText = "display:flex;gap:.5rem;align-items:flex-start;padding:.35rem .4rem;border:1px solid #2a2a30;border-radius:.35rem;margin-bottom:.3rem;background:#1b1b21;cursor:pointer";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = current.has(id);
      const text = document.createElement("div");
      const t = document.createElement("div");
      t.textContent = planned ? `${label} (not checkable yet)` : label;
      t.style.cssText = `font:600 12px system-ui;color:${planned ? "#a1a1aa" : "#e5e7eb"}`;
      const d = document.createElement("div");
      d.textContent = description;
      d.style.cssText = "font:10.5px system-ui;color:#9ca3af";
      text.append(t, d);
      row.append(cb, text);
      body.append(row);
      boxes.push({ id, input: cb });
    };

    const h = (label: string) => { const x = document.createElement("div"); x.textContent = label; x.style.cssText = "font:600 11px system-ui;color:#9ca3af;margin:.5rem 0 .3rem"; body.append(x); };
    h("Checks Sentinel can evaluate now");
    for (const c of registry.checks) addRow(c.id, c.label, c.description, false);
    h("Planned — binding one records the gap honestly");
    for (const p of registry.planned) addRow(p.id, p.label, p.reason, true);

    save.onclick = async () => {
      save.disabled = true;
      try {
        await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${section.id}/bindings`, {
          method: "PUT",
          body: JSON.stringify({
            bindings: {
              checks: boxes
                .filter((b) => b.input.checked)
                .map((b) => {
                  const params = currentParams.get(b.id);
                  return params ? { id: b.id, params } : { id: b.id };
                }),
            },
            updated_at: doc.updated_at,
            actor: await actor(),
          }),
        });
        onDone();
      } catch (e) {
        save.disabled = false;
        if ((e as any).status === 409) {
          msg("This document changed since you opened it — reopen it and set the bindings again.", true);
        } else {
          msg(`Couldn't save bindings: ${(e as Error).message}`, true);
        }
      }
    };
  }

  async function showSuggestBindings(doc: Doc, onDone: () => void) {
    const suggestions: Suggestion[] = await api(`/${encodeURIComponent(pid())}/${doc.id}/bindings/suggest`, { method: "POST", body: JSON.stringify({}) });
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = `Suggested bindings — ${doc.title}`;
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const apply = btn("✓ Apply selected", true);
    cancel.onclick = onDone;
    bar.append(title, cancel, apply);

    body.replaceChildren();
    const picks: { section_id: string; id: string; params: Record<string, unknown>; input: HTMLInputElement }[] = [];
    const matched = suggestions.filter((s) => s.suggested.length);
    if (!matched.length) {
      const none = document.createElement("div");
      none.textContent = "No sections matched a known check. Bind them manually from each section's Bindings button.";
      none.style.cssText = "color:#9ca3af;padding:1rem";
      body.append(none);
    }
    for (const s of matched) {
      const head = document.createElement("div");
      head.textContent = s.heading;
      head.style.cssText = "font:600 12px system-ui;color:#e5e7eb;margin:.6rem 0 .25rem";
      body.append(head);
      for (const sg of s.suggested) {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;gap:.5rem;align-items:flex-start;padding:.3rem .4rem;border:1px solid #2a2a30;border-radius:.35rem;margin-bottom:.25rem;background:#1b1b21;cursor:pointer";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !sg.planned && sg.confidence >= 1;
        const text = document.createElement("div");
        const t = document.createElement("div");
        t.textContent = sg.planned ? `${sg.label} (not checkable yet)` : sg.label;
        t.style.cssText = `font:600 11.5px system-ui;color:${sg.planned ? "#a1a1aa" : "#e5e7eb"}`;
        const w = document.createElement("div");
        w.textContent = `${sg.why} · confidence ${sg.confidence}`;
        w.style.cssText = "font:10px ui-monospace,Consolas,monospace;color:#71717a";
        text.append(t, w);
        row.append(cb, text);
        body.append(row);
        picks.push({ section_id: s.section_id, id: sg.id, params: sg.params, input: cb });
      }
    }

    apply.onclick = async () => {
      apply.disabled = true;
      apply.textContent = "Applying…";
      const bySection = new Map<string, { id: string; params: Record<string, unknown> }[]>();
      for (const p of picks) if (p.input.checked) bySection.set(p.section_id, [...(bySection.get(p.section_id) || []), { id: p.id, params: p.params }]);
      const sections = [...bySection.entries()];
      let appliedCount = 0;
      try {
        for (const [sectionId, checks] of sections) {
          const row: Doc = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${sectionId}/bindings`, {
            method: "PUT",
            body: JSON.stringify({ bindings: { checks: checks.map((c) => (c.params ? { id: c.id, params: c.params } : { id: c.id })) }, updated_at: doc.updated_at, actor: await actor() }),
          });
          // Each write bumps the document's updated_at; carry it forward or every section after the first is a stale write (409).
          if (row?.updated_at) doc.updated_at = row.updated_at;
          appliedCount += 1;
        }
        onDone();
      } catch (e) {
        apply.disabled = false;
        apply.textContent = "✓ Apply selected";
        const failedSection = sections[appliedCount]?.[0];
        const heading = matched.find((s) => s.section_id === failedSection)?.heading || failedSection || "unknown section";
        if ((e as any).status === 409) {
          msg(`Applied ${appliedCount}/${sections.length} section(s); this document changed since you opened it — reopen it and try again.`, true);
        } else {
          msg(`Applied ${appliedCount}/${sections.length} section(s); failed on "${heading}": ${(e as Error).message}`, true);
        }
      }
    };
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  async function showEditor(docId: string) {
    let doc: Doc;
    try { doc = await api(`/${encodeURIComponent(pid())}/${docId}`); } catch (e: any) { msg(e.message, true); return showList(); }
    if (doc.doc_type === "READINESS") return showReadinessEditor(doc);
    bar.replaceChildren();
    const back = btn("← Documents"); back.onclick = showList;
    const title = document.createElement("span");
    title.innerHTML = `<b style="color:#eee">${esc(doc.title)}</b> &nbsp;${chip(doc.status)}`;
    title.style.flex = "1";
    const viewBtn = btn("Document view"); viewBtn.onclick = () => showDocView(doc);
    const versBtn = btn("Versions"); versBtn.onclick = () => showVersions(doc);
    bar.append(back, title, viewBtn, versBtn);
    if (canGovern()) {
      const suggestBtn = btn("Suggest bindings"); suggestBtn.onclick = () => showSuggestBindings(doc, () => showEditor(doc.id));
      bar.append(suggestBtn);
    }
    bar.append(aiPicker());
    // document-level transitions (governance)
    if (canGovern()) {
      const next: Record<string, string[]> = { wip: ["shared"], shared: ["wip", "published"], published: ["archived"], archived: ["wip"] };
      for (const to of next[doc.status] || []) {
        const b = btn(to === "published" ? "Publish…" : `→ ${to}`, to === "published");
        b.onclick = async () => {
          try {
            if (to === "published") {
              const label = prompt("Version label (e.g. 'P01 — issued for review')") || "";
              const { version_no } = await api(`/${encodeURIComponent(pid())}/${doc.id}/publish`, { method: "POST", body: JSON.stringify({ label, actor: await actor() }) });
              msg(`Published v${version_no}`);
            } else {
              await api(`/${encodeURIComponent(pid())}/${doc.id}/transition`, { method: "POST", body: JSON.stringify({ to, actor: await actor() }) });
            }
            showEditor(doc.id);
          } catch (e: any) { msg(e.message, true); }
        };
        bar.append(b);
      }
    }

    body.replaceChildren();
    const editable = (doc.status === "wip" || doc.status === "shared") && canEdit();
    let compliance: Compliance | null = null;
    try { compliance = await api(`/${encodeURIComponent(pid())}/${doc.id}/compliance`); } catch { /* compliance is optional; the editor must still open */ }
    const resultsFor = (sid: string) => compliance?.sections.find((s) => s.section_id === sid)?.results ?? [];
    let comments: Comment[] = [];
    try { comments = await api(`/${encodeURIComponent(pid())}/${doc.id}/comments`); } catch { /* comments are optional; the editor must still open */ }
    for (const s of doc.sections) {
      const sec = document.createElement("details");
      sec.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.4rem;background:#191920";
      const sum = document.createElement("summary");
      sum.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;cursor:pointer;list-style:none";
      sum.innerHTML = `<span style="flex:1;font:600 12px system-ui;color:#eee">${esc(s.heading)}</span>${chip(s.state)}<span style="color:#71717a">${esc(s.owner || "")}</span>`;
      const inner = document.createElement("div");
      inner.style.cssText = "padding:.5rem .6rem;border-top:1px solid #2a2a30;display:flex;flex-direction:column;gap:.4rem";
      const guide = document.createElement("div");
      guide.textContent = s.guidance;
      guide.style.cssText = "color:#8b93a3;font-style:italic";
      const ta = document.createElement("textarea");
      ta.value = s.body;
      ta.disabled = !editable;
      ta.style.cssText = "min-height:110px;background:#1f1f27;border:1px solid #2c2c34;color:#e5e7eb;border-radius:.35rem;padding:.45rem;font:12px/1.5 ui-monospace,monospace;resize:vertical";
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "display:flex;gap:.4rem;align-items:center";
      const ownerIn = document.createElement("input");
      ownerIn.placeholder = "owner (email)";
      ownerIn.value = s.owner || "";
      ownerIn.disabled = !editable;
      ownerIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem;width:180px";
      const stateSel = document.createElement("select");
      stateSel.disabled = !editable;
      stateSel.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem";
      for (const st of ["wip", "shared", "published", "archived"]) {
        const o = document.createElement("option"); o.value = st; o.textContent = st; o.selected = st === s.state; stateSel.append(o);
      }
      const save = btn("Save section", true);
      save.disabled = !editable;
      save.onclick = async (ev) => {
        ev.preventDefault();
        const doSave = async (force = false) =>
          api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}`, {
            method: "PATCH",
            body: JSON.stringify({ body: ta.value, owner: ownerIn.value || null, state: stateSel.value, updated_at: force ? undefined : doc.updated_at, actor: await actor() }),
          });
        try { await doSave(); showEditor(doc.id); }
        catch (e: any) {
          if (e.status === 409 && confirm(`${e.message}\n\nOverwrite with your version?`)) { await doSave(true).catch((e2) => msg(e2.message, true)); showEditor(doc.id); }
          else msg(e.message, true);
        }
      };
      if (canGovern()) {
        const bindingsBtn = btn("Bindings");
        bindingsBtn.onclick = () => showBindings(doc, s, () => showEditor(doc.id));
        rowEl.append(ownerIn, stateSel, save, bindingsBtn);
      } else {
        rowEl.append(ownerIn, stateSel, save);
      }
      if (editable) {
        // AI draft — proposal only: fills the editor; nothing is saved until the normal Save.
        const draftBtn = btn("Draft with AI");
        draftBtn.onclick = async () => {
          draftBtn.disabled = true;
          const prev = draftBtn.textContent;
          draftBtn.textContent = "Drafting…";
          try {
            const r = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/draft`, { method: "POST", body: aiBody() });
            ta.value = r.proposal;                        // model output → .value (XSS-safe)
            ta.dispatchEvent(new Event("input"));         // fire any dirty-tracking the editor has
            msg(`AI draft (${r.provider}/${r.model}, grounded in ${r.grounding_used} fact(s)) — review before saving.`);
          } catch (e) {
            msg(`Draft failed: ${(e as Error).message}`, true);
          } finally {
            draftBtn.disabled = false;
            draftBtn.textContent = prev;
          }
        };
        rowEl.append(draftBtn);
      }
      inner.append(guide, ta, complianceStrip(resultsFor(s.id)), rowEl, commentThreadEl(doc, s.id, comments));
      sec.append(sum, inner);
      body.append(sec);
    }
  }

  // ── READINESS documents: three numbers per pillar, measured items with their check, declared items with a
  //    yes/partial/no answer, owner + due on the item, the plan derived. Never a blended percentage. ────
  const PILLARS: ("standards" | "people" | "process")[] = ["standards", "people", "process"];
  const PILLAR_TITLE = { standards: "Standards", people: "People", process: "Process" };
  const VERDICT_STYLE: Record<string, string> = { met: "#22c55e", yes: "#22c55e", partial: "#eab308", violation: "#f87171", no: "#f87171", not_checkable: "#a1a1aa", unbound: "#a1a1aa", unanswered: "#a1a1aa" };

  function threeNumbers(p: PillarScore): HTMLElement {
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-wrap:wrap;gap:.8rem;font:12px system-ui;color:#c9cfda;padding:.35rem 0";
    const line = (label: string, parts: [string, number, string][]) => {
      const d = document.createElement("span");
      d.append(Object.assign(document.createElement("b"), { textContent: `${label}: ` }));
      parts.forEach(([name, n, color], i) => {
        const s = document.createElement("span"); s.style.color = color; s.textContent = `${n} ${name}`; d.append(s);
        if (i < parts.length - 1) d.append(" · ");
      });
      return d;
    };
    box.append(
      line("Measured", [["met", p.measured.met, "#22c55e"], ["violation", p.measured.violation, "#f87171"], ["not checkable", p.measured.not_checkable, "#a1a1aa"]]),
      line("Declared", [["yes", p.declared.yes, "#22c55e"], ["partial", p.declared.partial, "#eab308"], ["no", p.declared.no, "#f87171"]]),
      line("Missing", [["", p.missing.length, "#93c5fd"]]),
    );
    return box;
  }

  function verdictChip(v: string): HTMLElement {
    const s = document.createElement("span");
    s.textContent = v.replace("_", " ");
    s.style.cssText = `font:700 10px system-ui;color:${VERDICT_STYLE[v] || "#a1a1aa"};border:1px solid ${VERDICT_STYLE[v] || "#a1a1aa"};border-radius:.3rem;padding:.1rem .35rem;flex-shrink:0;white-space:nowrap`;
    return s;
  }

  async function showReadinessEditor(doc: Doc) {
    bar.replaceChildren();
    const back = btn("← Documents"); back.onclick = showList;
    const title = document.createElement("span");
    title.innerHTML = `<b style="color:#eee">${esc(doc.title)}</b> &nbsp;${chip(doc.status)}`;
    title.style.flex = "1";
    const versBtn = btn("Versions"); versBtn.onclick = () => showVersions(doc);
    const reportBtn = btn("Download report (.md)");
    reportBtn.onclick = async () => {
      try {
        const r = await bfetch(`${base}/bimdocs/${encodeURIComponent(pid())}/${doc.id}/readiness?format=md`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await r.blob()), download: `readiness-${doc.title.replace(/[^\w-]+/g, "_")}.md` });
        a.click(); URL.revokeObjectURL(a.href);
      } catch (e: any) { msg(`Report failed: ${e.message}`, true); }
    };
    let showPlan = false;
    const planBox = document.createElement("div"); // dedicated container — toggling Plan must never rebuild itemEl() and lose in-progress input
    const planBtn = btn("Plan");
    planBtn.onclick = () => { showPlan = !showPlan; renderPlan(); };
    bar.append(back, title, versBtn, reportBtn, planBtn);
    if (canGovern()) {
      const next: Record<string, string[]> = { wip: ["shared"], shared: ["wip", "published"], published: ["archived"], archived: ["wip"] };
      for (const to of next[doc.status] || []) {
        const b = btn(to === "published" ? "Publish…" : `→ ${to}`, to === "published");
        b.onclick = async () => {
          try {
            if (to === "published") {
              const label = prompt("Version label (e.g. 'Assessment 1 — September')") || "";
              const { version_no } = await api(`/${encodeURIComponent(pid())}/${doc.id}/publish`, { method: "POST", body: JSON.stringify({ label, actor: await actor() }) });
              msg(`Published v${version_no}`);
            } else {
              await api(`/${encodeURIComponent(pid())}/${doc.id}/transition`, { method: "POST", body: JSON.stringify({ to, actor: await actor() }) });
            }
            showEditor(doc.id);
          } catch (e: any) { msg(e.message, true); }
        };
        bar.append(b);
      }
    }

    body.replaceChildren(Object.assign(document.createElement("div"), { textContent: "Computing readiness — running the measured checks…", style: "color:#9ca3af;font:12px system-ui;padding:.6rem" }));
    const editable = (doc.status === "wip" || doc.status === "shared") && canEdit();
    let rep: Readiness | null = null;
    try { rep = await api(`/${encodeURIComponent(pid())}/${doc.id}/readiness`); } catch (e: any) { msg(`Readiness could not be computed: ${e.message}`, true); }
    let comments: Comment[] = [];
    try { comments = await api(`/${encodeURIComponent(pid())}/${doc.id}/comments`); } catch { /* optional */ }
    let members: { email: string; role: string }[] = [];
    if (canGovern()) {
      try {
        const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members`);
        if (r.ok) members = ((await r.json()) as { email: string; role: string }[]).filter((m) => String(m.email || "").includes("@"));
      } catch { /* the owner picker then offers the current value only */ }
    }
    const resultsFor = (sid: string) => rep?.sections.find((s) => s.section_id === sid)?.results ?? [];
    const itemFor = (sid: string) => rep ? [...rep.score.overall.measured.items, ...rep.score.overall.declared.items].find((i) => i.section_id === sid) : undefined;

    const renderPlan = () => {
      planBox.replaceChildren();
      if (!showPlan || !rep) return;
      const tbl = document.createElement("table");
      tbl.style.cssText = "width:100%;border-collapse:collapse;font:11.5px system-ui;color:#c9cfda;margin-bottom:.6rem";
      tbl.innerHTML = `<thead><tr style="color:#9ca3af;text-align:left"><th>Item</th><th>Pillar</th><th>Owner</th><th>Due</th><th>Status</th><th>Closes when</th></tr></thead>`;
      const tb = document.createElement("tbody");
      for (const r of rep.plan) {
        const tr = document.createElement("tr");
        tr.style.borderTop = "1px solid #2a2a30";
        for (const v of [r.heading, r.pillar, r.owner || "—", r.due || "—", r.status, r.closes_when]) {
          const td = document.createElement("td"); td.textContent = v; td.style.padding = ".25rem .3rem";
          if (v === "overdue") td.style.color = "#f87171"; if (v === "closed") td.style.color = "#22c55e";
          tr.append(td);
        }
        tb.append(tr);
      }
      if (!rep.plan.length) tb.innerHTML = `<tr><td colspan="6" style="padding:.4rem;color:#9ca3af">Nothing open.</td></tr>`;
      tbl.append(tb); planBox.append(tbl);
    };

    // In-place updates: a save must never blank the page. Each item registers the bits that change; the scores
    // refresh in the background (the measured checks take seconds) and only numbers, chips and the plan are touched.
    const ui = new Map<string, { chip: HTMLElement; who: HTMLElement; by: HTMLElement; closes: HTMLElement }>();
    const overallStrip = document.createElement("div");
    const pillarStrip = Object.fromEntries(PILLARS.map((p) => [p, document.createElement("div")])) as unknown as Record<(typeof PILLARS)[number], HTMLElement>;
    const scoreNote = document.createElement("span");
    scoreNote.style.cssText = "font:400 11px system-ui;color:#9ca3af;margin-left:.5rem";
    const paintScores = () => {
      const r0 = rep;
      if (!r0) return;
      overallStrip.replaceChildren(threeNumbers(r0.score.overall));
      for (const p of PILLARS) pillarStrip[p].replaceChildren(threeNumbers(r0.score.pillars[p]));
      for (const [sid, u] of ui) {
        const it = itemFor(sid);
        if (!it) continue;
        const fresh = verdictChip(it.verdict); u.chip.replaceWith(fresh); u.chip = fresh;
        u.closes.textContent = r0.plan.find((row) => row.section_id === sid)?.closes_when ?? "";
      }
      renderPlan();
    };
    const refreshScores = async () => {
      scoreNote.textContent = "updating…";
      try { rep = await api(`/${encodeURIComponent(pid())}/${doc.id}/readiness`); paintScores(); scoreNote.textContent = ""; }
      catch (e: any) { scoreNote.textContent = "numbers not refreshed"; msg(`Readiness could not be refreshed: ${e.message}`, true); }
    };
    const applyRow = (row: Doc, s: Section) => {
      doc.updated_at = row.updated_at;
      const ns = row.sections.find((x) => x.id === s.id);
      if (ns) Object.assign(s, ns);
      const u = ui.get(s.id);
      if (!u) return;
      u.who.textContent = [s.owner, s.due].filter(Boolean).join(" · ");
      if (s.kind === "declared") {
        const fresh = verdictChip(s.answer?.value ?? "unanswered"); u.chip.replaceWith(fresh); u.chip = fresh;
        u.by.textContent = s.answer ? `answered ${s.answer.value} by ${s.answer.by} on ${s.answer.at.slice(0, 10)}` : "";
      }
    };

    const render = () => {
      body.replaceChildren();
      ui.clear();
      if (rep) {
        const head = document.createElement("div");
        head.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;padding:.5rem .6rem;margin-bottom:.5rem;background:#141418";
        const ev = document.createElement("div");
        ev.style.cssText = "font:11.5px system-ui;color:#9ca3af";
        ev.textContent = [
          rep.evidence.snapshot ? `Office snapshot: ${rep.evidence.snapshot.source.title} (${rep.evidence.snapshot.at.slice(0, 10)})` : "Office snapshot: none received — in Revit: Build Office System → Send office snapshot",
          rep.evidence.scan ? `Model scan: ${rep.evidence.scan.doc_title} (${rep.evidence.scan.at.slice(0, 10)})` : "Model scan: none received — synchronise a model with the add-in",
        ].join("  ·  ");
        const headTitle = Object.assign(document.createElement("div"), { textContent: "Overall", style: "font:600 12px system-ui;color:#eee" });
        headTitle.append(scoreNote);
        head.append(headTitle, overallStrip, ev);
        body.append(head);
      }
      body.append(planBox);
      renderPlan();
      for (const p of PILLARS) {
        const group = document.createElement("details");
        group.open = true;
        group.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;margin-bottom:.5rem;background:#141418";
        const gs = document.createElement("summary");
        gs.style.cssText = "padding:.45rem .6rem;cursor:pointer;list-style:none;font:600 12px system-ui;color:#eee";
        gs.textContent = PILLAR_TITLE[p];
        group.append(gs);
        pillarStrip[p].style.cssText = "padding:0 .6rem .2rem";
        if (rep) group.append(pillarStrip[p]);
        for (const s of doc.sections.filter((x) => x.pillar === p)) group.append(itemEl(s));
        body.append(group);
      }
      const rest = doc.sections.filter((x) => !PILLARS.includes(x.pillar as any));
      for (const s of rest) body.append(itemEl(s));
      paintScores();
    };

    const itemEl = (s: Section): HTMLElement => {
      const it = itemFor(s.id);
      const sec = document.createElement("details");
      sec.style.cssText = "border-top:1px solid #2a2a30;background:#191920";
      const sum = document.createElement("summary");
      sum.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.4rem .6rem;cursor:pointer;list-style:none";
      const h = document.createElement("span"); h.style.cssText = "flex:1;font:600 12px system-ui;color:#eee"; h.textContent = s.heading;
      const chipEl = verdictChip(it?.verdict ?? (s.kind === "measured" ? "not_checkable" : "unanswered"));
      sum.append(h, chipEl);
      const by = document.createElement("div"); by.style.cssText = "font:10.5px system-ui;color:#9ca3af";
      const who = document.createElement("span"); who.style.color = "#71717a"; who.textContent = [s.owner, s.due].filter(Boolean).join(" · "); sum.append(who);
      const inner = document.createElement("div");
      inner.style.cssText = "padding:.5rem .6rem;display:flex;flex-direction:column;gap:.4rem";
      const guide = document.createElement("div"); guide.style.cssText = "color:#8b93a3;font-style:italic"; guide.textContent = s.guidance; inner.append(guide);

      if (s.kind === "measured") {
        if (rep === null) {
          inner.append(Object.assign(document.createElement("div"), { textContent: "Readiness could not be computed — see the message above.", style: "color:#9ca3af" }));
        } else {
          inner.append(complianceStrip(resultsFor(s.id)));
        }
      } else {
        const q = document.createElement("div"); q.style.cssText = "color:#e5e7eb;font:12px system-ui"; q.textContent = s.question || ""; inner.append(q);
        const row = document.createElement("div"); row.style.cssText = "display:flex;gap:.6rem;align-items:center;flex-wrap:wrap";
        let value = s.answer?.value ?? "";
        for (const v of ["yes", "partial", "no"] as const) {
          const lab = document.createElement("label"); lab.style.cssText = `color:${VERDICT_STYLE[v]};font:12px system-ui;display:flex;gap:.25rem;align-items:center`;
          const rb = document.createElement("input"); rb.type = "radio"; rb.name = `ans-${s.id}`; rb.value = v; rb.checked = value === v; rb.disabled = !editable;
          rb.onchange = () => { value = v; };
          lab.append(rb, v); row.append(lab);
        }
        const note = document.createElement("input"); note.placeholder = s.answer_hint || "note (who, what, since when)"; note.value = s.answer?.note ?? ""; note.disabled = !editable;
        note.style.cssText = "flex:1;min-width:220px;background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem";
        const saveA = btn("Save answer", true); saveA.disabled = !editable;
        saveA.onclick = async (ev) => {
          ev.preventDefault();
          if (!value) return msg("Pick yes, partial or no first.", true);
          try {
            const row: Doc = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/answer`, { method: "PUT", body: JSON.stringify({ value, note: note.value, updated_at: doc.updated_at, actor: await actor() }) });
            applyRow(row, s); msg("Answer saved."); void refreshScores();
          } catch (e: any) { msg(e.message, true); }
        };
        row.append(note, saveA);
        by.textContent = s.answer ? `answered ${s.answer.value} by ${s.answer.by} on ${s.answer.at.slice(0, 10)}` : "";
        inner.append(by, row);
      }

      // plan fields — lead and above
      const plan = document.createElement("div"); plan.style.cssText = "display:flex;gap:.4rem;align-items:center;flex-wrap:wrap";
      const ownerIn = document.createElement("select"); ownerIn.disabled = !(editable && canGovern());
      ownerIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem;width:240px";
      ownerIn.append(new Option("— owner —", ""));
      for (const e of [...new Set([...(s.owner ? [s.owner] : []), ...members.map((m) => m.email)])]) {
        const m = members.find((x) => x.email === e);
        ownerIn.append(new Option(m ? `${e} (${m.role})` : e, e));
      }
      ownerIn.value = s.owner || "";
      const dueIn = document.createElement("input"); dueIn.type = "date"; dueIn.value = s.due || ""; dueIn.disabled = !(editable && canGovern());
      dueIn.style.cssText = "background:#1f1f27;border:1px solid #2c2c34;color:#c9cfda;border-radius:.35rem;padding:.3rem .4rem";
      const saveP = btn("Save plan"); saveP.disabled = !(editable && canGovern());
      saveP.onclick = async (ev) => {
        ev.preventDefault();
        try {
          const row: Doc = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/plan`, { method: "PUT", body: JSON.stringify({ owner: ownerIn.value || null, due: dueIn.value || null, updated_at: doc.updated_at, actor: await actor() }) });
          applyRow(row, s); msg("Plan saved."); void refreshScores();
        } catch (e: any) { msg(e.message, true); }
      };
      const closes = document.createElement("span"); closes.style.cssText = "font:11px system-ui;color:#9ca3af";
      closes.textContent = rep?.plan.find((r) => r.section_id === s.id)?.closes_when ?? "";
      plan.append(ownerIn, dueIn, saveP, closes);
      ui.set(s.id, { chip: chipEl, who, by, closes });
      inner.append(plan, commentThreadEl(doc, s.id, comments));
      sec.append(sum, inner);
      return sec;
    };

    render();
  }

  // ── Comment threads — always available, viewers included (published docs are commentable) ────
  function commentThreadEl(doc: Doc, sectionId: string, allComments: Comment[]): HTMLElement {
    const wrap = document.createElement("div");
    const list = allComments.filter((c) => c.section_id === sectionId);
    const toggle = btn(`💬 ${list.length}`);
    toggle.style.display = myRole === "viewer" || list.length > 0 ? "" : "none";
    const thread = document.createElement("div");
    thread.style.cssText = "display:none;flex-direction:column;gap:.35rem;margin-top:.4rem;padding:.4rem .5rem;border:1px solid #2a2a30;border-radius:.35rem;background:#141418";

    const renderThread = () => {
      thread.replaceChildren();
      for (const c of list) {
        const item = document.createElement("div");
        const meta = document.createElement("div");
        meta.style.cssText = "font:10.5px system-ui;color:#9ca3af";
        const authorSpan = document.createElement("span");
        authorSpan.textContent = c.author;                 // .textContent — XSS-safe
        const timeSpan = document.createElement("span");
        timeSpan.textContent = " · " + new Date(c.created_at).toLocaleString();
        meta.append(authorSpan, timeSpan);
        const textEl = document.createElement("div");
        textEl.textContent = c.text;                       // .textContent — XSS-safe
        textEl.style.cssText = "font:11px system-ui;color:#e5e7eb;white-space:pre-wrap";
        item.append(meta, textEl);
        thread.append(item);
      }
      const ta = document.createElement("textarea");
      ta.placeholder = "Add a comment…";
      ta.style.cssText = "width:100%;min-height:2.4rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.3rem;font:11px system-ui;resize:vertical;margin-top:.3rem";
      const postBtn = btn("Post");
      postBtn.style.marginTop = ".3rem";
      postBtn.onclick = async () => {
        const text = ta.value.trim();
        if (!text) return;
        postBtn.disabled = true;
        try {
          await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${sectionId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
          const fresh: Comment[] = await api(`/${encodeURIComponent(pid())}/${doc.id}/comments`);
          list.length = 0;
          list.push(...fresh.filter((c) => c.section_id === sectionId));
          toggle.textContent = `💬 ${list.length}`;
          renderThread();
        } catch (e) {
          msg(`Couldn't post comment: ${(e as Error).message}`, true); // draft text is kept — ta is untouched on failure
        } finally {
          postBtn.disabled = false;
        }
      };
      thread.append(ta, postBtn);
    };
    renderThread();
    toggle.onclick = () => { thread.style.display = thread.style.display === "none" ? "flex" : "none"; };
    wrap.append(toggle, thread);
    return wrap;
  }

  // ── Versions view ─────────────────────────────────────────────────────────
  async function showVersions(doc: Doc) {
    body.replaceChildren();
    const back = btn("← Editor"); back.onclick = () => showEditor(doc.id); body.append(back);
    try {
      const vs: { version_no: number; label: string; published_by: string; published_at: string }[] =
        await api(`/${encodeURIComponent(pid())}/${doc.id}/versions`);
      if (!vs.length) { body.append(Object.assign(document.createElement("div"), { textContent: "No published versions yet." })); return; }
      for (const v of vs) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:.6rem;align-items:center;padding:.45rem .6rem;border:1px solid #2a2a30;border-radius:.4rem;margin-top:.4rem;cursor:pointer";
        row.innerHTML = `<b style="color:#eee">v${v.version_no}</b><span style="flex:1">${esc(v.label || "")}</span><span style="color:#71717a">${esc(v.published_by)} · ${new Date(v.published_at).toLocaleString()}</span>`;
        row.onclick = async () => {
          const full = await api(`/${encodeURIComponent(pid())}/${doc.id}/versions/${v.version_no}`);
          showDocView(full.snapshot as Doc, `v${v.version_no} — ${esc(v.label || "")}`);
        };
        body.append(row);
      }
    } catch (e: any) { msg(e.message, true); }
  }

  // ── Document view (read + print) ──────────────────────────────────────────
  async function showDocView(doc: Doc, versionLabel?: string) {
    bar.replaceChildren();
    const back = btn("← Editor"); back.onclick = () => showEditor(doc.id); bar.append(back);
    const printBtn = btn("Print / PDF", true);
    const integrityBtn = btn("Check integrity");
    const stripBtn = btn("Strip test");
    bar.append(printBtn, aiPicker(), integrityBtn, stripBtn);
    body.replaceChildren();
    const integrityOut = document.createElement("div");   // findings render here, transient
    integrityBtn.onclick = async () => {
      integrityBtn.disabled = true;
      integrityBtn.textContent = "Analysing…";
      integrityOut.replaceChildren();
      try {
        const r: IntegrityReport = await api(`/${encodeURIComponent(pid())}/${doc.id}/integrity`, { method: "POST", body: aiBody() });
        renderIntegrity(integrityOut, r, doc);
      } catch (e) {
        const d = document.createElement("div");
        d.textContent = `Integrity analysis failed: ${(e as Error).message}`;
        d.style.cssText = "padding:.4rem .6rem;border-radius:.35rem;background:#3b1113;color:#fca5a5;margin:.4rem 0";
        integrityOut.append(d);
      } finally {
        integrityBtn.disabled = false;
        integrityBtn.textContent = "Check integrity";
      }
    };
    stripBtn.onclick = async () => {
      stripBtn.disabled = true;
      stripBtn.textContent = "Scoring…";
      integrityOut.replaceChildren();
      try {
        renderExecutability(integrityOut, await api(`/${encodeURIComponent(pid())}/${doc.id}/executability`));
      } catch (e) {
        const d = document.createElement("div");
        d.textContent = `Strip test failed: ${(e as Error).message}`;
        d.style.cssText = "padding:.4rem .6rem;border-radius:.35rem;background:#3b1113;color:#fca5a5;margin:.4rem 0";
        integrityOut.append(d);
      } finally {
        stripBtn.disabled = false;
        stripBtn.textContent = "Strip test";
      }
    };
    body.append(integrityOut);
    const page = document.createElement("div");
    page.className = "bimdoc-print";
    page.style.cssText = "max-width:760px;margin:0 auto;background:#fff;color:#111;border-radius:.4rem;padding:2rem;font:13px/1.6 Georgia,serif";
    const stamp = versionLabel || `working copy — ${doc.status}`;
    page.innerHTML =
      `<div style="border-bottom:2px solid #111;padding-bottom:.6rem;margin-bottom:1rem">
         <div style="font:700 20px system-ui">${esc(doc.title)}</div>
         <div style="font:12px system-ui;color:#555">${esc(doc.doc_type)} · Project ${pid()} · ${esc(stamp)} · ${new Date().toLocaleDateString()}</div>
       </div>` +
      doc.sections.map((s) =>
        `<section style="page-break-inside:avoid;margin-bottom:1.1rem">
           <h2 style="font:700 15px system-ui;border-bottom:1px solid #ccc;padding-bottom:.2rem">${esc(s.heading)}</h2>
           <div style="white-space:pre-wrap">${s.body ? esc(s.body) : "<i style='color:#999'>Not yet written.</i>"}</div>
         </section>`).join("");
    body.append(page);

    // Comment threads — only for the live document (versionLabel means a read-only past snapshot
    // whose section ids may not exist as commentable sections any more).
    if (!versionLabel) {
      let comments: Comment[] = [];
      try { comments = await api(`/${encodeURIComponent(pid())}/${doc.id}/comments`); } catch { /* optional */ }
      for (const s of doc.sections) {
        const holder = document.createElement("div");
        holder.style.cssText = "max-width:760px;margin:.3rem auto 0";
        holder.append(commentThreadEl(doc, s.id, comments));
        body.append(holder);
      }
    }

    printBtn.onclick = () => {
      const w = window.open("", "_blank");
      if (!w) return msg("Popup blocked — allow popups to print", true);
      w.document.write(`<!doctype html><title>${esc(doc.title)}</title>
        <style>body{font:13px/1.6 Georgia,serif;color:#111;margin:2rem auto;max-width:720px}
        h2{font:700 15px system-ui;border-bottom:1px solid #ccc;padding-bottom:.2rem}
        section{page-break-inside:avoid;margin-bottom:1.1rem}
        @page{margin:2cm}</style>${page.innerHTML}`);
      w.document.close();
      w.print();
    };
  }

  onActiveProjectChange(() => showList());
  showList();
  return root;
}
