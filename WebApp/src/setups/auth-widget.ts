import { type Session } from "@supabase/supabase-js";
import { currentSession, signInWithMagicLink, signOut, onAuthChange } from "./auth";

/**
 * Sign-in widget (Stage B) — a small, NON-BLOCKING floating pill (bottom-right). It does not gate the app:
 * signing in doesn't change what you can see yet (reads still go through the bridge). Its job is to prove
 * the magic-link auth flow works end-to-end and to establish an identity we can attach to memberships.
 * Making sign-in mandatory + switching reads to RLS is Stage C. Plain-DOM, iframe-safe (no window.prompt).
 */
export function authWidget(opts: { anchor?: string } = {}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = (opts.anchor ?? "position:fixed;bottom:.6rem;right:.6rem") + ";z-index:1000;font:13px system-ui";

  let session: Session | null = null;
  let mode: "idle" | "form" | "sent" = "idle";
  let msg = "";

  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
  const pill =
    "border:1px solid #2c2c34;background:#16161ae6;backdrop-filter:blur(6px);color:#eee;border-radius:100px;padding:.35rem .75rem;cursor:pointer;box-shadow:0 4px 14px #0006";

  const render = () => {
    const email = session?.user?.email ?? null;

    if (email) {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}" title="Signed in — click to sign out"><span style="color:#34d17e">◕</span> ${esc(email)} · <span style="color:#9ca3af">Sign out</span></button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => void signOut());
      return;
    }

    if (mode === "idle") {
      wrap.innerHTML = `<button id="aw-pill" style="${pill}">↪ Sign in</button>`;
      (wrap.querySelector("#aw-pill") as HTMLElement).addEventListener("click", () => { mode = "form"; msg = ""; render(); });
      return;
    }

    if (mode === "form") {
      wrap.innerHTML =
        '<div style="display:flex;gap:.35rem;align-items:center;background:#16161a;border:1px solid #2c2c34;border-radius:100px;padding:.25rem .3rem .25rem .75rem;box-shadow:0 4px 14px #0006">' +
        '<input id="aw-email" type="email" placeholder="you@firm.com" style="background:transparent;border:0;color:#eee;font:13px system-ui;outline:none;width:12rem"/>' +
        `<button id="aw-send" style="${pill};background:#6528d7;border-color:#6528d7;color:#fff">Send link</button>` +
        '<button id="aw-x" style="' + pill + ';padding:.35rem .55rem" title="Cancel">✕</button></div>' +
        (msg ? `<div style="margin-top:.35rem;font-size:11px;color:#9ca3af;text-align:right">${esc(msg)}</div>` : "");
      const input = wrap.querySelector("#aw-email") as HTMLInputElement;
      input.focus();
      const send = async () => {
        const em = input.value.trim();
        if (!em) return;
        msg = "Sending…"; render();
        const r = await signInWithMagicLink(em);
        if (r.ok) { mode = "sent"; msg = r.message; } else { mode = "form"; msg = r.message; }
        render();
      };
      (wrap.querySelector("#aw-send") as HTMLElement).addEventListener("click", () => void send());
      (wrap.querySelector("#aw-x") as HTMLElement).addEventListener("click", () => { mode = "idle"; msg = ""; render(); });
      input.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void send(); });
      return;
    }

    // sent
    wrap.innerHTML =
      `<div style="background:#16161a;border:1px solid #22c55e;border-radius:12px;padding:.55rem .75rem;color:#86efac;font-size:12px;max-width:16rem;box-shadow:0 4px 14px #0006">✓ ${esc(msg)}</div>`;
  };

  // React to sign-in/out (including the magic-link redirect landing back on this page).
  onAuthChange((s) => { session = s; mode = "idle"; msg = ""; render(); });
  currentSession().then((s) => { session = s; render(); }).catch(() => render());
  render();
  return wrap;
}
