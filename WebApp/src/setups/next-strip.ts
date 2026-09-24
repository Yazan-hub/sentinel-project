import { bfetch } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";

/**
 * The Next strip (spec 2026-09-24 §3): which standards are in force here, where the project is, and what is
 * next — read from GET /cde/:key/journey, which computes the journey once on the bridge from stored facts.
 * Read-only; mounted in main.ts between the project-space header and its tabs. A bridge failure shows
 * "Journey unavailable — <message>", never the previous project's data.
 */

export interface JourneyRef {
  ref: string | null; source: "project" | "office" | "none"; sha256: string | null; label: string;
  standard_key: string | null; semver: string | null;
}
export interface JourneyStep {
  id: string; label: string; status: "done" | "todo" | "not_checkable";
  evidence: { ref: string; label: string } | null; reason: string | null;
  how: { web: { tab: string; hint: string } | null; revit: string | null; who: "owner" | "lead" | "member" };
}
export interface Journey {
  key: string; kind: "office" | "project"; office_key: string | null;
  standards: { ids: JourneyRef; ruleset: JourneyRef; naming: JourneyRef };
  steps: JourneyStep[]; next: string | null; done: number; total: number;
}

/** GET /cde/:key/journey; throws with the bridge's message on any failure. */
export async function fetchJourney(baseUrl: string, key: string): Promise<Journey> {
  const r = await bfetch(`${baseUrl.replace(/\/$/, "")}/cde/${encodeURIComponent(key)}/journey`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
  return j as Journey;
}

// B1: nothing installed says where to install it; a failed read (label already "unavailable — <message>")
// is shown as is, never as an install hint.
const refText = (r: JourneyRef) => (r.ref ? r.label : r.label === "none" ? "none — install from Settings/Packs" : r.label);

/** "Standards in force: IDS <label> · Rules <label> · Naming <label>" — labels exactly as the bridge's refLabel. */
export const standardsLine = (j: Journey): string =>
  `Standards in force: IDS ${refText(j.standards.ids)} · Rules ${refText(j.standards.ruleset)} · Naming ${refText(j.standards.naming)}`;

/** "Next: <label> — <hint>" and the project-space tab that does it (null when the step is not done on the web). */
export function nextLine(j: Journey): { text: string; tab: string | null } {
  const step = j.steps.find((s) => s.id === j.next);
  if (!step) {
    const nc = j.steps.filter((s) => s.status === "not_checkable").length;
    return { text: nc ? `Next: nothing to do — ${nc} step(s) not checkable` : `Next: nothing — all ${j.total} steps done`, tab: null };
  }
  // B4: neither surface has a screen for this step yet (e.g. A4's "issued").
  const hint = step.how.web?.hint ?? (step.how.revit ? `Revit: ${step.how.revit}` : "no screen for this step yet");
  return { text: `Next: ${step.label} — ${hint}`, tab: step.how.web?.tab ?? null };
}

/** B2: one line per step for the Guide's journey list, chosen by status — a todo's own reason never reads as "Not checkable". */
export function stepDetail(s: JourneyStep, next: string | null): string {
  if (s.status === "done") return `Evidence: ${s.evidence?.label ?? "(missing — should not happen)"}`;
  if (s.status === "not_checkable") return `Not checkable: ${s.reason}`;
  return (s.id === next ? "Next" : "To do") + (s.reason ? ` — ${s.reason}` : "");
}

/** B3: a label's index among the project-space tabs, or -1 when absent (or no label named at all). */
export function tabIndex(labels: string[], label: string | null): number {
  return label == null ? -1 : labels.indexOf(label);
}

export function nextStrip(opts: { baseUrl: string; onOpenTab: (label: string) => void; onOpenGuide: () => void }): HTMLElement {
  const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#c9cfda;border-radius:.3rem;padding:.2rem .5rem;font:600 11px system-ui;cursor:pointer";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:.25rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30;background:#16161a;color:#c9cfda;font:12px system-ui;flex:0 0 auto";
  root.innerHTML =
    '<div id="ns-std" style="color:#9ca3af"></div>' +
    '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">' +
      '<span id="ns-next" style="color:#eee;font-weight:600"></span>' +
      `<button id="ns-open" style="${btn};display:none">Open</button>` +
      '<span style="flex:1"></span>' +
      `<button id="ns-journey" style="${btn};display:none" title="Open the Guide's journey"></button>` +
      `<button id="ns-refresh" style="${btn}" title="Refresh">↻</button>` +
    "</div>";
  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  let tab: string | null = null;
  let seq = 0; // a slower answer for the previous project never overwrites the current one

  const load = async () => {
    const mine = ++seq;
    tab = null;
    el("ns-std").textContent = "Loading journey…";
    el("ns-std").style.color = "#9ca3af";
    el("ns-next").textContent = "";
    el("ns-open").style.display = "none";
    el("ns-journey").style.display = "none";
    try {
      const j = await fetchJourney(opts.baseUrl, activePid());
      if (mine !== seq) return;
      const n = nextLine(j);
      tab = n.tab;
      el("ns-std").textContent = standardsLine(j);
      el("ns-next").textContent = n.text;
      el("ns-open").style.display = tab ? "" : "none";
      el("ns-journey").textContent = `${j.done} of ${j.total} ▸ Journey`;
      el("ns-journey").style.display = "";
    } catch (e) {
      if (mine !== seq) return;
      el("ns-std").textContent = `Journey unavailable — ${(e as Error).message}`;
      el("ns-std").style.color = "#ef4444";
    }
  };

  el("ns-open").addEventListener("click", () => { if (tab) opts.onOpenTab(tab); });
  el("ns-journey").addEventListener("click", () => opts.onOpenGuide());
  el("ns-refresh").addEventListener("click", () => void load());
  onActiveProjectChange(() => void load());
  void load();
  return root;
}
