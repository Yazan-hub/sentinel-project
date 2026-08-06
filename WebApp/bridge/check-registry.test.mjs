import { describe, it, expect } from "vitest";
import {
  CHECKS, PLANNED_CHECKS, getCheck, listChecks, runCheck,
  classifyNaming, classifyStates, classifySuitability, classifyVersioned,
  classifyGate, classifyPack, classifyVerdicts,
} from "./check-registry.mjs";

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
});
