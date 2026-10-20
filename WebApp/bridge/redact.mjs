// AI privacy (spec docs/superpowers/specs/2026-10-20-ai-privacy-controls-design.md §3): the names Sentinel holds — project,
// client, address, people — masked in what a model reads and mapped back in what it sends. Pure and zero-dependency, so the
// stdio MCP server and the bridge's AI gateway share it. The tokens are the bridge's (ai-policy.mjs: an HMAC under the
// bridge's secret): this module only applies a list, it makes no token and holds no secret.

export const MIN_TERM = 3;   // a shorter term would mask ordinary words
export const MAX_TERM = 200; // a longer one is no name; the alternation's cost grows with each term's length
export const TOKEN = /^[A-Z]+_[A-Z2-7]{8}$/;
// The token kinds themselves are never terms: a person who calls themselves "Project" would rewrite every token.
const KIND_WORDS = new Set(["project", "client", "address", "person", "office"]);
// Bounded parts (RFC 5321 lengths): an unbounded local part made the scan quadratic on a long run of letters (review M2).
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
export const EMAIL_MASK = "[e-mail]";
const WITHHELD = "[name]";
// Folded before matching (review L1): one Unicode form, no soft hyphen or zero-width character inside a name, and one dash
// and one apostrophe — "José", "As­ter" and "O’Brien" match their plain spellings. The folded text is what goes on.
const INVISIBLE = /[­​-‏⁠-⁤﻿]/g;
const fold = (s) => s.normalize("NFC").replace(INVISIBLE, "").replace(/[‐-―−]/g, "-").replace(/[‘’ʼ]/g, "'");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => fold(s).trim().replace(/\s+/g, " ").toLowerCase();

/**
 * {mask, unmask, maskDeep, unmaskDeep} for terms [{text, token}]. mask: every term, case-insensitive, as a whole word (no
 * letter or digit either side), longest first, any run of white space matching any other; then every other e-mail address
 * → "[e-mail]". A match whose token is not found again (a case fold the lookup does not share) is "[name]", never itself.
 * unmask: each token → the first text listed with it (the bridge lists a project's key before its name and a person's
 * e-mail before their name, so a token passed back as an argument becomes the key or the e-mail); {json: true} writes the
 * text JSON-escaped, for a reply that is parsed as JSON afterwards (a name must not add structure to it, review M4).
 */
export function redactor(terms = []) {
  const byText = new Map(), back = new Map();
  for (const t of Array.isArray(terms) ? terms : []) {
    if (typeof t?.text !== "string" || typeof t?.token !== "string" || !TOKEN.test(t.token)) continue;
    const k = norm(t.text);
    if (k.length < MIN_TERM || k.length > MAX_TERM || KIND_WORDS.has(k)) continue;
    if (!byText.has(k)) byText.set(k, t.token);
    if (!back.has(t.token)) back.set(t.token, t.text.trim());
  }
  // ponytail: one alternation, longest first — about O(text × longest term); a trie if an office's list reaches thousands.
  const keys = [...byText.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map((k) => esc(k).replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{N}])`, "giu") : null;
  const tokens = [...back.keys()];
  const tokRe = tokens.length ? new RegExp(`(?<![A-Za-z0-9_])(?:${tokens.join("|")})(?![A-Za-z0-9_])`, "g") : null;
  const mask = (s) => {
    if (typeof s !== "string") return s;
    const t = fold(s);
    return (re ? t.replace(re, (m) => byText.get(norm(m)) ?? WITHHELD) : t).replace(EMAIL, EMAIL_MASK);
  };
  const unmask = (s, { json = false } = {}) => (typeof s === "string" && tokRe
    ? s.replace(tokRe, (t) => { const v = back.get(t); return v === undefined ? t : json ? JSON.stringify(v).slice(1, -1) : v; }) : s);
  const deep = (f, keysToo) => {
    const walk = (v) => {
      if (typeof v === "string") return f(v);
      if (Array.isArray(v)) return v.map(walk);
      if (!v || typeof v !== "object") return v;
      // Two keys that mask alike stay two keys ("PROJECT_… #2"), never one value silently dropped (review M4).
      const used = new Set();
      return Object.fromEntries(Object.entries(v).map(([k, x]) => {
        let key = keysToo ? f(k) : k;
        for (let n = 2; used.has(key); n++) key = `${keysToo ? f(k) : k} #${n}`;
        used.add(key);
        return [key, walk(x)];
      }));
    };
    return walk;
  };
  return { mask, unmask, maskDeep: deep(mask, true), unmaskDeep: deep(unmask, false), size: byText.size };
}
