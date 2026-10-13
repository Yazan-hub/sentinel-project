// MA-4a — evidence intake end to end on a temp evidence folder: the pack, the signatures, admission (streamed sha, magic, policy), a changed file refused and flagged, Re-check, re-admission — deps injected, no Supabase.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makePack, readPack, signAttestation, runEvidenceIntake, recheckPack, draftRequest, surveyStart, webStatus, noticeOf, setDeleteBy, startExpirySweep } from "./evidence-store.mjs";
import * as W from "./web-sources.mjs";
import { jpegWithExif } from "./fixtures/jpeg-exif.mjs";
import { ATTESTATIONS, USES, ITEM_FIELDS, realDay } from "./evidence-logic.mjs";

let root, docs, audits, budgets, role;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "sentinel-evidence-")); docs = new Map(); audits = []; budgets = []; role = "lead"; });
afterEach(() => rmSync(root, { recursive: true, force: true }));

const rank = { viewer: 1, contributor: 2, lead: 3, owner: 4 };
const deps = () => ({
  root, now: () => "2026-10-08T10:00:00.000Z",
  artDeps: {
    ensureProject: async (key) => ({ id: `uuid-${key}`, key }),
    docGet: async (s, p, d) => docs.get(`${s}|${p}|${d}`) ?? null,
    docInsert: async (s, p, d, data) => { const k = `${s}|${p}|${d}`; if (docs.has(k)) throw Object.assign(new Error("duplicate"), { status: 409 }); docs.set(k, data); },
    docUpsert: async (s, p, d, data) => { docs.set(`${s}|${p}|${d}`, data); },
    audit: async () => {}, requireMinRole: async () => {}, officeKeyOf: async () => null, officeArtefact: async () => null,
  },
  ensureProject: async (key) => ({ id: `uuid-${key}`, key, name: "Demo", kind: key === "office" ? "office" : "project", office_key: key === "office" || key === "loose" ? null : "office" }),
  audit: async (_pid, et, _eid, action, actor, _o, newv) => { audits.push({ et, action, actor, newv }); return { id: audits.length, hash: "ab".repeat(32) }; },
  takeWriteBudget: (what, limits) => { budgets.push([what, limits]); },
  myRole: async () => role,
  requireMinRole: async (_k, min) => { if (role !== "service" && (rank[role] ?? 0) < rank[min]) throw Object.assign(new Error(`this action requires the ${min} role (you are ${role})`), { status: 403 }); return role; },
});
const put = (rel, bytes) => { const f = join(root, "demo", rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, bytes); };
const LAS = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(300, 7)]);
const JPG = jpegWithExif({ make: "Example", model: "Test Cam 1", taken: "2026:10:13 09:30:00", gps: true }); // MA-7-4: a NEW photo needs camera data
const SHOT = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]); // a screenshot: a JPEG with no EXIF
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sign = async (codes) => { const was = role; role = "lead"; for (const code of codes) await signAttestation("demo", "evp-0001", { code }, deps()); role = was; };
const ready = async () => { role = "lead"; await makePack("demo", {}, deps()); await sign(["a", "c", "d"]); role = "contributor"; };
const admit = (b) => runEvidenceIntake("demo", "evp-0001", b, deps());
const recheck = () => recheckPack("demo", "evp-0001", deps());
const pack = async () => (await readPack("demo", "evp-0001", deps())).pack;
const rows = (prefix) => audits.filter((a) => a.action.startsWith(prefix));
const REG = { method: "registered in source" };

