// What a refused or stale workspace call leaves to say (shared by the block editors and the naming block; no other imports, so no cycle).
import type { PaneCtx } from "./workspace-page"; // type-only

/** The text a refused or stale call leaves to show: "" when the project or document changed meanwhile (the answer is no longer this page's), else the bridge's words or the fallback. */
export function refusal(ctx: PaneCtx, fallback: string): string {
  const now = ctx.ws.state();
  return now.key !== ctx.st.key || !now.doc || now.doc.id !== ctx.st.doc?.id ? "" : now.message || fallback;
}
