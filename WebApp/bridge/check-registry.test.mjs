import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { refLabel, validateArtefact } from "./artefact-store.mjs";
import {
  CHECKS, PLANNED_CHECKS, getCheck, listChecks, runCheck,
  classifyNaming, classifyStates, classifySuitability, classifyVersioned,
  classifyGate, classifyPack, classifyStandard, classifyVerdicts, classifyDeliverables,
} from "./check-registry.mjs";
import { validateContainerName } from "./sentinel-core.mjs";

const RULESET = {
  title: "Test ruleset", separator: "-", enforce: "reject",
  fields: [{ key: "project", pattern: "[A-Za-z0-9]{3,}" }, { key: "disc", enum: ["ARC", "STR"] }],
};
const NAMED = { ruleset: RULESET, source: "office", ref: "naming@2", sha256: "3f07376abcdef0123456789" };
const NOTHING = { ruleset: null, source: "none", ref: null, sha256: null };

describe("registry contracts", () => {
  it("every check has the required fields and a unique id", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHECKS) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.description).toBe("string");
      expect(typeof c.run).toBe("function");
    }
  });

  it("planned checks all carry a reason and never collide with real ids", () => {
    const real = new Set(CHECKS.map((c) => c.id));
    for (const p of PLANNED_CHECKS) {
      expect(p.reason.length).toBeGreaterThan(10);
      expect(real.has(p.id)).toBe(false);
    }
  });

  it("getCheck finds a real check and misses an unknown one", () => {
    expect(getCheck("naming.containers")?.id).toBe("naming.containers");
    expect(getCheck("nope.nope")).toBeUndefined();
  });

  it("listChecks exposes checks and planned gaps without run functions", () => {
    const out = listChecks();
    expect(out.checks.length).toBe(CHECKS.length);
    expect(out.checks[0].run).toBeUndefined();
    expect(out.planned.length).toBe(PLANNED_CHECKS.length);
  });

  it("runCheck on an unknown id resolves to not_checkable, never throws", async () => {
    const r = await runCheck("nope.nope", "demo", {});
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toContain("nope.nope");
  });
});

describe("classifyNaming", () => {
  it("reports met when every container name passes", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED);
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
  });

  it("reports violations with per-container evidence naming the failing field", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }, { iso_name: "PRJ-XXX" }], NAMED);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("PRJ-XXX");
    expect(r.evidence[0].detail).toContain("disc");
  });

  it("is not_checkable naming the install route when no naming standard is installed", () => {
    const r = classifyNaming([{ iso_name: "anything" }], NOTHING);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toBe("no naming standard installed for this project or its office (PUT /cde/:key/artefacts/naming)");
  });

  it("is not_checkable when the project has no containers yet", () => {
    const r = classifyNaming([], NAMED);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no containers/i);
  });

  it("names the artefact that judged — ref · source · sha — in the summary", () => {
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED).summary).toContain(refLabel(NAMED));
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], NAMED).summary).toContain("naming@2 · office");
    expect(classifyNaming([{ iso_name: "PRJ-XXX" }], NAMED).summary).toContain("naming@2 · office");
  });

  describe("against the real validator and the pilot's naming pack (demo data, not a bridge default)", () => {
    const realRuleset = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../demo/bds-pilot/bds-naming-ruleset.json", import.meta.url)), "utf8")
    );
    const real = { ruleset: realRuleset, source: "project", ref: "naming@1", sha256: "0".repeat(64) };

    it("both shipped naming packs are installable as naming artefacts", () => {
      const base = JSON.parse(readFileSync(fileURLToPath(new URL("../../config/base-standard/naming-ruleset.json", import.meta.url)), "utf8"));
      expect(() => validateArtefact("naming", realRuleset)).not.toThrow();
      expect(() => validateArtefact("naming", base)).not.toThrow();
    });

    it("passes a correctly formed container name", () => {
      const r = classifyNaming([{ iso_name: "BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03" }], real, validateContainerName);
      expect(r.status).toBe("met");
      expect(r.count).toBe(0);
    });

    it("flags a malformed container name with the real failing field", () => {
      const r = classifyNaming([{ iso_name: "BDS20268-BDS-M3-IFC4-XYZ-ZZ-XX-XX-M001-S2-P03" }], real, validateContainerName);
      expect(r.status).toBe("violations");
      expect(r.count).toBe(1);
      expect(r.evidence[0].detail).toContain("discipline");
    });
  });
});

