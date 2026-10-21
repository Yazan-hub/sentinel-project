// Issue sign-offs on the ledger (2026-10-21): the entry topic-ledger builds for a topic change, and the order it writes in — the
// ledger row before the save, nothing saved without a row, a failed save answered by a second row, the coverage marker once.
// The routes themselves are driven end to end in write-roles.test.mjs.
import { describe, it, expect } from "vitest";
import { topicLedgerEntry, saveWithLedger, COVERAGE, COVERAGE_NOTE } from "./topic-ledger.mjs";

const T = { guid: "g", title: "Door", topic_status: "Open", priority: "Normal", assigned_to: "" };

describe("topicLedgerEntry", () => {
  it.each([
    [{ topic_status: "Closed" }, "issue_closed"],
    [{ topic_status: "Resolved" }, "issue_resolved"],
    [{ topic_status: "In Progress" }, "issue_status_changed"],
    [{ assigned_to: "a@x" }, "issue_assigned"],
    [{ priority: "High" }, "issue_priority_changed"],
    [{ topic_status: "Closed", assigned_to: "a@x", priority: "Low" }, "issue_closed"], // status names the act; every field is in it
  ])("%j → %s", (change, action) => {
    expect(topicLedgerEntry(T, { ...T, ...change }).action).toBe(action);
  });

  it("from closed or resolved (trimmed, any case) back to open work is a reopen; clearing the assignee is an unassign", () => {
    for (const s of ["Closed", " resolved"]) expect(topicLedgerEntry({ ...T, topic_status: s }, { ...T, topic_status: "In Progress" }).action).toBe("issue_reopened");
    expect(topicLedgerEntry({ ...T, assigned_to: "a@x" }, T).action).toBe("issue_unassigned");
  });

  it("old and new name only what changed, blanks as null; a raise is issue_opened with all three; no change is null", () => {
    expect(topicLedgerEntry(T, { ...T, assigned_to: "a@x", description: "ignored" }, { comment: "on it", via: "BCF file import" })).toEqual({
      action: "issue_assigned", old_value: { assigned_to: null },
      new_value: { guid: "g", title: "Door", assigned_to: "a@x", comment: "on it", via: "BCF file import" },
    });
    expect(topicLedgerEntry(null, T)).toEqual({ action: "issue_opened", old_value: null,
      new_value: { guid: "g", title: "Door", topic_status: "Open", assigned_to: null, priority: "Normal", comment: null, via: null } });
    expect(topicLedgerEntry(T, { ...T, due_date: "2026-11-01", title: "Door D-12" })).toBeNull();
    expect(topicLedgerEntry({ ...T, assigned_to: undefined }, T)).toBeNull(); // unset and "" are the same
  });
});

describe("saveWithLedger", () => {
  // A fake cde: `rows` is the ledger; `audit` returns the stored row ({id}) unless told to return nothing.
  const fakeCde = ({ configured = true, coverage = false, noRow = false } = {}) => {
    const rows = [], calls = [];
    return {
      rows, calls,
      cdeConfigured: () => configured,
      takeWriteBudget: () => {},
      ensureProject: async (key) => ({ id: `id-${key}` }),
      isUuid: (v) => v === "6f1c0d2a-0000-4000-8000-000000000001",
      sb: async (path, { service }) => { calls.push(`read:${service ? "service" : "caller"}`); return coverage ? [{ id: 1 }] : []; },
      audit: async (project_id, entity_type, entity_id, action, actor, old_value, new_value) => {
        calls.push(`audit:${action}`);
        if (noRow && action !== COVERAGE) return null;
        const row = { id: rows.length + 1, project_id, entity_type, entity_id, action, actor, old_value, new_value };
        rows.push(row);
        return row;
      },
    };
  };
  const topic = (pk) => ({ ...T, guid: "6f1c0d2a-0000-4000-8000-000000000001", project_id: pk, topic_status: "Closed" });

  it("writes the coverage marker once per project, then the row, stamps the lines, then saves", async () => {
    const cde = fakeCde(), lines = [{ action: "Status: Open → Closed" }];
    const id = await saveWithLedger(cde, { before: T, topic: topic("p1"), lines, actor: "a@x", save: async () => cde.calls.push("save") });
    await saveWithLedger(cde, { before: T, topic: topic("p1"), actor: "a@x", save: async () => cde.calls.push("save") });
    expect(cde.calls).toEqual(["read:service", `audit:${COVERAGE}`, "audit:issue_closed", "save", "audit:issue_closed", "save"]);
    expect(cde.rows[0]).toMatchObject({ project_id: "id-p1", entity_id: null, action: COVERAGE, new_value: { note: COVERAGE_NOTE } });
    expect(cde.rows[1]).toMatchObject({ entity_type: "bcf_topic", entity_id: "6f1c0d2a-0000-4000-8000-000000000001", new_value: { actor_verified: false } });
    expect([id, lines[0].ledger_id]).toEqual([2, 2]);
  });

  it("an existing coverage marker is not written again", async () => {
    const cde = fakeCde({ coverage: true });
    await saveWithLedger(cde, { before: T, topic: topic("p2"), actor: "a@x", save: async () => {} });
    expect(cde.calls).toEqual(["read:service", "audit:issue_closed"]);
  });

  it("no row back: a 502 and nothing saved", async () => {
    const cde = fakeCde({ noRow: true });
    let saved = false;
    await expect(saveWithLedger(cde, { before: T, topic: topic("p3"), actor: "a@x", save: async () => { saved = true; } }))
      .rejects.toMatchObject({ status: 502, message: "the ledger gave no row back — nothing was changed" });
    expect(saved).toBe(false);
  });

  it("a save that fails after the row is a second row voiding it, and the failure still reaches the caller", async () => {
    const cde = fakeCde();
    await expect(saveWithLedger(cde, { before: T, topic: topic("p4"), actor: "a@x", save: async () => { throw Object.assign(new Error("db down"), { status: 503 }); } }))
      .rejects.toMatchObject({ status: 503 });
    expect(cde.rows.slice(1).map((r) => [r.action, r.new_value?.voids])).toEqual([["issue_closed", undefined], ["issue_change_not_saved", 2]]);
  });

  it("no change, or no CDE: save alone, no row", async () => {
    for (const [cde, before] of [[fakeCde(), topic("p5")], [fakeCde({ configured: false }), T]]) {
      let saved = false;
      expect(await saveWithLedger(cde, { before, topic: topic("p5"), actor: "a@x", save: async () => { saved = true; } })).toBeNull();
      expect([saved, cde.rows]).toEqual([true, []]);
    }
  });
});
