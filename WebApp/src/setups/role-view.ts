// UX slice 6 (docs/ux/role-hiding.md; simplification map rule 4): "Role hides what isn't yours." A view choice, never a
// deletion: every tab stays mounted, a jump to a hidden tab still opens it, and "Show all tools" (Settings tab bar) brings
// every one back. The bridge still enforces every permission; this only tidies the tab bars.
// A tab is named by its place, "Area ▸ Tab" or "Area ▸ Group ▸ Tab", as main.ts's tab groups label them.

/** Role → the tabs it hides, each with its reason. Roles not listed (owner, lead, service, not-member, signed-out) hide nothing. */
export const ROLE_HIDES: Record<string, { tab: string; why: string }[]> = {
  // The modeller: models, files, issues and proposed changes are theirs; project setup and the commercial reports are not.
  contributor: [
    { tab: "Settings ▸ Project", why: "Read-only below lead: setting up the project is the BIM manager's." },
    { tab: "Settings ▸ Standards library", why: "Installing standards is a lead's or owner's work; Sentinel refuses it below lead." },
    { tab: "Documents ▸ Reports ▸ Tender", why: "The tender package is commercial work, not modelling." },
    { tab: "Documents ▸ Reports ▸ Owner view", why: "The owner's view is for the client, not the modeller." },
  ],
  // The reviewer (a viewer): reads models, documents, issues and reports; cannot decide or set anything up.
  viewer: [
    { tab: "Documents ▸ Proposed changes", why: "Accepting or declining a change is a contributor's or above; a viewer cannot." },
    { tab: "Settings ▸ Project", why: "Read-only below lead: setting up the project is the BIM manager's." },
    { tab: "Settings ▸ Standards library", why: "Installing standards is a lead's or owner's work; Sentinel refuses it below lead." },
  ],
};

/** The tabs hidden for this view. Nothing is hidden when the role was not read (bridge down, no project) or with Show all tools. */
export const hiddenTabs = (role: string, read: boolean, showAll: boolean): Set<string> =>
  new Set(showAll || !read ? [] : (ROLE_HIDES[role] ?? []).map((h) => h.tab));

/** The labels of one tab group ("Documents", "Documents ▸ Reports") among the hidden places; a deeper place is its subgroup's. */
export const hiddenIn = (hidden: Set<string>, group: string): string[] =>
  [...hidden].filter((p) => p.startsWith(`${group} ▸ `) && !p.slice(group.length + 3).includes(" ▸ ")).map((p) => p.slice(group.length + 3));

const SHOW_ALL_KEY = "sentinel.showAllTools";
/** Per viewer, per browser. A store that throws (private window, blocked site data) reads as off and forgets the choice. */
export const readShowAll = (): boolean => { try { return localStorage.getItem(SHOW_ALL_KEY) === "1"; } catch { return false; } };
export const writeShowAll = (on: boolean): void => { try { localStorage.setItem(SHOW_ALL_KEY, on ? "1" : "0"); } catch { /* not remembered */ } };
