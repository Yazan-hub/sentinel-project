import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CHECKS, PLANNED_CHECKS, getCheck, listChecks, runCheck,
  classifyNaming, classifyStates, classifySuitability, classifyVersioned,
  classifyGate, classifyPack, classifyVerdicts, classifyDeliverables,
} from "./check-registry.mjs";
import { validateContainerName } from "./sentinel-core.mjs";

const RULESET = {
  title: "Test ruleset", separator: "-", enforce: "reject",
  fields: [{ key: "project", pattern: "[A-Za-z0-9]{3,}" }, { key: "disc", enum: ["ARC", "STR"] }],
};

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
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "project");
    expect(r.status).toBe("met");
    expect(r.count).toBe(0);
  });

  it("reports violations with per-container evidence naming the failing field", () => {
    const r = classifyNaming([{ iso_name: "PRJ-ARC" }, { iso_name: "PRJ-XXX" }], RULESET, "project");
    expect(r.status).toBe("violations");
    expect(r.count).toBe(1);
    expect(r.evidence[0].label).toBe("PRJ-XXX");
    expect(r.evidence[0].detail).toContain("disc");
  });

  it("is not_checkable with a reason when no ruleset is configured", () => {
    const r = classifyNaming([{ iso_name: "anything" }], null, "default");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/ruleset/i);
  });

  it("is not_checkable when the project has no containers yet", () => {
    const r = classifyNaming([], RULESET, "project");
    expect(r.status).toBe("not_checkable");
    expect(r.reason).toMatch(/no containers/i);
  });

  it("names which ruleset was used in the summary", () => {
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "default").summary).toContain("bridge default");
    expect(classifyNaming([{ iso_name: "PRJ-ARC" }], RULESET, "project").summary).toContain("project");
  });

  describe("against the real validator and shipped ruleset", () => {
    const realRuleset = JSON.parse(
      readFileSync(fileURLToPath(new URL("./naming-ruleset.json", import.meta.url)), "utf8")
    );

    it("passes a correctly formed container name", () => {
      const r = classifyNaming(
        [{ iso_name: "BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03" }],
        realRuleset, "project", validateContainerName
      );
      expect(r.status).toBe("met");
      expect(r.count).toBe(0);
    });

    it("flags a malformed container name with the real failing field", () => {
      const r = classifyNaming(
        [{ iso_name: "BDS20268-BDS-M3-IFC4-XYZ-ZZ-XX-XX-M001-S2-P03" }],
        realRuleset, "project", validateContainerName
      );
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

describe("classifyPack", () => {
  it("met when a pack is selected", () => {
    const r = classifyPack("bds-house@1.4.1");
    expect(r.status).toBe("met");
    expect(r.summary).toContain("bds-house@1.4.1");
  });

  it("violations when none is selected", () => {
    expect(classifyPack("").status).toBe("violations");
    expect(classifyPack(undefined).status).toBe("violations");
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

  it("both are REAL checks; review/distribution are honest planned gaps", () => {
    for (const id of ["midp.revision", "midp.suitability"]) {
      expect(CHECKS.some((c) => c.id === id)).toBe(true);
      expect(PLANNED_CHECKS.some((p) => p.id === id)).toBe(false);
    }
    for (const id of ["midp.review", "midp.distribution"]) {
      expect(PLANNED_CHECKS.some((p) => p.id === id)).toBe(true);
      expect(CHECKS.some((c) => c.id === id)).toBe(false);
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
