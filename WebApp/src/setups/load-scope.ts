// load-scope — what a panel's data belongs to: the project and the person. Every reload arrives through one
// notify (active-project.ts): a project switch, a sign-in change, or the bridge coming back. A notify with the same
// scope as the last load is a plain refresh — keep what the person is doing (an open form, a hand-run scan, a picked
// comparison); a different scope is a switch — reset whatever belonged to the old project or person.
import { sessionUserId } from "./auth";

export const loadScope = (key: string): string => `${key}|${sessionUserId() ?? ""}`;
