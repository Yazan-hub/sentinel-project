// sentinel-core/federation — the Federation Gate: are these models one building? Six data checks over
// per-model manifests, run BEFORE any clash job (decision D-01: compete on data clash). Pure: no I/O,
// deterministic, every finding carries the models and values a coordinator needs. A check with nothing
// to judge is not_checkable with its reason — never a pass — and the verdict never blends into a score.
import { RuleEngine } from "./rule-engine";
import type { Rule } from "./types";
import { validateContainerName, type NamingRuleset, type NamingResult } from "./naming";

export interface ManifestElement { guid: string; class: string; type_name: string | null; storey: string | null }
export interface ManifestLevel { name: string; elevation_mm: number }
export interface MapConversion { eastings: number; northings: number; height: number; x_axis_abscissa: number; x_axis_ordinate: number; scale: number; crs_name: string | null }
export interface ManifestSite { lat: number | null; lon: number | null; elevation_m: number | null; map_conversion: MapConversion | null }
export interface Manifest { schema: string; elements: ManifestElement[]; levels: ManifestLevel[]; grids: string[]; site: ManifestSite | null; counts?: { elements: number; skipped: number } }
export interface FederationModel { container: string; version_id: string; manifest: Manifest | null }
export type VerdictWord = "accepted" | "recorded" | "rejected";
export interface FederationOptions {
  type_rule?: Rule | null;
  org?: string | null;
  naming_ruleset?: NamingRuleset | null;
  verdicts?: Record<string, VerdictWord | null | undefined>;
  tolerance?: { level_mm?: number; georef_m?: number; angle_deg?: number };
}
export type CheckStatus = "pass" | "fail" | "not_checkable";
export interface FederationCheck { id: string; title: string; status: CheckStatus; reason?: string; evidence: Record<string, unknown>[]; warnings: string[] }
export interface FederationResult { verdict: CheckStatus; models: { container: string; version_id: string; has_manifest: boolean }[]; checks: FederationCheck[] }

const SEPS: [string, string][] = [["_", "underscore"], ["-", "hyphen"], [" ", "space"], [".", "dot"]];

/** The naming shape of a type name: which separator dominates and how many tokens it yields. "Wall 1" is
 *  space·2, "W-A1-Fin" is hyphen·3 — the two conventions of the S11 case, made comparable. */
export function nameShape(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "none·0";
  let best: [string, string] | null = null, bestCount = 0;
  for (const sep of SEPS) {
    const n = s.split(sep[0]).length - 1;
    if (n > bestCount) { best = sep; bestCount = n; }
  }
  if (!best) return "none·1";
  return `${best[1]}·${s.split(best[0]).filter(Boolean).length}`;
}

const key = (s: string) => s.trim().toLowerCase();
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const dominant = (shapes: string[]): string => {
  const counts = new Map<string, number>();
  for (const s of shapes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "none·0";
};
const mk = (id: string, title: string): FederationCheck => ({ id, title, status: "pass", evidence: [], warnings: [] });
const fail = (c: FederationCheck, reason?: string) => { c.status = "fail"; if (reason) c.reason = reason; return c; };
const nc = (c: FederationCheck, reason: string) => { c.status = "not_checkable"; c.reason = reason; return c; };

function fg01(ms: { container: string; m: Manifest }[]): FederationCheck {
  const c = mk("FG-01", "No GlobalId appears in two models");
  if (ms.filter(({ m }) => m.elements.length > 0).length < 2) return nc(c, "fewer than two manifests carry elements");
  const seen = new Map<string, string[]>();
  for (const { container, m } of ms) for (const e of uniq(m.elements.map((x) => x.guid).filter(Boolean))) seen.set(e, [...(seen.get(e) ?? []), container]);
  for (const [guid, models] of seen) if (models.length > 1) c.evidence.push({ guid, models });
  return c.evidence.length ? fail(c, `${c.evidence.length} GlobalId(s) shared between models`) : c;
}

function resolveOrg(rule: Rule, org: string | null | undefined): Rule {
  const escaped = (org ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rule.token_defs ?? {})) defs[k] = v.split("{org}").join(escaped);
  return { ...rule, token_defs: defs };
}

