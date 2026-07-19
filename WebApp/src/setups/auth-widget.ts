import { type Session } from "@supabase/supabase-js";
import { currentSession, sendEmailCode, verifyEmailCode, signOut, onAuthChange } from "./auth";

/**
 * Sign-in widget (Stage B) — a small, NON-BLOCKING floating pill (bottom-right). Uses a 6-DIGIT CODE
 * (email → code → verify), not a magic link: no redirect, so it works cleanly for the app embedded in the
 * That Open Platform. Signing in doesn't gate anything yet (reads still go through the bridge) — its job is
 * to prove auth + establish identity for memberships. Plain-DOM, iframe-safe.
 */
export function authWidget(opts: { anchor?: string } = {}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = (opts.anchor ?? "position:fixed;bottom:.6rem;right:.6rem") + ";z-index:1000;font:13px system-ui";

  let session: Session | null = null;
  let mode: "idle" | "email" | "code" = "idle";
  let email = "";
  let msg = "";
  let busy = false;

  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const pill =
    "border:1px solid #2c2c34;background:#16161ae6;backdrop-filter:blur(6px);color:#eee;border-radius:100px;padding:.35rem .75rem;cursor:pointer;box-shadow:0 4px 14px #0006";
  const box =
    "display:flex;gap:.35rem;align-items:center;background:#16161a;border:1px solid #2c2c34;border-radius:100px;padding:.25rem .3rem .25rem .75rem;box-shadow:0 4px 14px #0006";
  const field = "background:transparent;border:0;color:#eee;font:13px system-ui;outline:none";

  const note = () => (msg ? `<div style="margin-top:.35rem;font-size:11px;color:#9ca3af;text-align:right">${esc(msg)}</div>` : "");

  const render = () => {
    const who = session?.user?.email ?? null;

    if (who) {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}" title="Signed in — click to sign out"><span style="color:#34d17e">◕</span> ${esc(who)} · <span style="color:#9ca3af">Sign out</span></button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => void signOut());
      return;
    }

    if (mode === "idle") {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}">↪ Sign in</button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => { mode = "email"; msg = ""; render(); });
      return;
    }

    if (mode === "email") {
      wrap.innerHTML =
        `<div style="${box}">` +
        `<input id="aw-email" type="email" placeholder="you@firm.com" value="${esc(email)}" style="${field};width:12rem"/>` +
        `<button id="aw-send" style="${pill};background:#6528d7;border-color:#6528d7;color:#fff">${busy ? "Sending…" : "Send code"}</button>` +
        `<button id="aw-x" style="${pill};padding:.35rem .55rem" title="Cancel">✕</button></div>` + note();
      const input = wrap.querySelector("#aw-email") as HTMLInputElement;
      input.focus();
      const send = async () => {
        email = input.value.trim();
        if (!email || busy) return;
        busy = true; msg = ""; render();
        const r = await sendEmailCode(email);
        busy = false;
        if (r.ok) { mode = "code"; msg = "Enter the 6-digit code from your email."; } else { msg = r.message; }
        render();
      };
      (wrap.querySelector("#aw-send") as HTMLElement).addEventListener("click", () => void send());
      (wrap.querySelector("#aw-x") as HTMLElement).addEventListener("click", () => { mode = "idle"; msg = ""; render(); });
      input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void send(); });
      return;
    }

    // mode === "code"
    wrap.innerHTML =
      `<div style="${box}">` +
      `<input id="aw-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6" style="${field};width:6rem;letter-spacing:.25em;font:600 15px ui-monospace,Consolas,monospace"/>` +
      `<button id="aw-verify" style="${pill};background:#123a1e;border-color:#22c55e;color:#86efac">${busy ? "Checking…" : "Verify"}</button>` +
      `<button id="aw-back" style="${pill};padding:.35rem .55rem" title="Back">↩</button></div>` + note();
    const input = wrap.querySelector("#aw-code") as HTMLInputElement;
    input.focus();
    const verify = async () => {
      const code = input.value.trim();
      if (code.length < 6 || busy) return;
      busy = true; msg = "Checking…"; render();
      const r = await verifyEmailCode(email, code);
      busy = false;
      // success → onAuthChange re-renders as signed-in; on failure show the reason
      if (!r.ok) { msg = r.message; render(); }
    };
    (wrap.querySelector("#aw-verify") as HTMLElement).addEventListener("click", () => void verify());
    (wrap.querySelector("#aw-back") as HTMLElement).addEventListener("click", () => { mode = "email"; msg = ""; render(); });
    input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void verify(); });
  };

  onAuthChange((s) => { session = s; mode = "idle"; msg = ""; busy = false; render(); });
  currentSession().then((s) => { session = s; render(); }).catch(() => render());
  render();
  return wrap;
}
