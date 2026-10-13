// MA-7-11 - a Gaussian splat of the evidence pack, shown in the shared 3D world with Spark (SplatMesh({fileBytes})) and a transform gizmo.
// For looking only: a splat has no true scale and loses spherical harmonics, so dimensions come from scans. The matrix the gizmo leaves is
// the placement a contributor saves (evidence.ts saveSplatPlacement -> one splat:placed row on the ledger).
// The splat sits in a Y-flipped inner group, as the reality-capture viewer does (3DGS is Y-down); the matrix is the OUTER group's - the splat's
// flipped frame in the model's world - so a reader of the row applies the same flip first (stated in the 7-11 report).
// Spark's worker and wasm are untried in the published app's opaque-origin iframe (D-7-25): a one-gaussian probe starts first, and when it does
// not start in time the button says the splat shows in the local app only (amendment 32). Spark loads lazily, as the .3tz viewer's does.
import type * as OBC from "@thatopen/components"; // the runtime module loads with the viewer (showSplat), so this file imports cleanly where there is no DOM
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

/** How long the one-gaussian probe may take to start Spark's worker (amendment 32). */
export const SPLAT_PROBE_MS = 5000;
/** The words when Spark cannot start here (the published view): the splat shows in the local app. */
export const LOCAL_ONLY_WORDS = "splats show in the local app on this PC (this published view cannot start Spark's worker) — nothing was loaded";

