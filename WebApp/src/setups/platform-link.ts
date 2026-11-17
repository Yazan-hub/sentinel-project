/**
 * The Sentinel project that opens by itself when the app starts inside a platform project: the one a lead linked to it
 * (Settings ▸ General ▸ Platform project, stored as settings.platform_project_id). The published app cannot remember a
 * choice between visits (the platform's sandbox keeps no storage), so without a link every visit starts on the list.
 * Two claimants are named, never guessed between; an archived project never opens by itself.
 */
export interface LinkRow {
  key: string;
  settings?: { platform_project_id?: string | null; archived?: boolean } | null;
}

export function linkedProject(rows: LinkRow[], platformId: string | undefined): { key?: string; conflict?: string[] } {
  if (!platformId) return {};
  const hits = rows.filter((p) => !p.settings?.archived && p.settings?.platform_project_id === platformId).map((p) => p.key);
  return hits.length === 1 ? { key: hits[0] } : hits.length > 1 ? { conflict: hits } : {};
}

/** F-RUN-15: the CDE board lists the platform's deliveries only on the Sentinel project linked to the platform project
 *  the app runs in (or that project itself); on any other project they were judged by another contract. */
export const showsPlatformDeliveries = (rows: LinkRow[], key: string, platformId: string | undefined): boolean =>
  !!platformId && (key === platformId || rows.some((p) => p.key === key && p.settings?.platform_project_id === platformId));
