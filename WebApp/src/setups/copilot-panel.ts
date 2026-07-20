import * as OBC from "@thatopen/components";
import { bfetch } from "./bridge-fetch";
import { activePid } from "./active-project";
import * as OBF from "@thatopen/components-front";
import { extractFacts } from "../sentinel-core/adapter/fragments-facts";
import { quantityTakeoff } from "../sentinel-core/adapter/fragments-quantities";
import { scan, buildScorecard, buildBoQ, defaultRates, buildCarbon, defaultFactors } from "../sentinel-core";
import { activeRuleset, paramNamesOf } from "./active-ruleset";
import { getAppManager } from "../app";
import { answer, summarize, type Grounding, type Answer, type CopilotIssue } from "./copilot/engine";

/**
 * Grounded Copilot — Phase 1's interface layer (docs/platform-vision.md). It answers from the
 * project's ground truth (QA scan, scorecard, 5D BoQ, BCF issues) with EXACT, CITED answers and a
 * one-click Isolate — never hallucination. The deterministic engine (copilot/engine.ts) is the
 * source of truth; a local LLM (Ollama, if reachable) only phrases free-form questions it didn't
 * match, fed a compact grounded context. Read-only: the sole action is Isolate (a view operation).
 *
 * Plain-DOM chat panel (mirrors issue-panel); main.ts docks it as the "Copilot" tab.
 */

const esc = (s?: string) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const SUGGESTIONS = ["Model health?", "What fails naming?", "Total cost?", "How many doors?", "Open clashes?"];

