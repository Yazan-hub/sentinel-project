// The origin the bridge echoes in Access-Control-Allow-Origin, or "" to refuse. Pure.
//
// Since 2026-09 the That Open platform runs apps in a sandboxed frame without allow-same-origin, so every call
// the Sentinel app makes carries `Origin: null` — the same value any sandboxed page, file:// page or data: URL
// sends. `null` is therefore accepted only when the browser-set Referer names an allowlisted origin: a page
// cannot forge its Referer, so a sandboxed page elsewhere still gets nothing.
const originOf = (url) => {
  try { return new URL(url).origin; } catch { return null; }
};

// With the auth gate armed (`armed`), `null` is accepted from any page: every route then needs a bearer
// (a Supabase JWT or BCF_TOKEN) that a browser never attaches on its own, so reading a response needs a stolen
// credential, not a forged origin — and the platform frame loads with referrerPolicy no-referrer, so a
// Referer cannot be relied on there.
export function corsOrigin(origin, referer, { allow = [], wildcard = false, armed = false } = {}) {
  if (wildcard) return origin || "*";
  if (!origin) return "";
  if (allow.includes(origin)) return origin;
  if (origin === "null" && (armed || (referer && allow.includes(originOf(referer))))) return "null";
  return "";
}
