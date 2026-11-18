import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// UX slice 2 (docs/ux/web-coverage.md): the founder's rule for the 12 → 5 areas move — nothing removed, nothing unreachable.
// main.ts is read as text, as main-wiring.test.ts does: the panels are built inside main() and cannot be imported.
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n"); // a Windows checkout has CRLF
const areas = main.slice(main.indexOf("// <five-areas>"), main.indexOf("// </five-areas>"));

// Every panel element the 12-area wiring mounted (main.ts up to 5ec8f22c), each mounted as a tab in the five areas now.
const TAB_PANELS = [
  "projectsRootEl", "copilotEl", "guideEl", // Projects (hub), Copilot, Guide
  "filesEl", "docsEl", "deliverablesEl", "projectSettingsEl", // the project space's tabs
  "browserEl", "propsEl", "visEl", "viewsEl", "sheetsEl", "reviewEl", "perfEl", // BIM Tools
  "issuesEl", "rfiEl", "clashEl", "cdeEl", // Coordination
  "costEl", "carbonEl", "timelineEl", "cobieEl", "tenderEl", "ownerEl", "feedEl", // Lifecycle
  "packsEl", "qaEl", // Standards, QA
];
// The platform built-ins the old layouts mounted (Explorer, Data, Settings) and the objects list that no layout mounted.
const BUILT_INS = ["top-model-tree", "top-properties-panel", "top-data-table-panel", "top-settings-panel", "top-objects-panel"];

const tabLabels = (name: string): string[] => {
  const start = areas.indexOf(`const ${name} = [`);
  expect(start, `${name} is defined in the five areas`).toBeGreaterThanOrEqual(0);
  const block = areas.slice(start, areas.indexOf("];", start));
  return [...block.matchAll(/\{ label: "([^"]+)", el: /g)].map((m) => m[1]);
};

describe("UX slice 2: nothing is lost in the five areas (founder rule)", () => {
  it("the sidebar holds exactly the five areas, each with the Next strip above it", () => {
    const block = main.slice(main.indexOf("app.layouts = {", main.indexOf("// </five-areas>")), main.indexOf("app.layout = \"Home\";"));
    expect([...block.matchAll(/^\s+(\w+): \{ label: "\1"/gm)].map((m) => m[1])).toEqual(["Home", "Models", "Documents", "Issues", "Settings"]);
    expect(block.match(/"strip viewer" auto/g)).toHaveLength(5);
    expect(main).toContain("strip: () => BUI.html`${nextStripEl}`");
  });

  it.each(TAB_PANELS)("%s is a tab of an area, mounted exactly once", (panel) => {
    expect(areas.match(new RegExp(`el: ${panel} \\}`, "g")) ?? []).toHaveLength(1);
  });

  it.each(BUILT_INS)("<%s> is mounted in an area", (tag) => expect(areas).toMatch(new RegExp(`builtIn\\([^)]*"${tag}"`)));

  it("the Dashboard sits in the open project's view (Home ▸ Overview), the editor is an overlay, the .3tz file list is registered as before", () => {
    expect(main).toContain("spaceView.append(spaceHeader, projectEl);");
    expect(main).toContain("container.appendChild(workspaceEl);");
    expect(main).toContain("files: () =>\n      BUI.html`<top-models-list .loaders=${modelLoaders}></top-models-list>`,");
  });

  it("every jump between areas names a tab that exists (an unknown label would blank the area)", () => {
    const groups: Record<string, string[]> = {
      HOME_TABS: tabLabels("homeTabs"), DOC_TABS: tabLabels("docTabs"), SETTINGS_TABS: tabLabels("settingsTabs"), REPORT_TABS: tabLabels("reportTabs"),
    };
    const jumps = [...main.matchAll(/(?:go\("\w+", \w+, |showTabOf\(\w+, )(\w+_TABS), "([^"]+)"\)/g)];
    expect(jumps.length).toBeGreaterThan(10);
    for (const [, list, label] of jumps) expect(groups[list], `${list} ▸ ${label}`).toContain(label);
  });

  it("the old area names are gone from navigation (no jump to a layout that no longer exists)", () => {
    for (const old of ["Projects", "Guide", "Copilot", "BIM Tools", "Coordination", "Lifecycle", "Explorer", "Data", "Standards", "QA", "Workspace"])
      expect(main, old).not.toContain(`app.layout = "${old}"`);
  });

  // Fable review 2026-11-18: a dropped group or a dropped area root left every leaf check above green.
  it("each area's root is mounted and its layout names it", () => {
    const roots: Record<string, [string, string]> = {
      Home: ["home", "homeTabsEl"], Models: ["models", "modelsEl"], Documents: ["documents", "docsAreaEl"], Issues: ["issues", "issuesAreaEl"], Settings: ["settings", "settingsAreaEl"],
    };
    for (const [layout, [key, el]] of Object.entries(roots)) {
      expect(main, layout).toContain(`${key}: () => BUI.html\`\${${el}}\``);
      expect(main, layout).toMatch(new RegExp(`${layout}: \\{ label: "${layout}", icon: "[^"]+", template: \`"strip viewer" auto "${key} viewer" 1fr`));
    }
  });

  it("the nested groups are tabs of their area (Models ▸ More, Documents ▸ Reports, Settings ▸ Advanced)", () => {
    for (const group of ["el: tabbed(modelsMore) }", "el: reportsEl }", "el: advancedEl }"]) expect(areas.split(group).length - 1, group).toBe(1);
  });

  it("every jump pairs an area with its own tab group and list", () => {
    const pairs = new Set(["Home homeTabsEl HOME_TABS", "Documents docsAreaEl DOC_TABS", "Settings settingsAreaEl SETTINGS_TABS"]);
    const jumps = [...main.matchAll(/go\("(\w+)", (\w+), (\w+_TABS), "/g)];
    expect(jumps.length).toBeGreaterThan(10);
    for (const [, layout, el, list] of jumps) expect(pairs.has(`${layout} ${el} ${list}`), `${layout}, ${el}, ${list}`).toBe(true);
    expect(main.match(/showTabOf\((\w+), (\w+_TABS),/g)?.every((m) => m === "showTabOf(reportsEl, REPORT_TABS,")).toBe(true);
  });

  it("every journey place the web strip and the Guide know opens a place in main.ts", () => {
    const strip = readFileSync(new URL("./setups/next-strip.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const places = strip.slice(strip.indexOf("export const JOURNEY_PLACES"), strip.indexOf("};", strip.indexOf("export const JOURNEY_PLACES")));
    const table = main.slice(main.indexOf("const JOURNEY_TABS"), main.indexOf("};", main.indexOf("const JOURNEY_TABS")));
    const opens = new Set([...table.matchAll(/"([^"]+)": \(\) => go\(/g)].map((m) => m[1]).concat(["Documents ▸ Document editor", "Workspace"]));
    const pairs = [...places.matchAll(/"([^"]+)": "([^"]+)"/g)];
    expect(pairs.length).toBe(6);
    for (const [, old, now] of pairs) { expect(opens.has(old), old).toBe(true); expect(opens.has(now), now).toBe(true); }
  });
});
