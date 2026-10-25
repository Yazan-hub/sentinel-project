// Read view and export (spec section 9): a cover, contents, a revision table and the rendered sections on white paper.
// Printing goes through a popup built with the POPUP'S OWN document: the published app's sandbox has no allow-modals,
// so never an in-frame print and never markup (document text reaches the page only as textContent).
import type { NamingRuleset } from "../sentinel-core/naming";
import { validateContainerName } from "../sentinel-core/naming";
import { STAGE_WORDS, type Snapshot, type VersionListRow } from "../sentinel-core/doc-blocks";
import type { WorkspaceState } from "./workspace-state";
import { renderSectionBody, type RenderCtx } from "./block-render";
import { CELL, TABLE } from "./markdown";
import { h } from "./dom";

export interface PrintInput { row: Snapshot; projectKey: string; version: VersionListRow | null; versions: VersionListRow[]; containerId: string | null; ctx: RenderCtx }

export const POPUP_BLOCKED = "Popup blocked — allow popups for this page to print.";
export const DRAFT_LINE = "Draft, live data";
const DASH = "—";
const PAPER = "background:#fff;color:#111;font:13px/1.6 Georgia,serif;padding:1.5rem";
const OWN_NUMBER = /^\d+(\.\d+)*\.?\s/;

// The paper's own colours win over the dark-theme inline styles the block renderers carry.
export const PAPER_CSS = "[data-paper] * { color: #111 !important; background: transparent !important; border-color: #999 !important }\n"
  + "[data-paper] a { color: #1d4ed8 !important }\n"
  + "[data-paper] [data-running-header] { font-size: 10px; color: #666 !important; margin: 0 0 .6rem }";
export const PRINT_CSS = "@page { margin: 2cm }\nbody { margin: 0 }\n[data-page-break] { page-break-after: always; break-after: page }\n"
  + "@media print { [data-paper] { padding: 0 !important } [data-running-header] { position: fixed; top: -1.5cm; left: 0; right: 0 } }\n" + PAPER_CSS;

const own = (o: Record<string, string>, k: unknown): string | undefined => (typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

export function revisionRows(versions: VersionListRow[], upTo: number | null): string[][] {
  return versions.filter((v) => upTo === null || v.version_no <= upTo).sort((a, b) => a.version_no - b.version_no)
    .map((v) => [`v${v.version_no}`, v.label, v.revision ?? DASH, v.suitability ?? DASH, v.published_by, String(v.published_at).slice(0, 10)]);
}

export function coverLines(input: PrintInput, today: string): string[] {
  const { row, version } = input;
  const stage = own(STAGE_WORDS, version?.stage ?? row.stage) ?? DASH;
  return [
    row.title, `Project: ${input.projectKey}`, `Container ID: ${input.containerId || "not assigned"}`, `Stage: ${stage}`,
    `Revision: ${version?.revision ?? DASH}`, `Suitability: ${version?.suitability ?? row.suitability ?? DASH}`,
    `Version: ${version ? `v${version.version_no}, ${version.label}` : "Draft"}`, `Date: ${version ? String(version.published_at).slice(0, 10) : today}`,
    ...(version ? [] : [DRAFT_LINE]),
  ];
}

export function pickPrintSource(st: WorkspaceState): { kind: "live" } | { kind: "version"; n: number } {
  if (st.viewing) return { kind: "version", n: st.viewing.version_no };
  if (st.doc?.status === "published" && st.versions.length) return { kind: "version", n: Math.max(...st.versions.map((v) => v.version_no)) };
  return { kind: "live" };
}

/** Why a container ID fails the naming rule: one sentence of reasons, or null when it passes. */
export function containerIdReasons(id: string, rs: NamingRuleset): string | null {
  const r = validateContainerName(id, rs);
  return r.ok ? null : `This container ID does not follow the naming rule in force: ${r.failures.map((f) => f.reason).join("; ")}`;
}

export function containerIdProblem(id: string, rs: NamingRuleset | null): string | null {
  const why = rs ? containerIdReasons(id, rs) : null;
  return why && `${why}. Nothing was printed.`;
}

export function renderPrintable(input: PrintInput, doc: Document, today = new Date().toISOString().slice(0, 10)): HTMLElement {
  const paper = h(doc, "div", PAPER);
  paper.dataset.paper = "";
  const part = (name: string, breaks = true): HTMLElement => {
    const s = h(doc, "section", "margin:0 0 1.5rem");
    s.dataset.part = name; if (breaks) s.dataset.pageBreak = "";
    return s;
  };
  if (!input.version) {
    const run = h(doc, "div", "", DRAFT_LINE);
    run.dataset.runningHeader = "";
    paper.append(run);
  }
  const [title, ...rest] = coverLines(input, today);
  const cover = part("cover");
  cover.append(h(doc, "h1", "font:700 26px Georgia,serif;margin:3rem 0 1.5rem", title));
  for (const line of rest) cover.append(h(doc, "p", "margin:.2rem 0", line));
  const sections = Array.isArray(input.row.sections) ? input.row.sections : [];
  const contents = part("contents");
  contents.append(h(doc, "h2", "font:700 18px Georgia,serif", "Contents"));
  sections.forEach((s, i) => { const heading = String(s.heading ?? ""); contents.append(h(doc, "div", "margin:.15rem 0", OWN_NUMBER.test(heading) ? heading : `${i + 1}. ${heading}`)); });
  const revisions = part("revisions");
  revisions.append(h(doc, "h2", "font:700 18px Georgia,serif", "Revision history"));
  const rows = revisionRows(input.versions, input.version?.version_no ?? null);
  if (!rows.length) revisions.append(h(doc, "p", "", "No version published yet."));
  else {
    const table = h(doc, "table", TABLE), head = h(doc, "tr");
    for (const c of ["Version", "Label", "Revision", "Suitability", "Published by", "Date"]) head.append(h(doc, "th", CELL, c));
    table.append(head);
    for (const r of rows) { const tr = h(doc, "tr"); for (const c of r) tr.append(h(doc, "td", CELL, c)); table.append(tr); }
    revisions.append(table);
  }
  paper.append(cover, contents, revisions);
  for (const s of sections) {
    const sec = part("section", false);
    sec.dataset.section = String(s.id);
    sec.append(h(doc, "h2", "font:700 18px Georgia,serif;margin:1.2rem 0 .4rem", String(s.heading ?? "")), renderSectionBody(s, input.ctx, doc));
    paper.append(sec);
  }
  return paper;
}

/** Opens the print popup and builds it through the popup's own document. "blocked" when the browser refuses the popup. */
export function printDocument(input: PrintInput, opener: Window = window): "printed" | "blocked" {
  const popup = opener.open("", "_blank");
  if (!popup) return "blocked";
  let d: Document;
  try { d = popup.document; } catch { return "blocked"; } // a popup the browser gave us but will not let us write to
  const title = d.createElement("title");
  title.textContent = input.row.title;
  const style = d.createElement("style");
  style.textContent = PRINT_CSS;
  d.head.append(title, style);
  d.body.append(renderPrintable(input, d));
  popup.focus();
  popup.print();
  return "printed";
}
