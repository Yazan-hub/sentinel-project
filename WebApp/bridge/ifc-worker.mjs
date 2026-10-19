// Large-model benchmark 2026-10 (docs/testing/LARGE_MODEL_BENCHMARK_2026-10.md): the IFC jobs that hold a large model's
// thread for tens of seconds — IFC → .frag (24 s) and elements + psets (30 s) on a 77 MB hospital IFC — run here, in a
// worker thread, never on the bridge's own. On the bridge's thread they stopped it answering anyone (GET /health took
// 34 s during one upload). Same pattern as doc-parse-worker.mjs. workerData: { job: "frag" | "extract", bytes, opts }.
// Posts { result } or { error: { message, status? } }.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

/** Run one IFC job in a fresh worker; resolves with its result, rejects with its error (status kept). */
export function runIfcJob(job, bytes, opts) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { job, bytes, opts } });
    w.once("message", (m) => (m.error ? reject(Object.assign(new Error(m.error.message), m.error.status ? { status: m.error.status } : {})) : resolve(m.result)));
    w.once("error", reject);
    // After a message this is a no-op; without one (a crash, out of memory) it is the answer.
    w.once("exit", (code) => reject(new Error(`the IFC worker stopped before answering (exit ${code})`)));
  });
}

if (!isMainThread && workerData?.job) {
  const { job, bytes, opts } = workerData;
  try {
    if (job !== "frag" && job !== "extract") throw new Error(`unknown IFC job "${job}"`);
    const result = job === "frag"
      ? await (await import("./ifc-to-frag.mjs")).convertHere(bytes)
      : await (await import("./ifc-extract.mjs")).extractHere(bytes, opts);
    parentPort.postMessage({ result });
  } catch (e) {
    parentPort.postMessage({ error: { message: String(e?.message || e), ...(e?.status ? { status: e.status } : {}) } });
  }
}
