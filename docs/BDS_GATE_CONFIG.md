# BDS Gate Configuration

How the **Governed Publish** gate is configured for the Badran Design Studio (BDS) pilot — and how to retune it or swap it for a future "Base template". Everything here is **data, not code**: the gate reads two swappable ruleset files, so an office's standard is expressed as configuration.

> The BDS documents are a *reference* for the pilot, not a fixed bible. When the Base BIM template exists, replace the two ruleset files below and nothing in the code changes.

---

## The gate has two independent checks

When a modeller clicks **Governed Publish**, the model runs through both, in order:

```
Revit model ──► export IFC ──► IFC Delivery Gate (contract) ──► ┌─ 1. NAMING gate  (file name)
                                                                └─ 2. ELEMENT gate (IDS, per element)
                                                                          │
                                                    verdict = rejected if either "reject" check fails
                                                                          │
                                       ✓ ACCEPTED → publish + version + badge + upload geometry
                                       ✗ REJECTED → not published; reasons shown; BCF raised for element gaps
```

Each check has its own **enforcement level**: `reject` (blocks the publish), `warn` (publishes but records + raises the gap), or `off` (skips). This lets the pilot start lenient and tighten by stage.

**Recommended pilot posture:** naming = `reject`, element data = `warn`.
Reasoning: a wrong file name is cheap to fix and pollutes the CDE, so block it. Missing LOD-300 data legitimately doesn't exist yet at early schematic, so *warn* (surface it, don't block), then flip to `reject` at DD/CD.

---

## 1. Naming gate (Phase A)

**Config file:** `config/base-standard/naming-ruleset.json` (or `SENTINEL_NAMING_RULESET` env var for server-side override)
**What it checks:** the published model / IFC **file name** against BDS's ISO 19650 11-field form.

```
Project-Originator-DocType-SubType-Discipline-Zone-Venue-Level-Number-Suit-Rev
e.g.  BDS20268-BDS-M3-IFC4-ARC-ZZ-XX-XX-M001-S2-P03
```

The ruleset defines each field as data — a list of allowed values (`enum`), a regex (`pattern`), and/or "not-applicable" `placeholders` (e.g. `NA`, `XX`, `ZZ`):

```jsonc
{
  "title": "BDS ISO 19650 container naming (V1.4, 11-field)",
  "separator": "-",
  "strip_extensions": [".ifc", ".rvt", ".nwc", ".pdf"],
  "enforce": "reject",                       // reject | warn | off
  "fields": [
    { "key": "originator", "label": "Originator", "enum": ["BDS","STR","MEP","CIV","FAC","LAN", "..."] },
    { "key": "discipline", "label": "Discipline", "enum": ["ARC","INT","STR","MEP","CIV","LAN"] },
    { "key": "suitability","label": "Suitability","enum": ["S0","S1","S2","S3","S4","A1","B1", "..."] },
    { "key": "revision",   "label": "Revision",   "pattern": "[PC][0-9]{2}(\\.[0-9]{1,2})?" }
    // … 11 fields total
  ]
}
```

**Behaviour:** a non-conforming name is **rejected** with the specific offending fields (e.g. *"'XYZ' is not a valid Discipline"*). A `reject` here is a *rename-and-retry*, not a BCF issue — it's a file-level, not element-level, problem.

**To retune:** edit the field `enum`/`pattern` lists, add originator codes, or change `enforce`. **Restart the bridge** to reload.

---

## 2. Element gate (Phase B)

**Config file:** `config/base-standard/ids.json` (or `SENTINEL_IDS` env var for server-side override)
**What it checks:** each exported **element** against BDS's LOD-300 data requirements (from the LOD Matrix).

