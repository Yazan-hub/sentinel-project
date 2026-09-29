import { type Session } from "@supabase/supabase-js";
import { SERVICE_URL } from "../config";
import { currentSession, signInWithPassword, signOut, onAuthChange, changePassword, passwordProblem, MIN_PASSWORD } from "./auth";
import { myRoleRead } from "./my-role";
import { activePid, hasProjectOverride } from "./active-project";
import { initialOf, accountLine } from "./account-line";

/**
 * The account corner (spec 2026-09-29 account-corner) — an avatar in the app's top-right corner, clear of the viewer's
 * gizmo and toolbar. Signed in: the email's initial with a presence dot; it opens a menu (who, the role on the open
 * project, Change password, Sign out of this browser). Signed out: a Sign in button opening the sign-in card. The
 * password and sign-in forms open in the same card. Email + password auth (no SMTP, no redirect), iframe-safe plain DOM;
 * the auth logic is auth.ts's.
 */
type View = "closed" | "menu" | "password" | "signin";

const ICON: Record<string, string> = {
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (name: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const STYLE = `
.sx-acct{position:fixed;top:24px;right:26px;z-index:1000;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e5e7eb}
.sx-acct *{box-sizing:border-box}
.sx-acct button{font-family:inherit}
.sx-av{width:32px;height:32px;border-radius:50%;background:#6528d7;color:#fff;border:2px solid #16161a;box-shadow:0 0 0 1px #3a3a44,0 4px 12px rgba(0,0,0,.35);font:600 13px/1 system-ui;display:grid;place-items:center;cursor:pointer;position:relative;padding:0;transition:box-shadow .12s}
.sx-av:hover{box-shadow:0 0 0 1px #8b5cf6,0 4px 12px rgba(0,0,0,.35)}
.sx-av:focus-visible,.sx-signin:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
.sx-dot{position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #16161a}
.sx-signin{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:1px solid #2c2c34;background:rgba(22,22,26,.94);color:#e5e7eb;font:500 12.5px system-ui;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35)}
.sx-signin:hover{border-color:#3f3f4a;background:#1f1f27}
.sx-card{position:absolute;top:40px;right:0;width:272px;background:#16161a;border:1px solid #2c2c34;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.3);overflow:hidden;animation:sx-in .12s ease-out}
@keyframes sx-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.sx-head{display:flex;gap:10px;align-items:center;padding:14px 14px 12px}
.sx-head .sx-av{width:36px;height:36px;cursor:default;box-shadow:none;border:0;font-size:14px}
.sx-who{min-width:0}
.sx-email{font-weight:600;color:#f4f4f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sx-line{font-size:11.5px;color:#9ca3af;margin-top:2px}
.sx-sep{height:1px;background:#26262e;margin:4px 0}
.sx-list{padding:2px 0 6px}
.sx-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;background:none;border:0;color:#e5e7eb;font:13px system-ui;text-align:left;cursor:pointer}
.sx-item svg{color:#9ca3af;flex:none}
.sx-item:hover,.sx-item:focus-visible{background:#1f1f27;outline:none}
.sx-item.sx-danger:hover svg,.sx-item.sx-danger:focus-visible svg{color:#f87171}
.sx-form{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px;margin:0}
.sx-title{display:flex;align-items:center;gap:8px;font-weight:600;color:#f4f4f5;min-height:26px}
.sx-title .sx-grow{flex:1}
.sx-iconbtn{width:26px;height:26px;display:grid;place-items:center;border-radius:6px;border:0;background:none;color:#9ca3af;cursor:pointer;padding:0}
.sx-iconbtn:hover,.sx-iconbtn:focus-visible{background:#1f1f27;color:#e5e7eb;outline:none}
.sx-field{display:flex;flex-direction:column;gap:4px}
.sx-field span{font-size:11.5px;color:#9ca3af}
.sx-field input{height:34px;padding:0 10px;border-radius:8px;border:1px solid #2c2c34;background:#101014;color:#f4f4f5;font:13px system-ui;outline:none}
.sx-field input:focus{border-color:#6528d7;box-shadow:0 0 0 3px rgba(101,40,215,.25)}
.sx-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#c4c4cc;line-height:1.35}
.sx-check input{margin:2px 0 0;accent-color:#6528d7}
.sx-primary{height:34px;border-radius:8px;border:0;background:#6528d7;color:#fff;font:600 13px system-ui;cursor:pointer}
.sx-primary:hover{background:#7236e8}
.sx-primary:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
.sx-primary[aria-busy="true"]{opacity:.7;cursor:progress}
.sx-err{font-size:12px;color:#f87171}
.sx-toast{position:absolute;top:40px;right:0;width:max-content;max-width:300px;display:flex;gap:8px;align-items:flex-start;padding:9px 12px;border-radius:10px;background:#16161a;border:1px solid #2c2c34;box-shadow:0 12px 30px rgba(0,0,0,.45);font-size:12.5px;color:#e5e7eb;transition:opacity .4s}
.sx-toast svg{color:#34d399;flex:none;margin-top:1px}
`;

export function authWidget(opts: { anchor?: string } = {}): HTMLElement {
  if (!document.getElementById("sx-acct-style")) {
    const style = document.createElement("style");
    style.id = "sx-acct-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  const wrap = document.createElement("div");
  wrap.className = "sx-acct";
  if (opts.anchor) wrap.style.cssText = opts.anchor;

  let session: Session | null = null;
  let view: View = "closed";
  let msg = "";          // the open form's refusal, in words
  let busy = false;
  let dismissed = false; // the sign-in card was closed: a signed-out 401 (the Issues feed's, every 3 s) must not reopen it
  let formEmail = "";    // kept across a failed sign-in's re-render
  let toast = "";
  let toastTimer: number | undefined;
  let role: { role: string; read: boolean } | null = null;
  let roleKey: string | null = null;

  const esc = (s?: string | null) =>
    (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const q = <T extends HTMLElement = HTMLElement>(id: string) => wrap.querySelector("#" + id) as T | null;

  const avatar = (who: string) =>
    `<button class="sx-av" id="sx-av" type="button" aria-haspopup="menu" aria-expanded="${view === "menu"}" title="${esc(who)}" aria-label="Account — ${esc(who)}">` +
    `${esc(initialOf(who))}<span class="sx-dot" aria-hidden="true"></span></button>`;

  const menuCard = (who: string) =>
    '<div class="sx-card" role="menu" aria-label="Account" id="sx-menu">' +
    `<div class="sx-head"><div class="sx-av" aria-hidden="true">${esc(initialOf(who))}</div>` +
    `<div class="sx-who"><div class="sx-email" title="${esc(who)}">${esc(who)}</div><div class="sx-line" id="sx-line">${esc(accountLine(role, roleKey))}</div></div></div>` +
    '<div class="sx-sep"></div><div class="sx-list">' +
    `<button class="sx-item" role="menuitem" id="sx-pw" type="button">${icon("key")}Change password</button>` +
    '<div class="sx-sep"></div>' +
    `<button class="sx-item sx-danger" role="menuitem" id="sx-out" type="button">${icon("logout")}Sign out of this browser</button>` +
    "</div></div>";

  const passwordCard = (who: string) =>
    '<div class="sx-card" role="dialog" aria-label="Change password"><form class="sx-form" id="sx-pwform" novalidate>' +
    `<div class="sx-title"><button type="button" class="sx-iconbtn" id="sx-back" aria-label="Back to the account menu">${icon("back")}</button>Change password</div>` +
    `<input type="text" autocomplete="username" value="${esc(who)}" hidden>` +
    '<label class="sx-field"><span>Current password</span><input id="sx-cur" type="password" autocomplete="current-password"></label>' +
    `<label class="sx-field"><span>New password</span><input id="sx-new" type="password" autocomplete="new-password" placeholder="At least ${MIN_PASSWORD} characters"></label>` +
    '<label class="sx-field"><span>Repeat the new password</span><input id="sx-new2" type="password" autocomplete="new-password"></label>' +
    '<label class="sx-check"><input id="sx-others" type="checkbox" checked>Sign out my other sessions — other browsers and Sentinel in Revit</label>' +
    (msg ? `<div class="sx-err" role="alert">${esc(msg)}</div>` : "") +
    `<button class="sx-primary" type="submit" aria-busy="${busy}">${busy ? "Changing…" : "Change password"}</button>` +
    "</form></div>";

  const signinCard = () =>
    '<div class="sx-card" role="dialog" aria-label="Sign in"><form class="sx-form" id="sx-inform" novalidate>' +
    `<div class="sx-title"><span class="sx-grow">Sign in to Sentinel</span><button type="button" class="sx-iconbtn" id="sx-close" aria-label="Close">${icon("close")}</button></div>` +
    `<label class="sx-field"><span>Email</span><input id="sx-email" type="email" autocomplete="username" placeholder="you@firm.com" value="${esc(formEmail)}"></label>` +
    '<label class="sx-field"><span>Password</span><input id="sx-pass" type="password" autocomplete="current-password"></label>' +
    (msg ? `<div class="sx-err" role="alert">${esc(msg)}</div>` : "") +
    `<button class="sx-primary" type="submit" aria-busy="${busy}">${busy ? "Signing in…" : "Sign in"}</button>` +
    "</form></div>";

  const render = () => {
    const who = session?.user?.email ?? null;
    let html = who ? avatar(who) : `<button class="sx-signin" id="sx-open" type="button">${icon("user", 15)}Sign in</button>`;
    if (who && view === "menu") html += menuCard(who);
    else if (who && view === "password") html += passwordCard(who);
    else if (!who && view === "signin") html += signinCard();
    else if (toast) html += `<div class="sx-toast" role="status" id="sx-toast">${icon("check")}<span>${esc(toast)}</span></div>`;
    wrap.innerHTML = html;
    wire();
  };

  const focusFirstItem = () => (wrap.querySelector(".sx-item") as HTMLElement | null)?.focus();
  const focusTrigger = () => (q("sx-av") ?? q("sx-open"))?.focus();

  /** Close whatever card is open; closing the sign-in card is remembered (a background 401 must not reopen it). */
  const closeView = (refocus: boolean) => {
    if (view === "closed") return;
    if (view === "signin") dismissed = true;
    view = "closed"; msg = ""; render();
    if (refocus) focusTrigger();
  };

  // The role on the open project, read when the menu opens — never a guessed role (accountLine).
  const readRole = async () => {
    const key = hasProjectOverride() ? activePid() : null;
    roleKey = key; role = null;
    const line = () => { const el = q("sx-line"); if (el) el.textContent = accountLine(role, roleKey); };
    line();
    if (!key) return;
    const r = await myRoleRead(SERVICE_URL.replace(/\/$/, ""), key);
    if (roleKey !== key) return; // the project changed meanwhile
    role = r; line();
  };

  const showToast = (text: string) => {
    toast = text; view = "closed"; render();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      const t = q("sx-toast");
      if (t) t.style.opacity = "0";
      window.setTimeout(() => { toast = ""; if (view === "closed") render(); }, 400);
    }, 6000);
  };

  const changeSubmit = async () => {
    if (busy) return;
    const cur = q<HTMLInputElement>("sx-cur"), nxt = q<HTMLInputElement>("sx-new"), again = q<HTMLInputElement>("sx-new2"), others = q<HTMLInputElement>("sx-others");
    if (!cur || !nxt || !again || !others) return;
    const [c, n, signOutOthers] = [cur.value, nxt.value, others.checked]; // the busy render rebuilds the form
    const problem = passwordProblem(c, n, again.value);
    if (problem) { msg = problem; render(); q("sx-cur")?.focus(); return; }
    busy = true; msg = ""; render();
    const r = await changePassword(c, n, signOutOthers);
    busy = false;
    if (r.ok) { showToast(r.message); focusTrigger(); return; }
    msg = r.message;
    if (view === "password") { render(); q("sx-cur")?.focus(); }
  };

  const signinSubmit = async () => {
    if (busy) return;
    const email = (q<HTMLInputElement>("sx-email")?.value ?? "").trim();
    const password = q<HTMLInputElement>("sx-pass")?.value ?? "";
    formEmail = email;
    if (!email || !password) { msg = !email ? "Enter your email." : "Enter your password."; render(); q(!email ? "sx-email" : "sx-pass")?.focus(); return; }
    busy = true; msg = ""; render();
    const r = await signInWithPassword(email, password);
    busy = false;
    // Success: onAuthChange re-renders as signed in. A refusal is said in the card.
    if (!r.ok) { msg = r.message; if (view === "signin") { render(); q("sx-pass")?.focus(); } }
  };

  const wire = () => {
    q("sx-av")?.addEventListener("click", () => {
      if (view === "menu") { closeView(true); return; }
      view = "menu"; msg = ""; toast = ""; render(); focusFirstItem(); void readRole();
    });
    q("sx-open")?.addEventListener("click", () => {
      if (view === "signin") { closeView(true); return; }
      view = "signin"; msg = ""; render(); q("sx-email")?.focus();
    });
    q("sx-pw")?.addEventListener("click", () => { view = "password"; msg = ""; render(); q("sx-cur")?.focus(); });
    q("sx-out")?.addEventListener("click", () => { view = "closed"; render(); void signOut(); });
    q("sx-back")?.addEventListener("click", () => { view = "menu"; msg = ""; render(); focusFirstItem(); void readRole(); });
    q("sx-close")?.addEventListener("click", () => closeView(true));
    q("sx-pwform")?.addEventListener("submit", (e) => { e.preventDefault(); void changeSubmit(); });
    q("sx-inform")?.addEventListener("submit", (e) => { e.preventDefault(); void signinSubmit(); });
    // Arrow keys move through the menu's items (the menu pattern).
    q("sx-menu")?.addEventListener("keydown", (e) => {
      const items = [...wrap.querySelectorAll<HTMLElement>(".sx-item")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const k = (e as KeyboardEvent).key;
      const next = k === "ArrowDown" ? (i + 1) % items.length : k === "ArrowUp" ? (i - 1 + items.length) % items.length : k === "Home" ? 0 : k === "End" ? items.length - 1 : -1;
      if (next >= 0) { e.preventDefault(); items[next]?.focus(); }
    });
  };

  // Escape closes the open card and returns focus to its trigger; a press outside the corner closes it.
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && view !== "closed") closeView(true); });
  document.addEventListener("pointerdown", (e) => { if (view !== "closed" && !wrap.contains(e.target as Node)) closeView(false); }, true);

  onAuthChange((s) => {
    const samePerson = (s?.user?.id ?? null) === (session?.user?.id ?? null);
    session = s;
    // The same person (a token refresh, or the password check's own re-sign-in): an open card keeps what was typed.
    if (samePerson && view !== "closed") return;
    // A sign-in or a sign-out clears the dismissal, so a later signed-out 401 may prompt again.
    if (!samePerson) { dismissed = false; toast = ""; role = null; roleKey = null; }
    view = "closed"; msg = ""; busy = false; render();
  });
  currentSession().then((s) => { session = s; render(); }).catch(() => render());

  // A panel's signed-out 401: offer the sign-in card, unless it was closed (and without taking the focus).
  document.addEventListener("sentinel:signin-needed", () => {
    if (view === "closed" && !session && !dismissed) { view = "signin"; msg = ""; render(); }
  });

  render();
  return wrap;
}
