// The Members screen's words and rules (R2a; documents design 2026-10-24 §6, §17). Pure: the panel renders, the bridge and the
// database refuse; these helpers only keep the screen from offering what will be refused and name things in plain words.

export type Party = "appointing" | "lead_appointed" | "appointed";
export const PARTIES: Party[] = ["appointing", "lead_appointed", "appointed"];
export const PARTY_WORDS: Record<Party, string> = { appointing: "Client", lead_appointed: "Lead firm", appointed: "Firm" };
export const NO_PARTY = "No party yet";
export const INVITED_WORDS = "Invited, not signed in yet";
export const MAIL_NOTE = "Invitations go out as a sign-in code by e-mail. Sentinel's mail service sends two an hour, so a code can take a while; Resend sends another.";

export interface MemberRow { user_id: string; email: string; role: string; party: Party | null; task_team: string | null; state: "invited" | "active" }
export interface InvitationRow { id: string; email: string; role: string; party: Party | null; task_team: string | null; sent_at: string; expires_at: string }

/** "Client", "Lead firm", "Firm · Team ARC", or "No party yet". */
export const partyWord = (party: Party | null | undefined, task_team?: string | null): string =>
  !party ? NO_PARTY : party === "appointed" && task_team ? `Firm · Team ${task_team}` : PARTY_WORDS[party];

/** Party and team are an owner's to change (0050's trigger refuses everyone else), never on one's own row. */
export const canEditParty = (myRole: string, rowUserId: string, myUserId: string | null): boolean =>
  (myRole === "owner" || myRole === "service") && rowUserId !== myUserId;

/** The parties this caller may give at an invite: the Client is an owner's. */
export const invitableParties = (myRole: string): Party[] => PARTIES.filter((p) => p !== "appointing" || myRole === "owner" || myRole === "service");

/** Why the invite form cannot be sent yet, in words — null when it can. Mirrors the bridge's first refusals so the screen says it first. */
export function inviteProblem(f: { email: string; role: string; party: Party | ""; task_team: string }, myRole: string, grantable: string[]): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Type the person's e-mail.";
  if (!grantable.includes(f.role)) return `You can invite as ${grantable.join(", ")} only.`;
  if (f.party === "appointing" && !(myRole === "owner" || myRole === "service")) return "Only an owner invites the Client.";
  if (f.party === "appointed" && !f.task_team.trim()) return "A Firm member belongs to a task team — pick one.";
  return null;
}

/** Members grouped for display: Client, Lead firm, each Firm by team, then No party yet. */
export function groupByParty(rows: MemberRow[]): { title: string; members: MemberRow[] }[] {
  const groups = new Map<string, MemberRow[]>();
  for (const m of rows) { const k = partyWord(m.party, m.task_team); groups.set(k, [...(groups.get(k) ?? []), m]); }
  const order = (t: string) => (t === "Client" ? 0 : t === "Lead firm" ? 1 : t === NO_PARTY ? 3 : 2);
  return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([title, members]) => ({ title, members }));
}

/** "12 Nov 2026" from an ISO time, for the invitation list. */
export const dayOf = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
