import { type Session } from "@supabase/supabase-js";
import { currentSession, signInWithPassword, signOut, onAuthChange } from "./auth";

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

  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const pill =
    "border:1px solid #2c2c34;background:#16161ae6;backdrop-filter:blur(6px);color:#eee;border-radius:100px;padding:.35rem .75rem;cursor:pointer;box-shadow:0 4px 14px #0006";
  const field =
    "background:#101014;border:1px solid #2c2c34;border-radius:.4rem;color:#eee;font:13px system-ui;outline:none;padding:.4rem .55rem";

  const render = () => {
    const who = session?.user?.email ?? null;

    if (who) {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}" title="Signed in — click to sign out"><span style="color:#34d17e">◕</span> ${esc(who)} · <span style="color:#9ca3af">Sign out</span></button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => void signOut());
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
    (wrap.querySelector("#aw-x") as HTMLElement).addEventListener("click", () => { open = false; msg = ""; render(); });
    passEl.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void go(); });
    emailEl.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") passEl.focus(); });
  };

  onAuthChange((s) => { session = s; open = false; msg = ""; busy = false; render(); });
  currentSession().then((s) => { session = s; render(); }).catch(() => render());

  // ponytail: debounce by checking state before opening; upgrade if event spam becomes an issue
  document.addEventListener("sentinel:signin-needed", () => {
    if (!open && !session) {
      open = true;
      msg = "";
      render();
    }
  });

  render();
  return wrap;
}
