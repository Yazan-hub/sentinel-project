import { SERVICE_URL } from "../config";
import { bfetch, bwrite } from "./bridge-fetch";
import { activePid, onActiveProjectChange } from "./active-project";
import { escapeHtml as esc, fmtDate } from "./escape-html";

/**
 * Data feed — the no-toll feed (spec docs/superpowers/specs/2026-10-19-work-alongside-connectors.md §2). The project's element
 * rows at a URL Power BI and Excel read and refresh, signed in with a personal feed key over Basic (the founder's choice). The
 * screen shows the URLs with Copy, makes and revokes the person's own keys, and says the steps in words — no JSON, no CLI.
 */

export type FeedKey = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

/** The feed URLs for a project, as a BIM manager pastes them. Pure. */
export function feedUrls(base: string, key: string): { label: string; url: string; note: string }[] {
  const b = `${base.replace(/\/$/, "")}/feed/${encodeURIComponent(key)}`;
  return [
    { label: "Elements, newest revision (CSV)", url: `${b}/elements.csv`, note: "Always the latest take-off — a refresh picks up a new revision." },
    { label: "Revisions (CSV)", url: `${b}/revisions.csv`, note: "Every revision with its date and element count." },
    { label: "Elements, newest revision (JSON)", url: `${b}/elements.json`, note: "The same rows for scripts and Power Query's JSON connector." },
  ];
}

/** "last used …" / "never used" / "revoked …". Pure. */
export function keyState(k: FeedKey): string {
  if (k.revoked_at) return `revoked ${fmtDate(k.revoked_at)}`;
  return k.last_used_at ? `last used ${fmtDate(k.last_used_at)}` : "never used";
}