```jsonc
{
  "title": "BDS LOD 300 element checks (schematic)",
  "enforce": "warn",                         // reject | warn | off  (data checks warn during schematic)
  "specifications": [
    { "name": "Every element is named",                 "applicability": { "entity": "^IFC" },
      "requirements": { "attributes": [{ "name": "Name", "cardinality": "required" }], "properties": [] } },
    { "name": "Every governed element carries a BDS discipline",
      "applicability": { "entity": "^IFC(WALL|SLAB|COLUMN|BEAM|DOOR|WINDOW|COVERING|ROOF|STAIR|FOOTING)" },
      "requirements": { "attributes": [], "properties": [
        { "pset": "Pset_BDS", "name": "Discipline", "pattern": "^(ARC|INT|STR|MEP|CIV|LAN)$", "cardinality": "required" }] } },
    { "name": "Walls carry a fire rating (LOD 350)",  "applicability": { "entity": "IFCWALL" },
      "requirements": { "properties": [{ "pset": "Pset_WallCommon", "name": "FireRating", "cardinality": "required" }] } },
    { "name": "Doors carry a fire rating (LOD 350)",  "applicability": { "entity": "IFCDOOR" },
      "requirements": { "properties": [{ "pset": "Pset_DoorCommon", "name": "FireRating", "cardinality": "required" }] } },
    { "name": "Windows carry a U-value (LOD 350)",    "applicability": { "entity": "IFCWINDOW" },
      "requirements": { "properties": [{ "pset": "Pset_WindowCommon", "name": "ThermalTransmittance", "cardinality": "required" }] } }
  ]
}
```

**Where the data comes from:** the Revit add-in's element extractor reads these parameters from the live model and maps them to the psets above:

| IDS check | Revit parameter read (instance, then type) |
|---|---|
| `Pset_BDS.Discipline` | `BDS_Discipline` / `Discipline` |
| `Pset_WallCommon.IsExternal` | `IsExternal` param, else wall type Function (Exterior⇒external) |
| `Pset_WallCommon.FireRating` / `Pset_DoorCommon.FireRating` | `FireRating`, else the built-in Fire Rating |
| `Pset_WindowCommon.ThermalTransmittance` | `ThermalTransmittance` / `U-Value` / `Heat Transfer Coefficient (U)` / `BDS_UValue` |

A parameter that isn't authored is simply *absent* → the IDS reports it (as a warning or rejection per `enforce`).

**Behaviour under `warn`:** the model still **publishes** (✓ accepted), but every missing requirement is **recorded on the immutable audit trail and raised as a BCF issue** that live-syncs back into Revit, and the version is flagged "accepted with warnings." Flip `enforce` to `reject` (at DD/CD) to make the same gaps block the publish.

**To retune:** edit the checks / `enforce`, or add a spec for another category. The file is JSON only (raw `.ids` XML is browser-parsed, not server-side).

---

## Applying / swapping rulesets

| Action | How |
|---|---|
| **Use server-side naming ruleset** | set `SENTINEL_NAMING_RULESET=/path/to/ruleset.json` in `config/.env`; restart the bridge |
| **Use server-side element IDS spec** | set `SENTINEL_IDS=/path/to/ids.json` in `config/.env`; restart the bridge |
| **Loosen naming to advisory** | set `"enforce": "warn"` (or `"off"`) in the active ruleset file, restart the bridge |
| **Tighten element data at DD/CD** | set `"enforce": "reject"` in the active IDS spec file |
| **Swap for a different Base template** | replace `config/base-standard/naming-ruleset.json` and/or `config/base-standard/ids.json`, or override via env vars — no code change |
| **Reload after any edit** | restart the bridge (`npm run bcf:serve`); rulesets are cached at first use |

Per-request override (agents/tools): a caller may pass an inline `naming` ruleset and/or `ids` spec in the propose body to override the on-disk defaults for that request.

---

## Enforcement quick reference

| enforce | Naming | Element data |
|---|---|---|
| `reject` | wrong name **blocks** publish (rename & retry) | missing data **blocks** publish (fix & retry) |
| `warn` | recorded, **publishes** anyway | recorded + BCF raised, **publishes** anyway *(pilot default)* |
| `off` | not checked | not checked |

See also: `docs/PILOT_DEMO_RUNBOOK.md` (the 4 demo beats + preflight) and `docs/superpowers/specs/2026-07-20-governed-publish-loop-pilot-design.md` (the loop design).
