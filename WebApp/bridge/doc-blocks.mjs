// BIM Documents block model — what a section holds (typed blocks), their limits, and checking them.
// Pure: no I/O and no store imports, so vitest covers it; the store and the migration backfill compose these.
import { randomUUID } from "node:crypto";

export const BLOCK_KINDS = Object.freeze(["text", "table", "matrix", "facts", "live_view", "proposed_changes", "eir_link", "loin", "naming", "references"]);
export const LIMITS = Object.freeze({ docChars: 8_000_000, sectionsPerDoc: 120, blocksPerSection: 60, rows: 500, columns: 24, cellChars: 4000, markdownChars: 100000, titleChars: 200, labels: 64, namingFields: 64, patternChars: 512 });
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const LABEL_RE = /^[a-z][a-z0-9_.]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMN_TYPES = ["text", "person", "team", "date", "choice", "number"];
const MARKS = ["produces", "contributes", "signs_off"];
const PRESETS = ["high_level", "detailed", "im_assignment"];
const LIVE_SOURCES = ["midp", "tidp", "office_register", "risk_register", "mobilisation"];

const EMPTY = {
  text: () => ({ markdown: "" }),
  table: () => ({ columns: [], rows: [], group_by_team: false }),
  matrix: () => ({ preset: null, columns: [], show_milestone: false, show_recipient: false, rows: [] }),
  facts: () => ({ labels: [], layout: "text" }),
  live_view: () => ({ source: "midp", filter: { team: null, stage: null, register_part: null } }),
  proposed_changes: () => ({ changes: [] }),
  eir_link: () => ({ clauses: [] }),
  loin: () => ({ rows: [] }),
  naming: () => ({ separator: "-", enforce: "reject", fields: [] }),
  references: () => ({ rows: [] }),
};

/** A fresh, valid `data` object for a new block of this kind. */
export function emptyData(kind) {
  return (Object.hasOwn(EMPTY, kind) ? EMPTY[kind] : () => fail("block: kind", `must be one of ${BLOCK_KINDS.join(", ")}`))();
}

// ---- small checkers. `at` is the place in plain words ("block: data.rows[0]"); every message is `${at} ${what}`. ----