describe("classifyStates", () => {
  const files = [
    { iso_name: "A.ifc", versions: [{ is_live: true, state: "published" }] },
    { iso_name: "B.ifc", versions: [{ is_live: true, state: "wip" }] },
  ];

  it("flags containers whose live version is not in an expected state", () => {
    const r = classifyStates(files, ["published"]);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("B.ifc");
    expect(r.evidence[0].detail).toContain("wip");
  });

  it("reports met when all match", () => {
    expect(classifyStates(files, ["published", "wip"]).status).toBe("met");
  });

  it("is not_checkable with no containers", () => {
    expect(classifyStates([], ["published"]).status).toBe("not_checkable");
  });
});

describe("classifySuitability", () => {
  it("flags a live version whose suitability is outside the allowed list", () => {
    const files = [{ iso_name: "A.ifc", versions: [{ is_live: true, suitability: "S0" }] }];
    const r = classifySuitability(files, ["S3", "S4"]);
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toContain("S0");
  });

  it("treats a missing suitability as a violation, not a pass", () => {
    const files = [{ iso_name: "A.ifc", versions: [{ is_live: true }] }];
    expect(classifySuitability(files, ["S3"]).count).toBe(1);
  });

  it("is not_checkable, not met, when no container has a live version", () => {
    const files = [{ iso_name: "A.ifc", versions: [] }, { iso_name: "B.ifc", versions: [{ is_live: false }] }];
    const r = classifySuitability(files, ["S3"]);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/live version/i);
  });

  it("still measures the containers that do have a live version", () => {
    const files = [
      { iso_name: "A.ifc", versions: [{ is_live: true, suitability: "S3" }] },
      { iso_name: "B.ifc", versions: [] },
    ];
    expect(classifySuitability(files, ["S3"]).status).toBe("met");
  });
});

describe("classifyVersioned", () => {
  it("flags a container with no live version", () => {
    const files = [
      { iso_name: "A.ifc", versions: [{ is_live: true }] },
      { iso_name: "B.ifc", versions: [{ is_live: false }] },
      { iso_name: "C.ifc", versions: [] },
    ];
    const r = classifyVersioned(files);
    expect(r.count).toBe(2);
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["B.ifc", "C.ifc"]);
  });
});

describe("classifyGate", () => {
  it("reports met when the gate passes", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: true, na: false, detail: "90" }], pass: true });
    expect(r.status).toBe("met");
  });

  it("reports violations listing the failing checks only", () => {
    const r = classifyGate("design", {
      checks: [{ label: "Health", ok: false, na: false, detail: "60" }, { label: "Compliance", ok: true, na: false, detail: "80" }],
      pass: false,
    });
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("Health");
  });

  it("is not_checkable when every gate metric is unavailable", () => {
    const r = classifyGate("design", { checks: [{ label: "Health", ok: false, na: true, detail: "no data" }], pass: true });
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no data|not available/i);
  });

  it("is not_checkable for a terminal stage with no gate", () => {
    expect(classifyGate("oper", { checks: [], pass: true }).status).toBe("not_checkable");
  });

  it("is not_checkable, not met, when some metrics pass and others were never measured", () => {
    const r = classifyGate("design", {
      checks: [
        { label: "Model health", ok: true, na: false, detail: "90" },
        { label: "Model health ≥ 80%", ok: false, na: true, detail: "no data" },
        { label: "Standards compliance ≥ 70%", ok: false, na: true, detail: "no data" },
      ],
      pass: true,
    });
    expect(r.status).toBe("not_checkable");
    expect(r.count).toBe(2);
    expect(r.reason).toContain("2 of 3");
    expect(r.reason).toContain("Model health ≥ 80%");
    expect(r.reason).toContain("Standards compliance ≥ 70%");
    expect(r.evidence.map((e) => e.label)).toEqual(["Model health ≥ 80%", "Standards compliance ≥ 70%"]);
  });

  it("reports met only when every check was actually measured and passed", () => {
    const r = classifyGate("design", {
      checks: [{ label: "Health", ok: true, na: false, detail: "90" }, { label: "Compliance", ok: true, na: false, detail: "80" }],
      pass: true,
    });
    expect(r.status).toBe("met");
  });

  it("a real failure outranks an unmeasured caveat — still violations", () => {
    const r = classifyGate("design", {
      checks: [
        { label: "Health", ok: false, na: false, detail: "60" },
        { label: "Compliance", ok: false, na: true, detail: "no data" },
      ],
      pass: false,
    });
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("Health");
  });
});

