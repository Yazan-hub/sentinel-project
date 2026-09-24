// GET /cde/:key/journey (Next strip spec §2): gather the stored facts in parallel, judge them with the pure
// journey-logic, add the standards line. A rejected source marks only its own steps not_checkable (allSettled);
// the membership gate is the same ensureProject every /cde/:key read has. Deps-injected (the artefact-store
// idiom); the defaults load lazily so this module stays cheap to import and cycle-free.
import { buildJourney } from "./journey-logic.mjs";
import { refLabel } from "./artefact-store.mjs";

const KINDS = ["ids", "ruleset", "naming"];

async function wire(deps = {}) {
  const pick = async (name, path) => deps[name] || (await import(path))[name];
  return {
    ensureProject: await pick("ensureProject", "./cde-store.mjs"),
    projectScope: await pick("projectScope", "./office-scope.mjs"),
    listMemberRows: await pick("listMemberRows", "./members-store.mjs"),
    resolveArtefact: await pick("resolveArtefact", "./artefact-store.mjs"),
    getSnapshot: await pick("getSnapshot", "./office-store.mjs"),
    getScan: await pick("getScan", "./office-store.mjs"),
    listDocs: await pick("listDocs", "./bimdocs-store.mjs"),
    listVersionVerdictRows: await pick("listVersionVerdictRows", "./cde-store.mjs"),
    listFiles: await pick("listFiles", "./cde-store.mjs"),
    getFederation: await pick("getFederation", "./federation-store.mjs"),
    listTransmittals: await pick("listTransmittals", "./cde-store.mjs"),
  };
}

/** One kind of the standards line: ref · source · sha exactly as the judges print it (refLabel). */
const lineOf = (a) => ({ ref: a?.ref ?? null, source: a?.source ?? "none", sha256: a?.sha256 ?? null, label: refLabel(a ?? {}), standard_key: a?.body?.standard_key ?? null, semver: a?.body?.semver ?? null });
const unavailable = (error) => ({ ref: null, source: "none", sha256: null, label: `unavailable — ${error}`, standard_key: null, semver: null });

export async function getJourney(key, deps = {}) {
  const d = await wire(deps);
  await d.ensureProject(key);                          // 404 unknown key, 403 not a member — before any fact is read
  // Outside allSettled on purpose: the scope decides the kind and so the step list; without it there is no
  // journey to mark step by step, and a 500 with the error is the honest answer.
  const scope = await d.projectScope(key);
  const run = (f) => Promise.resolve().then(f);        // a synchronous throw becomes a rejected fact, not a 500
  const sources = {
    members: run(() => d.listMemberRows(key)),
    standards: run(() => Promise.all(KINDS.map((k) => d.resolveArtefact(key, k)))),
    docs: run(() => d.listDocs(key)),
    ...(scope.kind === "office"
      ? { snapshot: run(() => d.getSnapshot(key)) }
      : {
          scan: run(() => d.getScan(key)), verdicts: run(() => d.listVersionVerdictRows(key)), files: run(() => d.listFiles(key)),
          federation: run(() => d.getFederation(key)), transmittals: run(() => d.listTransmittals(key)),
        }),
  };
  const names = Object.keys(sources);
  const settled = await Promise.allSettled(Object.values(sources));
  const facts = { project: { key, kind: scope.kind, office_key: scope.office_key }, children: { ok: true, value: scope.keys.filter((k) => k !== key) } };
  names.forEach((n, i) => {
    const s = settled[i];
    facts[n] = s.status === "fulfilled" ? { ok: true, value: s.value } : { ok: false, error: String(s.reason?.message || s.reason) };
  });
  const standards = Object.fromEntries(KINDS.map((k, i) => [k, facts.standards.ok ? lineOf(facts.standards.value[i]) : unavailable(facts.standards.error)]));
  if (facts.standards.ok) facts.standards = { ok: true, value: standards };
  const j = buildJourney(facts);
  return { key, kind: j.kind, office_key: scope.office_key, standards, steps: j.steps, next: j.next, done: j.done, total: j.total };
}
