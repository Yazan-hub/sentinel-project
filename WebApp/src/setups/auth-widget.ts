import { type Session } from "@supabase/supabase-js";
import { currentSession, signInWithPassword, signOut, onAuthChange, changePassword, passwordProblem, MIN_PASSWORD } from "./auth";

/**
 * Sign-in widget (Stage B) — a small, NON-BLOCKING floating pill (bottom-right). Email + password, so it
 * works with no SMTP / no email round-trip / no redirect (the pragmatic flow for the platform-embedded app
 * before custom SMTP is configured). Signing in doesn't gate anything yet — its job is to prove auth +
 * establish identity for memberships. Plain-DOM, iframe-safe.
 */
export function authWidget(opts: { anchor?: string } = {}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = (opts.anchor ?? "position:fixed;bottom:.6rem;right:.6rem") + ";z-index:1000;font:13px system-ui";

  let session: Session | null = null;
  let open = false;
  let msg = "";
  let busy = false;
  let dismissed = false; // ✕ closed the form: a signed-out 401 (the Issues feed's, every 3 s) must not reopen it
  let changing = false; // the change-password form is open
  let notice = ""; // what the last password change did, shown above the signed-in pill

  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const pill =
    "border:1px solid #2c2c34;background:#16161ae6;backdrop-filter:blur(6px);color:#eee;border-radius:100px;padding:.35rem .75rem;cursor:pointer;box-shadow:0 4px 14px #0006";
  const field =
    "background:#101014;border:1px solid #2c2c34;border-radius:.4rem;color:#eee;font:13px system-ui;outline:none;padding:.4rem .55rem";

  const render = () => {
    const who = session?.user?.email ?? null;

    if (who && changing) {
      wrap.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:.4rem;background:#16161a;border:1px solid #2c2c34;border-radius:.7rem;padding:.6rem;box-shadow:0 8px 24px #0008;width:16rem">' +
        `<div style="font-size:12px;color:#ccc">Change password — ${esc(who)}</div>` +
        `<input id="aw-cur" type="password" autocomplete="current-password" placeholder="current password" style="${field}"/>` +
        `<input id="aw-new" type="password" autocomplete="new-password" placeholder="new password (${MIN_PASSWORD}+ characters)" style="${field}"/>` +
        `<input id="aw-new2" type="password" autocomplete="new-password" placeholder="new password again" style="${field}"/>` +
        '<label style="display:flex;gap:.4rem;align-items:flex-start;font-size:11px;color:#bbb"><input id="aw-others" type="checkbox" checked style="margin:.1rem 0 0"/>' +
        "Sign out my other sessions (other browsers, Sentinel in Revit)</label>" +
        '<div style="display:flex;gap:.4rem">' +
        `<button id="aw-change" style="${pill};background:#6528d7;border-color:#6528d7;color:#fff;flex:1">${busy ? "Changing…" : "Change password"}</button>` +
        `<button id="aw-x" style="${pill};padding:.35rem .6rem">✕</button></div>` +
        (msg ? `<div style="font-size:11px;color:#f0a0a0">${esc(msg)}</div>` : "") +
        "</div>";
      const cur = wrap.querySelector("#aw-cur") as HTMLInputElement;
      const nxt = wrap.querySelector("#aw-new") as HTMLInputElement;
      const again = wrap.querySelector("#aw-new2") as HTMLInputElement;
      const others = wrap.querySelector("#aw-others") as HTMLInputElement;
      cur.focus();
      const change = async () => {
        if (busy) return;
        const [c, n, signOutOthers] = [cur.value, nxt.value, others.checked]; // the busy render rebuilds the form
        const problem = passwordProblem(c, n, again.value);
        if (problem) { msg = problem; render(); return; }
        busy = true; msg = ""; render();
        const r = await changePassword(c, n, signOutOthers);
        busy = false;
        if (r.ok) { changing = false; notice = r.message; } else msg = r.message;
        render();
      };
      (wrap.querySelector("#aw-change") as HTMLElement).addEventListener("click", () => void change());
      (wrap.querySelector("#aw-x") as HTMLElement).addEventListener("click", () => { changing = false; msg = ""; render(); });
      again.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void change(); });
      return;
    }

    if (who) {
      wrap.innerHTML =
        (notice ? `<div id="aw-notice" style="font-size:11px;color:#86efac;background:#16161ae6;border:1px solid #2c2c34;border-radius:.5rem;padding:.35rem .55rem;margin-bottom:.35rem;max-width:18rem;cursor:pointer" title="Click to hide">${esc(notice)}</div>` : "") +
        '<div style="display:flex;gap:.35rem;justify-content:flex-end">' +
        `<button id="aw-pw" style="${pill}" title="Change your Sentinel password">🔑 Password</button>` +
        `<button id="aw-pill" style="${pill}" title="Signed in — click to sign out"><span style="color:#34d17e">◕</span> ${esc(who)} · <span style="color:#9ca3af">Sign out</span></button></div>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => void signOut());
      (wrap.querySelector("#aw-pw") as HTMLElement).addEventListener("click", () => { changing = true; msg = ""; notice = ""; render(); });
      wrap.querySelector("#aw-notice")?.addEventListener("click", () => { notice = ""; render(); });
      return;
    }

    if (!open) {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}">↪ Sign in</button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => { open = true; msg = ""; render(); });
      return;
    }

    wrap.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:.4rem;background:#16161a;border:1px solid #2c2c34;border-radius:.7rem;padding:.6rem;box-shadow:0 8px 24px #0008;width:15rem">' +
      `<input id="aw-email" type="email" placeholder="you@firm.com" style="${field}"/>` +
      `<input id="aw-pass" type="password" placeholder="password" style="${field}"/>` +
      '<div style="display:flex;gap:.4rem">' +
      `<button id="aw-go" style="${pill};background:#6528d7;border-color:#6528d7;color:#fff;flex:1;justify-content:center">${busy ? "Signing in…" : "Sign in"}</button>` +
      `<button id="aw-x" style="${pill};padding:.35rem .6rem">✕</button></div>` +
      (msg ? `<div style="font-size:11px;color:${/signed in/i.test(msg) ? "#86efac" : "#f0a0a0"}">${esc(msg)}</div>` : "") +
      "</div>";
    const emailEl = wrap.querySelector("#aw-email") as HTMLInputElement;
    const passEl = wrap.querySelector("#aw-pass") as HTMLInputElement;
    emailEl.focus();
    const go = async () => {
      const email = emailEl.value.trim();
      const password = passEl.value;
      if (!email || !password || busy) return;
      busy = true; msg = ""; render();
      const r = await signInWithPassword(email, password);
      busy = false;
      // success → onAuthChange re-renders as signed-in; failure shows the reason
      if (!r.ok) { msg = r.message; render(); }
    };
    (wrap.querySelector("#aw-go") as HTMLElement).addEventListener("click", () => void go());
    (wrap.querySelector("#aw-x") as HTMLElement).addEventListener("click", () => { open = false; dismissed = true; msg = ""; render(); });
    passEl.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void go(); });
    emailEl.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") passEl.focus(); });
  };

  onAuthChange((s) => {
    // A sign-in or sign-out (not a token refresh) clears ✕, so a later signed-out 401 may prompt again.
    const samePerson = (s?.user?.id ?? null) === (session?.user?.id ?? null);
    if (!samePerson) { dismissed = false; changing = false; notice = ""; }
    session = s;
    // The same person (a token refresh, or the password check's own re-sign-in): an open change form keeps what was
    // typed, and its outcome is rendered by the form itself.
    if (samePerson && changing) return;
    open = false; msg = ""; busy = false; render();
  });
  currentSession().then((s) => { session = s; render(); }).catch(() => render());

  // ponytail: debounce by checking state before opening; upgrade if event spam becomes an issue
  document.addEventListener("sentinel:signin-needed", () => {
    if (!open && !session && !dismissed) {
      open = true;
      msg = "";
      render();
    }
  });

  render();
  return wrap;
}