describe("classifyPack — judged by the ruleset artefact; the metadata name is a display name only", () => {
  const office = { body: { standard_key: "k", semver: "1.0.0", rules: [{ id: "R1", target: "type", mode: "warn" }] }, source: "office", ref: "ruleset@1", sha256: "3f07376abcdef0123456789", pointer_sha_mismatch: false };
  const none = { body: null, source: "none", ref: null, sha256: null, pointer_sha_mismatch: false };

  it("met naming ref · source · sha as evidence, with the display name in the summary", () => {
    const r = classifyPack(office, "house-pack@1.4.1");
    expect(r).toMatchObject({ id: "project.standards_pack", label: "Standards pack selected", status: "met" });
    expect(r.summary).toContain("house-pack@1.4.1");
    expect(r.evidence).toEqual([{ label: "ruleset", detail: refLabel(office) }]);
    expect(r.evidence[0].detail).toContain("ruleset@1 · office · 3f07376abcde");
  });

  it("a display name alone is not a standard: nothing installed → violations naming the install route", () => {
    const r = classifyPack(none, "house-pack@1.4.1");
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toBe("not installed — PUT /cde/:key/artefacts/ruleset");
  });

  it("classifyStandard keeps the caller's id and label", () => {
    const r = classifyStandard(none, "naming", "office.naming_standard", "Container naming standard installed");
    expect(r).toMatchObject({ id: "office.naming_standard", label: "Container naming standard installed", status: "violations" });
  });
});

describe("classifyVerdicts", () => {
  const rows = [
    { entity_type: "file_version", entity_id: "v1", action: "verdict:accepted", at: "2026-01-02", new_value: { summary: { failing: 0 } } },
    { entity_type: "file_version", entity_id: "v2", action: "verdict:rejected", at: "2026-01-03", new_value: { summary: { failing: 3 } } },
    { entity_type: "container", entity_id: "c1", action: "created", at: "2026-01-01" },
  ];

  it("counts rejected verdicts as violations and cites the failing count", () => {
    const r = classifyVerdicts(rows);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].detail).toContain("3");
  });

  it("is met when every recorded verdict was accepted", () => {
    expect(classifyVerdicts([rows[0]]).status).toBe("met");
  });

  it("is not_checkable when nothing was ever adjudicated", () => {
    const r = classifyVerdicts([rows[2]]);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no .*verdict/i);
  });

  it("keeps only the newest verdict per version", () => {
    const dup = [
      { entity_type: "file_version", entity_id: "v1", action: "verdict:rejected", at: "2026-01-01", new_value: { summary: { failing: 5 } } },
      { entity_type: "file_version", entity_id: "v1", action: "verdict:accepted", at: "2026-01-05", new_value: { summary: { failing: 0 } } },
    ];
    expect(classifyVerdicts(dup).status).toBe("met");
  });

  it("is not_checkable, not met, when all versions were only recorded (no IDS spec)", () => {
    const rows2 = [
      { entity_type: "file_version", entity_id: "v1", action: "verdict:recorded", at: "2026-01-02" },
      { entity_type: "file_version", entity_id: "v2", action: "verdict:recorded", at: "2026-01-03" },
    ];
    const r = classifyVerdicts(rows2);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toContain("2");
  });

  it("is not_checkable, not met, for a mix of accepted and recorded verdicts", () => {
    const rows2 = [
      { entity_type: "file_version", entity_id: "v1", action: "verdict:accepted", at: "2026-01-02", new_value: { summary: { failing: 0 } } },
      { entity_type: "file_version", entity_id: "v2", action: "verdict:recorded", at: "2026-01-03" },
    ];
    const r = classifyVerdicts(rows2);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toContain("1 of 2");
  });
});

describe("midp.milestones promotion", () => {
  it("is a REAL check, not a planned gap (the promotion trap)", () => {
    expect(CHECKS.some((c) => c.id === "midp.milestones")).toBe(true);
    expect(PLANNED_CHECKS.some((p) => p.id === "midp.milestones")).toBe(false);
  });
});

