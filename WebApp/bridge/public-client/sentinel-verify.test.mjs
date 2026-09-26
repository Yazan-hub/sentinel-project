import { describe, it, expect, vi } from "vitest";
import { Sentinel, SentinelError, verdictBadge, CONTRACT_VERSION } from "./sentinel-verify.mjs";

const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe("Sentinel client", () => {
  it("requires the two things it cannot guess", () => {
    expect(() => new Sentinel({ project: "bds" })).toThrow(/baseUrl is required/);
    expect(() => new Sentinel({ baseUrl: "http://x" })).toThrow(/project is required/);
  });

  it("trims a trailing slash so callers can paste either form", () => {
    expect(new Sentinel({ baseUrl: "http://x:4100/", project: "p" }).baseUrl).toBe("http://x:4100");
  });

  it("posts elements and provenance to the project's propose endpoint", async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({ verdict: "accepted", receipt: { audit_id: 1 } }));
    const s = new Sentinel({ baseUrl: "http://x:4100", project: "bds ok", fetch: f });
    const out = await s.propose({ elements: [{ identity: { Class: "IFCWALL" } }], agent: { kind: "agent", model: "gpt-6" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://x:4100/cde/bds%20ok/propose");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).agent).toEqual({ kind: "agent", model: "gpt-6" });
    expect(out.verdict).toBe("accepted");
  });

  it("refuses a non-array elements argument before any network call", async () => {
    const f = vi.fn();
    const s = new Sentinel({ baseUrl: "http://x", project: "p", fetch: f });
    expect(() => s.propose({ elements: "wall" })).toThrow(/must be an array/);
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the bearer token when one is configured, and omits it when not", async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({}));
    await new Sentinel({ baseUrl: "http://x", project: "p", token: "tok", fetch: f }).receipt(4);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
    const g = vi.fn().mockResolvedValue(jsonRes({}));
    await new Sentinel({ baseUrl: "http://x", project: "p", fetch: g }).receipt(4);
    expect(g.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("raises the bridge's own message, status and body on failure", async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({ message: "no ledger entry" }, false, 404));
    const s = new Sentinel({ baseUrl: "http://x", project: "p", fetch: f });
    await expect(s.receipt(9)).rejects.toThrow(SentinelError);
    await s.receipt(9).catch((e) => {
      expect(e.status).toBe(404);
      expect(e.message).toBe("no ledger entry");
      expect(e.body).toEqual({ message: "no ledger entry" });
    });
  });

  it("still fails loudly when the error body is not JSON", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("nope"); } });
    await expect(new Sentinel({ baseUrl: "http://x", project: "p", fetch: f }).receipt(1)).rejects.toThrow(/responded 500/);
  });

  it("verify() posts the receipt to the verify endpoint", async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({ matches: true, reasons: [] }));
    await new Sentinel({ baseUrl: "http://x", project: "p", fetch: f }).verify({ audit_id: 7 });
    expect(f.mock.calls[0][0]).toBe("http://x/receipt/p/verify");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ receipt: { audit_id: 7 } });
  });

  it("exports a contract version so a consumer can pin it", () => {
    expect(CONTRACT_VERSION).toBe("sentinel-verdict/1");
  });
});

describe("verdictBadge", () => {
  // A minimal document stub — the badge must never need a real DOM to be testable.
  const doc = () => ({
    createElement: () => {
      const node = {
        children: [], style: { cssText: "" }, attrs: {}, textContent: "", title: "",
        setAttribute(k, v) { this.attrs[k] = v; },
        append(...kids) { this.children.push(...kids); },
      };
      return node;
    },
  });
  const text = (el) => [el.textContent, ...el.children.map(text)].join(" ").trim();
  // The public reply when the receipt's verdict was compared, and when only the id and hash were.
  const verdictChecked = { matches: true, checked: ["audit_id", "ledger_hash", "project", "recorded_at", "verdict"], mismatched: [], not_checked: [] };
  const hashOnly = { matches: true, checked: ["audit_id", "ledger_hash", "project"], mismatched: [], not_checked: ["recorded_at", "verdict"] };

  it("reads UNVERIFIED until the receipt has actually been checked", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abc12345" }, undefined, doc());
    expect(text(el)).toMatch(/accepted — unverified/);
    expect(el.attrs["data-sentinel-confirmed"]).toBe("false");
  });

  it("only claims acceptance once verification confirmed it", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abc12345", audit_id: 5 }, verdictChecked, doc());
    expect(text(el)).toMatch(/accepted by Sentinel/);
    expect(el.attrs["data-sentinel-confirmed"]).toBe("true");
  });

  it("shows a confirmed rejection as a rejection", () => {
    const el = verdictBadge({ verdict: "rejected", ledger_hash: "h" }, verdictChecked, doc());
    expect(text(el)).toMatch(/rejected by Sentinel/);
  });

  it("a failed check does NOT read as accepted", () => {
    const el = verdictBadge({ verdict: "accepted" }, { matches: false, reasons: ["forged"] }, doc());
    expect(text(el)).toMatch(/unverified/);
  });

  it("shows a short ledger hash when there is one, and nothing when there isn't", () => {
    expect(text(verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234" }, verdictChecked, doc()))).toMatch(/abcdef12/);
    expect(verdictBadge({ verdict: "accepted" }, verdictChecked, doc()).children).toHaveLength(2);
  });

  it("a match that did not compare the verdict shows the entry, never the verdict the receipt claims", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234", audit_id: 702 }, hashOnly, doc());
    expect(text(el)).toMatch(/on the ledger — verdict not checked/);
    expect(text(el)).not.toMatch(/accepted/);
    expect(el.attrs["data-sentinel-confirmed"]).toBe("true");
    expect(el.attrs["data-sentinel-verdict"]).toBe("not-checked");
    // a member's full reply carries no `checked`, but its verifyReceipt always compares the verdict; a reply with
    // neither `checked` nor `reasons` under-claims rather than assumes
    expect(text(verdictBadge({ verdict: "accepted" }, { matches: true, reasons: [], ledger: {} }, doc()))).toMatch(/accepted by Sentinel/);
    expect(text(verdictBadge({ verdict: "accepted" }, { matches: true }, doc()))).toMatch(/verdict not checked/);
  });

  it("says what a match is: the ledger's stored hash, the chain not recomputed", () => {
    const el = verdictBadge({ verdict: "accepted", ledger_hash: "abcdef1234", audit_id: 702 }, verdictChecked, doc());
    expect(el.children[2].title).toBe("Entry 702 matches the ledger's stored hash (chain not recomputed).");
    expect(el.children[2].title).not.toMatch(/immutable/);
  });
});
