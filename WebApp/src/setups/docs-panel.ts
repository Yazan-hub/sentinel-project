// Documents panel — ISO 19650 project documents (BEP/EIR): create from template, edit sections,
// manage states, publish immutable versions, print/PDF via a print stylesheet. Plain-DOM like files-panel.
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";

const STATE_COLOR: Record<string, string> = { wip: "#a1a1aa", shared: "#3b82f6", published: "#22c55e", archived: "#71717a" };
type Section = { id: string; heading: string; guidance: string; body: string; state: string; owner: string | null; bindings: Record<string, unknown> };
type Doc = { id: string; doc_type: string; title: string; status: string; sections: Section[]; updated_at: string };
type Evidence = { label: string; detail: string; ref?: string };
type CheckResult = { id: string; label: string; status: "met" | "violations" | "not_checkable" | "error"; count: number; summary: string; reason?: string; evidence: Evidence[] };
type Compliance = { document_id: string; generated_at: string; summary: Record<string, number>; sections: { section_id: string; heading: string; results: CheckResult[] }[] };
type Suggestion = { section_id: string; heading: string; suggested: { id: string; label: string; params: Record<string, unknown>; confidence: number; why: string; planned: boolean }[] };

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

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;flex:0 0 auto";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
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
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Project Documents";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
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
    bar.append(title, ingestBtn, newBtn, fileInput);
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
          await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${sectionId}/bindings`, {
            method: "PUT",
            body: JSON.stringify({ bindings: { checks: checks.map((c) => (c.params ? { id: c.id, params: c.params } : { id: c.id })) }, updated_at: doc.updated_at, actor: await actor() }),
          });
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
    bar.replaceChildren();
    const back = btn("← Documents"); back.onclick = showList;
    const title = document.createElement("span");
    title.innerHTML = `<b style="color:#eee">${esc(doc.title)}</b> &nbsp;${chip(doc.status)}`;
    title.style.flex = "1";
    const viewBtn = btn("Document view"); viewBtn.onclick = () => showDocView(doc);
    const versBtn = btn("Versions"); versBtn.onclick = () => showVersions(doc);
    const suggestBtn = btn("Suggest bindings"); suggestBtn.onclick = () => showSuggestBindings(doc, () => showEditor(doc.id));
    bar.append(back, title, viewBtn, versBtn, suggestBtn);
    // document-level transitions
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

    body.replaceChildren();
    const editable = doc.status === "wip" || doc.status === "shared";
    let compliance: Compliance | null = null;
    try { compliance = await api(`/${encodeURIComponent(pid())}/${doc.id}/compliance`); } catch { /* compliance is optional; the editor must still open */ }
    const resultsFor = (sid: string) => compliance?.sections.find((s) => s.section_id === sid)?.results ?? [];
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
      const bindingsBtn = btn("Bindings");
      bindingsBtn.onclick = () => showBindings(doc, s, () => showEditor(doc.id));
      rowEl.append(ownerIn, stateSel, save, bindingsBtn);
      if (editable) {
        // AI draft — proposal only: fills the editor; nothing is saved until the normal Save.
        const draftBtn = btn("Draft with AI");
        draftBtn.onclick = async () => {
          draftBtn.disabled = true;
          const prev = draftBtn.textContent;
          draftBtn.textContent = "Drafting…";
          try {
            const r = await api(`/${encodeURIComponent(pid())}/${doc.id}/section/${s.id}/draft`, { method: "POST", body: JSON.stringify({}) });
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
      inner.append(guide, ta, complianceStrip(resultsFor(s.id)), rowEl);
      sec.append(sum, inner);
      body.append(sec);
    }
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
  function showDocView(doc: Doc, versionLabel?: string) {
    bar.replaceChildren();
    const back = btn("← Editor"); back.onclick = () => showEditor(doc.id); bar.append(back);
    const printBtn = btn("Print / PDF", true);
    const integrityBtn = btn("Check integrity");
    bar.append(printBtn, integrityBtn);
    body.replaceChildren();
    const integrityOut = document.createElement("div");   // findings render here, transient
    integrityBtn.onclick = async () => {
      integrityBtn.disabled = true;
      integrityBtn.textContent = "Analysing…";
      integrityOut.replaceChildren();
      try {
        const r: IntegrityReport = await api(`/${encodeURIComponent(pid())}/${doc.id}/integrity`, { method: "POST", body: JSON.stringify({}) });
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
