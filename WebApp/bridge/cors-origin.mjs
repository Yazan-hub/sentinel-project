// The origin the bridge echoes in Access-Control-Allow-Origin, or "" to refuse. Pure.
//
// Since 2026-09 the That Open platform runs apps in a sandboxed frame without allow-same-origin, so every call
// the Sentinel app makes carries `Origin: null` — the same value any sandboxed page, file:// page or data: URL
// sends. `null` is therefore accepted only when the browser-set Referer names an allowlisted origin: a page
// cannot forge its Referer, so a sandboxed page elsewhere still gets nothing.
const originOf = (url) => {
  try { return new URL(url).origin; } catch { return null; }
};

export function corsOrigin(origin, referer, { allow = [], wildcard = false } = {}) {
  if (wildcard) return origin || "*";
  if (!origin) return "";
  if (allow.includes(origin)) return origin;
  if (origin === "null" && referer && allow.includes(originOf(referer))) return "null";
  return "";
}