describe("classifyDeliverables", () => {
  const st = (summary, rows = []) => ({ summary: { total: 0, delivered: 0, late: 0, in_wip: 0, overdue: 0, pending: 0, unscheduled: 0, ...summary }, rows });

  it("is not_checkable with a reason when no deliverables are defined", () => {
    const r = classifyDeliverables(st({ total: 0 }));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no deliverables/i);
  });

  it("is met when every deliverable was delivered on time", () => {
    const r = classifyDeliverables(st({ total: 2, delivered: 2 }));
    expect(r.status).toBe("met");
    expect(r.summary).toContain("2");
  });

  it("reports violations for late, overdue and in_wip rows with evidence", () => {
    const rows = [
      { container_name: "A", status: "late", days_late: 3, published_at: "2026-06-13", due_date: "2026-06-10" },
      { container_name: "B", status: "overdue", days_late: 5, due_date: "2026-06-10" },
      { container_name: "C", status: "in_wip", due_date: "2026-06-10" },
      { container_name: "D", status: "delivered" },
    ];
    const r = classifyDeliverables(st({ total: 4, delivered: 1, late: 1, overdue: 1, in_wip: 1 }, rows));
    expect(r.status).toBe("violations");
    expect(r.count).toBe(3);
    expect(r.evidence.map((e) => e.label).sort()).toEqual(["A", "B", "C"]);
    expect(r.evidence.find((e) => e.label === "C").detail).toMatch(/wip/i);
  });

  it("does NOT report met while rows are merely pending (unmeasured, not passed)", () => {
    const r = classifyDeliverables(st({ total: 2, delivered: 1, pending: 1 }, [
      { container_name: "A", status: "delivered" },
      { container_name: "B", status: "pending", due_date: "2026-12-01" },
    ]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/not yet due/i);
  });
});

import { classifyMidpRevision, classifyMidpSuitability } from "./check-registry.mjs";

describe("midp.revision / midp.suitability checks", () => {
  const st = (rows) => ({ rows, summary: {}, exceptions: [] });
  const R = (evidence, over = {}) => ({ container_name: "A", due_date: "2026-06-10", evidence: { revision: "not_specified", suitability: "not_specified", actual_revisions: [], actual_suitabilities: [], ...evidence }, ...over });

  it("the whole midp.* family is REAL now — none of it may sit in PLANNED (the promotion trap)", () => {
    for (const id of ["midp.revision", "midp.suitability", "midp.distribution", "midp.review"]) {
      expect(CHECKS.some((c) => c.id === id)).toBe(true);
      expect(PLANNED_CHECKS.some((p) => p.id === id)).toBe(false);
    }
  });

  it("not_checkable with a reason when NO row sets the expectation", () => {
    const r = classifyMidpRevision(st([R({})]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no expected revision/i);
  });

  it("violations listing each mismatch with its receipt", () => {
    const r = classifyMidpRevision(st([
      R({ revision: "mismatch", actual_revisions: ["P01@2026-06-05"] }, { expected_revision: "P03" }),
      R({ revision: "met" }, { container_name: "B", expected_revision: "P02" }),
    ]));
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("A");
    expect(r.evidence[0].detail).toMatch(/P01@2026-06-05/);
  });

  it("not_checkable naming unmeasured rows when some are still pending and none mismatch", () => {
    const r = classifyMidpRevision(st([
      R({ revision: "met" }, { expected_revision: "P01" }),
      R({ revision: "pending" }, { container_name: "B", expected_revision: "P03" }),
    ]));
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/1 .*not.*published|unmeasured|pending/i);
  });

  it("met only when every expectation-bearing row is met", () => {
    const r = classifyMidpSuitability(st([
      R({ suitability: "met" }, { expected_suitability: "S4" }),
      R({ suitability: "met" }, { container_name: "B", expected_suitability: "S2" }),
    ]));
    expect(r.status).toBe("met");
    expect(r.summary).toMatch(/2/);
  });
});

