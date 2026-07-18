import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
// Inlines the fragments worker so it runs inside the platform's sandboxed iframe.
import "@thatopen/fragments/inline";
import * as BUI from "@thatopen/ui";
import * as MARKERJS from "@markerjs/markerjs3";
import { PlatformClient, UIManager } from "@thatopen/services";
import { setAppContext } from "./app";
import { SERVICE_URL } from "./config";
import { qaPanel } from "./setups/qa-panel";
import { modelPanel } from "./setups/model-panel";
import { packsPanel } from "./setups/packs-panel";
import { costPanel } from "./setups/cost-panel";
import { projectShell } from "./setups/project-shell";
import { copilotPanel } from "./setups/copilot-panel";
import { guidePanel } from "./setups/guide-panel";
import { timelinePanel } from "./setups/timeline-panel";
import { carbonPanel } from "./setups/carbon-panel";
import { cobiePanel } from "./setups/cobie-panel";
import { ownerPanel } from "./setups/owner-panel";
import { tenderPanel } from "./setups/tender-panel";
import { rfiPanel } from "./setups/rfi-panel";
import { issuePanel } from "./setups/issue-panel";
import { cdePanel } from "./setups/cde-panel";
import { propertiesPanel } from "./setups/properties-panel";
import { projectBrowserPanel } from "./setups/project-browser-panel";
import { visibilityPanel } from "./setups/visibility-panel";
import { clashPanel } from "./setups/clash-panel";
import { plansPanel } from "./setups/plans-panel";
import { sheetsPanel } from "./setups/sheets-panel";
import { viewsPanel } from "./setups/views-panel";
import { projectsHubPanel } from "./setups/projects-hub-panel";
import { projectSwitcher } from "./setups/project-switcher";

// ─── A2 migration — PHASES 1+2: boot on UIManager + re-dock panels ───────────
// Juan consolidated the old AppManager (layout) + ViewportsManager (viewport)
// built-ins into the single UIManager built-in, which ships `top-app` (shell +
// layout) and `top-viewer` (deferred-PEN viewport). This boots the bim-viewer on
// that model.
//   Phase 1 — top-app shell hosting one top-viewer + auto-load.  [done]
//   Phase 2 — re-dock the side panels (tree/properties/files/data/objects/
//             settings) into top-app's layouts + sidebar.        [this file]
//   Phase 3 — the viewer-overlay tools (fps/HUD/gizmo/bottom toolbar/measure +
//             clip handles) that mount over the canvas.          [next]
// The pre-A2 rich main is preserved at `main.rich.ts.bak`.

/**
 * Wrap several existing panel elements into ONE panel with an internal tab bar, so related tools share a
 * single sidebar icon (keeps the activity bar short — nothing hidden below the fold). Each child keeps its
 * own state (reused by reference); only the active child is shown. Plain-DOM, iframe-safe.
 */
function tabbed(tabs: { label: string; el: HTMLElement }[]): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden;background:#16161a;border-radius:.5rem";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;flex-wrap:wrap;gap:.25rem;padding:.4rem .45rem;border-bottom:1px solid #2a2a30;flex:0 0 auto";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;display:flex";
  const btns: HTMLButtonElement[] = [];
  const show = (i: number) => {
    tabs.forEach((t, j) => {
      const on = j === i;
      t.el.style.display = on ? "flex" : "none";
      if (on) { t.el.style.flex = "1"; t.el.style.minHeight = "0"; }
    });
    btns.forEach((b, j) => {
      const on = j === i;
      b.style.background = on ? "#6528d7" : "#1f1f27";
      b.style.color = on ? "#fff" : "#c9cfda";
      b.style.borderColor = on ? "#6528d7" : "#2c2c34";
    });
  };
  tabs.forEach((t, i) => {
    const b = document.createElement("button");
    b.textContent = t.label;
    b.style.cssText = "border:1px solid #2c2c34;border-radius:.3rem;padding:.28rem .55rem;font:600 11px system-ui;cursor:pointer";
    b.addEventListener("click", () => show(i));
    btns.push(b);
    bar.appendChild(b);
    body.appendChild(t.el);
  });
  root.append(bar, body);
  show(0);
  return root;
}

