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

type AiTool = { name: string; description: string; input_schema: unknown };
type AiToolCall = { id?: string; name: string; input: Record<string, unknown> };

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
  let mode: "ask" | "agent" = "ask";
  let provider = "local";                 // local-default: the picker starts on the private option
  let model = "";                         // "" = the provider's own default
  let aiTools: AiTool[] = [];             // the registry, fetched once
  const toolPolicy = new Map<string, string>();

  const btn = "border:0;border-radius:.3rem;padding:.35rem .7rem;font:600 12px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    // flex-wrap + shrinkable selects: the panel is dockable and gets narrow, and without this the
    // model picker overlapped the Ask/Agent toggle instead of moving. Wrapping to a second row is
    // the right failure mode for a control strip.
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">✦ Copilot</span>' +
      // Ask ↔ Agent. The ONLY difference is whether the model may propose actions: Ask answers,
      // Agent proposes and a human ticks. Same chat, same providers, same grounding.
      '<span id="co-mode" style="display:inline-flex;border:1px solid #2c2c34;border-radius:100px;overflow:hidden">' +
        `<button data-mode="ask" style="${btn};border-radius:0;background:#6528d7;color:#fff">Ask</button>` +
        `<button data-mode="agent" style="${btn};border-radius:0;background:transparent;color:#9ca3af">Agent</button>` +
      "</span>" +
      '<span style="flex:1 1 0;min-width:0"></span>' +
      `<select id="co-provider" title="Which AI" style="flex:1 1 92px;min-width:0;background:#14141a;color:#c9cfda;border:1px solid #2c2c34;border-radius:.3rem;font:11px system-ui;padding:.2rem"></select>` +
      `<select id="co-model" title="Model" style="flex:1 1 92px;min-width:0;max-width:150px;background:#14141a;color:#c9cfda;border:1px solid #2c2c34;border-radius:.3rem;font:11px system-ui;padding:.2rem"></select>` +
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

  // ── the AI layer (bridge /ai/*) ──────────────────────────────────────────────
  // Every model call goes through the bridge, never straight to a provider: that's where the keys
  // live and where the local-default/cloud-opt-in rule is enforced. The panel only picks WHICH.
  const aiChat = async (system: string, q: string, tools: AiTool[] = []) => {
    const r = await bfetch(`${base}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, system, messages: [{ role: "user", content: q }], tools }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.message || `AI error ${r.status}`);
    return j as { text: string; toolCalls: AiToolCall[]; model?: string };
  };

  /** Ask mode: the deterministic engine already failed to match, so the model PHRASES an answer from
   *  the same ground truth. It is never asked to supply figures — those come from the engine. */
  const askModel = async (q: string, g: Grounding): Promise<string | null> => {
    try {
      const { text } = await aiChat(
        "You are a BIM project assistant. Answer ONLY from the PROJECT DATA given. If the answer " +
        "isn't in it, say you don't have that data. Be concise.\n\nPROJECT DATA:\n" + summarize(g),
        q,
      );
      return text || null;
    } catch { return null; }
  };

  // ── Agent mode: the model proposes, a human ticks, only then does anything run ───────────────
  /** Render the proposal as a tick-list. Reads are marked auto; writes start ticked but nothing runs
   *  until Apply. This is GhostBuilder's review gate, in the browser, for the same reason. */
  const renderGate = (calls: AiToolCall[], preamble: string) => {
    const rows = calls.map((c) => ({ call: c, policy: toolPolicy.get(c.name) ?? "write" }));
    const wrap = bubble("ai",
      (preamble ? esc(preamble) + "<br><br>" : "") +
      '<b>Nothing has run yet.</b> Tick what to apply.<div id="g-rows" style="margin-top:.5rem"></div>');
    const host = (wrap.querySelector("#g-rows") as HTMLElement);

    const boxes: HTMLInputElement[] = [];
    rows.forEach((r, i) => {
      const line = document.createElement("label");
      line.style.cssText = "display:flex;gap:.4rem;align-items:flex-start;padding:.25rem 0;font-size:12px;cursor:pointer";
      const isRead = r.policy === "read";
      line.innerHTML =
        `<input type="checkbox" ${isRead ? "checked disabled" : "checked"} data-i="${i}" style="margin-top:.15rem">` +
        `<span><b style="color:${isRead ? "#6ee7b7" : "#fbbf24"}">${esc(r.call.name)}</b>` +
        `<span style="color:#8b93a3"> ${isRead ? "· reads only, runs automatically" : "· changes the project"}</span>` +
        `<div style="color:#9ca3af;font:11px ui-monospace,Consolas,monospace;word-break:break-word">${esc(JSON.stringify(r.call.input))}</div></span>`;
      host.appendChild(line);
      boxes.push(line.querySelector("input") as HTMLInputElement);
    });

    const apply = document.createElement("button");
    apply.textContent = `Apply ${rows.filter((r) => r.policy !== "read").length} change(s)`;
    apply.style.cssText = "margin-top:.5rem;border:0;background:#6528d7;color:#fff;border-radius:.3rem;padding:.35rem .7rem;font:600 11px system-ui;cursor:pointer";
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      apply.textContent = "Applying…";
      const out: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (!boxes[i].checked) { out.push(`— ${rows[i].call.name}: skipped`); continue; }
        try {
          // `approved` is the human's tick travelling to the server. The bridge refuses a write
          // without it, so an un-ticked row cannot run even if this code were wrong.
          const r = await bfetch(`${base}/ai/run-tool`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: rows[i].call.name, args: rows[i].call.input, approved: true }),
          });
          const j = await r.json();
          out.push(r.ok ? `✓ ${rows[i].call.name}` : `✗ ${rows[i].call.name}: ${j?.message ?? r.status}`);
        } catch (e) { out.push(`✗ ${rows[i].call.name}: ${(e as Error).message}`); }
      }
      apply.remove();
      bubble("ai", esc(out.join("\n")) + '<div style="margin-top:.3rem;color:#8b93a3;font:11px system-ui">Every applied change is in the audit trail.</div>');
      grounding = null; // project state moved — the cached ground truth is stale
    });
    host.parentElement!.appendChild(apply);
  };

  const runAgent = async (q: string, g: Grounding) => {
    const { text, toolCalls } = await aiChat(
      "You are a BIM project agent. Use the tools to inspect or change the project. Prefer reading " +
      "before proposing a change. Be specific — name the element and the failure.\n\nPROJECT CONTEXT:\n" +
      summarize(g) + `\n\nThe current project key is "${pid()}".`,
      q, aiTools,
    );
    if (!toolCalls?.length) { bubble("ai", esc(text || "No action proposed.")); return; }
    renderGate(toolCalls, text);
  };

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    bubble("you", esc(q));
    (el("co-in") as HTMLInputElement).value = "";
    const thinking = bubble("ai", '<span style="color:#8b93a3">…</span>');
    try {
      const g = await ensureGrounding();
      if (mode === "agent") { thinking.remove(); await runAgent(q, g); return; }
      const a = answer(q, g);
      thinking.remove();
      if (a.fallback && g.hasModel) {
        // deterministic engine didn't match — try the local LLM, grounded; else show capabilities.
        const llm = await askModel(q, g);
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

  // Populate the pickers from the bridge. A blocked provider stays listed but disabled WITH its
  // reason, so a missing key explains itself in the dropdown instead of failing on first use.
  const loadModels = async () => {
    const sel = el("co-model") as HTMLSelectElement;
    sel.innerHTML = "";
    try {
      const r = await bfetch(`${base}/ai/models?provider=${encodeURIComponent(provider)}`);
      const { models } = await r.json();
      for (const m of models as string[]) sel.appendChild(new Option(m, m));
      model = sel.value || "";
    } catch { /* leave empty — the bridge falls back to the provider default */ }
  };
  void (async () => {
    try {
      const [pr, tl] = await Promise.all([
        bfetch(`${base}/ai/providers`).then((r) => r.json()),
        bfetch(`${base}/ai/tools`).then((r) => r.json()),
      ]);
      const sel = el("co-provider") as HTMLSelectElement;
      for (const p of pr.providers) {
        const o = new Option(p.available ? p.label : `${p.label} — unavailable`, p.id);
        o.disabled = !p.available;
        o.title = p.blocked || p.note;
        sel.appendChild(o);
      }
      sel.value = provider;
      aiTools = tl.tools.map((t: any) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
      for (const t of tl.tools) toolPolicy.set(t.name, t.policy);
      await loadModels();
    } catch { /* bridge offline — Ask mode still works off the deterministic engine */ }
  })();

  (el("co-provider") as HTMLSelectElement).addEventListener("change", async (e) => {
    provider = (e.target as HTMLSelectElement).value;
    await loadModels();
  });
  (el("co-model") as HTMLSelectElement).addEventListener("change", (e) => { model = (e.target as HTMLSelectElement).value; });

  el("co-mode").querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = (b.dataset.mode as "ask" | "agent") ?? "ask";
      el("co-mode").querySelectorAll<HTMLButtonElement>("button").forEach((x) => {
        const on = x.dataset.mode === mode;
        x.style.background = on ? "#6528d7" : "transparent";
        x.style.color = on ? "#fff" : "#9ca3af";
      });
      (el("co-in") as HTMLInputElement).placeholder =
        mode === "agent" ? "Tell me what to do — I'll propose, you approve…" : "Ask about this project…";
      bubble("ai", mode === "agent"
        ? '<b>Agent mode.</b> I can inspect the project freely, but anything that <i>changes</i> it is only ever a proposal — you tick what runs, and every applied change lands in the audit trail.'
        : "<b>Ask mode.</b> Answers only — I cannot change anything.");
    }));

  el("co-send").addEventListener("click", () => ask((el("co-in") as HTMLInputElement).value));
  el("co-in").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") ask((el("co-in") as HTMLInputElement).value); });
  el("co-refresh").addEventListener("click", async () => { grounding = null; await ensureGrounding(); bubble("ai", '<span style="color:#8b93a3">Project context reloaded.</span>'); });

  bubble("ai", 'Hi — I\'m grounded in this project\'s live data (QA, cost, issues). I cite my sources and never guess. Ask me something, or tap a suggestion below.');
  return root;
}