describe("evidence intake (MA-4a)", () => {
  it("(a) a contributor admits own scans and photos by a streamed sha; the trust fields are the bridge's", async () => {
    await ready();
    put("scans/tiny.las", LAS); put("photos/own.jpg", JPG); put("scans/site.rcp", "rcp stand-in"); put("scans/site-registration.txt", "report");
    const a = await admit({ path: "scans/tiny.las", kind: "scan", registration: REG });
    const b = await admit({ path: "photos/own.jpg", kind: "photo" });
    const c = await admit({ path: "scans/site.rcp", kind: "scan", registration: { ...REG, report_path: "scans/site-registration.txt" } });
    expect([a, b, c].map((r) => r.verdict)).toEqual(["admitted", "admitted", "admitted"]);
    expect([a, b, c].map((r) => r.item.id)).toEqual(["ev-0001", "ev-0002", "ev-0003"]);
    expect(a.item).toMatchObject({ sha256: sha(LAS), size_bytes: 304, admitted_by: "machine", attestation_ids: ["att-0001", "att-0002"] });
    expect(c.item).toMatchObject({ surveyable: false, attestation_ids: ["att-0001", "att-0002"] });
    expect(c.item.registration.report_sha256).toBe(sha(Buffer.from("report")));
    expect(b.item.attestation_ids).toEqual(["att-0001", "att-0002", "att-0003"]);
    for (const r of [a, b, c]) expect(r.item.allowed_uses).toEqual(USES);
    const admitted = rows("evidence:admitted");
    expect(admitted).toHaveLength(3);
    expect(admitted[2].newv.pack_version).toBe(7); // make 1, sign 2-4, admit 5-7
    expect((await readPack("demo", "evp-0001", deps())).folder.files_not_admitted).toEqual([]); // the report is not listed
    expect(budgets).toContainEqual(["evidence admissions", { perUser: 30, all: 90 }]);
  });

  it("(b) the signatures a kind needs, then the path, the file, the person and a new scan's fields — all before any row", async () => {
    await makePack("demo", {}, deps());
    role = "contributor";
    put("scans/tiny.las", LAS); put("photos/own.jpg", JPG); put("scans/site.rcp", "rcp stand-in");
    await expect(admit({ path: "scans/tiny.las", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 409, message: "a lead must sign (a) and (c) first; nothing was saved" });
    expect(audits).toEqual([]);
    await sign(["a", "c"]);
    const sigRows = audits.length;
    await expect(admit({ path: "photos/own.jpg", kind: "photo" })).rejects.toMatchObject({ status: 409, message: "a lead must sign (d) first; nothing was saved" });
    expect(audits.length).toBe(sigRows);
    await sign(["d"]);
    expect((await admit({ path: "photos/own.jpg", kind: "photo" })).verdict).toBe("admitted");
    const before = audits.length;
    await expect(admit({ path: "../x", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 400 });
    const none = admit({ path: "scans/none.las", kind: "scan", provider: "google", registration: REG });
    await expect(none).rejects.toMatchObject({ status: 404 });
    await expect(none).rejects.toThrow("no file scans/none.las in the project's evidence folder (");
    await expect(none).rejects.toThrow(") — put it there first; nothing was saved");
    role = "service";
    await expect(admit({ path: "scans/tiny.las", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 403, message: "an admission needs a person — it names who admitted the file and confirmed its registration: sign in. Nothing was saved." });
    role = "contributor";
    await expect(admit({ path: "scans/tiny.las", kind: "scan" })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("registration.method") });
    await expect(admit({ path: "scans/site.rcp", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 400, message: "an RCP is admitted with its registration report: registration.report_path, a file in the evidence folder — nothing was saved" });
    expect(audits.length).toBe(before);
  });

  it("(c) a policy or content refusal is a row, on a file that is there and not admitted", async () => {
    await ready();
    put("photos/street.jpg", JPG);
    const red = await admit({ path: "photos/street.jpg", kind: "photo", provider: "google" });
    expect(red.verdict).toBe("refused");
    expect(red.reasons).toEqual(["google is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused photos/street.jpg"]);
    const ok = await admit({ path: "photos/street.jpg", kind: "photo" });
    expect(ok).toMatchObject({ verdict: "admitted", item: { id: "ev-0001" } });
    const n = audits.length;
    await expect(admit({ path: "photos/street.jpg", kind: "photo", provider: "google" })).rejects.toMatchObject({ status: 409, message: "photos/street.jpg is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved" });
    expect(audits.length).toBe(n);
    put("notes/a.txt", "text");
    expect(await admit({ path: "notes/a.txt", kind: "photo" })).toMatchObject({ verdict: "refused", reasons: ["a .txt is not admitted — scans are e57, las, laz or rcp; photos are jpg or png; a concept model is ifc"] });
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20, 1)]);
    put("scans/fake.las", zip);
    expect(await admit({ path: "scans/fake.las", kind: "scan", registration: REG })).toMatchObject({ verdict: "refused", sha256: null, reasons: ["the file does not begin as a .las does — renamed or damaged"] }); // refused before any byte is hashed
    put("drawings/A-101.pdf", "%PDF-1.7");
    const m = audits.length; // a drawing waits for (b), then names its request (MA-4b) — no row either way
    await expect(admit({ path: "drawings/A-101.pdf", kind: "drawing" })).rejects.toMatchObject({ status: 409, message: "a lead must sign (b) first; nothing was saved" });
    await sign(["b"]);
    await expect(admit({ path: "drawings/A-101.pdf", kind: "drawing" })).rejects.toMatchObject({ status: 400, message: "a drawing names the Ask the owner request it answers: request_id, as req-0001 — nothing was saved" });
    expect(audits.length).toBe(m + 1); // the (b) signature only
  });

  it("(d) a changed file: a 409 until Re-check flags it, refused as changed bytes, admitted again only as the same bytes", async () => {
    await ready();
    put("scans/tiny.las", LAS);
    await admit({ path: "scans/tiny.las", kind: "scan", registration: REG });
    const changed = Buffer.from(LAS); changed[changed.length - 1] ^= 1;
    put("scans/tiny.las", changed);
    const again = "scans/tiny.las is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved";
    const n = audits.length;
    await expect(admit({ path: "scans/tiny.las", kind: "scan" })).rejects.toMatchObject({ status: 409, message: again });
    expect(audits.length).toBe(n);
    const r = await recheck();
    expect(r.changed).toEqual([{ item_id: "ev-0001", path: "scans/tiny.las", sha256: sha(changed), reason: "changed since admitted" }]);
    expect((await pack()).items[0].state).toBe("changed");
    expect(rows("evidence:refused").map((x) => x.action)).toEqual(["evidence:refused scans/tiny.las"]);
    const r2 = await recheck();
    expect(r2).toMatchObject({ changed: [], still_changed: 1 });
    expect(rows("evidence:refused")).toHaveLength(1);
    expect((await readPack("demo", "evp-0001", deps())).folder.files_not_admitted.map((f) => f.path)).toEqual(["scans/tiny.las"]);
    const v = (await readPack("demo", "evp-0001", deps())).ref;
    expect(await admit({ path: "scans/tiny.las", kind: "scan" })).toMatchObject({ verdict: "refused", reasons: ["changed since admitted"] });
    expect((await readPack("demo", "evp-0001", deps())).ref).toBe(v); // no new pack version
    put("scans/tiny.las", LAS);
    const back = await admit({ path: "scans/tiny.las", kind: "scan" });
    expect(back.verdict).toBe("admitted");
    expect(back.item.id).toBe("ev-0001");
    expect(back.item.state).toBeUndefined();
    expect(back.item.registration).toMatchObject({ method: "registered in source" });
    expect(rows("evidence:admitted").at(-1).newv.readmitted).toBe(true);
    await expect(admit({ path: "scans/tiny.las", kind: "scan" })).rejects.toMatchObject({ status: 409, message: again });

    // The RCP the same way: restored, it comes back with its first registration and report.
    put("scans/site.rcp", "rcp stand-in"); put("scans/site-registration.txt", "report");
    await admit({ path: "scans/site.rcp", kind: "scan", registration: { ...REG, report_path: "scans/site-registration.txt" } });
    put("scans/site.rcp", "rcp changed");
    expect((await recheck()).changed.map((c) => c.path)).toEqual(["scans/site.rcp"]);
    put("scans/site.rcp", "rcp stand-in");
    const rcp = await admit({ path: "scans/site.rcp", kind: "scan" });
    expect(rcp.verdict).toBe("admitted");
    expect(rcp.item.registration.report_sha256).toBe(sha(Buffer.from("report")));
  });

  it("(e) signing: a person, a lead, once per code, its pinned text's sha on the ledger", async () => {
    await makePack("demo", {}, deps());
    role = "service";
    await expect(signAttestation("demo", "evp-0001", { code: "a" }, deps())).rejects.toMatchObject({ status: 403, message: "an attestation needs a person: sign in. Nothing was saved." });
    role = "contributor";
    await expect(signAttestation("demo", "evp-0001", { code: "a" }, deps())).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    role = "lead";
    await signAttestation("demo", "evp-0001", { code: "a" }, deps());
    await expect(signAttestation("demo", "evp-0001", { code: "a" }, deps())).rejects.toMatchObject({ status: 409, message: "attestation (a) on evp-0001 was signed by machine at 2026-10-08T10:00:00.000Z — each is signed once per pack; nothing was saved" });
    await expect(signAttestation("demo", "evp-0001", { code: "z" }, deps())).rejects.toMatchObject({ status: 400 });
    const signed = rows("attestation:signed");
    expect(signed).toHaveLength(1);
    expect(signed[0].newv.text_sha256).toBe(ATTESTATIONS.a.sha256);
  });

  it("(f) one pack, on a project of an office, in the bridge's own folder", async () => {
    const made = await makePack("demo", {}, deps());
    await expect(makePack("demo", {}, deps())).rejects.toMatchObject({ status: 409 });
    await expect(readPack("demo", "evp-0002", deps())).rejects.toMatchObject({ status: 404, message: "demo's evidence pack is evp-0001, not evp-0002 — nothing was saved" });
    await expect(readPack("other", "evp-0001", deps())).rejects.toMatchObject({ status: 404, message: "other has no evidence pack yet — a lead makes it (POST /cde/other/evidence) — nothing was saved" });
    expect(existsSync(join(root, "demo"))).toBe(true);
    expect(made.folder).toBe(join(root, "demo"));
    expect(made.pack.storage_root).toBe(join(root, "demo"));
    const size = docs.size;
    await expect(makePack("office", {}, deps())).rejects.toMatchObject({ status: 400, message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" });
    expect(docs.size).toBe(size);
    await expect(makePack("loose", {}, deps())).rejects.toMatchObject({ status: 403, message: "loose belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office); nothing was saved" });
    // The read says so too, so the web offers no Make button that would always be refused (final review).
    await expect(readPack("loose", "evp-0001", deps())).rejects.toMatchObject({ status: 409, message: "loose belongs to no office — evidence is kept for office projects (a lead of the office attaches it in Project settings ▸ Office)" });
    await expect(readPack("office", "evp-0001", deps())).rejects.toMatchObject({ status: 409, message: "an evidence pack belongs to a project, not an office — make it on the project" });
  });

  it("(g) the cap: a pack of 100 items admits no more", async () => {
    await ready();
    const items = docs.get("artefact|uuid-demo|evidence_pack@4").body.items;
    for (let i = 1; i <= 100; i++) items.push({ id: `ev-${String(i).padStart(4, "0")}`, kind: "photo", format: "jpg", sha256: "a".repeat(64), size_bytes: 1, path: `p/${i}.jpg`, provider: "own", licence: "owner-supplied", attestation_ids: ["att-0001", "att-0002", "att-0003"], allowed_uses: { ...USES }, surveyable: true, admitted_by: "x", admitted_at: "t" });
    put("photos/own.jpg", JPG);
    await expect(admit({ path: "photos/own.jpg", kind: "photo" })).rejects.toMatchObject({ status: 409, message: "the evidence pack holds 100 items, its cap — nothing was saved" });
  });

  it("(h) E-7 offline: no evidence byte leaves the PC — no upload, fetch or remote module", () => {
    const src = readFileSync(new URL("./evidence-store.mjs", import.meta.url), "utf8");
    for (const word of ["readRaw", "fetch(", "uploadIfc", "/cde/files", "thatopen"]) expect(src).not.toContain(word);
    const allowed = ["./bridge-auth.mjs", "./evidence-logic.mjs", "./artefact-store.mjs", "./cde-store.mjs", "./members-store.mjs",
      "./web-sources.mjs"]; // MA-7-2: a pure table, no I/O
    const specs = [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s.startsWith("node:") || allowed.includes(s), s).toBe(true);
  });

  it("(v) MA-7-2: webStatus reads the switch for this project and echoes no other env value", async () => {
    await ready();
    role = "viewer";
    const off = await webStatus("demo", "evp-0001", { ...deps(), env: { SENTINEL_WEB_EVIDENCE: "", SENTINEL_AI_KEY: "sk-secret-value", SENTINEL_WEB_COUNSEL_REF: "ab".repeat(32) } });
    expect(off).toMatchObject({ mode: "off", counsel_ref: null, a_signed: true });
    expect(off.red.labels).toContain("google");
    expect(off.sources_sha256).toBe(W.SOURCES_SHA256);
    expect(off.sources.find((s) => s.id === "wikimedia-commons")).toMatchObject({ list: "AMBER", held_for_counsel: true });
    expect(JSON.stringify(off)).not.toMatch(/sk-secret|SENTINEL_AI|abababababababab/);
    const on = await webStatus("demo", "evp-0001", { ...deps(), env: { SENTINEL_WEB_EVIDENCE: "on", SENTINEL_WEB_COUNSEL_REF: "ab".repeat(32) } });
    expect(on).toMatchObject({ mode: "on", counsel_ref: "abababababab" });
    expect(JSON.stringify(on)).not.toContain("ab".repeat(13));
    expect((await webStatus("demo", "evp-0001", { ...deps(), env: { SENTINEL_WEB_EVIDENCE: "drill:demo" } })).mode).toBe("drill");
    expect(await webStatus("demo", "evp-0001", { ...deps(), env: { SENTINEL_WEB_EVIDENCE: "drill" } })).toMatchObject({ mode: "off", why: W.DRILL_NO_KEY });
    expect(await webStatus("demo", "evp-0001", { ...deps(), env: { SENTINEL_WEB_EVIDENCE: "on", SENTINEL_WEB_COUNSEL_REF: "ab".repeat(31) + "a" } })).toMatchObject({ mode: "off", why: W.ON_NO_REF });
    await expect(webStatus("demo", "evp-0009", deps())).rejects.toMatchObject({ status: 404 });
  });

  it("(w) MA-7-4: a NEW photo must carry camera data; a screenshot and a PNG are refused; the capture is on the item and the row, without coordinates", async () => {
    await ready();
    put("photos/cam.jpg", JPG); put("photos/shot.jpg", SHOT); put("photos/shot.png", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]));
    const noCam = "this photo carries no camera data (EXIF make and model) — a screenshot or a saved web image is not admitted as your own photo (attestation d); admit the camera's original file";
    expect(await admit({ path: "photos/shot.jpg", kind: "photo" })).toMatchObject({ verdict: "refused", reasons: [noCam] });
    expect(await admit({ path: "photos/shot.png", kind: "photo" })).toMatchObject({ verdict: "refused", reasons: ["a .png photo is a screenshot or an export — a camera writes JPEG: admit the camera's original file (attestation d)"] });
    expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused photos/shot.jpg", "evidence:refused photos/shot.png"]);
    const ok = await admit({ path: "photos/cam.jpg", kind: "photo" });
    expect(ok.item.capture).toEqual({ make: "Example", model: "Test Cam 1", taken_at: "2026-10-13 09:30", gps: true });
    const row = rows("evidence:admitted")[0].newv;
    expect(row.capture).toEqual(ok.item.capture);
    expect(JSON.stringify(row)).not.toMatch(/lat|lon|coord/i);
    expect((await pack()).items[0].capture).toEqual(ok.item.capture);
  });

  it("(x) MA-7-4: a photo from a map service is RED, from a website waits for counsel (switch off); a flagged pre-7-4 PNG re-admitted unchanged is admitted", async () => {
    await ready();
    put("photos/cam.jpg", JPG);
    const red = await admit({ path: "photos/cam.jpg", kind: "photo", provider: "Google Street View" });
    expect(red.reasons).toEqual(["google street view is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"]);
    expect((await admit({ path: "photos/cam.jpg", kind: "photo", provider: "street view" })).reasons[0]).toMatch(/^street view is a RED source/);
    // R19: RED reads the provider only — an Apple camera's own photo is admitted
    put("photos/iphone.jpg", jpegWithExif({ make: "Apple", model: "iPhone 15" }));
    expect(await admit({ path: "photos/iphone.jpg", kind: "photo" })).toMatchObject({ verdict: "admitted", item: { capture: { make: "Apple" } } });
    expect((await admit({ path: "photos/cam.jpg", kind: "photo", provider: "website" })).reasons[0]).toMatch(/^a third party's or a website's photo waits for counsel's review/);
    // a photo admitted before 7-4 (a PNG, no capture), flagged by Re-check, comes back as first admitted — it is not re-checked for camera data
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    put("photos/old.png", png);
    const packKey = [...docs.keys()].filter((k) => k.startsWith("artefact|uuid-demo|evidence_pack@")).sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1])).pop(); // the current version
    docs.get(packKey).body.items.push({ id: "ev-0099", kind: "photo", format: "png", sha256: createHash("sha256").update(png).digest("hex"), size_bytes: png.length, path: "photos/old.png", provider: "own", licence: "owner-supplied",
      attestation_ids: ["att-0001", "att-0002", "att-0003"], allowed_uses: { ...USES }, surveyable: true, admitted_by: "x", admitted_at: "2026-10-01T00:00:00.000Z", state: "changed", changed_sha256: "b".repeat(64), changed_at: "2026-10-02T00:00:00.000Z" });
    const back = await admit({ path: "photos/old.png", kind: "photo" });
    expect(back).toMatchObject({ verdict: "admitted", item: { id: "ev-0099" } });
    expect(back.item.capture).toBeUndefined(); // no camera re-check
  });

  it("(i) Re-check is budgeted, runs once at a time per project, and is a contributor's", async () => {
    await ready();
    put("scans/tiny.las", LAS);
    await admit({ path: "scans/tiny.las", kind: "scan", registration: REG });
    await recheck();
    expect(budgets).toContainEqual(["evidence rechecks", { perUser: 6, all: 12 }]);
    const both = await Promise.allSettled([recheck(), recheck()]);
    expect(both.map((s) => s.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(both.find((s) => s.status === "rejected").reason).toMatchObject({ status: 409, message: "a re-check of demo is already running — nothing was saved" });
    await expect(recheckPack("demo", "evp-0002", deps())).rejects.toMatchObject({ status: 404 });
    expect((await recheck()).checked).toBe(1); // the guard is released, also after a throw
    role = "viewer";
    await expect(recheck()).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
  });

  // Final review: NTFS answers to any case of a name — one file is one path, so a case variant of an admitted file is the 409, no row.
  it("(j) a path is matched as the disk spells it: a case variant of an admitted file is the 409, before any policy check", async () => {
    await ready();
    put("photos/own.jpg", JPG);
    await admit({ path: "photos/own.jpg", kind: "photo" });
    const n = audits.length;
    if (existsSync(join(root, "demo", "PHOTOS", "OWN.jpg"))) { // a case-insensitive disk (the office PC)
      const again = { status: 409, message: "photos/own.jpg is already admitted as ev-0001 (Re-check finds a changed file) — nothing was saved" };
      await expect(admit({ path: "Photos/OWN.jpg", kind: "photo" })).rejects.toMatchObject(again);
      await expect(admit({ path: "PHOTOS/own.jpg", kind: "photo", provider: "google" })).rejects.toMatchObject(again);
    } else await expect(admit({ path: "Photos/OWN.jpg", kind: "photo" })).rejects.toMatchObject({ status: 404 });
    expect(audits.length).toBe(n);
    expect((await pack()).items).toHaveLength(1);
  });

  it("(k) a folder swapped for a junction out of the evidence folder: admit is a 400, Re-check flags the item missing", async () => {
    await ready();
    put("scans/tiny.las", LAS);
    await admit({ path: "scans/tiny.las", kind: "scan", registration: REG });
    renameSync(join(root, "demo", "scans"), join(root, "elsewhere"));
    symlinkSync(join(root, "elsewhere"), join(root, "demo", "scans"), "junction");
    await expect(admit({ path: "scans/tiny.las", kind: "scan" })).rejects.toMatchObject({ status: 400 });
    expect((await recheck()).changed).toEqual([{ item_id: "ev-0001", path: "scans/tiny.las", sha256: null, reason: "missing from the evidence folder" }]);
    expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused scans/tiny.las"]);
  });

  it("(l) admissions run one at a time per project", async () => {
    await ready();
    put("photos/a.jpg", JPG); put("photos/b.jpg", JPG);
    const both = await Promise.allSettled([admit({ path: "photos/a.jpg", kind: "photo" }), admit({ path: "photos/b.jpg", kind: "photo" })]);
    expect(both.map((s) => s.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(both.find((s) => s.status === "rejected").reason).toMatchObject({ status: 409, message: "an admission to demo is already running — try again when it ends; nothing was saved" });
    expect((await admit({ path: "photos/b.jpg", kind: "photo" })).verdict).toBe("admitted"); // released
  });

  it("(m) Ask the owner: a lead drafts the letter (a person; Sentinel sends nothing), and a drawing is admitted under it", async () => {
    await ready();
    const ask = (b) => draftRequest("demo", "evp-0001", b, deps());
    const body = { recipient_kind: "owner", recipient: "Ms Owner", documents: ["floor plans, every level", "sections"] };
    role = "service";
    await expect(ask(body)).rejects.toMatchObject({ status: 403, message: "a request needs a person — the letter names who asks: sign in. Nothing was saved." });
    role = "contributor";
    await expect(ask(body)).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    role = "lead";
    await expect(ask({ ...body, recipient_kind: "google" })).rejects.toMatchObject({ status: 400 });
    expect(rows("evidence:requested")).toEqual([]);
    const r = await ask(body);
    expect(r.request).toMatchObject({ id: "req-0001", recipient_kind: "owner", recipient: "Ms Owner", drafted_by: "machine", drafted_at: "2026-10-08T10:00:00.000Z" });
    expect(r.letter).toBe(r.request.letter);
    expect(r.letter).toContain("Subject: Request for the drawings of Demo (our reference demo req-0001)");
    expect(r.pack_version).toBe(5); // make 1, sign 2-4, request 5
    const req = rows("evidence:requested");
    expect(req.map((x) => [x.et, x.action])).toEqual([["evidence", "evidence:requested req-0001 owner"]]);
    expect(req[0].newv).toEqual({ pack_id: "evp-0001", request_id: "req-0001", recipient_kind: "owner", documents: 2, letter_sha256: r.request.letter_sha256, actor: "machine" });
    expect(budgets).toContainEqual(["evidence requests", { perUser: 10, all: 30 }]);
    expect((await ask({ recipient_kind: "municipality", documents: ["approved drawings"] })).request.id).toBe("req-0002");
    await expect(draftRequest("office", "evp-0001", body, deps())).rejects.toMatchObject({ status: 400 });

    await sign(["b"]);
    role = "contributor";
    put("drawings/A-101.pdf", "%PDF-1.7 a plan");
    await expect(admit({ path: "drawings/A-101.pdf", kind: "drawing", request_id: "req-0009" })).rejects.toMatchObject({ status: 404, message: "no request req-0009 in evp-0001 — a lead drafts it under Ask the owner first; nothing was saved" });
    const a = await admit({ path: "drawings/A-101.pdf", kind: "drawing", request_id: "req-0002", provider: "wikimedia" });
    expect(a.verdict).toBe("admitted");
    expect(a.item).toMatchObject({ kind: "drawing", format: "pdf", provider: "municipality", licence: "holder-permission", request_id: "req-0002", attestation_ids: ["att-0001", "att-0004"], surveyable: false });
    expect(rows("evidence:admitted").at(-1).newv).toMatchObject({ request_id: "req-0002", provider: "municipality" });
    put("drawings/scan.jpg", JPG);
    expect((await admit({ path: "drawings/scan.jpg", kind: "drawing", request_id: "req-0001" })).item).toMatchObject({ kind: "drawing", format: "jpg", provider: "owner" });
    put("drawings/fake.pdf", "PK not a pdf");
    expect(await admit({ path: "drawings/fake.pdf", kind: "drawing", request_id: "req-0001" })).toMatchObject({ verdict: "refused", reasons: ["the file does not begin as a .pdf does — renamed or damaged"] });
    put("drawings/notes.txt", "x");
    expect((await admit({ path: "drawings/notes.txt", kind: "drawing", request_id: "req-0001" })).reasons).toEqual(["a .txt is not admitted as a drawing — drawings are pdf, dwg, dxf, png or jpg"]);

    // Changed, flagged, restored: it comes back as first admitted — its request kept, whatever the body says.
    put("drawings/A-101.pdf", "%PDF-1.7 a changed plan");
    expect((await recheck()).changed.map((c) => c.path)).toEqual(["drawings/A-101.pdf"]);
    put("drawings/A-101.pdf", "%PDF-1.7 a plan");
    const back = await admit({ path: "drawings/A-101.pdf", kind: "photo" });
    expect(back.item).toMatchObject({ id: "ev-0001", kind: "drawing", request_id: "req-0002", provider: "municipality" });
    expect((await pack()).requests.map((x) => x.id)).toEqual(["req-0001", "req-0002"]);
  });

  it("(n) review: a flagged drawing comes back on (a) and (b) alone, whatever kind the body names", async () => {
    await makePack("demo", {}, deps());
    await sign(["a", "b"]);
    role = "lead";
    await draftRequest("demo", "evp-0001", { recipient_kind: "architect", documents: ["plans"] }, deps());
    role = "contributor";
    put("d/A.pdf", "%PDF-1.7 plan");
    await admit({ path: "d/A.pdf", kind: "drawing", request_id: "req-0001" });
    put("d/A.pdf", "%PDF-1.7 changed");
    await recheck();
    put("d/A.pdf", "%PDF-1.7 plan");
    const back = await admit({ path: "d/A.pdf", kind: "photo" }); // no (c) or (d) is asked for
    expect(back).toMatchObject({ verdict: "admitted", item: { kind: "drawing", request_id: "req-0001", provider: "architect" } });
  });

  it("(o) MA-4h: a published dataset's pack — made by the machine credential with its record, signed (f) alone, its scans admitted by a lead under its licence", async () => {
    const DS = { provider: "example-repository", source_url: "https://example.test/records/1", licence: "CC-BY-4.0", attribution: "Example scan by A. Surveyor, example.test, CC BY 4.0" };
    role = "lead";
    await expect(makePack("demo", { dataset: DS }, deps())).rejects.toMatchObject({ status: 403, message: "a published dataset's pack is made by the machine credential, on a drill project of its own — a pack is never deleted and admits only the dataset's scans; nothing was saved" });
    role = "service";
    await expect(makePack("demo", { dataset: { ...DS, licence: "CC-BY-NC-4.0" } }, deps())).rejects.toMatchObject({ status: 400 });
    expect(docs.size).toBe(0);
    expect((await makePack("demo", { dataset: DS }, deps())).pack.dataset).toEqual(DS);
    role = "lead";
    await expect(signAttestation("demo", "evp-0001", { code: "a" }, deps())).rejects.toMatchObject({ status: 409, message: "a published dataset's pack is signed (f) only — (a) speaks for the asset's owner or your own capture; nothing was saved" });
    put("scans/site.las", LAS);
    role = "contributor";
    await expect(admit({ path: "scans/site.las", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    role = "lead";
    await expect(admit({ path: "scans/site.las", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 409, message: "a lead must sign (f) first; nothing was saved" });
    await signAttestation("demo", "evp-0001", { code: "f" }, deps());
    expect(rows("attestation:signed")[0].newv.text_sha256).toBe(ATTESTATIONS.f.sha256);
    await expect(admit({ path: "photos/own.jpg", kind: "photo" })).rejects.toMatchObject({ status: 400, message: "a published dataset's pack admits its scans only — nothing was saved" });
    const r = await admit({ path: "scans/site.las", kind: "scan", registration: { method: "as published" } });
    expect([r.verdict, r.item.provider, r.item.licence, r.item.attestation_ids]).toEqual(["admitted", "example-repository", "CC-BY-4.0", ["att-0001"]]);
    expect(rows("evidence:admitted")[0].newv).toMatchObject({ provider: "example-repository", licence: "CC-BY-4.0", sha256: sha(LAS) });
    // an own pack never signs (f)
    await makePack("other", {}, deps());
    await expect(signAttestation("other", "evp-0001", { code: "f" }, deps())).rejects.toMatchObject({ status: 409, message: "(f) is signed on a published dataset's pack only — this pack holds your own evidence; nothing was saved" });
  });
});

describe("surveyStart (MA-4c): the checks before a survey job", () => {
  it("a person, a contributor of an office project, the budget, the pack in force — in that order; no file read", async () => {
    await ready();
    role = "service";
    await expect(surveyStart("demo", "evp-0001", deps())).rejects.toMatchObject({ status: 403, message: "a survey job needs a person — its build:run row names who started it: sign in. Nothing was saved." });
    role = "viewer";
    await expect(surveyStart("demo", "evp-0001", deps())).rejects.toMatchObject({ status: 403, message: "this action requires the contributor role (you are viewer)" });
    role = "contributor";
    await expect(surveyStart("office", "evp-0001", deps())).rejects.toMatchObject({ status: 400, message: "an evidence pack belongs to a project, not an office — make it on the project; nothing was saved" });
    await expect(surveyStart("demo", "evp-0002", deps())).rejects.toMatchObject({ status: 404, message: "demo's evidence pack is evp-0001, not evp-0002 — nothing was saved" });
    const s = await surveyStart("demo", "evp-0001", deps());
    expect(s).toMatchObject({ proj: { id: "uuid-demo" }, pack: { pack_id: "evp-0001" }, version: 4, dir: join(root, "demo") });
    expect(budgets).toContainEqual(["survey jobs", { perUser: 6, all: 12 }]);
  });
});

describe("a concept IFC (MA-6-8)", () => {
  const IFC = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));
  it("is admitted as a model, own, on (a) alone; a PDF renamed .ifc and a 65 MB file are refused with a row each, the big one unhashed", async () => {
    await makePack("demo", {}, deps()); await sign(["a"]); role = "contributor";
    put("model/concept.ifc", IFC); put("model/fake.ifc", "%PDF-1.7\n1 0 obj\n"); put("model/big.ifc", Buffer.concat([Buffer.from("ISO-10303-21;\n"), Buffer.alloc(65 * 1048576)]));
    const ok = await admit({ path: "model/concept.ifc", kind: "model" });
    expect(ok).toMatchObject({ verdict: "admitted", item: { id: "ev-0001", kind: "model", format: "ifc", provider: "own", licence: "owner-supplied", surveyable: false, sha256: sha(IFC), size_bytes: IFC.length, attestation_ids: ["att-0001"] } });
    expect(rows("evidence:admitted")).toHaveLength(1);
    const pdf = await admit({ path: "model/fake.ifc", kind: "model" });
    expect(pdf).toMatchObject({ verdict: "refused", sha256: null, reasons: ["the file does not begin as a .ifc does — renamed or damaged"] });
    const big = await admit({ path: "model/big.ifc", kind: "model" });
    expect(big.verdict).toBe("refused");
    expect(big.sha256).toBe(null);
    expect(big.reasons[0]).toMatch(/^a \.ifc is read inside the bridge — at most 64 MB \(this one is 65\.0 MB\)/);
    expect(rows("evidence:refused").map((r) => r.action)).toEqual(["evidence:refused model/fake.ifc", "evidence:refused model/big.ifc"]);
    expect((await admit({ path: "model/concept.ifc", kind: "scan", registration: REG }).catch((e) => e)).status).toBe(409); // already admitted; a scan needs (c) first
  });
  it("an .ifc sent as a photo is refused in words; LAS, E57, JPG and PDF still pass the 16-byte head", async () => {
    await ready();
    put("a.ifc", IFC); put("scans/tiny.las", LAS); put("photos/own.jpg", JPG); put("scans/s.e57", Buffer.concat([Buffer.from("ASTM-E57"), Buffer.alloc(40)]));
    put("drawings/a.pdf", Buffer.from("%PDF-1.7\n"));
    expect((await admit({ path: "a.ifc", kind: "photo" })).reasons).toEqual(["a .ifc is a model, not a photo"]);
    for (const [path, kind] of [["scans/tiny.las", "scan"], ["scans/s.e57", "scan"]]) expect((await admit({ path, kind, registration: REG })).verdict).toBe("admitted");
    expect((await admit({ path: "photos/own.jpg", kind: "photo" })).verdict).toBe("admitted");
  });
});

// MA-8-3 — a third party's model: a lead's admission, (a) + (e), a licence_ref; a flagged one comes back as first admitted.
describe("a third party's model (MA-8-3)", () => {
  const IFC = readFileSync(new URL("./fixtures/ifc-geometry/concept-2storey.ifc", import.meta.url));
  const vendor = { path: "model/vendor.ifc", kind: "model", provider: "Acme Scans", licence_ref: "PO-2026-114" };
  it("is a lead's; without (e) a 409; with it the item reads commercial and the row names provider and licence", async () => {
    await makePack("demo", {}, deps()); await sign(["a"]); put("model/vendor.ifc", IFC);
    role = "contributor";
    await expect(admit(vendor)).rejects.toMatchObject({ status: 403, message: "this action requires the lead role (you are contributor)" });
    role = "lead";
    await expect(admit(vendor)).rejects.toMatchObject({ status: 409, message: "a lead must sign (e) first; nothing was saved" });
    await expect(admit({ ...vendor, licence_ref: undefined })).rejects.toMatchObject({ status: 400 });
    await sign(["e"]);
    const r = await admit(vendor);
    expect(r).toMatchObject({ verdict: "admitted", item: { provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114", attestation_ids: ["att-0001", "att-0002"] } });
    expect(rows("evidence:admitted")[0].newv).toMatchObject({ provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" });
    expect((await pack()).items[0].licence_ref).toBe("PO-2026-114");
  });
  it("a RED vendor is refused with a row; the office's own model needs (a) only and no licence_ref", async () => {
    await makePack("demo", {}, deps()); await sign(["a", "e"]); put("model/vendor.ifc", IFC); put("model/own.ifc", IFC);
    const red = await admit({ ...vendor, provider: "Google Earth" });
    expect(red).toMatchObject({ verdict: "refused", reasons: ["google earth is a RED source — imagery and data from Google, Apple and Azure/Bing map services are never admitted (attestation d says so for every photo)"] });
    role = "contributor";
    expect(await admit({ path: "model/own.ifc", kind: "model" })).toMatchObject({ verdict: "admitted", item: { provider: "own", licence: "owner-supplied", attestation_ids: ["att-0001"] } });
  });
  it("a flagged vendor model comes back with its vendor and order from the pack, never the body", async () => {
    await makePack("demo", {}, deps()); await sign(["a", "e"]); put("model/vendor.ifc", IFC);
    role = "lead";
    await admit(vendor);
    put("model/vendor.ifc", Buffer.concat([IFC, Buffer.from(" ")]));
    await recheck();
    put("model/vendor.ifc", IFC);
    const back = await admit({ path: "model/vendor.ifc", kind: "model" });
    expect(back).toMatchObject({ verdict: "admitted", item: { id: "ev-0001", provider: "acme scans", licence: "commercial", licence_ref: "PO-2026-114" } });
    expect(rows("evidence:admitted")[1].newv).toMatchObject({ readmitted: true, licence_ref: "PO-2026-114" });
    // a body naming another provider for a flagged model is a 409, not a silent drop
    put("model/vendor.ifc", Buffer.concat([IFC, Buffer.from(" ")]));
    await recheck();
    put("model/vendor.ifc", IFC);
    await expect(admit({ ...vendor, provider: "other co" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("comes back as first admitted (acme scans)") });
  });
});

describe("delete-by, expiry and retire (MA-7-5)", () => {
  const TODAY = "2026-10-08"; // deps()'s clock
  const delBy = (id, b, d = deps()) => setDeleteBy("demo", "evp-0001", id, b, d);
  const setup = async () => { await ready(); put("scans/tiny.las", LAS); put("photos/own.jpg", JPG); await admit({ path: "scans/tiny.las", kind: "scan", registration: REG }); await admit({ path: "photos/own.jpg", kind: "photo" }); role = "lead"; };
  const edit = (id, f) => { // plant a field on a stored item (7-7 / 7-12 write view_copy and role; the sweep reads only the pack)
    const k = [...docs.keys()].filter((x) => x.startsWith("artefact|uuid-demo|evidence_pack@")).sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1])).pop();
    Object.assign(docs.get(k).body.items.find((i) => i.id === id), f);
  };
  const copy = (rel) => join(root, "demo", ".sentinel", "view", rel);
  // view_copy and role are 7-7's and 7-12's item fields (they widen ITEM_FIELDS then); the sweep already reads them, so these tests plant them
  const FIELDS = ["view_copy", "role"];
  beforeEach(() => { ITEM_FIELDS.push(...FIELDS); });
  afterEach(() => { ITEM_FIELDS.splice(ITEM_FIELDS.length - FIELDS.length, FIELDS.length); });

  it("(p) roles: the machine credential 403 with the words, a contributor 403, a lead 200 with one delete_by row", async () => {
    await setup();
    role = "service";
    await expect(delBy("ev-0002", { date: "2026-12-31" })).rejects.toMatchObject({ status: 403, message: "a delete-by date needs a person — it names who set it: sign in. Nothing was saved." });
    role = "contributor";
    await expect(delBy("ev-0002", { date: "2026-12-31" })).rejects.toMatchObject({ status: 403 });
    expect(rows("evidence:delete_by")).toHaveLength(0);
    role = "lead";
    const r = await delBy("ev-0002", { date: "2026-12-31", why: "owner asked" });
    expect(r.item).toMatchObject({ id: "ev-0002", delete_by: "2026-12-31", delete_why: "owner asked" });
    expect(r.ledger).toHaveLength(1);
    expect(rows("evidence:delete_by").map((a) => a.action)).toEqual(["evidence:delete_by ev-0002 2026-12-31"]);
    expect(rows("evidence:delete_by")[0].newv).toMatchObject({ item_id: "ev-0002", delete_by: "2026-12-31", why: "owner asked", actor: "machine" });
    expect(rows("evidence:expired")).toHaveLength(0);
    expect(budgets).toContainEqual(["evidence delete-by", { perUser: 20, all: 60 }]);
    await expect(delBy("ev-0099", { date: "2026-12-31" })).rejects.toMatchObject({ status: 404 });
    await expect(delBy("ev-0002", { date: "2026-10-06" })).rejects.toMatchObject({ status: 400 });
    expect((await delBy("ev-0002", { date: "2027-01-01" })).item.delete_why).toBeUndefined(); // a new date without a why drops the old why
  });

  it("(q) retire now on an own scan: expired, one evidence:expired row with removed [] — and the office's file still exists", async () => {
    await setup();
    const r = await delBy("ev-0001", { date: TODAY });
    expect(r.item).toMatchObject({ state: "expired", expired_at: "2026-10-08T10:00:00.000Z", removed: [], sha256: sha(LAS), delete_by: TODAY });
    expect(rows("evidence:delete_by").map((a) => a.action)).toEqual([`evidence:delete_by ev-0001 ${TODAY}`]);
    const x = rows("evidence:expired");
    expect(x.map((a) => a.action)).toEqual(["evidence:expired ev-0001 scans/tiny.las"]);
    expect(x[0].newv).toMatchObject({ item_id: "ev-0001", sha256: sha(LAS), removed: [], kept: "hash and record", office_file: "not touched — delete it by hand if the owner asked" });
    expect(x[0].newv.not_removed).toBeUndefined();
    expect(existsSync(join(root, "demo", "scans", "tiny.las"))).toBe(true);
    expect(r.ledger).toHaveLength(2);
    await expect(delBy("ev-0001", { date: "2026-12-31" })).rejects.toMatchObject({ status: 409, message: "ev-0001 expired on 2026-10-08 — its record stays and cannot change; nothing was saved" });
  });

  it("(r) a Sentinel copy with the admitted bytes is removed, one with other bytes is left (and said); a fold that fails deletes nothing", async () => {
    await setup();
    const COPY = Buffer.from("blurred copy bytes");
    edit("ev-0002", { view_copy: { sha256: sha(COPY) } });
    put(".sentinel/view/ev-0002.jpg", COPY);
    const r = await delBy("ev-0002", { date: TODAY });
    expect(r.item.removed).toEqual([".sentinel/view/ev-0002.jpg"]);
    expect(existsSync(copy("ev-0002.jpg"))).toBe(false);
    expect(existsSync(join(root, "demo", "photos", "own.jpg"))).toBe(true); // an own photo is the office's
    expect(rows("evidence:expired")[0].newv).toMatchObject({ removed: [".sentinel/view/ev-0002.jpg"] });
    // other bytes: left in place, said on the row
    edit("ev-0001", { view_copy: { sha256: sha(COPY) } });
    put(".sentinel/view/ev-0001.jpg", "someone else's bytes");
    const r2 = await delBy("ev-0001", { date: TODAY });
    expect(r2.item.removed).toEqual([]);
    expect(existsSync(copy("ev-0001.jpg"))).toBe(true);
    expect(rows("evidence:expired")[1].newv.not_removed).toEqual([{ path: ".sentinel/view/ev-0001.jpg", why: "not the admitted bytes — left in place" }]);
  });

  it("(r2) the record comes first: a fold that throws 409 leaves the copy where it is", async () => {
    await setup();
    const COPY = Buffer.from("blurred copy bytes");
    edit("ev-0002", { view_copy: { sha256: sha(COPY) }, delete_by: TODAY });
    put(".sentinel/view/ev-0002.jpg", COPY);
    const d = deps(), ins = d.artDeps.docInsert;
    let n = 0; // fold 1 sets ev-0001's delete-by; fold 2 is the sweep's, and another write landed first
    d.artDeps.docInsert = async (...a) => { if (++n === 2) throw Object.assign(new Error("conflict"), { status: 409 }); return ins(...a); };
    const r = await delBy("ev-0001", { date: TODAY }, d); // review: the date is saved, so the lead is told so — not "nothing was saved"
    expect(r.note).toMatch(/^the delete-by date is saved; the item expires at the next sweep/);
    expect(r.item.delete_by).toBe(TODAY);
    expect(n).toBe(2);
    expect(existsSync(copy("ev-0002.jpg"))).toBe(true);
    expect(rows("evidence:expired")).toHaveLength(0);
    expect((await pack()).items.every((i) => i.state === undefined)).toBe(true);
  });

  it("(u) an unlink that fails: pack, row and reply say it was not removed, the first expiry date stays, and the next sweep removes it", async () => {
    await setup();
    const COPY = Buffer.from("blurred copy bytes");
    edit("ev-0002", { view_copy: { sha256: sha(COPY) } });
    put(".sentinel/view/ev-0002.jpg", COPY);
    const bad = { ...deps(), unlink: () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); } };
    const r = await delBy("ev-0002", { date: TODAY }, bad);
    const why = [{ path: ".sentinel/view/ev-0002.jpg", why: "could not be deleted (EBUSY)" }];
    expect(r.item).toMatchObject({ state: "expired", removed: [], not_removed: why });
    expect(existsSync(copy("ev-0002.jpg"))).toBe(true);
    expect(rows("evidence:expired")[0].newv).toMatchObject({ removed: [], not_removed: why });
    // the next sweep (a working unlink) tries it again, on the same expired_at
    const later = { ...deps(), now: () => "2026-10-10T10:00:00.000Z" };
    const timer = startExpirySweep({ every: 3600_000, deps: later, env: {} });
    await vi.waitFor(() => expect(rows("evidence:expired")).toHaveLength(2));
    clearInterval(timer);
    const it2 = (await pack()).items.find((i) => i.id === "ev-0002");
    expect(it2).toMatchObject({ state: "expired", expired_at: "2026-10-08T10:00:00.000Z", removed: [".sentinel/view/ev-0002.jpg"] });
    expect(it2.not_removed).toBeUndefined();
    expect(existsSync(copy("ev-0002.jpg"))).toBe(false);
    expect(rows("evidence:expired")[1].newv).toMatchObject({ removed: [".sentinel/view/ev-0002.jpg"] });
    expect(rows("evidence:expired")[1].newv.not_removed).toBeUndefined();
  });

  it("(u2) a web item's delete-by can be brought forward, not moved later; yesterday's UTC day (a client behind) means today", async () => {
    await setup();
    edit("ev-0002", { role: "context", delete_by: "2026-11-01" });
    await expect(delBy("ev-0002", { date: "2026-12-01" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("brought forward") });
    expect((await delBy("ev-0002", { date: "2026-10-20" })).item.delete_by).toBe("2026-10-20");
    expect((await delBy("ev-0001", { date: "2026-10-07" })).item).toMatchObject({ state: "expired", delete_by: TODAY });
    await expect(delBy("ev-0002", { date: "2026-10-06" })).rejects.toMatchObject({ status: 400 });
  });

  it("(r3) a web item's own file is removed on its sha; the row has no office_file", async () => {
    await setup();
    edit("ev-0002", { role: "context" });
    const r = await delBy("ev-0002", { date: TODAY });
    expect(r.item.removed).toEqual(["photos/own.jpg"]);
    expect(existsSync(join(root, "demo", "photos", "own.jpg"))).toBe(false);
    expect(rows("evidence:expired")[0].newv.office_file).toBeNull();
  });

  it("(s) an expired path is a 409 before the already-admitted one; Re-check skips it and the folder list does not offer it", async () => {
    await setup();
    await delBy("ev-0001", { date: TODAY });
    role = "contributor";
    await expect(admit({ path: "scans/tiny.las", kind: "scan", registration: REG })).rejects.toMatchObject({ status: 409, message: "scans/tiny.las was ev-0001, expired on 2026-10-08 (delete-by) — put the file in under a new name; nothing was saved" });
    rmSync(join(root, "demo", "scans", "tiny.las"));
    const rc = await recheck();
    expect(rc.changed).toEqual([]); // the missing file of an expired item is no change
    expect(rc.checked).toBe(1);
    put("scans/tiny.las", LAS);
    expect((await readPack("demo", "evp-0001", deps())).folder.files_not_admitted).toEqual([]);
  });

  it("(t) the sweep runs over each project folder with a pack and skips a busy one", async () => {
    await setup();
    await delBy("ev-0001", { date: "2026-10-09" }); // due tomorrow
    // a second project: the same pack with one due item
    const keyOf = (p) => `artefact|uuid-${p}|evidence_pack@`;
    mkdirSync(join(root, "other"), { recursive: true });
    for (const [k, v] of [...docs]) if (k.includes("|uuid-demo|evidence_pack")) docs.set(k.replace("uuid-demo", "uuid-other"), structuredClone(v.body ? { ...v, body: { ...v.body, project: "other" } } : v));
    const later = { ...deps(), now: () => "2026-10-10T10:00:00.000Z" };
    // hold "demo": a delete-by whose pack read waits
    let release; const gate = new Promise((ok) => { release = ok; }); let entered = false;
    const slow = deps(); const get = slow.artDeps.docGet; slow.artDeps.docGet = async (...a) => { entered = true; await gate; return get(...a); };
    const held = delBy("ev-0002", { date: "2026-12-31" }, slow);
    await vi.waitFor(() => expect(entered).toBe(true));
    const timer = startExpirySweep({ every: 3600_000, deps: later, env: {} });
    await vi.waitFor(() => expect(rows("evidence:expired").map((a) => a.action)).toEqual(["evidence:expired ev-0001 scans/tiny.las"]));
    clearInterval(timer);
    release(); await held;
    expect((await pack()).items[0].state).toBeUndefined(); // demo was busy: left for the next run
    expect(audits.filter((a) => a.action.startsWith("evidence:expired"))).toHaveLength(1);
    const latest = (p) => [...docs.keys()].filter((x) => x.startsWith(keyOf(p))).sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1])).pop();
    expect(docs.get(latest("other")).body.items[0].state).toBe("expired"); // review: the one row is other's, not demo's
  });

  it("(t3) realDay: a real calendar day only (a hand-edited pack's 2026-02-30 is refused by validatePack)", () => {
    expect(realDay("2026-02-30")).toBeNaN();
    expect(realDay("2026-02-28")).toBeGreaterThan(0);
  });

  it("(t2) SENTINEL_EXPIRY_SWEEP=off starts nothing", () => {
    expect(startExpirySweep({ deps: deps(), env: { SENTINEL_EXPIRY_SWEEP: "off" } })).toBeNull();
  });

  it("(u) Sentinel's own .sentinel/ folder is not listed", async () => {
    await ready();
    put("scans/tiny.las", LAS); put(".sentinel/view/ev-0009.jpg", "x");
    expect((await readPack("demo", "evp-0001", deps())).folder.files_not_admitted.map((f) => f.path)).toEqual(["scans/tiny.las"]);
  });
  it("(x) MA-7-6: noticeOf - a viewer reads it; the tools come from the injected build:run rows; a ledger failure is a 503 in words and makes nothing", async () => {
    await ready();
    role = "viewer";
    const seen = [];
    const rowsOf = [{ id: 1, action: "build:run job-1 \u00b7 done", new_value: { claimed: false, tools: [{ name: "numpy", version: "2.4.6", licence: "BSD-3-Clause" }] } }];
    const n = await noticeOf("demo", "evp-0001", { ...deps(), auditAll: async (k, f) => { seen.push([k, f]); return rowsOf; } });
    expect(seen).toEqual([["demo", { entity_type: "build", action_prefix: "build:run " }]]);
    expect(n).toMatchObject({ tools: 1, credits: 0 });
    expect(n.text).toContain("- numpy 2.4.6 \u00b7 BSD-3-Clause");
    expect(n.text).toContain("made by Sentinel 2026-10-08");
    expect(n.sha256).toBe(createHash("sha256").update(n.text, "utf8").digest("hex"));
    const before = audits.length;
    await expect(noticeOf("demo", "evp-0001", { ...deps(), auditAll: async () => { throw new Error("db down"); } })).rejects.toMatchObject({ status: 503, message: "the NOTICE needs the build:run rows and the ledger could not be read \u2014 nothing was made" });
    await expect(noticeOf("demo", "evp-0009", { ...deps(), auditAll: async () => [] })).rejects.toMatchObject({ status: 404 });
    expect(audits.length).toBe(before); // a read: no row
  });
});
