// Standards in force ▸ ids ▸ "Generate from standards…" (founder's 2026-10-19 decision Q5: nobody writes IDS by hand).
// The bridge compiles the IDS from the contract and naming rules in force (GET /cde/:key/artefacts/ids/generated, standardsToIds);
// this screen says it in plain words, lists what is NOT in it and why, and a lead installs it as the next ids@n through the usual
// PUT (validated, ledger row). No JSON is shown or asked for. Spec: docs/superpowers/specs/2026-10-19-ids-from-standards.md.
import { escapeHtml as esc } from "./escape-html";

type Facet = { pset?: string | null; name: string; value?: string; pattern?: string; cardinality: string };
type Spec = { name: string; origin?: string; applicability: { entity?: string }; requirements: { properties?: Facet[]; attributes?: Facet[] } };
export interface GeneratedIds {
  ids: { title: string; enforce?: string; specifications: Spec[]; generated_from: Record<string, { label: string; sha256: string } | null> };
  added: number; kept: number; current: string | null; up_to_date: boolean | null; xml: string;
  unmatched: { from: string; item: string; reason: string; checked_by?: string }[];
  xml_skipped: { specification: string; requirement: string; reason: string }[];
  /** An installed EIR's requirements this IDS puts back (the standards stopped checking them) / holds back (they now check the same). */
  eir_restored?: string[]; eir_held?: { name: string; reason: string }[];
}

const MUST: Record<string, string> = { required: "must have", prohibited: "must not have", optional: "may have" };

/** One specification's requirements, one plain sentence each: "Walls must have FireRating in Pset_WallCommon". */
export function specWords(s: Spec): string[] {
  const who = s.name.split(" · ")[0];
  const what = (f: Facet) => (f.value != null ? ` equal to "${f.value}"` : f.pattern != null ? ` matching ${f.pattern}` : "");
  return [
    ...(s.requirements.properties ?? []).map((p) => `${who} ${MUST[p.cardinality] ?? p.cardinality} ${p.name} ${p.pset ? `in ${p.pset}` : "in any property set"}${what(p)}`),
    ...(s.requirements.attributes ?? []).map((a) => `${who} ${MUST[a.cardinality] ?? a.cardinality} a ${a.name}${what(a)}`),
  ];
}

/** The out-of-date line on the ids row, or "" (not generated, or made from the standards in force). */
export const staleWords = (g: Pick<GeneratedIds, "up_to_date" | "current"> | null): string =>
  g?.up_to_date === false ? `${g.current ?? "The IDS"} was generated from an earlier contract or naming rules — generate it again to bring it up to date` : "";

const btn = "border:1px solid #2c2c34;background:#1f1f27;color:#e5e7eb;border-radius:.35rem;padding:.3rem .6rem;font:600 11.5px system-ui;cursor:pointer";

/** The preview: what the IDS will check, what it keeps, what it leaves to other checks; Install / Download .ids / Cancel. */
export function renderIdsPreview(g: GeneratedIds, opts: { canInstall: boolean; onInstall: () => Promise<void>; onDownload: () => void; onCancel: () => void }): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "border:1px solid #2a2a30;border-radius:.4rem;padding:.6rem .7rem;margin:.5rem 0;font-size:12px;display:flex;flex-direction:column;gap:.45rem";
  const made = g.ids.specifications.filter((s) => s.origin === "contract" || s.origin === "ruleset");
  const from = Object.values(g.ids.generated_from).filter(Boolean).map((f) => f!.label);
  const li = (t: string) => `<li style="margin:.1rem 0">${esc(t)}</li>`;
  box.innerHTML =
    `<div style="font-weight:600">IDS from the standards in force</div>` +
    `<div style="color:#9ca3af;font-size:11px">Made from ${from.length ? esc(from.join(" · ")) : "no contract or naming rules — none is installed"}. ` +
    (g.current ? `Keeps ${g.kept} specification${g.kept === 1 ? "" : "s"} of ${esc(g.current)} that did not come from these standards.` : "No IDS is installed yet.") + `</div>` +
    (g.eir_restored?.length ? `<div style="color:#22c55e;font-size:11px">Puts back from the EIR: ${esc(g.eir_restored.join(", "))} — these standards no longer check it.</div>` : "") +
    (g.eir_held?.length ? `<div style="color:#9ca3af;font-size:11px">Holds back from the EIR, so nothing is checked twice: ${esc(g.eir_held.map((x) => x.name).join(", "))} — these standards now check the same, and it comes back if they stop.</div>` : "") +
    (made.length ? `<div>It checks:</div><ul style="margin:0;padding-left:1.1rem">${made.flatMap(specWords).map(li).join("")}</ul>`
      : `<div style="color:#fbbf24">Nothing in these standards can be checked as an IDS — see below.</div>`) +
    (g.unmatched.length ? `<details${made.length ? "" : " open"}><summary style="cursor:pointer;color:#9ca3af">Not in the IDS (${g.unmatched.length}) — still checked elsewhere or needs a change to the standard</summary>` +
      `<ul style="margin:.3rem 0 0;padding-left:1.1rem;color:#a1a1aa">${g.unmatched.map((u) => li(`${u.item} (${u.from}): ${u.reason}${u.checked_by ? ` — checked by ${u.checked_by}` : ""}`)).join("")}</ul></details>` : "") +
    (g.xml_skipped.length ? `<div style="color:#fbbf24;font-size:11px">The .ids file leaves out ${g.xml_skipped.length} check${g.xml_skipped.length === 1 ? "" : "s"} its format cannot hold: ${esc(g.xml_skipped.map((x) => `${x.specification} ${x.requirement}`).join(", "))}. Sentinel still checks them.</div>` : "") +
    // Review: an IDS needs one check at least (the bridge refuses an empty one, and so does the IDS 1.0 schema) — said, never a dead button.
    (g.ids.specifications.length ? "" : `<div style="color:#fbbf24;font-size:11px">Nothing to install: an IDS needs at least one check, and neither these standards nor ${esc(g.current ?? "an IDS in force")} give one. ${g.current ? `${esc(g.current)} stays in force as it is.` : ""}</div>`) +
    `<div class="ids-gen-msg" style="font-size:11px"></div>` +
    `<div style="display:flex;gap:.5rem;flex-wrap:wrap">` +
    (opts.canInstall && g.ids.specifications.length ? `<button class="ids-gen-install" style="${btn};background:#1d4ed8;border-color:#1d4ed8">Install as the project's IDS</button>` : "") +
    (g.ids.specifications.length ? `<button class="ids-gen-download" style="${btn}">Download .ids</button>` : "") + `<button class="ids-gen-cancel" style="${btn}">Cancel</button></div>`;
  const msg = box.querySelector<HTMLElement>(".ids-gen-msg")!;
  const install = box.querySelector<HTMLButtonElement>(".ids-gen-install");
  install?.addEventListener("click", async () => {
    install.disabled = true; install.textContent = "Installing…";
    try { await opts.onInstall(); } catch (e) {
      msg.style.color = "#fca5a5"; msg.textContent = (e as Error)?.message ?? String(e);
      install.disabled = false; install.textContent = "Install as the project's IDS";
    }
  });
  box.querySelector(".ids-gen-download")?.addEventListener("click", opts.onDownload);
  box.querySelector(".ids-gen-cancel")!.addEventListener("click", opts.onCancel);
  return box;
}