describe("classifyMidpExpectation — met is positive, never by elimination", () => {
  it("a row with a MISSING evidence verdict yields not_checkable, not met", () => {
    const status = { rows: [
      { container_name: "A", due_date: "2026-06-10", expected_revision: "P01", evidence: { revision: "met", suitability: "not_specified", actual_revisions: [], actual_suitabilities: [] } },
      { container_name: "B", due_date: "2026-06-10", expected_revision: "P02" }, // no evidence block at all
    ], summary: {}, exceptions: [] };
    const r = classifyMidpRevision(status);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no evidence verdict/i);
  });
});

import { classifyDistribution } from "./check-registry.mjs";

describe("classifyDistribution (midp.distribution)", () => {
  const file = (name, versions) => ({ iso_name: name, versions });
  const v = (id, state = "published", revision = "P01") => ({ id, state, revision });

  it("not_checkable when nothing is published yet — never a flattering met", () => {
    const r = classifyDistribution([file("A", [v("v1", "shared"), v("v2", "wip")])], []);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/nothing has reached published/i);
  });

  it("met when every published version rides a transmittal with a recipient", () => {
    const r = classifyDistribution(
      [file("A", [v("v1")]), file("B", [v("v2")])],
      [{ reference: "TR-001", recipients: ["client@x.com"], version_ids: ["v1", "v2"] }],
    );
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
    expect(r.summary).toMatch(/All 2 published version/);
  });

  it("violations name each unissued version with its container and revision", () => {
    const r = classifyDistribution(
      [file("PRJ-ARC-M3-0001", [v("v1", "published", "P02")])],
      [],
    );
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("PRJ-ARC-M3-0001 P02");
    expect(r.evidence[0].detail).toMatch(/no transmittal records issuing it/i);
    expect(r.evidence[0].ref).toBe("v1");
  });

  it("a recipient-less transmittal evidences nothing, and says so by name", () => {
    const r = classifyDistribution(
      [file("A", [v("v1")])],
      [{ reference: "TR-009", recipients: [], version_ids: ["v1"] }],
    );
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toMatch(/TR-009 lists no recipients/);
  });

  it("blank-string recipients do not count as issue", () => {
    const r = classifyDistribution([file("A", [v("v1")])], [{ reference: "TR-010", recipients: ["  "], version_ids: ["v1"] }]);
    expect(r.status).toBe("violations");
  });

  it("superseded published versions still need evidence — issue is per version", () => {
    const r = classifyDistribution(
      [file("A", [v("v1", "published", "P01"), v("v2", "published", "P02")])],
      [{ reference: "TR-001", recipients: ["c@x"], version_ids: ["v2"] }],
    );
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("A P01");
  });

  it("tolerates missing arrays without throwing", () => {
    expect(classifyDistribution(undefined, undefined).status).toBe("not_checkable");
    expect(classifyDistribution([{ iso_name: "A" }], [{}]).status).toBe("not_checkable");
  });
});

import { classifyResponsibility } from "./check-registry.mjs";

describe("classifyResponsibility (roles.responsibility)", () => {
  const st = (rows) => ({ rows, summary: {}, exceptions: [] });
  const team = (code, over = {}) => ({ id: `t-${code}`, code, lead_email: "lead@bds.jo", ...over });

  it("is a REAL check now, not a planned gap (the promotion trap)", () => {
    expect(CHECKS.some((c) => c.id === "roles.responsibility")).toBe(true);
    expect(PLANNED_CHECKS.some((p) => p.id === "roles.responsibility")).toBe(false);
  });

  it("not_checkable when there are no deliverables to assign", () => {
    const r = classifyResponsibility(st([]), [team("ARC")]);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no production to assign/i);
  });

  it("met when every row resolves to a declared team with a lead", () => {
    const r = classifyResponsibility(st([{ container_name: "A", responsible_team: "ARC" }, { container_name: "B", responsible_team: "arc" }]), [team("ARC")]);
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
  });

  it("matches team codes case-insensitively — 'arc' is not a different team", () => {
    expect(classifyResponsibility(st([{ container_name: "A", responsible_team: "ARC" }]), [team("arc")]).status).toBe("met");
  });

  it("flags a deliverable naming an undeclared team, quoting the name as written", () => {
    const r = classifyResponsibility(st([{ container_name: "A", responsible_team: "MEP" }]), [team("ARC")]);
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toMatch(/"MEP", which is not declared/);
  });

  it("flags a deliverable with no team at all", () => {
    const r = classifyResponsibility(st([{ container_name: "A", responsible_team: null }]), [team("ARC")]);
    expect(r.status).toBe("violations");
    expect(r.evidence[0].detail).toMatch(/names no task team/);
  });

  it("flags a declared-but-leaderless team ONCE, however many rows point at it", () => {
    const r = classifyResponsibility(
      st([{ container_name: "A", responsible_team: "ARC" }, { container_name: "B", responsible_team: "ARC" }]),
      [team("ARC", { lead_email: null })],
    );
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("task team ARC");
    expect(r.evidence[0].detail).toMatch(/no accountable lead/);
  });

  it("does not flag a leaderless team that no deliverable relies on", () => {
    const r = classifyResponsibility(st([{ container_name: "A", responsible_team: "ARC" }]), [team("ARC"), team("XXX", { lead_email: null })]);
    expect(r.status).toBe("met");
  });

  it("with zero declared teams every row is a gap — measurable, so never a flattering met", () => {
    const r = classifyResponsibility(st([{ container_name: "A", responsible_team: "ARC" }]), []);
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
  });

  it("tolerates a missing teams array without throwing", () => {
    expect(classifyResponsibility(st([{ container_name: "A", responsible_team: "ARC" }]), undefined).status).toBe("violations");
  });
});

