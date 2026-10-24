// Block types of a BIM document section (mirror of bridge/doc-blocks.mjs). Types only; the bridge validates.
export type BlockKind = "text" | "table" | "matrix" | "facts" | "live_view" | "proposed_changes" | "eir_link" | "loin" | "naming" | "references";
export interface Block<K extends BlockKind = BlockKind> { id: string; kind: K; title: string; data: BlockData[K] }
export interface BlockData {
  text: { markdown: string };
  table: { columns: TableColumn[]; rows: TableRow[]; group_by_team: boolean };
  matrix: { preset: "high_level" | "detailed" | "im_assignment" | null; columns: MatrixColumn[]; show_milestone: boolean; show_recipient: boolean; rows: MatrixRow[] };
  facts: { labels: string[]; layout: "text" | "table" };
  live_view: { source: "midp" | "tidp" | "office_register" | "risk_register" | "mobilisation"; filter: { team: string | null; stage: string | null; register_part: string | null } };
  proposed_changes: { changes: { field_key: string; change: "added" | "removed" | "changed"; detail: string; reason: string }[] };
  eir_link: { clauses: { clause_id: string; note: string }[] };
  loin: { rows: { id: string; element: string; milestone: string; property: string; value: string; used_by: string; why: string }[] };
  naming: { separator: string; enforce: "reject" | "warn" | "off"; fields: { key: string; label: string; pattern: string | null; enum: string[]; placeholders: string[]; description: string }[] };
  references: { rows: { id: string; role: "protocol" | "information_standard" | "production_methods" | "eir" | "other"; title: string; version: string; sha: string | null; issuer: string; received: string | null; incorporated_in: string[] }[] };
}
export type ColumnType = "text" | "person" | "team" | "date" | "choice" | "number";
export interface TableColumn { key: string; label: string; type: ColumnType; choices: string[]; choices_from: string | null }
export interface TableRow { id: string; group: string | null; cells: Record<string, string | number | null> }
export type MatrixMark = "produces" | "contributes" | "signs_off";
export interface MatrixColumn { key: string; label: string; team: string | null }
export interface MatrixRow { id: string; label: string; milestone: string | null; recipient: string | null; marks: Record<string, MatrixMark> }

/** The bridge's text-only rule: no blocks, or exactly one text block with an empty title. */
export const oldPanelEditable = (s: { blocks?: { kind: string; title?: string }[] }): boolean =>
  !s.blocks || s.blocks.length === 0 || (s.blocks.length === 1 && s.blocks[0].kind === "text" && !s.blocks[0].title);
/** The body the old panel sends on save: the text of a text-only section, nothing for any other (the bridge would refuse it). */
export const oldPanelSaveBody = (s: { blocks?: { kind: string; title?: string }[] }, value: string): string | undefined =>
  (oldPanelEditable(s) ? value : undefined);
export const OLD_PANEL_NOTE = "This section has tables or other parts; edit it in the workspace.";
