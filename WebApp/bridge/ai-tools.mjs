// The Sentinel tool registry — ONE list of everything an AI may do, shared by the in-app agent AND
// the MCP server. Add a capability here and it is immediately available to both: the Copilot's agent
// mode, and any external client (Claude Desktop, an IDE, another agent) that speaks MCP.
//
// ── The safety model is a POLICY, not a short list ────────────────────────────────────────────────
// The instinct is to keep the agent safe by giving it three actions. That is the wrong lever: it caps
// what the product can do forever, and it doesn't actually make anything safe — one bad write is one
// bad write whether it's the only tool or the fortieth.
//
// So capability is broad and CONTROL is per-tool:
//   policy "read"  — no side effects. Runs immediately, no approval, no ledger entry.
//   policy "write" — changes project state. NEVER auto-runs. The model can only ever PROPOSE it; a
//                    human ticks it in the review gate, and the result lands in the audit trail.
//
// That's the same shape as GhostBuilder's review window, for the same reason: the model proposes, a
// person disposes, and the record is written either way.
import * as cde from "./cde-store.mjs";

/** Every tool: name, what it's for (the model reads this), its JSON schema, its policy, and how to run it. */
export const TOOLS = [
  // ── READ: answer questions about the project. Auto-runs. ────────────────────────────────────────
  {
    name: "list_projects",
    policy: "read",
    description: "List the governed CDE projects (id, key, name). Use to find the right project key.",
    input_schema: { type: "object", properties: {} },
    run: () => cde.listProjects(),
  },
  {
    name: "list_containers",
    policy: "read",
    description: "List a project's ISO 19650 information containers with their current state (wip/shared/published/archived).",
    input_schema: { type: "object", required: ["project"], properties: { project: { type: "string", description: "project key" } } },
    run: ({ project }) => cde.listContainers(project),
  },
  {
    name: "list_folders",
    policy: "read",
    description: "List a project's folder tree.",
    input_schema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
    run: ({ project }) => cde.listFolders(project),
  },
  {
    name: "list_revisions",
    policy: "read",
    description: "List a project's uploaded model revisions (the units 5D cost and 6D carbon are diffed across).",
    input_schema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
    run: ({ project }) => cde.listRevisions(project),
  },
  {
    name: "list_issues",
    policy: "read",
    description: "List the project's BCF coordination issues. Filter by status (e.g. Open, Closed) when asked about outstanding work.",
    input_schema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, status: { type: "string", description: "optional BCF status filter" } },
    },
    run: ({ project, status }) => cde.bcfListTopics(project, { status }),
  },
  {
    name: "list_transmittals",
    policy: "read",
    description: "List formal issue-to-party transmittals (who was sent what, when).",
    input_schema: { type: "object", required: ["project"], properties: { project: { type: "string" } } },
    run: ({ project }) => cde.listTransmittals(project),
  },
  {
    name: "read_audit",
    policy: "read",
    description: "Read the project's immutable, hash-chained audit trail — every proposal verdict, state transition and publish. This is the golden-thread record; cite it when asked what happened or who did what.",
    input_schema: {
      type: "object", required: ["project"],
      properties: { project: { type: "string" }, limit: { type: "number", description: "most recent N rows (default 50)" } },
    },
    run: async ({ project, limit }) => {
      const rows = await cde.listAudit(project);
      return Array.isArray(rows) ? rows.slice(0, limit || 50) : rows;
    },
  },

  // ── WRITE: changes project state. Proposal only — the gate decides. ─────────────────────────────
  {
    name: "raise_issue",
    policy: "write",
    description: "Raise a BCF coordination issue against the model. Use when a check fails and someone needs to act on it.",
    input_schema: {
      type: "object", required: ["project", "title"],
      properties: {
        project: { type: "string" },
        title: { type: "string", description: "short, specific — name the element and the failure" },
        description: { type: "string" },
        priority: { type: "string", enum: ["Low", "Normal", "High", "Critical"] },
        assigned_to: { type: "string", description: "email of the responsible party" },
      },
    },
    run: ({ project, title, description, priority, assigned_to }) =>
      cde.bcfCreateTopic({ project_id: project, title, description, priority, assigned_to, status: "Open" }),
  },
  {
    name: "propose_elements",
    policy: "write",
    description:
      "Submit elements to the governed referee: they are validated against the project's IDS and the verdict (accepted / rejected with per-requirement reasons) is recorded immutably. This is the core Sentinel action — use it to answer 'is this compliant?' with evidence rather than an opinion.",
    input_schema: {
      type: "object", required: ["project", "elements"],
      properties: {
        project: { type: "string" },
        source: { type: "string", description: "who is proposing (agent/tool name)" },
        elements: { type: "array", description: "ElementProperties shape: {identity:{Class,GlobalId,Name?}, psets:[{name,rows:[{name,value}]}], quantities:[…]}" },
        note: { type: "string" },
      },
    },
    run: ({ project, ...body }) => cde.adjudicateProposal(project, body),
  },
  {
    name: "transition_container",
    policy: "write",
    description: "Move an information container version through the ISO 19650 state machine (wip → shared → published → archived). Gated by role server-side; the transition is audited.",
    input_schema: {
      type: "object", required: ["version_id", "state"],
      properties: {
        version_id: { type: "string", description: "the container VERSION id, from list_containers" },
        state: { type: "string", enum: ["wip", "shared", "published", "archived"] },
        actor: { type: "string" },
        note: { type: "string" },
      },
    },
    run: ({ version_id, state, actor, note }) => cde.transition(version_id, state, actor, note),
  },
  {
    name: "set_live_version",
    policy: "write",
    description: "Make a specific container version the live one that consumers see. High impact — this changes what everyone downstream reads.",
    input_schema: {
      type: "object", required: ["version_id"],
      properties: { version_id: { type: "string" }, actor: { type: "string" } },
    },
    run: ({ version_id, actor }) => cde.setLiveVersion(version_id, actor),
  },
  {
    name: "create_folder",
    policy: "write",
    description: "Create a folder in the project's container tree.",
    input_schema: {
      type: "object", required: ["project", "name"],
      properties: { project: { type: "string" }, name: { type: "string" }, parent_id: { type: "string" } },
    },
    run: ({ project, name, parent_id }) => cde.createFolder(project, { name, parent_id }),
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** What the model sees — the Anthropic tool shape, minus `run` and `policy`. Never ship `run`. */
export const toolSpecs = (only = null) =>
  TOOLS.filter((t) => !only || only.includes(t.name)).map(({ name, description, input_schema }) => ({
    name, description, input_schema,
  }));

/** What the UI needs to render the gate: which calls will auto-run and which need a tick. */
export const policyOf = (name) => byName.get(name)?.policy ?? "write"; // unknown ⇒ treat as dangerous

/**
 * Execute one tool. `allowWrites` MUST come from a human decision, never from the model — a `write`
 * tool called without it throws rather than silently doing nothing, so a missing gate is a loud bug
 * instead of an agent that appears to work and quietly changes nothing.
 */
export async function runTool(name, args = {}, { allowWrites = false } = {}) {
  const t = byName.get(name);
  if (!t) throw Object.assign(new Error(`Unknown tool: ${name}`), { status: 400 });
  if (t.policy === "write" && !allowWrites)
    throw Object.assign(new Error(`"${name}" changes project state and needs explicit approval.`), { status: 403 });
  return t.run(args);
}