/** A minimal 3DGS .ply (binary little-endian): `n` gaussians at the origin-ish, 14 floats each - x y z, f_dc_0..2, opacity, scale_0..2, rot_0..3. Pure; for the probe and the tests. */
export function tinySplatPly(n = 1): Uint8Array {
  const props = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity", "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"];
  const head = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\n${props.map((p) => `property float ${p}`).join("\n")}\nend_header\n`);
  const out = new Uint8Array(head.length + n * props.length * 4), dv = new DataView(out.buffer);
  out.set(head);
  for (let i = 0; i < n; i++) {
    const o = head.length + i * props.length * 4, f = (k: number, v: number) => dv.setFloat32(o + k * 4, v, true);
    f(0, (i % 100) * 0.01); f(1, Math.floor(i / 100) * 0.01); f(2, 0);   // x y z
    f(3, 0.5); f(4, 0.5); f(5, 0.5);                                      // f_dc: mid grey
    f(6, 2);                                                              // opacity (logit)
    f(7, -4); f(8, -4); f(9, -4);                                         // scale (log): a few millimetres
    f(10, 1); f(11, 0); f(12, 0); f(13, 0);                               // rot: identity (w x y z)
  }
  return out;
}

/** The part of Spark the probe uses (a test passes a stand-in). */
export interface SparkProbe { SplatMesh: new (o: { fileBytes: Uint8Array }) => { initialized: Promise<unknown>; dispose?: () => void } }
export type ProbeResult = { ok: true } | { ok: false; why: string };

/** Start Spark on a one-gaussian splat: ok when it initialised within `ms`, else why not (the words for the button). Not memoised - probeSpark is. */
export async function probeSparkWith(load: () => Promise<SparkProbe>, ms = SPLAT_PROBE_MS): Promise<ProbeResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = (async () => {
      const { SplatMesh } = await load();
      const mesh = new SplatMesh({ fileBytes: tinySplatPly(1) });
      await mesh.initialized;
      try { mesh.dispose?.(); } catch { /* the probe is thrown away */ }
    })();
    run.catch(() => {}); // a late failure after the timeout is not unhandled
    const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(new Error("timeout")), ms); });
    await Promise.race([run, late]);
    return { ok: true };
  } catch {
    return { ok: false, why: LOCAL_ONLY_WORDS };
  } finally { if (timer) clearTimeout(timer); }
}
let probed: Promise<ProbeResult> | null = null;
/** The probe against the installed Spark, once per page (the answer does not change while the page lives). */
export const probeSpark = (): Promise<ProbeResult> => (probed ??= probeSparkWith(() => import("@sparkjsdev/spark") as unknown as Promise<SparkProbe>));

export interface SplatShown {
  /** The placement now: the outer group's 4x4, column-major (three.js Matrix4 elements). */
  matrix(): number[];
  setMode(mode: "translate" | "rotate" | "scale"): void;
  dispose(): void;
}

/** Show `bytes` (a .ply) in the first world of `components`, at `opts.matrix` (the newest saved placement) or where the camera looks, with the gizmo on. Throws in words;
 *  nothing is left in the scene when it throws. One splat at a time is the caller's rule (dispose the old one first). */
export async function showSplat(components: OBC.Components, bytes: Uint8Array, opts: { matrix?: number[] | null } = {}): Promise<SplatShown> {
  const [{ SplatMesh, SparkRenderer }, OBCrt] = await Promise.all([import("@sparkjsdev/spark"), import("@thatopen/components")]);
  const world = [...(components.get(OBCrt.Worlds).list.values() as unknown as Iterable<any>)][0] as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!world?.scene?.three || !world?.renderer?.three || !world?.camera) throw new Error("the 3D view is not ready — open the model view first; nothing was loaded");
  const scene = world.scene.three as THREE.Scene, renderer = world.renderer.three as THREE.WebGLRenderer;
  const camera = (): THREE.Camera => world.camera.three ?? world.camera.threePersp;
  const controls = world.camera.controls;
  // splats draw in the one forward pass with the model (free occlusion), as the reality-capture viewer's forward path does; postproduction is put back on dispose
  const post = world.renderer.postproduction, postWas = !!post?.enabled;
  if (post && postWas) post.enabled = false;
  const spark = new SparkRenderer({ renderer, clipXY: 1.0 } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  scene.add(spark);
  const root = new THREE.Group(), flip = new THREE.Group();
  flip.rotation.x = Math.PI; // 3DGS is Y-down
  root.add(flip);
  const mesh = new SplatMesh({ fileBytes: bytes });
  flip.add(mesh);
  scene.add(root);
  const gizmo = new TransformControls(camera(), renderer.domElement);
  const helper = gizmo.getHelper();
  let done = false;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "w" || e.key === "W") gizmo.setMode("translate");
    else if (e.key === "e" || e.key === "E") gizmo.setMode("rotate");
    else if (e.key === "r" || e.key === "R") gizmo.setMode("scale");
  };
  const dispose = () => {
    if (done) return;
    done = true;
    window.removeEventListener("keydown", onKey);
    try { gizmo.detach(); scene.remove(helper); gizmo.dispose(); } catch { /* gone with the scene */ }
    try { scene.remove(root); mesh.dispose(); } catch { /* noop */ }
    try { scene.remove(spark); (spark as unknown as { dispose?: () => void }).dispose?.(); } catch { /* noop */ }
    if (post && postWas) post.enabled = true;
    if (controls) controls.enabled = true;
  };
  try { await mesh.initialized; }
  catch (e) { dispose(); throw new Error(`the splat could not be loaded (${(e as Error).message || "Spark refused it"}) — nothing was loaded`); }
  if (done) return { matrix: () => root.matrix.toArray(), setMode: () => {}, dispose }; // closed while loading
  if (opts.matrix && opts.matrix.length === 16) new THREE.Matrix4().fromArray(opts.matrix).decompose(root.position, root.quaternion, root.scale);
  else try { root.position.copy(controls.getTarget(new THREE.Vector3())); } catch { /* no controls: the origin */ }
  gizmo.attach(root);
  scene.add(helper);
  gizmo.addEventListener("dragging-changed", (e: any) => { if (controls) controls.enabled = !e.value; }); // eslint-disable-line @typescript-eslint/no-explicit-any
  window.addEventListener("keydown", onKey);
  return {
    matrix: () => { root.updateMatrix(); return root.matrix.toArray(); },
    setMode: (m) => gizmo.setMode(m),
    dispose,
  };
}