function fail(at, what) {
  throw Object.assign(new Error(`${at} ${what}`), { status: 400 });
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const obj = (v, at) => (isObj(v) ? v : fail(at, "must be an object"));
const bool = (v, at) => (v === undefined ? false : typeof v === "boolean" ? v : fail(at, "must be true or false"));
const str = (v, at, max, dflt = "") =>
  v === undefined ? dflt : typeof v !== "string" ? fail(at, "must be text") : v.length > max ? fail(at, `is longer than ${max} characters`) : v;
const strOrNull = (v, at, max) => (v == null ? null : str(v, at, max));
/** One of `options`; a missing value takes `dflt` when one is given (null counts), otherwise it is refused. */
const oneOf = (v, at, options, dflt) =>
  (v === undefined || v === null) && dflt !== undefined ? dflt : options.includes(v) ? v : fail(at, `must be one of ${options.join(", ")}`);
const refId = (v, at) => (typeof v === "string" && ID_RE.test(v) ? v : fail(at, "is not a valid id (letters, digits, dot, dash, underscore)"));
/** An id the block or row already has, or a fresh one. */
const idOf = (v, at) => (v == null ? randomUUID() : refId(v, at));
const keyOf = (v, at) => (typeof v === "string" && KEY_RE.test(v) ? v : fail(at, "must be lowercase letters, digits and underscores, starting with a letter"));
/** A free-text name that is not blank (the same test the artefact store applies to naming field keys). */
const nameOf = (v, at) => (typeof v === "string" && /[^\s\u0085]/.test(v) ? str(v, at, LIMITS.titleChars) : fail(at, "must be a non-empty text"));
const isDate = (s) => {
  const t = DATE_RE.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN;
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const dateOrNull = (v, at) => (v == null ? null : typeof v === "string" && isDate(v) ? v : fail(at, "must be a date written YYYY-MM-DD"));

/** A list (missing = empty) of at most `max` items. */
function list(v, at, max, noun) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return fail(at, "must be a list");
  return v.length > max ? fail(at, `holds at most ${max} ${noun}`) : v;
}
/** Each item of a list as an object, normalised by `fn(item, itemAt)`. */
const each = (v, at, max, noun, fn) => list(v, at, max, noun).map((x, i) => fn(obj(x, `${at}[${i}]`), `${at}[${i}]`));
const texts = (v, at, max) => list(v, at, LIMITS.rows, "items").map((s, i) => str(s, `${at}[${i}]`, max));

/** Columns of a table or matrix: a unique key and a label, plus what `extra(col, colAt)` adds. */
function columnsOf(v, at, extra) {
  const seen = new Set();
  return each(v, `${at}.columns`, LIMITS.columns, "columns", (c, a) => {
    const key = keyOf(c.key, `${a}.key`);
    if (seen.has(key)) fail(`${a}.key`, `"${key}" is used by another column`);
    seen.add(key);
    return { key, label: str(c.label, `${a}.label`, LIMITS.titleChars), ...extra(c, a) };
  });
}

// ---- one normaliser per kind: (rawData, at) -> clean data. Unknown keys are dropped, missing ones take their default. ----

function cellOf(v, at, col) {
  if (v == null) return null;
  if (col.type === "number") return Number.isFinite(v) ? v : fail(at, "must be a number");
  if (col.type === "date") return dateOrNull(v, at);
  const s = str(v, at, LIMITS.cellChars);
  return col.type === "choice" && col.choices.length && !col.choices.includes(s) ? fail(at, `must be one of ${col.choices.join(", ")}`) : s;
}

function table(d, at) {
  const columns = columnsOf(d.columns, at, (c, a) => ({
    type: oneOf(c.type, `${a}.type`, COLUMN_TYPES, "text"),
    choices: texts(c.choices, `${a}.choices`, LIMITS.titleChars),
    choices_from: strOrNull(c.choices_from, `${a}.choices_from`, LIMITS.titleChars),
  }));
  const rows = each(d.rows, `${at}.rows`, LIMITS.rows, "rows", (r, a) => {
    const cells = {};
    for (const [k, v] of Object.entries(obj(r.cells ?? {}, `${a}.cells`))) {
      const col = columns.find((c) => c.key === k);
      if (!col) fail(`${a}.cells.${k}`, "is not a column");
      cells[k] = cellOf(v, `${a}.cells.${k}`, col);
    }
    return { id: idOf(r.id, `${a}.id`), group: strOrNull(r.group, `${a}.group`, LIMITS.titleChars), cells };
  });
  return { columns, rows, group_by_team: bool(d.group_by_team, `${at}.group_by_team`) };
}

function matrix(d, at) {
  const columns = columnsOf(d.columns, at, (c, a) => ({ team: strOrNull(c.team, `${a}.team`, LIMITS.titleChars) }));
  const rows = each(d.rows, `${at}.rows`, LIMITS.rows, "rows", (r, a) => {
    const marks = {};
    for (const [k, m] of Object.entries(obj(r.marks ?? {}, `${a}.marks`))) {
      if (!columns.some((c) => c.key === k)) fail(`${a}.marks.${k}`, "is not a column");
      marks[k] = oneOf(m, `${a}.marks.${k}`, MARKS);
    }
    if (Object.values(marks).filter((m) => m === "produces").length > 1) fail(a, 'has more than one "produces" mark; one task team is responsible for producing each row');
    return {
      id: idOf(r.id, `${a}.id`),
      label: str(r.label, `${a}.label`, LIMITS.titleChars),
      milestone: strOrNull(r.milestone, `${a}.milestone`, LIMITS.titleChars),
      recipient: strOrNull(r.recipient, `${a}.recipient`, LIMITS.titleChars),
      marks,
    };
  });
  return {
    preset: oneOf(d.preset, `${at}.preset`, PRESETS, null),
    columns,
    show_milestone: bool(d.show_milestone, `${at}.show_milestone`),
    show_recipient: bool(d.show_recipient, `${at}.show_recipient`),
    rows,
  };
}

const facts = (d, at) => ({
  labels: list(d.labels, `${at}.labels`, LIMITS.labels, "labels").map((l, i) =>
    typeof l === "string" && LABEL_RE.test(l) ? l : fail(`${at}.labels[${i}]`, "must be a lowercase label such as appointing_party.name")),
  layout: oneOf(d.layout, `${at}.layout`, ["text", "table"], "text"),
});

function liveView(d, at) {
  const f = obj(d.filter ?? {}, `${at}.filter`);
  const part = (k) => strOrNull(f[k], `${at}.filter.${k}`, LIMITS.titleChars);
  return { source: oneOf(d.source, `${at}.source`, LIVE_SOURCES, "midp"), filter: { team: part("team"), stage: part("stage"), register_part: part("register_part") } };
}

const proposedChanges = (d, at) => ({
  changes: each(d.changes, `${at}.changes`, LIMITS.rows, "changes", (c, a) => ({
    field_key: str(c.field_key, `${a}.field_key`, LIMITS.titleChars),
    change: oneOf(c.change, `${a}.change`, ["added", "removed", "changed"]),
    detail: str(c.detail, `${a}.detail`, LIMITS.cellChars),
    reason: str(c.reason, `${a}.reason`, LIMITS.cellChars),
  })),
});

const eirLink = (d, at) => ({
  clauses: each(d.clauses, `${at}.clauses`, LIMITS.rows, "clauses", (c, a) => ({
    clause_id: refId(c.clause_id, `${a}.clause_id`),
    note: str(c.note, `${a}.note`, LIMITS.cellChars),
  })),
});

const loin = (d, at) => ({
  rows: each(d.rows, `${at}.rows`, LIMITS.rows, "rows", (r, a) => ({
    id: idOf(r.id, `${a}.id`),
    ...Object.fromEntries(["element", "milestone", "property", "value", "used_by", "why"].map((k) => [k, str(r[k], `${a}.${k}`, LIMITS.cellChars)])),
  })),
});

// Shape only; the full naming-rule check (validateArtefact) runs when the rule is installed.
function naming(d, at) {
  const separator = d.separator ?? "-";
  if (typeof separator !== "string" || [...separator].length !== 1) fail(`${at}.separator`, "must be exactly one character");
  return {
    separator,
    enforce: oneOf(d.enforce, `${at}.enforce`, ["reject", "warn", "off"], "reject"),
    fields: each(d.fields, `${at}.fields`, LIMITS.namingFields, "fields", (f, a) => ({
      key: nameOf(f.key, `${a}.key`),
      label: str(f.label, `${a}.label`, LIMITS.titleChars),
      pattern: strOrNull(f.pattern, `${a}.pattern`, LIMITS.patternChars),
      enum: texts(f.enum, `${a}.enum`, LIMITS.titleChars),
      placeholders: texts(f.placeholders, `${a}.placeholders`, LIMITS.titleChars),
      description: str(f.description, `${a}.description`, LIMITS.cellChars),
    })),
  };
}

const references = (d, at) => ({
  rows: each(d.rows, `${at}.rows`, LIMITS.rows, "rows", (r, a) => ({
    id: idOf(r.id, `${a}.id`),
    role: oneOf(r.role, `${a}.role`, ["protocol", "information_standard", "production_methods", "eir", "other"]),
    title: str(r.title, `${a}.title`, LIMITS.titleChars),
    version: str(r.version, `${a}.version`, LIMITS.titleChars),
    sha: strOrNull(r.sha, `${a}.sha`, 128),
    issuer: str(r.issuer, `${a}.issuer`, LIMITS.titleChars),
    received: dateOrNull(r.received, `${a}.received`),
    incorporated_in: texts(r.incorporated_in, `${a}.incorporated_in`, LIMITS.titleChars),
  })),
});

const NORMALISE = {
  text: (d, at) => ({ markdown: str(d.markdown, `${at}.markdown`, LIMITS.markdownChars) }),
  table,
  matrix,
  facts,
  live_view: liveView,
  proposed_changes: proposedChanges,
  eir_link: eirLink,
  loin,
  naming,
  references,
};

/** Check one block and return it clean: `{ id, kind, title, data }`. Throws status 400 with a message that starts with `path`. */
export function validateBlock(raw, path = "block") {
  const b = obj(raw, path);
  const kind = oneOf(b.kind, `${path}: kind`, BLOCK_KINDS);
  const id = idOf(b.id, `${path}: id`);
  const title = str(b.title, `${path}: title`, LIMITS.titleChars);
  const data = NORMALISE[kind](obj(b.data, `${path}: data`), `${path}: data`);
  return { id, kind, title, data };
}

// ---- the plain-text body derived from blocks, and how the old (text-only) panel reads and writes it ----

/** A text block holding `markdown`. */
export const textBlock = (markdown, id) => ({ id, kind: "text", title: "", data: { markdown } });

/** A section's blocks: the stored list, or — for a section stored before blocks — its body as one text block with a stable id. */
export const blocksOf = (section) => (Array.isArray(section.blocks) ? section.blocks : [textBlock(section.body ?? "", `${section.id}.t0`)]);

const MARK_WORDS = { produces: "produces", contributes: "contributes", signs_off: "signs off" };
const cellText = (v) => (v == null ? "" : String(v));
/** An own property only: a column key such as "constructor" must not read the object's prototype. */
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : null);
const row = (...cells) => cells.join(" | ");

