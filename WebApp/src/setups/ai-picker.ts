// AI provider/model selection, shared by every place that drafts or analyses with AI (the workspace's Edit view,
// the old Documents panel's Check integrity). Same rule as the copilot panel: the picker only chooses WHICH;
// every call still goes through the bridge, where the keys live and local-default/cloud-opt-in is enforced.
import { bfetch } from "./bridge-fetch";

let aiProvider = "local";
let aiModel = ""; // "" = the provider's own default
let aiProviders: { key: string; list: { id: string; label: string; available: boolean; blocked?: string; note?: string }[] } | null = null;

/** The body of an AI call: the shared selection. */
export const aiBody = (): { provider: string; model?: string } => (aiModel ? { provider: aiProvider, model: aiModel } : { provider: aiProvider });

/** A fresh picker instance for a view's bar; all instances read/write the shared selection. */
export const aiPicker = (base: string, key: () => string): HTMLElement => {
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
      // Per project: its AI policy can make the cloud rows unavailable (spec 2026-10-20), said in each row's title.
      if (aiProviders?.key !== key()) aiProviders = { key: key(), list: (await (await bfetch(`${base}/ai/providers?project=${encodeURIComponent(key())}`)).json()).providers };
      for (const p of aiProviders.list) {
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