import { classifyReview } from "./check-registry.mjs";

describe("classifyReview (midp.review)", () => {
  const file = (name, versions) => ({ iso_name: name, versions });
  const v = (id, state = "published", revision = "P01") => ({ id, state, revision });
  const sub = (vid, actor) => ({ entity_type: "container_version", entity_id: vid, action: "state:wip->shared", actor });
  const auth = (vid, actor) => ({ entity_type: "container_version", entity_id: vid, action: "state:shared->published", actor });

  it("is a REAL check now, not a planned gap", () => {
    expect(CHECKS.some((c) => c.id === "midp.review")).toBe(true);
    expect(PLANNED_CHECKS.some((p) => p.id === "midp.review")).toBe(false);
  });

  it("not_checkable when nothing is published", () => {
    const r = classifyReview([file("A", [v("v1", "shared")])], []);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/nothing has reached published/i);
  });

  it("met when submitter and authorizer are different people", () => {
    const r = classifyReview([file("A", [v("v1")])], [auth("v1", "yara@bds.jo"), sub("v1", "modeller@bds.jo")]);
    expect(r.status).toBe("met");
  });

  it("violation when the same person submitted and authorized — self-issue", () => {
    const r = classifyReview([file("A", [v("v1", "published", "P02")])], [auth("v1", "yara@bds.jo"), sub("v1", "Yara@bds.jo")]);
    expect(r.status).toBe("violations");
    expect(r.evidence[0].label).toBe("A P02");
    expect(r.evidence[0].detail).toMatch(/same person \(yara@bds\.jo\)/);
  });

  it("a generic actor is UNMEASURED, never an independent reviewer", () => {
    const r = classifyReview([file("A", [v("v1")])], [auth("v1", "yara@bds.jo"), sub("v1", "web")]);
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/cannot be judged/i);
    expect(r.evidence[0].detail).toMatch(/unresolved identity/);
  });

  it("missing transitions (outside the audit window) are unmeasured, not a pass", () => {
    const r = classifyReview([file("A", [v("v1")])], []);
    expect(r.status).toBe("not_checkable");
    expect(r.evidence[0].detail).toMatch(/outside the audit window/);
  });

  it("a real violation outranks unmeasured rows", () => {
    const r = classifyReview(
      [file("A", [v("v1")]), file("B", [v("v2")])],
      [auth("v1", "y@x"), sub("v1", "y@x")],
    );
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
  });

  it("reports how many DID show review in the not_checkable sentence — positive, never by elimination", () => {
    const r = classifyReview(
      [file("A", [v("v1")]), file("B", [v("v2")])],
      [auth("v1", "a@x"), sub("v1", "b@x")],
    );
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/1 of 2 published version\(s\) show independent review/);
  });

  it("ignores audit rows for other entity types", () => {
    const r = classifyReview([file("A", [v("v1")])], [
      { entity_type: "file_version", entity_id: "v1", action: "state:shared->published", actor: "ghost" },
      auth("v1", "a@x"), sub("v1", "b@x"),
    ]);
    expect(r.status).toBe("met");
  });
});
