// The "Platform deliveries" strip the CDE board mounts above its columns (spec 2026-09-27 platform-delivery-gate,
// Decision 8): the IFCs of the linked platform project as the platform's Sentinel gate judged them, in the Holding
// Area's card look. Read straight from the platform through the app's client; a read that failed says so.
import { getAppManager } from "../app";
import { platformProjectId } from "./active-project";
import { readDeliveries, deliveriesSummary, shortSha, type DeliveriesClient, type DeliveryCard } from "./platform-deliveries";

const esc = (s?: string | null) => (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const TONE: Record<DeliveryCard["state"], { border: string; color: string }> = {
  passed: { border: "#14532d", color: "#4ade80" }, refused: { border: "#4a3a12", color: "#f59e0b" },
  not_checked: { border: "#2c2c34", color: "#9ca3af" }, did_not_run: { border: "#5b1a1a", color: "#fca5a5" }, running: { border: "#1e3a5f", color: "#93c5fd" },
};

export function cardHtml(c: DeliveryCard): string {
  const t = TONE[c.state];
  return `<div style="min-width:16rem;max-width:22rem;padding:.45rem .55rem;background:#1b1b21;border:1px solid ${t.border};border-radius:.4rem;font-size:12px">` +
    `<div style="display:flex;gap:.5rem;align-items:baseline"><span style="font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.name)}">${esc(c.name)}</span>` +
    `<span style="color:#71717a;font-size:10.5px">${esc(c.versionTag)}</span></div>` +
    `<div style="color:${t.color};font-size:11px;font-weight:600">${esc(c.headline)}</div>` +
    c.lines.map((l) => `<div style="color:${c.state === "refused" ? "#fca5a5" : "#9ca3af"};font-size:11px;padding-left:.6rem">${esc(l)}</div>`).join("") +
    `<div style="color:#71717a;font-size:10.5px;font-family:ui-monospace,Consolas,monospace">sha256 ${esc(shortSha(c.sha256))}${c.run ? ` · run ${esc(c.run)}` : ""}</div></div>`;
}

/** Mounts the strip into `host` and returns a refresh function; `refresh()` is called by the board on each load. */
export function mountPlatformDeliveries(host: HTMLElement): () => Promise<void> {
  host.style.cssText = "display:flex;flex-direction:column;gap:.35rem;padding:.4rem .6rem;border-bottom:1px solid #2a2a30";
  return async function refresh() {
    host.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem;font-size:11px"><span style="color:#a1a1aa;text-transform:uppercase;letter-spacing:.06em">Platform deliveries</span><span id="pd-sum" style="color:#9ca3af">reading…</span></div><div id="pd-cards" style="display:flex;gap:.5rem;overflow-x:auto"></div>`;
    const sum = host.querySelector("#pd-sum") as HTMLElement;
    const cards = host.querySelector("#pd-cards") as HTMLElement;
    try {
      const list = await readDeliveries(getAppManager().client as unknown as DeliveriesClient | undefined, platformProjectId());
      sum.textContent = deliveriesSummary(list);
      cards.innerHTML = list.map(cardHtml).join("");
    } catch (e) {
      sum.textContent = (e as Error).message; // "not read — …": never an empty lane pretending there is nothing
      sum.style.color = "#fbbf24";
      cards.innerHTML = "";
    }
  };
}
