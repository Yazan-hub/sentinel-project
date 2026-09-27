// platform-deliveries — the CDE board's "Platform deliveries" lane (spec 2026-09-27 platform-delivery-gate, Decision
// 8): every .ifc in the linked platform project, as the platform's Sentinel gate judged it. Read straight from the
// platform (no bridge): the item's latest version, its labels (sentinel_*), and the matching <name>.gate.json report
// version. A read that failed is "not read — …" (the holding rule), never an empty lane. No ledger line ever appears
// here — a platform verdict has no ledger row; the card cites the report's sha256 and the run id instead.

export const REPORT_KIND = "sentinel.gate-report";
export const reportName = (ifcName: string): string => `${ifcName}.gate.json`;

export interface PlatformItem { _id: string; name: string; versions?: Array<{ tag: string; createdAt?: string }> }
export type Labels = Record<string, string | number | boolean | null | undefined>;
export interface GateReport {
  kind: string; result: "pass" | "fail" | "not_checked"; passed: boolean | null; reason?: string | null;
  contract?: { ref: string; sha256: string | null } | null; failures: string[]; warnings: string[]; sha256: string;
  run?: { executionId?: string | null; at?: string | null } | null;
}
export type CardState = "passed" | "refused" | "not_checked" | "did_not_run" | "running";
export interface DeliveryCard {
  name: string; versionTag: string; state: CardState; headline: string; lines: string[]; sha256: string | null; run: string | null;
}

/** The platform calls the lane needs (a subset of @thatopen/services' EngineServicesClient). */
export interface DeliveriesClient {
  listFiles(filters?: { projectId?: string }): Promise<PlatformItem[]>;
  getFileVersionMetadata(fileId: string, versionTag: string): Promise<Labels>;
  downloadFile(fileId: string, params?: { versionTag?: string }): Promise<Response>;
}

const short = (sha: string | null | undefined) => (sha ? `${sha.slice(0, 12)}…` : "—");

/** One card from what the platform holds for an IFC version: the report when there is one for this version, else
 *  the labels, else "running". The report wins over the labels because it carries the sentences; a label that says
 *  error is "Gate did not run" — never a pass. */
export function deliveryCard(item: PlatformItem, versionTag: string, labels: Labels | null, report: GateReport | null): DeliveryCard {
  const base = { name: item.name, versionTag };
  if (report && report.kind === REPORT_KIND) {
    const contract = report.contract?.ref ?? null;
    const run = report.run?.executionId ?? null;
    if (report.result === "pass") return { ...base, state: "passed", headline: `Passed — ${contract ?? "contract"}`, lines: report.warnings.map((w) => `⚠ ${w}`), sha256: report.sha256, run };
    if (report.result === "fail") return { ...base, state: "refused", headline: `Refused — ${contract ?? "contract"} — ${report.failures.length} failure${report.failures.length === 1 ? "" : "s"}`, lines: report.failures.map((f) => `✗ ${f}`), sha256: report.sha256, run };
    return { ...base, state: "not_checked", headline: "Not checked", lines: [report.reason ?? "no contract on the platform project"], sha256: report.sha256, run };
  }
  const gate = labels ? String(labels.sentinel_gate ?? "") : "";
  if (gate) {
    const sha = labels!.sentinel_sha256_a && labels!.sentinel_sha256_b ? `${labels!.sentinel_sha256_a}${labels!.sentinel_sha256_b}` : null;
    const run = labels!.sentinel_run ? String(labels!.sentinel_run) : null;
    const contract = labels!.sentinel_contract ? String(labels!.sentinel_contract) : "contract";
    if (gate === "pass") return { ...base, state: "passed", headline: `Passed — ${contract}`, lines: ["the report file could not be read — the labels say pass"], sha256: sha, run };
    if (gate === "fail") return { ...base, state: "refused", headline: `Refused — ${contract} — ${labels!.sentinel_failures ?? "?"} failure(s)`, lines: ["the report file with the sentences could not be read"], sha256: sha, run };
    if (gate === "not_checked") return { ...base, state: "not_checked", headline: "Not checked", lines: ["no contract on the platform project — install one in Sentinel"], sha256: sha, run };
    return { ...base, state: "did_not_run", headline: "Gate did not run", lines: [`the labels say ${gate} — never a pass`], sha256: sha, run };
  }
  return { ...base, state: "running", headline: "Running", lines: ["no verdict yet — the platform's Sentinel gate has not written one for this version"], sha256: null, run: null };
}

const latestTag = (i: PlatformItem): string | null => (i.versions?.length ? i.versions[i.versions.length - 1].tag : null);

/** Every .ifc of the platform project as a card. Throws "not read — <why>" when the list itself failed; a single
 *  item's labels or report that could not be read fall through to the next source (report → labels → running). */
export async function readDeliveries(client: DeliveriesClient | undefined, platformId: string | undefined): Promise<DeliveryCard[]> {
  if (!client || !platformId) throw new Error("not read — this project is not linked to a platform project (Settings ▸ Platform project)");
  let items: PlatformItem[];
  try { items = await client.listFiles({ projectId: platformId }); }
  catch (e) { throw new Error(`not read — ${(e as Error)?.message || String(e)}`); }
  const ifcs = items.filter((i) => /\.ifc$/i.test(i.name));
  return Promise.all(ifcs.map(async (item) => {
    const tag = latestTag(item);
    if (!tag) return deliveryCard(item, "—", null, null);
    let report: GateReport | null = null;
    const rep = items.find((i) => i.name === reportName(item.name));
    if (rep && (rep.versions ?? []).some((v) => v.tag === tag)) {
      try { report = (await (await client.downloadFile(rep._id, { versionTag: tag })).json()) as GateReport; } catch { report = null; }
    }
    let labels: Labels | null = null;
    if (!report) { try { labels = await client.getFileVersionMetadata(item._id, tag); } catch { labels = null; } }
    return deliveryCard(item, tag, labels, report);
  }));
}

/** The lane's one-line summary. */
export function deliveriesSummary(cards: DeliveryCard[]): string {
  const n = (s: CardState) => cards.filter((c) => c.state === s).length;
  if (!cards.length) return "no IFC on the platform project yet";
  return [`${cards.length} IFC`, n("passed") ? `${n("passed")} passed` : "", n("refused") ? `${n("refused")} refused` : "", n("not_checked") ? `${n("not_checked")} not checked` : "", n("did_not_run") ? `${n("did_not_run")} did not run` : "", n("running") ? `${n("running")} running` : ""].filter(Boolean).join(" · ");
}

export const shortSha = short;
