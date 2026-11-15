// "Compile to IDS" under the LOIN table: the bridge maps each row to an IDS specification and merges them into the IDS in force
// (EIR and generated specifications stay) as a PROPOSAL; a lead installs it with If-Match. Same pattern as eir-compile.ts.
import { artefactInForce, installArtefact, type InForce } from "../setups/active-ruleset";
import { canGovernRole } from "../setups/my-role";
import { C, btn, h } from "./dom";
import type { PaneCtx } from "./workspace-page";

export type LoinRow = { id: string; element: string; milestone: string; property: string; value: string; used_by: string; why: string };
interface Answer { ids?: object; added?: number; kept?: number; replaced?: number; unmatched?: { row: unknown; reason: string }[]; already?: { row: unknown; by: string }[] }

/** "n added, n kept, n not mapped[, n already required]", then "Row n: reason" for each row left out and each row the IDS in force
 *  already requires. `row` is the row or its number. */
export function loinLines(r: Answer, rows: LoinRow[]): string[] {
  const un = Array.isArray(r.unmatched) ? r.unmatched : [], al = Array.isArray(r.already) ? r.already : [];
  const at = (x: unknown): number => typeof x === "number" ? x : Math.max(0, rows.findIndex((q) => q.id === (x as LoinRow | null)?.id)) + 1;
  return [`${r.added ?? 0} added, ${r.kept ?? 0} kept, ${un.length} not mapped${al.length ? `, ${al.length} already required` : ""}`,
    ...un.map((u) => `Row ${at(u.row)}: ${u.reason}`), ...al.map((a) => `Row ${at(a.row)}: already required by "${a.by}", so it is not checked twice`)];
}

/** `rows` is read when Compile is pressed: pass a function to compile what the editor holds now. */
export function loinCompile(ctx: PaneCtx, rows: LoinRow[] | (() => LoinRow[])): HTMLElement {
  const d = ctx.doc, st = ctx.st, doc = st.doc, key = st.key;
  const stale = (): boolean => ctx.ws.state().key !== key;
  const root = h(d, "div", `border-top:1px solid ${C.line};padding-top:.5rem;margin-top:.5rem`);
  if (!doc) return root;
  const compile = btn(d, "Compile to IDS"), say = h(d, "div", `color:${C.warn};font:12px system-ui;margin:.3rem 0`), out = h(d, "div");
  root.append(compile, say, out);
  compile.addEventListener("click", async () => {
    const now = typeof rows === "function" ? rows() : rows;
    compile.disabled = true; say.textContent = ""; out.replaceChildren();
    const restore = (): void => { compile.disabled = false; };
    let inForce: InForce | null;
    try { inForce = await artefactInForce(ctx.base, key, "ids"); } catch (e) {
      if (!stale()) { restore(); say.textContent = `The IDS in force could not be read: ${(e as Error).message}`; }
      return;
    }
    if (stale()) return;
    const r = await ctx.ws.post<Answer>(`/cde/${encodeURIComponent(key)}/artefacts/ids/loin`, { rows: now, title: `${doc.title}, level of information need` });
    if (stale()) return;
    restore();
    if (!r) { say.textContent = ctx.ws.state().message || "The compile did not finish. Nothing was installed."; return; }
    const box = h(d, "div", `border:1px solid ${C.border};border-radius:.4rem;padding:.6rem;margin:.4rem 0;color:${C.soft};font:12px system-ui`);
    loinLines(r, now).forEach((t, i) => box.append(h(d, "div", i ? `color:${C.warn};padding:.1rem 0` : "font-weight:600;padding:.1rem 0", t)));
    const result = h(d, "div", `color:${C.warn};font:12px system-ui;margin-top:.4rem`);
    // An install is worth offering when it adds a specification, or when it only takes the earlier LOIN ones out (their rows are gone).
    const adds = (r.added ?? 0) > 0, drops = r.replaced ?? 0, unmapped = Array.isArray(r.unmatched) ? r.unmatched.length : 0;
    if (!adds && drops) box.append(h(d, "div", `color:${C.soft};margin-top:.4rem`, `No row adds a specification. Installing takes the ${drops} earlier level-of-information-need ${drops === 1 ? "specification" : "specifications"} out of the IDS.`));
    if (!adds && !drops) box.append(h(d, "div", `color:${C.muted};margin-top:.4rem`, (r.already?.length ?? 0) && !unmapped ? "Nothing to install: the IDS in force already requires every row." : "Nothing to install: no row could be mapped."));
    else if (inForce !== null && !inForce.sha256) result.textContent = "The IDS in force could not be read; nothing can be installed now.";
    else if (canGovernRole(st.role)) {
      const install = btn(d, "Install as the project's IDS", true);
      install.addEventListener("click", async () => {
        install.disabled = true; result.textContent = "";
        try {
          const p = await installArtefact(ctx.base, key, "ids", { ...r.ids, source: { document_id: doc.id, compiled_at: new Date().toISOString() } }, st.me, inForce?.sha256 ?? "none");
          if (stale()) return;
          install.textContent = "Installed"; result.textContent = `Installed ids@${p.version} on ${key}.`;
        } catch (e) {
          if (stale()) return;
          install.disabled = false;
          result.textContent = (e as { status?: number }).status === 412 ? "The IDS in force changed while you looked; compile again. Nothing was installed." : (e as Error).message;
        }
      });
      box.append(install);
    }
    box.append(result);
    out.replaceChildren(box);
  });
  return root;
}
