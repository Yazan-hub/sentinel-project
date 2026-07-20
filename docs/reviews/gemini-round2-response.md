# Reply to Gemini's review — how we reacted, and what we did

*Context: Gemini reviewed the Sentinel project overview and returned a 5-point review + action items. This is our point-by-point response, written after acting on it. Date: 2026-07-20.*

---

Thanks — this was sharp, and we moved on the two highest-leverage items you flagged. Point by point:

**1. The "referee seat" / digital notary.** Agreed, and we've adopted that framing verbatim — *storage is a CDE's job; truth is ours*. It's now the spine of the positioning doc.

**2. Breadth = focus risk.** You're right, and we folded both of your framings into product doctrine (and stamped them directly on the code so they can't drift):
- **"Data clash, not geometric clash"** — we now cede geometric clash to Navisworks/Revizto and keep our AABB checker only as a *trust-gap* play ("reconcile against your own NWD, signed on the audit chain"). The differentiated clash is IDS / parameter / contract / ISO-19650-state contradiction. Marked in `clash-panel.ts`.
- **"5D/6D are derivation-only."** They derive from one shared quantities/snapshot spine and integrate external cost/EPD data *by reference* (EC3 for carbon) — never owning a cost book or EPD database. The default rate/factor tables are now explicitly labelled demo seeds, not product surfaces. Marked in `cost-panel.ts` / `carbon-panel.ts`.

**3. UK BSA golden thread as the beachhead.** Agreed — and it now has teeth, because of #4.

**4. The service-key loophole — this is where we dug in, and we owe you a precise correction.** We checked it against the live database, not the design doc. Your specific scenario — *service key rewrites historical logs* — was **already blocked**: there's a `BEFORE UPDATE OR DELETE` trigger on the ledger that fires for the service role too, and the table is owned by `postgres`, so the service key can't drop it. **But your instinct found a real hole one step over:** that trigger is row-level, so it never fires on `TRUNCATE`, and all three Postgres roles still held the `TRUNCATE` grant. So a row-rewrite was impossible but a full **table wipe** wasn't. We closed it at both layers — a `BEFORE TRUNCATE` trigger plus revoking `update/delete/truncate` from every app role — and verified on the live DB (95 rows, zero hash-chain breaks). The ledger is now append-only *at the database core*, exactly as you recommended — the claim is now actually true, not just mostly true.

**5. Referee-for-AI.** Unchanged conviction — highest-leverage long-term play. It stays the north star: be the compiler / test-framework that adjudicates generated BIM, not another generator.

---

**On your #1 action item — "validate the Revit live loop": done, and it earned its priority.** We deployed the unified one-button Governed Publish and ran it on a real building (Autodesk's Snowdon Towers sample). The live run immediately surfaced bugs no unit test had caught:
- a 6-second timeout too short to adjudicate a large model (raised to 120s for the deliberate governed calls), and
- an HTTP 500 from a genuine **NUL byte** buried in real Revit element data — Postgres can't store `U+0000` in JSONB, so an audit insert 400'd. Fixed by stripping NUL at the single database-write chokepoint.

The desktop→cloud→referee loop now runs on a real model — export → delivery gate → IDS adjudication → immutable verdict → publish-only-on-pass, with failures auto-raised as BCF issues synced back into Revit. You were right that both the value *and* the risk lived in that one seam; unit tests were green while the real model still broke it.

**On your #2 — "simplify":** in the same spirit we collapsed the Revit ribbon from 22 scattered buttons (sharing 5 repeated icons) into 4 purpose-named panels with grouped pulldowns and a distinct icon per tool — less operator friction on the way into the loop.

**One place we deliberately didn't follow you:** "stop all web-app dev, 100% on the loop." The loop was already built — what it needed was *live validation*, which is now done and hardened by real-world data. And we kept 5D/6D/clash rather than cutting them, but demoted them to thin derivations per your framing.

Net: the two things you called most important — *prove the live loop* and *make the ledger physically immutable* — are both done and evidence-backed. Appreciate the push.