export function copilotPanel(components: OBC.Components, opts: { baseUrl?: string; ollamaUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const ollamaUrl = opts.ollamaUrl ?? "http://localhost:11434/api/generate";
  const fragments = components.get(OBC.FragmentsManager);
  const hider = components.get(OBC.Hider);
  const highlighter = components.get(OBF.Highlighter);
  const pid = () => activePid();

  let grounding: Grounding | null = null; // cached ground truth

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">✦ Copilot</span>' +
      '<span style="color:#9ca3af;font-size:11px">grounded · read-only</span>' +
      '<span style="flex:1"></span>' +
      `<button id="co-refresh" style="${btn};background:#2a2a30;color:#eee" title="Reload project context">↻</button>` +
    "</div>" +
    '<div id="co-log" style="flex:1;overflow:auto;padding:.6rem;display:flex;flex-direction:column;gap:.5rem"></div>' +
    '<div id="co-chips" style="display:flex;flex-wrap:wrap;gap:.3rem;padding:.4rem .6rem;border-top:1px solid #2a2a30"></div>' +
    '<div style="display:flex;gap:.4rem;padding:.5rem .6rem;border-top:1px solid #2a2a30">' +
      `<input id="co-in" placeholder="Ask about this project…" style="flex:1;background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.4rem .5rem;font:13px system-ui"/>` +
      `<button id="co-send" style="${btn};background:#6528d7;color:#fff">Ask</button>` +
    "</div>";

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const log = el("co-log");

  const bubble = (who: "you" | "ai", inner: string) => {
    const wrap = document.createElement("div");
    const mine = who === "you";
    wrap.style.cssText = `max-width:92%;align-self:${mine ? "flex-end" : "flex-start"}`;
    wrap.innerHTML =
      `<div style="background:${mine ? "#6528d7" : "#1f1f27"};color:${mine ? "#fff" : "#e5e7eb"};border:1px solid ${mine ? "transparent" : "#2c2c34"};border-radius:.6rem;padding:.5rem .65rem;font-size:12.5px;line-height:1.5;white-space:pre-wrap">${inner}</div>`;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  };

  const renderAnswer = (a: Answer, note?: string) => {
    let inner = esc(a.text);
    if (a.sources.length) inner += `<div style="margin-top:.4rem;color:#8b93a3;font:11px ui-monospace,Consolas,monospace">source: ${esc(a.sources.join(" · "))}</div>`;
    if (note) inner += `<div style="margin-top:.2rem;color:#8b93a3;font:11px ui-monospace,Consolas,monospace">${esc(note)}</div>`;
    const wrap = bubble("ai", inner);
    if (a.elements && Object.keys(a.elements).length) {
      const b = document.createElement("button");
      b.textContent = `Isolate ${a.count ?? ""} in viewer`;
      b.style.cssText = "margin-top:.5rem;border:1px solid #6528d7;background:transparent;color:#c4b5fd;border-radius:.3rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer";
      b.addEventListener("click", () => isolate(a.elements!));
      (wrap.firstChild as HTMLElement).appendChild(b);
    }
  };

  // ── ground truth (cached; rebuilt on ↻ or first ask) ─────────────────────────
  const buildGrounding = async (): Promise<Grounding> => {
    const hasModel = fragments.list.size > 0;
    const ruleset = await activeRuleset(base); // installed standards pack, else bundled
    let facts: Grounding["facts"] = [], report: Grounding["report"] = null, scorecard: Grounding["scorecard"] = null, boq: Grounding["boq"] = null, carbon: Grounding["carbon"] = null;
    if (hasModel) {
      facts = await extractFacts(fragments, { parameterNames: paramNamesOf(ruleset) });
      report = scan(facts, ruleset, { doc_title: "project", now: new Date().toISOString() });
      scorecard = buildScorecard(report);
      // One quantity take-off feeds both 5D cost and 6D carbon.
      try {
        const quantities = await quantityTakeoff(fragments);
        boq = buildBoQ(quantities, defaultRates);
        carbon = buildCarbon(quantities, defaultFactors);
      } catch { boq = null; carbon = null; }
    }
    let issues: CopilotIssue[] = [];
    try { issues = await (await bfetch(`${base}/bcf/3.0/projects/${encodeURIComponent(pid())}/topics?status=all&model=`)).json(); } catch { /* offline */ }
    return { facts, report, scorecard, boq, carbon, issues, ruleset, hasModel };
  };

  const ensureGrounding = async (): Promise<Grounding> => {
    if (!grounding) grounding = await buildGrounding();
    return grounding;
  };

  // ── optional local-LLM phrasing for unmatched free-form questions ────────────
  const askOllama = async (q: string, g: Grounding): Promise<string | null> => {
    const prompt =
      "You are a BIM project assistant. Answer ONLY from the PROJECT DATA below. " +
      "If the answer isn't in it, say you don't have that data. Be concise.\n\nPROJECT DATA:\n" +
      summarize(g) + `\n\nQUESTION: ${q}`;
    try {
      const r = await fetch(ollamaUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "llama3", prompt, stream: false }) });
      if (!r.ok) return null;
      const j = await r.json();
      const t = (j.response ?? "").trim();
      return t || null;
    } catch { return null; }
  };

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    bubble("you", esc(q));
    (el("co-in") as HTMLInputElement).value = "";
    const thinking = bubble("ai", '<span style="color:#8b93a3">…</span>');
    try {
      const g = await ensureGrounding();
      const a = answer(q, g);
      thinking.remove();
      if (a.fallback && g.hasModel) {
        // deterministic engine didn't match — try the local LLM, grounded; else show capabilities.
        const llm = await askOllama(q, g);
        if (llm) { renderAnswer({ text: llm, sources: ["project data (local LLM)"] }, "phrased by local LLM · figures from project data"); return; }
      }
      renderAnswer(a);
    } catch (e) {
      thinking.remove();
      bubble("ai", `<span style="color:#f87171">Couldn't answer: ${esc((e as Error)?.message ?? String(e))}</span>`);
    }
  };

  // ── isolate (the one action — read-only view op) ─────────────────────────────
  const isolate = async (modelMap: Record<string, number[]>) => {
    const map: OBC.ModelIdMap = {};
    for (const [mid, ids] of Object.entries(modelMap)) map[mid] = new Set(ids);
    try {
      await hider.set(true);
      await hider.isolate(map);
      await highlighter.highlightByID("select", map, true, true);
    } catch (e) { console.error("[Sentinel] copilot isolate failed", e); }
  };

  // ── wiring ───────────────────────────────────────────────────────────────────
  el("co-chips").innerHTML = SUGGESTIONS.map((s) =>
    `<button class="co-chip" style="border:1px solid #2c2c34;background:#14141a;color:#c9cfda;border-radius:100px;padding:.25rem .6rem;font:11px system-ui;cursor:pointer">${esc(s)}</button>`).join("");
  root.querySelectorAll<HTMLButtonElement>(".co-chip").forEach((c) => c.addEventListener("click", () => ask(c.textContent || "")));

  el("co-send").addEventListener("click", () => ask((el("co-in") as HTMLInputElement).value));
  el("co-in").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") ask((el("co-in") as HTMLInputElement).value); });
  el("co-refresh").addEventListener("click", async () => { grounding = null; await ensureGrounding(); bubble("ai", '<span style="color:#8b93a3">Project context reloaded.</span>'); });

  bubble("ai", 'Hi — I\'m grounded in this project\'s live data (QA, cost, issues). I cite my sources and never guess. Ask me something, or tap a suggestion below.');
  return root;
}
