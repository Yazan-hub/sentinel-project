import { describe, it, expect } from "vitest";
import { filterProjects, isDefaultFilter, DEFAULT_FILTER, type ProjectFilter, type FilterableProject } from "./projects-filter";

const p = (key: string, o: Partial<FilterableProject> = {}): FilterableProject => ({
  key,
  name: key,
  appointing_party: null,
  created_at: "2026-01-01T00:00:00Z",
  container_count: 0,
  ...o,
});

// Fetched order (as the bridge returns it): mixed dates, an archived office, an archived project, loose projects.
const list: FilterableProject[] = [
  p("hq", { name: "HQ Office", kind: "office", created_at: "2026-01-01T00:00:00Z" }),
  p("aster-tower", { name: "Aster Tower", office_key: "hq", office_name: "HQ Office", created_at: "2026-03-01T00:00:00Z", container_count: 5 }),
  p("old-wing", { name: "Old Wing", office_key: "hq", office_name: "HQ Office", created_at: "2026-05-01T00:00:00Z", settings: { archived: true } }),
  p("bay-bridge", { name: "Bay Bridge", office_key: "hq", office_name: "HQ Office", created_at: "2026-02-01T00:00:00Z", container_count: 9, appointing_party: "Harbour Authority" }),
  p("north", { name: "North Office", kind: "office", created_at: "2026-01-02T00:00:00Z", settings: { archived: true } }),
  p("north-yard", { name: "North Yard", office_key: "north", office_name: "North Office", created_at: "2026-04-01T00:00:00Z" }),
  p("sec2-smoke", { name: "SEC-2 smoke", created_at: "2026-10-05T00:00:00Z" }),
  p("demo", { name: "Demo", created_at: "2026-06-01T00:00:00Z", container_count: 2 }),
  p("ghost", { name: "Ghost", office_key: "gone", created_at: "2026-07-01T00:00:00Z", settings: { archived: true } }),
];

const run = (f: Partial<ProjectFilter> = {}) => filterProjects(list, { ...DEFAULT_FILTER, ...f });
const keys = (f: Partial<ProjectFilter> = {}) => run(f).groups.map((g) => [g.title, g.rows.map((r) => r.key)]);
const flat = (f: Partial<ProjectFilter> = {}) => run(f).groups.flatMap((g) => g.rows.map((r) => r.key));

describe("filterProjects", () => {
  it("defaults: today's set and grouping, archived last, newest first inside each group", () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
    const r = run();
    expect(r.total).toBe(list.length);
    expect(r.shown).toBe(list.length);
    expect(keys()).toEqual([
      ["HQ Office · office", ["hq", "aster-tower", "bay-bridge", "old-wing"]],
      ["North Office · office", ["north", "north-yard"]],
      ["No office", ["sec2-smoke", "demo", "ghost"]],
    ]);
  });

  it("no offices loaded: one untitled group", () => {
    const r = filterProjects([p("a"), p("b", { created_at: "2026-02-01T00:00:00Z" })], DEFAULT_FILTER);
    expect(r.groups).toEqual([{ title: "", rows: [expect.objectContaining({ key: "b" }), expect.objectContaining({ key: "a" })] }]);
  });

  it("search: case-insensitive, trimmed, every word must match name, key, office name or appointing party", () => {
    expect(flat({ q: "  aster tower " })).toEqual(["aster-tower"]);
    expect(flat({ q: "ASTER-TOWER" })).toEqual(["aster-tower"]);
    expect(flat({ q: "sec2" })).toEqual(["sec2-smoke"]);
    expect(flat({ q: "harbour" })).toEqual(["bay-bridge"]);
    expect(flat({ q: "hq office bay" })).toEqual(["bay-bridge"]);
    expect(flat({ q: "north" })).toEqual(["north", "north-yard"]);
    expect(flat({ q: "aster bridge" })).toEqual([]);
  });

  it("type: projects only, offices only", () => {
    expect(flat({ kind: "office" })).toEqual(["hq", "north"]);
    expect(keys({ kind: "project" })).toEqual([
      ["HQ Office · office", ["aster-tower", "bay-bridge", "old-wing"]],
      ["North Office · office", ["north-yard"]],
      ["No office", ["sec2-smoke", "demo", "ghost"]],
    ]);
  });

  it("office: none, and a named office (its card plus its projects)", () => {
    expect(keys({ office: "none" })).toEqual([["No office", ["sec2-smoke", "demo", "ghost"]]]);
    expect(keys({ office: "north" })).toEqual([["North Office · office", ["north", "north-yard"]]]);
    expect(flat({ office: "hq", kind: "project" })).toEqual(["aster-tower", "bay-bridge", "old-wing"]);
  });

  it("status: active hides archived, archived shows only archived", () => {
    expect(flat({ status: "active" })).toEqual(["hq", "aster-tower", "bay-bridge", "north-yard", "sec2-smoke", "demo"]);
    expect(flat({ status: "archived" })).toEqual(["old-wing", "north", "ghost"]);
    // An archived office's active project still sits under its office title.
    expect(keys({ status: "active", office: "north" })).toEqual([["North Office · office", ["north-yard"]]]);
  });

  it("sort: oldest, name, most containers - inside each group, archived still last", () => {
    expect(keys({ sort: "oldest" })[0]).toEqual(["HQ Office · office", ["hq", "bay-bridge", "aster-tower", "old-wing"]]);
    expect(keys({ sort: "name" })[2]).toEqual(["No office", ["demo", "sec2-smoke", "ghost"]]);
    expect(keys({ sort: "containers" })[0]).toEqual(["HQ Office · office", ["hq", "bay-bridge", "aster-tower", "old-wing"]]);
  });

  it("an empty result: no groups, shown 0 of total", () => {
    const r = run({ q: "nothing-like-this" });
    expect(r.groups).toEqual([]);
    expect(r.shown).toBe(0);
    expect(r.total).toBe(list.length);
  });

  it("isDefaultFilter: any change is a filter", () => {
    expect(isDefaultFilter({ ...DEFAULT_FILTER, q: "   " })).toBe(true);
    for (const f of [{ q: "a" }, { kind: "office" }, { office: "none" }, { status: "active" }, { sort: "name" }] as Partial<ProjectFilter>[])
      expect(isDefaultFilter({ ...DEFAULT_FILTER, ...f })).toBe(false);
  });
});