function fg02(ms: { container: string; m: Manifest }[], opts: FederationOptions): FederationCheck {
  const c = mk("FG-02", "Type naming is one convention per category");
  // (a) shape drift per category across models
  const byCat = new Map<string, { container: string; names: string[] }[]>();
  for (const { container, m } of ms) {
    const per = new Map<string, string[]>();
    for (const e of m.elements) if (e.type_name) per.set(e.class, [...(per.get(e.class) ?? []), e.type_name]);
    for (const [cat, names] of per) byCat.set(cat, [...(byCat.get(cat) ?? []), { container, names: uniq(names) }]);
  }
  let sharedCategory = false;
  for (const [category, rows] of byCat) {
    if (rows.length < 2) continue;
    sharedCategory = true;
    const shaped = rows.map((r) => ({ category, model: r.container, shape: dominant(r.names.map(nameShape)), examples: r.names.slice(0, 5) }));
    if (uniq(shaped.map((s) => s.shape)).length > 1) { c.evidence.push(...shaped); c.status = "fail"; }
  }
  if (!sharedCategory && !opts.type_rule) return nc(c, "no category appears in two or more models and no type rule installed");
  // (b) the installed type rule, when there is one
  if (opts.type_rule) {
    const engine = new RuleEngine();
    const rule = resolveOrg(opts.type_rule, opts.org);
    for (const { container, m } of ms)
      for (const name of uniq(m.elements.map((e) => e.type_name).filter((x): x is string => !!x)))
        if (engine.checkName(rule, 0, name)) { c.evidence.push({ model: container, type_name: name, rule: rule.id }); c.status = "fail"; }
  } else {
    c.reason = "no type rule installed — naming shapes compared only";
  }
  if (c.status === "fail") c.reason = (c.reason ? c.reason + "; " : "") + "type naming differs between models";
  return c;
}

function fg03(ms: { container: string; m: Manifest }[], tolMm: number): FederationCheck {
  const c = mk("FG-03", "Levels align by name and elevation");
  const withLevels = ms.filter((x) => x.m.levels.length);
  if (withLevels.length < 2) return nc(c, "fewer than two models carry levels");
  const byName = new Map<string, { name: string; values: { model: string; elevation_mm: number }[] }>();
  for (const { container, m } of withLevels) for (const l of m.levels) {
    const k = key(l.name);
    const row = byName.get(k) ?? { name: l.name, values: [] };
    row.values.push({ model: container, elevation_mm: l.elevation_mm });
    byName.set(k, row);
  }
  let shared = 0;
  for (const row of byName.values()) {
    if (row.values.length === withLevels.length) shared++;
    if (row.values.length >= 2) {
      const el = row.values.map((v) => v.elevation_mm);
      if (Math.max(...el) - Math.min(...el) > tolMm) c.evidence.push({ name: row.name, values: row.values });
    }
    for (const { container } of withLevels) if (!row.values.some((v) => v.model === container)) c.warnings.push(`${row.name}: missing in ${container}`);
  }
  if (c.evidence.length) return fail(c, `${c.evidence.length} level(s) at different elevations`);
  if (shared === 0) return fail(c, "no level name is shared by every model that has levels");
  return c;
}

function fg04(ms: { container: string; m: Manifest }[]): FederationCheck {
  const c = mk("FG-04", "Grid tags match");
  const withGrids = ms.filter((x) => x.m.grids.length);
  if (withGrids.length < 2) return nc(c, "fewer than two models carry grids");
  const union = uniq(withGrids.flatMap((x) => x.m.grids)).sort();
  for (const { container, m } of withGrids) {
    const mine = new Set(m.grids);
    const missing = union.filter((g) => !mine.has(g));
    if (missing.length) c.evidence.push({ model: container, missing, extra: [] });
  }
  return c.evidence.length ? fail(c, "grid tag sets differ between models") : c;
}

