// sentinel-core/adapter/clash-worker — run the CPU-bound clash pass OFF the main thread.
//
// The item-gathering (getBoxes/getItemsData) is already worker-backed inside fragments and must stay on the
// main thread (it touches the FragmentsManager); what blocks the UI on dense models is the pure sweep-and-prune
// compare. This module ships that compare as an INLINE blob worker — a source STRING → Blob → object URL →
// classic Worker. NO `new URL("./x.ts", import.meta.url)` and NO { type: "module" }: both build paths emit a
// single IIFE bundle.js (see vite.config.js lib/iife), so a separate worker chunk can't be emitted, and the
// platform's sandboxed iframe rejects import.meta.url worker URLs (Invalid URL). Same proven form as
// setups/reality-capture/lib/point-tile-plugin.ts.
//
// The blob below is a BYTE-FAITHFUL copy of the pure core in ../clash.ts (boxesClash → findClashes →
// dedupeClashes → computeClashRun). It is duplicated, not derived via `.toString()`, because the production
// build minifies and would mangle the helper references a serialized function body depends on. clash.ts stays
// the canonical, unit-tested algorithm; KEEP THIS COPY IN LOCK-STEP with it. The sync fallback path below
// calls the real clash.ts, so tests and non-DOM environments always exercise the canonical version.

import { computeClashRun, type ClashItem, type ClashComputation } from "../clash";

// ---- inline worker source (faithful copy of ../clash.ts core) --------------------------------------------
const WORKER_SRC = `
function boxesClash(a, b, tol) {
  var ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  var oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  var oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (ox <= tol || oy <= tol || oz <= tol) return null;
  return { overlap: [ox, oy, oz], volume: ox * oy * oz };
}
function keyOf(i) { return i.guid ? ("g:" + i.guid) : (i.modelId + ":" + i.localId); }
function clashSignature(a, b) {
  var ka = keyOf(a), kb = keyOf(b);
  return ka < kb ? (ka + "|" + kb) : (kb + "|" + ka);
}
function findClashes(setA, setB, tol, cap) {
  if (tol == null) tol = 0.02;
  if (cap == null) cap = 20000;
  var a = setA.slice().sort(function (p, q) { return p.box.min[0] - q.box.min[0]; });
  var b = setB.slice().sort(function (p, q) { return p.box.min[0] - q.box.min[0]; });
  var out = [];
  var start = 0;
  for (var ai = 0; ai < a.length; ai++) {
    var ia = a[ai];
    while (start < b.length && b[start].box.max[0] <= ia.box.min[0] + tol) start++;
    for (var j = start; j < b.length; j++) {
      var ib = b[j];
      if (ib.box.min[0] >= ia.box.max[0] - tol) break;
      var r = boxesClash(ia.box, ib.box, tol);
      if (r) {
        out.push({ id: clashSignature(ia, ib), a: ia, b: ib, overlap: r.overlap, volume: r.volume });
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}
function dedupeClashes(clashes, known) {
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < clashes.length; i++) {
    var c = clashes[i];
    if (known.has(c.id) || seen[c.id]) continue;
    seen[c.id] = 1;
    out.push(c);
  }
  return out;
}
function computeClashRun(sets, known, tol) {
  if (tol == null) tol = 0.02;
  var all = [];
  if (sets.length >= 2) {
    for (var i = 0; i < sets.length; i++)
      for (var j = i + 1; j < sets.length; j++)
        all.push.apply(all, findClashes(sets[i], sets[j], tol));
  } else if (sets[0] && sets[0].length) {
    var self = findClashes(sets[0], sets[0], tol);
    for (var k = 0; k < self.length; k++)
      if (self[k].a.localId !== self[k].b.localId) all.push(self[k]);
  }
  var clashes = dedupeClashes(all, known).sort(function (a, b) { return b.volume - a.volume; });
  return { total: all.length, clashes: clashes };
}
self.onmessage = function (e) {
  var d = e.data;
  var known = new Set(d.known);
  var res = computeClashRun(d.sets, known, d.tol);
  self.postMessage({ id: d.id, total: res.total, clashes: res.clashes });
};
`;

// ---- single-worker RPC -----------------------------------------------------------------------------------
let _blobURL: string | null = null;
let _worker: Worker | null = null;
let _nextId = 0;
const _pending = new Map<number, (r: ClashComputation) => void>();

function workerAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof Blob !== "undefined";
}

function getWorker(): Worker {
  if (_worker) return _worker;
  _blobURL ??= URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  const w = new Worker(_blobURL); // classic blob worker (no import.meta.url, no module type)
  w.onmessage = (e: MessageEvent<{ id: number } & ClashComputation>) => {
    const resolve = _pending.get(e.data.id);
    _pending.delete(e.data.id);
    resolve?.({ total: e.data.total, clashes: e.data.clashes });
  };
  // A worker crash must not hang callers — reject everyone to the sync path on the next call.
  w.onerror = () => { _worker = null; for (const r of _pending.values()) r({ total: -1, clashes: [] }); _pending.clear(); };
  _worker = w;
  return w;
}

/**
 * Run the clash compare over already-gathered item sets, off the main thread when possible. Falls back to the
 * synchronous canonical `computeClashRun` (../clash.ts) when Web Workers are unavailable (Node/vitest, older
 * sandboxes) or if a worker crashes mid-run — so behaviour is identical, only the thread differs.
 */
export function runClashInWorker(sets: ClashItem[][], known: ReadonlySet<string>, tol = 0.02): Promise<ClashComputation> {
  if (!workerAvailable()) return Promise.resolve(computeClashRun(sets, known, tol));
  return new Promise<ClashComputation>((resolve) => {
    const id = _nextId++;
    _pending.set(id, (r) => {
      // total === -1 is the worker-crash sentinel from onerror → recompute synchronously so the run still completes.
      if (r.total < 0) resolve(computeClashRun(sets, known, tol));
      else resolve(r);
    });
    try {
      getWorker().postMessage({ id, sets, known: [...known], tol });
    } catch {
      _pending.delete(id);
      resolve(computeClashRun(sets, known, tol)); // posting failed (e.g. structured-clone edge) → sync
    }
  });
}
