// sentinel-core self-check — runs the ported engine against worked examples from the
// BDS V1.4 docs (the same corpus the C# side's 37 pattern tests use). No framework:
// `npx tsx src/sentinel-core/self-check.ts` — exits non-zero on any mismatch.
//
// Each case asserts whether a given name PASSES (no violation) or FAILS a rule id.

import { RuleEngine } from "./rule-engine";
import { bdsRuleset } from "./index";
import type { Rule } from "./types";

const engine = new RuleEngine();
const ruleById = (id: string): Rule => {
  const r = bdsRuleset.rules.find((x) => x.id === id);
  if (!r) throw new Error(`rule ${id} missing from ruleset`);
  return r;
};

let failures = 0;
/** expectPass=true → name is compliant (checkName returns null). */
function check(ruleId: string, name: string, expectPass: boolean) {
  const r = ruleById(ruleId);
  const isParam = r.target === "parameter";
  const violation = isParam
    ? engine.checkParameter(r, 1, name, name) // param present & non-empty → pass
    : engine.checkName(r, 1, name);
  const passed = violation === null;
  const ok = passed === expectPass;
  if (!ok) {
    failures++;
    console.error(
      `✗ ${ruleId}  "${name}"  expected ${expectPass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"}`,
    );
  }
}

// ── VN-01 view naming: [PREFIX]_[BODY] ──────────────────────────────────────
check("VN-01", "WIP_FP_L00_FFL", true); // worked example
check("VN-01", "SH_PE_EAST", true);
check("VN-01", "SH_PS_XX_A-A", true);
check("VN-01", "NAVISWORKS", true); // whitelisted
check("VN-01", "ARC_Walls", true); // whitelisted
check("VN-01", "randomview", false); // no prefix
check("VN-01", "floorplan level 0", false);

// ── SN-01 sheet 11-field ISO 19650 container ────────────────────────────────
check("SN-01", "BDS20268-BDS-DR-FP-ARC-ZZ-XX-00-0001-S2-P03", true); // worked example
check("SN-01", "BDS20268-BDS-DR-ARC-ZZ-XX-00-0001-S2-P03", true); // TYPE without sub-type
check("SN-01", "A-101", false);
check("SN-01", "BDS-DR-ARC", false); // too few fields

// ── WS-01 workset whitelist ─────────────────────────────────────────────────
check("WS-01", "ARC_Walls", true);
check("WS-01", "Shared_Levels & Grids Model", true);
check("WS-01", "Workset1", false); // explicitly forbidden
check("WS-01", "My Custom Workset", false);

// ── FN-01 family BDS_[LOC]_[TYPE]_[VARIANT] ─────────────────────────────────
check("FN-01", "BDS_INT_Door_SingleFlush", true);
check("FN-01", "BDS_Door_Double", true); // LOCATION optional
check("FN-01", "Generic Door", false);
check("FN-01", "BDS", false); // no body

// ── LV-01 level (monitor) ───────────────────────────────────────────────────
check("LV-01", "L00_FFL", true);
check("LV-01", "LB1_SSL", true);
check("LV-01", "STREET LEVEL", true);
check("LV-01", "Level 1", false);

// ── GR-01 grid (monitor) ────────────────────────────────────────────────────
check("GR-01", "A", true);
check("GR-01", "12", true);
check("GR-01", "Grid-A", false);

// ── VP-01 parameter presence ────────────────────────────────────────────────
// (checkParameter: empty/whitespace → violation)
{
  const r = ruleById("VP-01");
  const emptyViolation = engine.checkParameter(r, 1, "SomeView", "");
  if (emptyViolation === null) {
    failures++;
    console.error(`✗ VP-01 empty param expected FAIL, got PASS`);
  }
  const filledViolation = engine.checkParameter(r, 1, "SomeView", "For Review");
  if (filledViolation !== null) {
    failures++;
    console.error(`✗ VP-01 filled param expected PASS, got FAIL`);
  }
}

if (failures > 0) {
  console.error(`\nsentinel-core self-check: ${failures} FAILED`);
  process.exit(1);
}
console.log("sentinel-core self-check: all cases passed ✓");
