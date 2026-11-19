// UX slice 3 (docs/ux/web-words.md): every string in the web app and bridge that still uses a glossary word.
// Most were changed; what is left is listed in src/ux-words-left.json on purpose (stored or hashed text, codes,
// format names, AI/agent text). src/ux-words.test.ts fails when a string outside that list appears.
// `node scripts/ux-words.mjs --write` rewrites the list after a reviewed change.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEBAPP = fileURLToPath(new URL("..", import.meta.url));
export const LIST = join(WEBAPP, "src", "ux-words-left.json");
const WORD = /\b(changesets?|ledger|gates?|rulesets?|contract@|artefacts?|holding area|IDS|MIDP|TIDP|CDE|sha-?256|sha|hash(?:es)?|bridge|token|BCF|governed|containers?|lod_state)\b/i;
const SEG = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`\n]*)`|>([^<>{}\n]{3,})</g;
const SKIP_LINE = /^\s*(import |export \* |using |#|\/\/|\*|\/\*)|console\.(log|debug)|require\(/;
const CODEISH = /^[\w./:@#?=&%${}-]+$/; // paths, ids, keys, routes: no spaces
const SKIP_DIRS = new Set(["node_modules", "fixtures", "dist", "vendor", "__snapshots__", "obj", "bin"]);
// Web app and bridge (slice 3); the Revit add-in's code, windows and F1 help text (slice 4).
const BASES = [["src", /\.(ts|mjs)$/], ["bridge", /\.(ts|mjs)$/], ["../SentinelAddin", /(\.cs|\.xaml|^content\.json)$/]];

function* sources(dir, ext) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) yield* sources(p, ext); continue; }
    if (ext.test(name) && !name.includes(".test.") && !name.endsWith(".d.ts")) yield p;
  }
}

/** "file :: text" for every candidate string, sorted and unique. */
export function wordStrings() {
  const out = new Set();
  for (const [base, ext] of BASES) {
    for (const p of sources(join(WEBAPP, base), ext)) {
      const rel = relative(WEBAPP, p).replace(/\\/g, "/");
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        if (SKIP_LINE.test(line) || !WORD.test(line)) continue;
        for (const m of line.matchAll(SEG)) {
          const s = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim();
          if (!WORD.test(s) || CODEISH.test(s) || !s.includes(" ")) continue;
          out.add(`${rel} :: ${s.slice(0, 220)}`);
        }
      }
    }
  }
  return [...out].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--write")) {
  const all = wordStrings();
  writeFileSync(LIST, JSON.stringify(all, null, 1) + "\n");
  console.log(`${all.length} strings written to ${relative(WEBAPP, LIST)}`);
}