/** The lines a (valid) block contributes below its title; an empty block contributes none, so it adds nothing to the body,
 *  title included (spec section 4: the executability "empty" count keeps working). A live view always contributes its line: an
 *  unfiltered live list (the MIDP appendix) is content. */
const LINES = {
  text: (d) => (d.markdown === "" ? [] : [d.markdown]),
  table: (d) => (d.columns.length && d.rows.length ? [row(...d.columns.map((c) => c.label)), ...d.rows.map((r) => row(...d.columns.map((c) => cellText(own(r.cells, c.key)))))] : []),
  matrix: (d) => d.rows.map((r) => {
    const marks = d.columns.filter((c) => own(r.marks, c.key)).map((c) => `${c.label} ${MARK_WORDS[r.marks[c.key]]}`);
    return marks.length ? `${r.label}: ${marks.join("; ")}` : r.label;
  }),
  facts: (d) => (d.labels.length ? [`Project facts: ${d.labels.join(", ")}`] : []),
  live_view: (d) => [`Live list: ${d.source}${d.filter.team ? ` (team ${d.filter.team})` : ""}`],
  proposed_changes: (d) => d.changes.map((c) => `${c.field_key}: ${c.change} — ${c.detail} (${c.reason})`),
  eir_link: (d) => (d.clauses.length ? [`Answers EIR clauses: ${d.clauses.map((c) => c.clause_id).join(", ")}`] : []),
  loin: (d) => (d.rows.length ? [row("Element", "Milestone", "Property", "Value", "Used by", "Why"), ...d.rows.map((r) => row(r.element, r.milestone, r.property, r.value, r.used_by, r.why))] : []),
  naming: (d) => (d.fields.length ? [`Naming rule: ${d.fields.map((f) => f.key).join(d.separator)} (${d.enforce})`, ...d.fields.map((f) => `${f.label}: ${f.pattern ?? f.enum.join(", ")}`)] : []),
  references: (d) => d.rows.map((r) => `${r.title} ${r.version} — ${r.issuer}${r.received ? `, received ${r.received}` : ""}`),
};

