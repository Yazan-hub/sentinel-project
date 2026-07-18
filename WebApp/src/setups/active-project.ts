import { getAppManager } from "../app";

/**
 * Active-project state — the single source of truth for "which project is the app scoped to".
 *
 * Before Phase 1 every panel read the project straight off the platform embedding context
 * (`getAppManager().client?.context?.projectId`), so the app could only ever show the one project
 * it was launched into. The projects hub + global switcher need an in-app override that every panel
 * honours, so that resolution moves here:
 *
 *     in-app override (localStorage)  →  platform-embedded project  →  "default"
 *
 * Panels call `activePid()` where they used to inline the platform read. Switching persists the
 * choice and fires `sentinel:project-changed` (+ direct subscribers) so open panels can refetch.
 */

const LS_KEY = "sentinel.activeProject";
const CHANGE_EVENT = "sentinel:project-changed";

type Listener = (key: string) => void;
const listeners = new Set<Listener>();

/** The project the platform launched us into — the fallback when nothing is chosen in-app. */
const platformKey = (): string | undefined =>
  getAppManager().client?.context?.projectId ?? undefined;

let override: string | null = (() => {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null; // private-mode / sandboxed iframe with storage blocked
  }
})();

/** The project key every panel should scope its data to. */
export const getActiveProjectKey = (): string => override ?? platformKey() ?? "default";

/** Drop-in replacement for the old inline `pid()` the panels used. */
export const activePid = (): string => getActiveProjectKey();

/** True once the user has explicitly picked a project in-app (vs. the platform default). */
export const hasProjectOverride = (): boolean => override != null;

/** Switch the whole app to another project. Persists the choice and notifies every listener. */
export const setActiveProjectKey = (key: string): void => {
  const next = (key || "").trim();
  if (!next || next === override) return;
  override = next;
  try {
    localStorage.setItem(LS_KEY, next);
  } catch {
    /* storage blocked — the choice still applies for this session via `override` */
  }
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key: next } }));
  } catch {
    /* CustomEvent unavailable — direct listeners below still fire */
  }
  for (const cb of listeners) {
    try {
      cb(next);
    } catch {
      /* isolate a bad listener so the rest still run */
    }
  }
};

/** Subscribe to project switches. Returns an unsubscribe fn. */
export const onActiveProjectChange = (cb: Listener): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