function fg05(ms: { container: string; m: Manifest }[], georefM: number, angleDeg: number): FederationCheck {
  const c = mk("FG-05", "Georeference agrees");
  const has = (m: Manifest) => !!m.site && ((m.site.lat != null && m.site.lon != null) || !!m.site.map_conversion);
  const withGeo = ms.filter((x) => has(x.m));
  if (withGeo.length === 0) return nc(c, "no model carries a georeference");
  for (const { container, m } of ms) if (!has(m)) c.evidence.push({ model: container, georeference: "none" });
  const metres = (a: ManifestSite, b: ManifestSite) => {
    if (a.lat == null || b.lat == null || a.lon == null || b.lon == null) return null;
    const dy = (b.lat - a.lat) * 111320, dx = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  };
  const rot = (mc: MapConversion) => (Math.atan2(mc.x_axis_ordinate, mc.x_axis_abscissa) * 180) / Math.PI;
  // angles wrap at ±180°: 179.97° and -179.98° are 0.05° apart, not ~360° apart — normalize before abs.
  const angleDelta = (a: number, b: number) => Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
  let mismatched = 0, incomparable = 0, compared = 0;
  for (let i = 0; i < withGeo.length; i++) for (let j = i + 1; j < withGeo.length; j++) {
    const a = withGeo[i], b = withGeo[j];
    const sa = a.m.site!, sb = b.m.site!;
    let deltaM = metres(sa, sb);
    let deltaDeg: number | null = null;
    if (sa.map_conversion && sb.map_conversion) {
      const ma = sa.map_conversion, mb = sb.map_conversion;
      deltaM = Math.max(deltaM ?? 0, Math.hypot(ma.eastings - mb.eastings, ma.northings - mb.northings, ma.height - mb.height));
      deltaDeg = angleDelta(rot(ma), rot(mb));
    }
    if (deltaM == null && deltaDeg == null) {
      // One side carries only lat/lon, the other only a map conversion: nothing was compared, so
      // nothing can be called a pass (honesty rule; final review 2026-09-23).
      incomparable++;
      c.evidence.push({ model_a: a.container, model_b: b.container, comparable: false, reason: "one model carries latitude/longitude only, the other a map conversion only" });
      continue;
    }
    compared++;
    if ((deltaM != null && deltaM > georefM) || (deltaDeg != null && deltaDeg > angleDeg)) {
      mismatched++;
      c.evidence.push({ model_a: a.container, model_b: b.container, delta_m: deltaM == null ? null : Number(deltaM.toFixed(3)), delta_deg: deltaDeg == null ? null : Number(deltaDeg.toFixed(4)) });
    }
  }
  const none = ms.length - withGeo.length;
  if (mismatched || none) return fail(c, mismatched ? "models are not placed together" : "a model carries no georeference");
  if (incomparable && !compared) return nc(c, "georeferences cannot be compared: latitude/longitude on one side, a map conversion on the other");
  if (incomparable) return fail(c, "some model pairs could not be compared");
  return c;
}

function fg06(models: FederationModel[], opts: FederationOptions): FederationCheck {
  const c = mk("FG-06", "Every model is named to the rule and judged");
  const rs = opts.naming_ruleset;
  for (const m of models) {
    let naming: NamingResult | null = null;
    if (rs && rs.enforce !== "off") {
      naming = validateContainerName(m.container, rs);
      if (!naming.ok) {
        if (rs.enforce === "reject") { c.status = "fail"; c.evidence.push({ model: m.container, naming, verdict: opts.verdicts?.[m.version_id] ?? null }); continue; }
        c.warnings.push(`${m.container}: name does not meet '${rs.title}' (warn level)`);
      }
    }
    const verdict = opts.verdicts?.[m.version_id] ?? null;
    if (verdict !== "accepted" && verdict !== "recorded") { c.status = "fail"; c.evidence.push({ model: m.container, naming, verdict }); }
  }
  if (c.status === "fail") c.reason = "a model is misnamed, rejected or not judged";
  if (!rs) c.warnings.push("no naming ruleset installed — names not checked");
  return c;
}

export function checkFederation(models: FederationModel[], opts: FederationOptions = {}): FederationResult {
  const tol = { level_mm: 1, georef_m: 0.5, angle_deg: 0.1, ...(opts.tolerance ?? {}) };
  const withManifest = models.filter((m): m is FederationModel & { manifest: Manifest } => !!m.manifest).map((m) => ({ container: m.container, m: m.manifest }));
  const out: FederationResult = { verdict: "pass", models: models.map((m) => ({ container: m.container, version_id: m.version_id, has_manifest: !!m.manifest })), checks: [] };
  if (withManifest.length < 2) {
    out.verdict = "not_checkable";
    for (const id of ["FG-01", "FG-02", "FG-03", "FG-04", "FG-05", "FG-06"]) out.checks.push(nc(mk(id, ""), `fewer than two models carry a manifest (${withManifest.length} of ${models.length})`));
    return out;
  }
  out.checks = [fg01(withManifest), fg02(withManifest, opts), fg03(withManifest, tol.level_mm), fg04(withManifest), fg05(withManifest, tol.georef_m, tol.angle_deg), fg06(models, opts)];
  out.verdict = out.checks.some((c) => c.status === "fail") ? "fail" : "pass";
  return out;
}
