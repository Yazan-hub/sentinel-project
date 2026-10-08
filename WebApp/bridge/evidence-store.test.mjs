// MA-4a — evidence intake end to end on a temp evidence folder: the pack, the signatures, admission (streamed sha, magic, policy), a changed file refused and flagged, Re-check, re-admission — deps injected, no Supabase.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { makePack, readPack, signAttestation, runEvidenceIntake, recheckPack, draftRequest, surveyStart } from "./evidence-store.mjs";
import { ATTESTATIONS, USES } from "./evidence-logic.mjs";

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
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
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
    expect(await admit({ path: "notes/a.txt", kind: "photo" })).toMatchObject({ verdict: "refused", reasons: ["a .txt is not admitted — scans are e57, las, laz or rcp; photos are jpg or png"] });
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
    const allowed = ["./bridge-auth.mjs", "./evidence-logic.mjs", "./artefact-store.mjs", "./cde-store.mjs", "./members-store.mjs"];
    const specs = [...src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s.startsWith("node:") || allowed.includes(s), s).toBe(true);
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