async function main() {
  const client = PlatformClient.fromPlatformContext();

  // Brand accent (purple) — drives layout-selector active state, dividers, etc.
  document.documentElement.style.setProperty("--bim-ui_accent-base", "#6528d7");

  // The dev `thatopen serve` wrapper HTML doesn't zero the UA body margin (8px),
  // which insets the whole app inside the platform iframe. Kill it here so it's
  // fixed in both dev and production regardless of the host page.
  document.body.style.margin = "0";

  // UIManager must be in the setup call: it registers the platform web
  // components (top-app, top-viewer, top-viewer-tools, …) before the DOM renders.
  const { components } = await client.setup<OBC.Components>(
    { OBC, OBF, BUI, THREE, FRAGS, MARKERJS },
    { uuid: UIManager.uuid },
  );
  components.get(UIManager).init();

  // One STABLE top-viewer node, returned by reference so re-rendering top-app
  // (when we add the panels below) reuses it instead of disposing/recreating
  // its world. No <top-viewer-tools>: the bim-viewer mounts its own tabbed
  // visibility/inspect toolbar (see below), so the platform default would just
  // duplicate it.
  const viewerEl = document.createElement("top-viewer");
  // Frame the viewport to match the side panels (BUI bim-panel host = 1px border
  // + 0.75rem radius). top-viewer's host is already overflow:hidden, so the
  // radius clips the canvas corners; border-box keeps the 1px inside the grid
  // area. Done here (not in top-viewer) so the CDE's top-file-viewer, which draws
  // its own frame, never double-borders.
  viewerEl.style.border = "1px solid var(--bim-ui_bg-contrast-20)";
  viewerEl.style.borderRadius = "0.75rem";
  viewerEl.style.boxSizing = "border-box";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = document.createElement("top-app") as any;

  app.setup = (waitUntil: (p: Promise<void>, label?: string) => void) => {
    waitUntil(
      (async () => {
        const fragments = components.get(OBC.FragmentsManager);
        const workerUrl = await FRAGS.FragmentsModels.getWorker();
        fragments.init(await FRAGS.toClassicWorker(workerUrl), {
          classicWorker: true,
        });
      })(),
      "Fragments Core",
    );
    return { components, client };
  };

  // Mount minimally first (viewer only) so top-viewer creates the world; the
  // panels + their tools are built once that world exists (below).
  app.elements = { viewer: () => BUI.html`${viewerEl}` };
  app.layouts = {
    Main: {
      label: "Main",
      icon: "solar:3d-square-bold",
      template: `"viewer" 1fr / 1fr`,
    },
  };
  app.layout = "Main";

  const container = document.getElementById("that-open-app") ?? document.body;
  container.appendChild(app);

  // Wait for top-viewer's world to exist before building world-dependent panels.
  // The viewer tool suite + dynamic-anchor pivot dot are now baked into
  // <top-viewer> (setupViewerTools), so the app no longer wires them.
  await firstWorld(components.get(OBC.Worlds));

  // Platform client + project data for the AppManager-shim consumers
  // (CloudRunner, data-table-panel, app-info-section).
  const projectId: string | undefined = client?.context?.projectId;
  let projectData;
  try {
    if (projectId) projectData = await client.getProjectData(projectId);
  } catch {
    /* dev/no-project → consumers degrade gracefully */
  }
  setAppContext(client, projectData);

  // Pluggable loaders for <top-models-list>. The built-in ships the lightweight
  // defaults (.frag load, IFC→fragments convert); heavy/app-specific loaders are
  // registered here so they stay OUT of the built-in's bundle. The reality-capture
  // .3tz viewer pulls Spark + 3d-tiles-renderer, so it's lazy-imported app-side
  // and plugged in via the loader registry. Alignment persists through the panel's
  // app-data via the loader context (getAlignment/setAlignment).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rcViewer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelLoaders: Record<string, any> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "3tz": async (fileId: string, ctx: any) => {
      if (!rcViewer) {
        const { realityCaptureViewer } = await import(
          "./setups/reality-capture-viewer"
        );
        rcViewer = realityCaptureViewer(ctx.components, client);
      }
      const saved = ctx.getAlignment(fileId) as number[] | undefined;
      await rcViewer.loadIntoWorld(fileId, {
        keepPostproduction: true,
        transform: saved ? new THREE.Matrix4().fromArray(saved) : undefined,
        onTransformChange: (m: THREE.Matrix4) =>
          ctx.setAlignment(fileId, m.toArray()),
      });
    },
  };

  // In-browser 3D Modeling studio — author walls/columns/slabs, transform-edit, measure + markup,
  // all on the shared OBC world. Built once so its authored geometry survives layout switches.
  const modelEl = modelPanel(components, { baseUrl: SERVICE_URL });
  // One stable Sentinel QA panel, built now that the world + components exist.
  // Reused by reference so switching layouts doesn't reset its scan results.
  const qaEl = qaPanel(components, { baseUrl: SERVICE_URL });
  // Standards-pack marketplace — browse/install/fork/publish; install → QA + gates enforce it (Phase 4).
  const packsEl = packsPanel(components, { baseUrl: SERVICE_URL });
  // 5D Cost panel — model-driven quantity take-off → live BoQ + change tracking (Phase 1/2).
  const costEl = costPanel(components, { baseUrl: SERVICE_URL });
  // 4D Sequence panel — schedule ↔ elements + construction-sequence simulation (Phase 2).
  const timelineEl = timelinePanel(components);
  // 6D Carbon panel — model-driven embodied-carbon estimate (Phase 3).
  const carbonEl = carbonPanel(components, { baseUrl: SERVICE_URL });
  // 7D Handover panel — asset register + COBie export + handover readiness (Phase 3).
  const cobieEl = cobiePanel(components, { baseUrl: SERVICE_URL });
  // Owner / FM portal — read-only stakeholder view; the golden thread (Phase 3).
  const ownerEl = ownerPanel(components, { baseUrl: SERVICE_URL });
  // Tender module — BoQ-driven tendering + bid comparison; front of the lifecycle (Phase 4).
  const tenderEl = tenderPanel(components, { baseUrl: SERVICE_URL });
  // RFIs / approvals — coordination objects beside BCF issues (Phase 2).
  const rfiEl = rfiPanel(components, { baseUrl: SERVICE_URL });
  // Project Shell — the Lifecycle Command Center: aggregates health + issues + 5D cost + stage gates.
  const projectEl = projectShell(components, { baseUrl: SERVICE_URL });
  // Projects Hub — the "which project?" landing over the governed Supabase dataset. Opening a card
  // switches the whole app (active-project.ts) and drops you on the Project dashboard.
  const projectsHubEl = projectsHubPanel(components, {
    baseUrl: SERVICE_URL,
    onOpen: () => {
      app.layout = "Project";
    },
  });
  // Grounded Copilot — cited answers over the project's live data; optional local LLM for free-form.
  const copilotEl = copilotPanel(components, { baseUrl: SERVICE_URL });
  // Guide — interactive in-app teaching interface (what Sentinel is + every feature + how to use it).
  const guideEl = guidePanel(components);
  // Issue Management panel — docked as an "Issues" sidebar tab (create + list + details in one panel).
  const issuesEl = issuePanel(components, { bcfBaseUrl: SERVICE_URL });
  // CDE panel — ISO 19650 information-container board (WIP/Shared/Published/Archived) on Supabase.
  const cdeEl = cdePanel(components, { baseUrl: SERVICE_URL });
  // Properties Palette (Revit-influenced) — click an element → its IFC identity + property/quantity sets.
  const propsEl = propertiesPanel(components);
  // Project Browser (Revit-influenced) — Category → Type → Instance tree that drives selection.
  const browserEl = projectBrowserPanel(components);
  // Visibility / Graphics (Revit VG) — per-category hide/isolate/ghost/colour.
  const visEl = visibilityPanel(components, { baseUrl: SERVICE_URL });
  // Clash — headless, dedup.d AABB clash across loaded models -> BCF + CDE audit.
  const clashEl = clashPanel(components, { baseUrl: SERVICE_URL });
  // Floor Plans — 2D plan view per IFC storey (OBC.Views), generated from the 3D model.
  const plansEl = plansPanel(components);
  // Revit Sheets — PNGs the plugin renders (sheets aren't in the IFC), served by the Bridge.
  const sheetsEl = sheetsPanel(components, { baseUrl: SERVICE_URL });
  // Saved named views (Revit) — save/restore camera + zoom-fit.
  const viewsEl = viewsPanel(components);

  // Re-dock: the stable viewer + the panels, under the bim-viewer's named layouts
  // with the activity-bar sidebar (Explorer · Assets · Data · Settings). All panels
  // are now built-ins that self-wire from top-app's componentsContext/clientContext
  // — no `components` plumbing in the app.
  // Consolidate related panels into grouped tabs (internal sub-tabs) so the activity bar stays compact
  // and nothing is hidden below the fold. Each child panel keeps its own state (reused by reference).
  const bimToolsEl = tabbed([
    { label: "Browser", el: browserEl },
    { label: "Properties", el: propsEl },
    { label: "Visibility", el: visEl },
    { label: "Plans", el: plansEl },
    { label: "Sheets", el: sheetsEl },
    { label: "Views", el: viewsEl },
    { label: "Model", el: modelEl },
  ]);
  const coordEl = tabbed([
    { label: "Issues", el: issuesEl },
    { label: "RFIs", el: rfiEl },
    { label: "Clash", el: clashEl },
    { label: "CDE", el: cdeEl },
  ]);
  const lifecycleEl = tabbed([
    { label: "Cost 5D", el: costEl },
    { label: "Carbon 6D", el: carbonEl },
    { label: "4D Sequence", el: timelineEl },
    { label: "COBie 7D", el: cobieEl },
    { label: "Tender", el: tenderEl },
    { label: "Owner", el: ownerEl },
  ]);

  app.elements = {
    viewer: () => BUI.html`${viewerEl}`,
    tree: () => BUI.html`<top-model-tree></top-model-tree>`,
    properties: () => BUI.html`<top-properties-panel></top-properties-panel>`,
    files: () =>
      BUI.html`<top-models-list .loaders=${modelLoaders}></top-models-list>`,
    dataTable: () => BUI.html`<top-data-table-panel></top-data-table-panel>`,
    objects: () => BUI.html`<top-objects-panel></top-objects-panel>`,
    settings: () => BUI.html`<top-settings-panel></top-settings-panel>`,
    projectsHub: () => BUI.html`${projectsHubEl}`,
    project: () => BUI.html`${projectEl}`,
    copilot: () => BUI.html`${copilotEl}`,
    guide: () => BUI.html`${guideEl}`,
    qa: () => BUI.html`${qaEl}`,
    packs: () => BUI.html`${packsEl}`,
    // Consolidated groups (each hosts internal sub-tabs).
    bimtools: () => BUI.html`${bimToolsEl}`,
    coordination: () => BUI.html`${coordEl}`,
    lifecycle: () => BUI.html`${lifecycleEl}`,
  };
  // No `label` → the sidebar renders icon-only activity-bar buttons (matching
  // the pre-A2 look), background only on the active one.
  // Sidebar ordered top→bottom as the PROJECT LIFECYCLE, so the activity bar reads like the
  // stages: overview tools first, then Tender → Design → Construction → Coordination → Handover →
  // Operate, then Settings. (The activity bar is a flat icon list, so order carries the structure.)
  app.layouts = {
    // ── Overview / cross-cutting ──
    Projects: {
      icon: "mdi:view-grid-outline",
      template: `"projectsHub viewer" 1fr / 30rem 1fr`,
    },
    Project: {
      icon: "mdi:view-dashboard-outline",
      template: `"project viewer" 1fr / 26rem 1fr`,
    },
    Guide: {
      icon: "mdi:book-open-page-variant-outline",
      template: `"guide viewer" 1fr / 32rem 1fr`,
    },
    Copilot: {
      icon: "mdi:robot-outline",
      template: `"copilot viewer" 1fr / 24rem 1fr`,
    },
    // ── Consolidated groups (each hosts internal sub-tabs, so the activity bar stays short) ──
    "BIM Tools": {
      icon: "mdi:toolbox-outline",
      template: `"bimtools viewer" 1fr / 26rem 1fr`,
    },
    Coordination: {
      icon: "mdi:account-group-outline",
      template: `"coordination viewer" 1fr / 48rem 1fr`,
    },
    Lifecycle: {
      icon: "mdi:chart-timeline-variant",
      template: `"lifecycle viewer" 1fr / 26rem 1fr`,
    },
    // ── Platform built-ins + governance ──
    Explorer: {
      icon: "mdi:file-tree",
      template: `"tree viewer" 1fr "properties viewer" 1fr / 22rem 1fr`,
    },
    Assets: {
      icon: "mdi:folder-multiple-outline",
      template: `"files viewer" 1fr "objects viewer" 1fr / 22rem 1fr`,
    },
    Data: {
      icon: "mdi:table",
      template: `"dataTable viewer" 1fr / 22rem 1fr`,
    },
    Standards: {
      icon: "mdi:store-outline",
      template: `"packs viewer" 1fr / 24rem 1fr`,
    },
    QA: {
      icon: "mdi:clipboard-check-outline",
      template: `"qa viewer" 1fr / 24rem 1fr`,
    },
    Settings: {
      icon: "mdi:cog",
      template: `"settings viewer" 1fr / 22rem 1fr`,
    },
  };
  app.layout = "Project";
  app.sidebar = true;

  // Global project switcher — a persistent floating pill (layout-independent) so you can switch the
  // active project from anywhere; "Manage projects…" opens the hub. Appended to the shell container,
  // not a BUI layout, so it survives activity-bar navigation.
  container.appendChild(
    projectSwitcher({
      baseUrl: SERVICE_URL,
      onManage: () => {
        app.layout = "Projects";
      },
    }),
  );

  // ── Viewer toolbar — now a built-in slotted INTO <top-viewer> (it consumes the
  // world + components contexts top-viewer provides). The rich bottom toolbar +
  // active-tool HUD + clip/measure/walkthrough tools all live in
  // <top-viewer-toolbar>; the side panels share the SAME tool singletons via
  // components.get (OBC.Component-wrapped).
  viewerEl.appendChild(document.createElement("top-viewer-toolbar"));

  // Navigation gizmo is now baked into <top-viewer> (setupViewerTools), so the
  // app no longer mounts it. (Cascade: the rest of the overlay tools follow.)

  // No auto-load: the viewer opens empty. Users add models from the Assets
  // (files) panel — top-models-list loads the .frag they pick into the world.
}

/** Resolves with the first world once it exists (top-viewer creates it async). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstWorld(worlds: any): Promise<any> {
  const existing = [...worlds.list.values()][0];
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = ({ value }: any) => {
      worlds.list.onItemSet.remove(handler);
      resolve(value);
    };
    worlds.list.onItemSet.add(handler);
  });
}

main().catch(console.error);
