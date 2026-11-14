// What a BEP's start is, in one place (ruling 7): the outline's "Answers:" line and the start strip both read it here.
import type { DocRow } from "../sentinel-core/doc-blocks";
import { blocksOf } from "../sentinel-core/doc-blocks";

/** A BEP of the comprehensive template, or of an office template (one saved from it carries its starts), that still has its EIR
 *  response section (an ingested one never had it). The bridge decides the rest: an office template with no start is refused in words. */
export const isComprehensive = (doc: Pick<DocRow, "doc_type" | "template_id" | "sections">): boolean =>
  doc.doc_type === "BEP" && /^(bep-comprehensive|office-)/.test(String(doc.template_id ?? ""))
  && (Array.isArray(doc.sections) ? doc.sections : []).some((s) => s?.template_key === "eir-response");

/** The start is picked: the BEP answers an EIR, or says it has none (a block whose id ends `.part-e`). */
export const hasStart = (doc: Pick<DocRow, "responds_to" | "sections">): boolean =>
  !!doc.responds_to
  || (Array.isArray(doc.sections) ? doc.sections : []).some((s) => !!s && blocksOf(s).some((b) => String(b?.id ?? "").endsWith(".part-e")));