export function dataFeedPanel(opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl ?? SERVICE_URL).replace(/\/$/, "");
  const btn = "border:0;border-radius:.3rem;padding:.3rem .6rem;font:600 12px system-ui;cursor:pointer";
  const inp = "background:#111;color:#eee;border:1px solid #333;border-radius:.3rem;padding:.3rem;font:12px system-ui;box-sizing:border-box";
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;background:#16161a;color:#eee;font:13px system-ui;overflow:hidden;border-radius:.5rem";
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:.4rem;padding:.55rem .6rem;border-bottom:1px solid #2a2a30">' +
      '<span style="font-weight:600">⇩ Data feed</span><span style="color:#9ca3af;font-size:12px">Power BI · Excel</span></div>' +
    '<div style="flex:1;overflow:auto;padding:.6rem">' +
      '<div style="color:#9ca3af;font-size:12px;margin-bottom:.6rem">Your project\'s element quantities, per model revision, at a web address Power BI and Excel read and refresh. ' +
        "The data comes from Sentinel, so there is no data-out charge. You sign in with your own feed key; it works only while you are a member of the project.</div>" +
      `<div style="border:1px solid #2a2a30;border-radius:.4rem;padding:.55rem;margin-bottom:.6rem"><div style="font-weight:600;margin-bottom:.4rem">1 · The address</div><div id="df-urls"></div></div>` +
      `<div style="border:1px solid #2a2a30;border-radius:.4rem;padding:.55rem;margin-bottom:.6rem"><div style="font-weight:600;margin-bottom:.4rem">2 · Your feed key</div>` +
        '<div style="display:flex;gap:.35rem;margin-bottom:.4rem">' +
          `<input id="df-label" maxlength="80" placeholder="What it is for, e.g. Power BI on my laptop" style="${inp};flex:1"/>` +
          `<button id="df-make" style="${btn};background:#6528d7;color:#fff">Make a feed key</button></div>` +
        '<div id="df-new"></div><div id="df-keys"></div></div>' +
      `<div style="border:1px solid #2a2a30;border-radius:.4rem;padding:.55rem;margin-bottom:.6rem;font-size:12px;line-height:1.55">` +
        '<div style="font-weight:600;margin-bottom:.3rem">3 · Power BI Desktop</div>' +
        "<ol style=\"margin:0 0 .5rem 1.1rem;padding:0\"><li>Home ▸ <b>Get data</b> ▸ <b>Web</b>.</li><li>Paste the elements address from step 1 and press OK.</li>" +
        "<li>In the sign-in window choose <b>Basic</b>. User name: your email. Password: your feed key. Apply it to the address shown, then <b>Connect</b>.</li>" +
        "<li><b>Load</b> (or <b>Transform data</b> to shape it). Later, <b>Refresh</b> brings the newest revision.</li></ol>" +
        '<div style="font-weight:600;margin-bottom:.3rem">Excel</div>' +
        "<ol style=\"margin:0 0 .5rem 1.1rem;padding:0\"><li>Data ▸ <b>From Web</b>, paste the address, OK.</li><li>Choose <b>Basic</b>: your email and your feed key, then <b>Connect</b> and <b>Load</b>.</li>" +
        "<li>Data ▸ <b>Refresh All</b> brings the newest revision.</li></ol>" +
        '<div style="margin-bottom:.4rem"><b>Windows with a decimal comma</b> (German, French, Czech…): the quantities use a decimal point. In Power BI choose <b>Transform data</b>, select count, length, area, volume and weight, then <b>Change type ▸ Using locale… ▸ Decimal number, English (United States)</b>. In Excel the same step is in Power Query (<b>Transform Data</b>).</div>' +
        '<div style="color:#9ca3af">A fixed revision: add <code>?rev=P02</code> (its revision code) to the elements address. If a refresh says the sign-in failed, the key was revoked or you left the project — make a new key.</div>' +
      "</div></div>" +
    '<div id="df-msg" style="padding:.4rem .6rem;border-top:1px solid #2a2a30;color:#9ca3af;font-size:12px;min-height:1rem"></div>';

  const el = (id: string) => root.querySelector("#" + id) as HTMLElement;
  const msg = (t: string, color = "#9ca3af") => { el("df-msg").textContent = t; el("df-msg").style.color = color; };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); msg(`Copied ${what}.`, "#22c55e"); }
    catch { msg(`Copy is blocked in this browser — select ${what} and copy it by hand.`, "#eab308"); }
  };

  const renderUrls = () => {
    const key = activePid();
    const urls = key ? feedUrls(base, key) : [];
    el("df-urls").innerHTML = key
      ? urls.map((u, i) => `<div style="margin-bottom:.4rem"><div style="font-size:12px">${esc(u.label)}</div>` +
          `<div style="display:flex;gap:.35rem;align-items:center"><input readonly value="${esc(u.url)}" style="${inp};flex:1;font-family:Consolas,monospace"/>` +
          `<button data-copy="${i}" style="${btn};background:#2a2a30;color:#eee">Copy</button></div>` +
          `<div style="font-size:11px;color:#9ca3af">${esc(u.note)}</div></div>`).join("")
      : '<div style="color:#9ca3af;font-size:12px">Open a project first.</div>';
    root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) => b.addEventListener("click", () => void copy(urls[Number(b.dataset.copy)].url, "the address")));
  };

  const loadKeys = async () => {
    try {
      const r = await bfetch(`${base}/feed/keys`);
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
      const keys = j as FeedKey[];
      el("df-keys").innerHTML = keys.length
        ? keys.map((k) => `<div style="display:flex;align-items:center;gap:.4rem;padding:.25rem 0;border-top:1px solid #222;font-size:12px${k.revoked_at ? ";color:#6b7280" : ""}">` +
            `<span style="flex:1">${esc(k.label || "(no label)")} · made ${esc(fmtDate(k.created_at))} · ${esc(keyState(k))}</span>` +
            (k.revoked_at ? "" : `<button data-revoke="${esc(k.id)}" style="${btn};background:#2a2a30;color:#fca5a5">Revoke</button>`) + "</div>").join("")
        : '<div style="color:#9ca3af;font-size:12px">You have no feed keys yet.</div>';
      root.querySelectorAll<HTMLButtonElement>("[data-revoke]").forEach((b) => b.addEventListener("click", () => void revoke(b.dataset.revoke as string, b)));
    } catch (e) {
      el("df-keys").innerHTML = `<div style="color:#ef4444;font-size:12px">Your keys were not read — ${esc((e as Error).message)}</div>`;
    }
  };

  let shownId: string | null = null; // the key on screen now (shown once): cleared only when that key is revoked
  const make = async () => {
    const b = el("df-make") as HTMLButtonElement; b.disabled = true; msg("Making a feed key…");
    try {
      const k = await bwrite<FeedKey & { key: string }>(`${base}/feed/keys`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: (el("df-label") as HTMLInputElement).value }) });
      (el("df-label") as HTMLInputElement).value = "";
      shownId = k.id;
      el("df-new").innerHTML = '<div style="border:1px solid #6528d7;border-radius:.3rem;padding:.45rem;margin-bottom:.4rem">' +
        '<div style="font-size:12px;margin-bottom:.3rem"><b>Your new feed key.</b> Copy it now and paste it as the password in Power BI or Excel — it is shown this once and never again.</div>' +
        `<div style="display:flex;gap:.35rem"><input readonly value="${esc(k.key)}" style="${inp};flex:1;font-family:Consolas,monospace"/>` +
        `<button id="df-copykey" style="${btn};background:#6528d7;color:#fff">Copy</button></div></div>`;
      el("df-copykey").addEventListener("click", () => void copy(k.key, "the feed key"));
      msg("✅ Feed key made — copy it now.", "#22c55e");
      await loadKeys();
    } catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); }
    finally { b.disabled = false; }
  };

  const revoke = async (id: string, b: HTMLButtonElement) => {
    if (!confirm("Revoke this feed key? Every report that uses it stops refreshing until you give it a new key.")) return;
    b.disabled = true;
    try { await bwrite(`${base}/feed/keys/${encodeURIComponent(id)}`, { method: "DELETE" }); msg("✅ Key revoked — it reads nothing from now on.", "#22c55e"); if (id === shownId) { el("df-new").innerHTML = ""; shownId = null; } await loadKeys(); }
    catch (e) { msg("❌ " + ((e as Error)?.message ?? String(e)), "#ef4444"); b.disabled = false; }
  };

  el("df-make").addEventListener("click", () => void make());
  renderUrls();
  void loadKeys();
  onActiveProjectChange(() => { renderUrls(); void loadKeys(); }); // a key is the person's, not the project's: one just made stays on screen
  return root;
}
