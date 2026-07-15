// Central runtime config. For a pilot, point the app at a hosted Sentinel service by setting
// VITE_SENTINEL_SERVICE in a .env file (see .env.example). Defaults to a local service on :4100.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env ?? {};

/** Base URL of the Sentinel service (BCF + projects + RFIs + tenders + packs). */
export const SERVICE_URL: string = String(env.VITE_SENTINEL_SERVICE || "http://localhost:4100").replace(/\/$/, "");