/** The plain-text body of a list of blocks. Never throws: a block that does not validate is left out — except a text block,
 *  which keeps its stored text even over a limit (the body derives from what is stored). */
export function deriveBody(blocks) {
  const parts = [];
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    let b;
    try {
      b = validateBlock(raw);
    } catch {
      if (raw?.kind !== "text" || typeof raw.data?.markdown !== "string") continue; // not a valid block: nothing to say about it
      b = { kind: "text", title: typeof raw.title === "string" ? raw.title : "", data: { markdown: raw.data.markdown } };
    }
    const lines = LINES[b.kind](b.data);
    if (lines.length) parts.push([...(b.title ? [b.title] : []), ...lines].join("\n"));
  }
  return parts.join("\n\n");
}

/**
 * What the old panel's body save does to a text-only section (no blocks, or one text block with no title):
 * the body becomes that one text block. Any other section is refused, since a body save would flatten its parts.
 */
export function applyOldPanelBody(section, body) {
  const blocks = blocksOf(section);
  if (blocks.length > 1 || (blocks.length === 1 && (blocks[0]?.kind !== "text" || blocks[0].title))) {
    throw Object.assign(new Error("This section has tables or other parts; edit it in the workspace. Nothing was saved."), { status: 422 });
  }
  if (typeof body === "string" && body.length > LIMITS.markdownChars) {
    throw Object.assign(new Error("This section's text is longer than 100,000 characters. Nothing was saved."), { status: 422 });
  }
  const block = validateBlock(textBlock(body, blocks[0]?.id ?? `${section.id}.t0`));
  return { blocks: [block], body };
}
