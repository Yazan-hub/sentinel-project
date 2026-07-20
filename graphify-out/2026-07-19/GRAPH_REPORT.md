# Graph Report - sentinel-project  (2026-07-19)

## Corpus Check
- 233 files · ~201,088 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2526 nodes · 4105 edges · 153 communities (131 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 64 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8a908ed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SentinelAddin/UI
- SentinelAddin/UI
- SentinelAddin/Engine
- WebApp/bridge
- SentinelAddin/Standards
- SentinelAddin/UI
- src/setups
- src/sentinel-core
- SentinelAddin/Workflow
- src/setups
- src/sentinel-core
- bim-components/CloudRunner
- SentinelAddin/Engine
- src/sentinel-core
- src/setups
- src/setups
- src/setups
- src/setups
- src/setups
- setups/copilot
- SentinelAddin/Engine
- src/setups
- src/setups
- SentinelAddin/Standards
- SentinelAddin
- SentinelAddin/GhostBuilder
- WebApp/bridge
- SentinelAddin/UI
- SentinelAddin/UI
- SentinelAddin/Updaters
- SentinelAddin/Engine
- SentinelAddin/UI
- SentinelAddin
- SentinelAddin/GhostBuilder
- SentinelAddin/Workflow
- WebApp
- SentinelAddin/GhostBuilder
- SentinelAddin/UI
- src/setups
- SentinelAddin
- SentinelAddin/Workflow
- src/setups
- SentinelAddin/UI
- SentinelAddin/GhostBuilder
- src/sentinel-core
- src/setups
- SentinelAddin/GhostBuilder
- SentinelAddin/UI
- SentinelAddin
- SentinelAddin/Engine
- SentinelAddin/Workflow
- SentinelAddin
- SentinelAddin/Workflow
- reality-capture/lib
- src/setups
- SentinelAddin/Updaters
- SentinelAddin/Standards
- WebApp
- src/setups
- sentinel-core/adapter
- src/sentinel-core
- SentinelAddin/UI
- SentinelAddin
- SentinelAddin
- SentinelAddin/Standards
- SentinelAddin/Standards
- SentinelAddin/Standards
- SentinelAddin/Workflow
- src/setups
- src/setups
- SentinelAddin/Engine
- SentinelAddin/Standards
- SentinelAddin/UI
- WebApp
- SentinelAddin/UI
- SentinelAddin
- sentinel-core/adapter
- sentinel-core/adapter
- src/setups
- SentinelAddin/Engine
- SentinelAddin
- SentinelAddin/GhostBuilder
- SentinelAddin/Engine
- WebApp
- src/setups
- reality-capture/lib
- SentinelAddin/GhostBuilder
- SentinelAddin/Engine
- SentinelAddin/UI
- src/setups
- src/setups
- src/setups
- SentinelAddin/UI
- SentinelAddin
- SentinelAddin
- SentinelAddin
- SentinelAddin/Engine
- SentinelAddin
- SentinelAddin
- SentinelAddin
- reality-capture/lib
- reality-capture/lib
- src/setups
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp
- WebApp/src
- WebApp
- SentinelAddin
- CHAT_TRANSCRIPT.md
- Sentinel — BIM Coordinator Plugin for Revit
- 3D Authoring → real IFC — scope
- Sentinel — Auth + RLS design (the "C4")
- Sentinel Platform — Pilot Onboarding (first run in ~15 min)
- BcfIssuesWindow
- Sentinel.Workflow
- Sentinel Platform — A→Z Manual Test Script
- Sentinel — Strategic Deep Review & Sector-Defining Positioning
- Sentinel — Full Test Report
- DeliveryContract
- Overnight work report — 2026-07-16
- The Sentinel Platform — from a Revit plugin to a project-delivery operating system
- LocalGhostBuilder
- Sentinel — Plugin Summary & Tool Guide
- fragments-facts.ts
- .Read
- Phase 2 — Technical Spec: Time, Cost & Gates across the lifecycle
- 1. Market analysis — where AEC/BIM software actually breaks
- Sentinel — Install (Revit 2021–2027)
- plans-panel.ts
- Part A — The Project Shell
- Phase 3 — Technical Spec: Handover & the Golden Thread
- CdeSyncGuard
- Sentinel Platform
- .ToRevit
- ClashManager.cs
- package.json
- AGENTS.md
- potree-core
- README.md
- @supabase/supabase-js
- @thatopen-platform/components-beta
- @thatopen-platform/components-front-beta

## God Nodes (most connected - your core abstractions)
1. `Extract content if wrapped in markdown blocks safely, then save` - 160 edges
2. `Restart the dev server` - 118 edges
3. `activePid()` - 38 edges
4. `3. Restart the dev server` - 36 edges
5. `Sentinel.Engine` - 30 edges
6. `main()` - 30 edges
7. `StandardsPack` - 25 edges
8. `getAppManager()` - 25 edges
9. `Rule` - 22 edges
10. `BcfApplyEvent` - 20 edges

## Surprising Connections (you probably didn't know these)
- `projectShell()` --indirect_call--> `snap()`  [INFERRED]
  WebApp/src/setups/project-shell.ts → WebApp/src/sentinel-core/revision-diff.test.ts
- `plansPanel()` --indirect_call--> `box()`  [INFERRED]
  WebApp/src/setups/plans-panel.ts → WebApp/src/sentinel-core/clash.test.ts
- `clashPanel()` --indirect_call--> `run()`  [INFERRED]
  WebApp/src/setups/clash-panel.ts → WebApp/src/setups/camera-tools.ts
- `timelinePanel()` --indirect_call--> `kg()`  [INFERRED]
  WebApp/src/setups/timeline-panel.ts → WebApp/src/setups/carbon-panel.ts
- `App` --references--> `RuleEngineHost`  [EXTRACTED]
  SentinelAddin/App.cs → SentinelAddin/Engine/RuleEngineHost.cs

## Import Cycles
- None detected.

## Communities (153 total, 22 thin omitted)

### Community 0 - "SentinelAddin/UI"
Cohesion: 0.14
Nodes (10): ElementSet, ExternalCommandData, Result, IReadOnlyList, Action, CancellationToken, HttpClient, IReadOnlyList (+2 more)

### Community 1 - "SentinelAddin/UI"
Cohesion: 0.08
Nodes (48): getAppManager(), setAppContext(), SERVICE_URL, firstWorld(), main(), tabbed(), BakeElement, bdsRuleset (+40 more)

### Community 2 - "SentinelAddin/Engine"
Cohesion: 0.18
Nodes (13): ReconcileReport, Action, BuiltInCategory, Document, double, Element, List, string (+5 more)

### Community 3 - "WebApp/bridge"
Cohesion: 0.08
Nodes (46): addVersion(), audit(), cdeConfigured(), createContainer(), createFolder(), createProject(), createTransmittal(), DEFAULT_TREE (+38 more)

### Community 4 - "SentinelAddin/Standards"
Cohesion: 0.06
Nodes (34): BcfIssue, Grade, HostCategory, HostId, HostName, LinkName, LocationText, OtherName (+26 more)

### Community 5 - "SentinelAddin/UI"
Cohesion: 0.09
Nodes (21): ExtractDto, NrDto, CancellationToken, Dictionary, double, HttpClient, IEnumerable, int (+13 more)

### Community 6 - "src/setups"
Cohesion: 0.11
Nodes (20): DataStorage, Document, Guid, JsonSerializerOptions, Schema, string, SentinelSettings, SettingsManager (+12 more)

### Community 7 - "src/sentinel-core"
Cohesion: 0.10
Nodes (31): ElementProperties, extractElementProperties(), parseElementProperties(), PROPERTY_DATA_CONFIG, PropGroup, PropRow, val(), ModelValidation (+23 more)

### Community 8 - "SentinelAddin/Workflow"
Cohesion: 0.12
Nodes (31): extractFacts(), quantityTakeoff(), buildBoQ(), defaultRates, buildScorecard(), DomainScore, gradeFor(), Scorecard (+23 more)

### Community 9 - "src/setups"
Cohesion: 0.08
Nodes (45): buildCarbon(), CarbonFactor, CarbonFactors, CarbonLine, CarbonReport, defaultFactors, resolveFactor(), EvaluatedCheck (+37 more)

### Community 10 - "src/sentinel-core"
Cohesion: 0.07
Nodes (24): FamilyVerdict, HealResult, IFamilyLoadOptions, SanitationReport, Action, Application, Document, Family (+16 more)

### Community 11 - "bim-components/CloudRunner"
Cohesion: 0.11
Nodes (32): Audit, cdePanel(), Container, Folder, NEXT, State, STATE_COLOR, STATE_LABEL (+24 more)

### Community 12 - "SentinelAddin/Engine"
Cohesion: 0.10
Nodes (15): CloudRunner, TODO: Replace with your actual component ID after publishing., CloudRunnerStatus, cloudRunner(), CustomUIs, getUIManager(), uiManager(), appInfoSectionTemplate() (+7 more)

### Community 13 - "src/sentinel-core"
Cohesion: 0.15
Nodes (10): Button, Action, Brush, Func, IReadOnlyList, List, TextBlock, StandardsReviewWindow (+2 more)

### Community 14 - "src/setups"
Cohesion: 0.17
Nodes (18): Dictionary, Document, Element, ElementId, Func, IEnumerable, IReadOnlyList, List (+10 more)

### Community 15 - "src/setups"
Cohesion: 0.19
Nodes (8): LayerMapping, bool, CancellationToken, Dictionary, IEnumerable, string, ILayerMapper, LayerMapper

### Community 16 - "src/setups"
Cohesion: 0.22
Nodes (13): escapeRegex(), make(), RuleEngine, flatScore(), isExcluded(), matchesCategory(), scan(), ScanContext (+5 more)

### Community 17 - "src/setups"
Cohesion: 0.26
Nodes (9): DefinitionFile, Application, Category, Definition, Document, string, UIApplication, StandardsBuilder (+1 more)

### Community 18 - "src/setups"
Cohesion: 0.10
Nodes (13): Sentinel, ExternalEvent, Queue, BuiltInCategory, Category, Dictionary, Element, ElementId (+5 more)

### Community 19 - "setups/copilot"
Cohesion: 0.15
Nodes (23): capabilities(), carbonM(), catIn(), CATS, CopilotIssue, costByCatM(), costM(), countM() (+15 more)

### Community 20 - "SentinelAddin/Engine"
Cohesion: 0.12
Nodes (14): bytes, state, DateTime, path, bool, Document, AutoPublish, Document (+6 more)

### Community 21 - "src/setups"
Cohesion: 0.18
Nodes (20): attr(), collectNames(), extractAssets(), firstOf(), flatten(), MAINTAINABLE, toAsset(), assess() (+12 more)

### Community 22 - "src/setups"
Cohesion: 0.19
Nodes (13): BakeKind, buildIfc(), cap(), ifcGuid(), iso(), KindDef, KINDS, R() (+5 more)

### Community 23 - "SentinelAddin/Standards"
Cohesion: 0.15
Nodes (14): Curve, Dictionary, Document, double, IEnumerable, IList, ImportInstance, int (+6 more)

### Community 24 - "SentinelAddin"
Cohesion: 0.14
Nodes (10): ControlledApplication, FailuresProcessingEventArgs, IFailuresPreprocessor, FailureProcessingResult, FailuresAccessor, GhostFailureHandler, FailureProcessingResult, FailuresAccessor (+2 more)

### Community 25 - "SentinelAddin/GhostBuilder"
Cohesion: 0.12
Nodes (15): db, defaultProject(), getProject(), pdb, persist(), persistPack(), persistProj(), persistRfi() (+7 more)

### Community 26 - "WebApp/bridge"
Cohesion: 0.08
Nodes (21): DoctorHeader, DoctorLog, ElementName, FixVisibility, Message, ScoreText, Status, Violations (+13 more)

### Community 27 - "SentinelAddin/UI"
Cohesion: 0.20
Nodes (7): GateResult, DateTimeOffset, Dictionary, List, Regex, GateResult, IfcDeliveryGate

### Community 28 - "SentinelAddin/UI"
Cohesion: 0.06
Nodes (35): ArVisibility, ExtraInfo, ExtraVisibility, Header, Id, MessageAr, MessageEn, ModeBackground (+27 more)

### Community 29 - "SentinelAddin/Updaters"
Cohesion: 0.26
Nodes (8): Payload, DataStorage, Document, Guid, IReadOnlyList, Schema, string, RequestStore

### Community 30 - "SentinelAddin/Engine"
Cohesion: 0.11
Nodes (17): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, esModuleInterop, isolatedModules (+9 more)

### Community 31 - "SentinelAddin/UI"
Cohesion: 0.01
Nodes (160): 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant (+152 more)

### Community 33 - "SentinelAddin/GhostBuilder"
Cohesion: 0.11
Nodes (12): BitmapImage, DockablePaneId, DocumentSavedEventArgs, IExternalApplication, RibbonPanel, DocumentSynchronizedWithCentralEventArgs, Result, App (+4 more)

### Community 34 - "SentinelAddin/Workflow"
Cohesion: 0.20
Nodes (7): EventArgs, FillPatternElement, SavedState, Document, object, UIApplication, ShowPendingChangeCommand

### Community 35 - "WebApp"
Cohesion: 0.15
Nodes (12): MODES, SNAPS, AngleUnit, AreaUnit, LengthUnit, MeasurementRow, MeasurementSettings, MeasurementToolComponent (+4 more)

### Community 36 - "SentinelAddin/GhostBuilder"
Cohesion: 0.16
Nodes (9): CancellationTokenSource, ElementSet, ExternalCommandData, PlacementReport, Result, GhostBuilderCommand, CancellationToken, TextBlock (+1 more)

### Community 37 - "SentinelAddin/UI"
Cohesion: 0.32
Nodes (7): CurveLoop, IReadOnlyDictionary, Outcome, Curve, Document, ElementPlacementFactory, GhostElement

### Community 38 - "src/setups"
Cohesion: 0.16
Nodes (12): Inputs, List, MappingResult, double, UIApplication, GhostBuilderPlacementEvent, CancellationToken, Document (+4 more)

### Community 41 - "src/setups"
Cohesion: 0.13
Nodes (12): count, DependencyReport, dir, Document, ElementId, List, DependencyMapper, DependencyReport (+4 more)

### Community 42 - "SentinelAddin/UI"
Cohesion: 0.13
Nodes (10): Sentinel.GhostBuilder, ProvisionReport, Outcome, List, Inputs, Document, int, List (+2 more)

### Community 43 - "SentinelAddin/GhostBuilder"
Cohesion: 0.19
Nodes (8): INotifyPropertyChanged, Action, double, IReadOnlyList, ObservableCollection, string, SentinelPanelViewModel, UpdaterData

### Community 44 - "src/sentinel-core"
Cohesion: 0.05
Nodes (40): Sentinel.Commands, IExternalCommand, ElementSet, ExternalCommandData, Result, ToggleAutoPublishCommand, ElementSet, ExternalCommandData (+32 more)

### Community 45 - "src/setups"
Cohesion: 0.18
Nodes (23): attr(), catIds(), countIds(), elementLevels(), elementSide(), group(), LevelGroup, num() (+15 more)

### Community 46 - "SentinelAddin/GhostBuilder"
Cohesion: 0.33
Nodes (7): DateTimeOffset, Guid, AuditEntry, ChangeRequest, RequestStatus, List, Payload

### Community 47 - "SentinelAddin/UI"
Cohesion: 0.02
Nodes (118): 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant (+110 more)

### Community 48 - "SentinelAddin"
Cohesion: 0.30
Nodes (6): Dictionary, Document, Element, Guid, string, RequestManager

### Community 49 - "SentinelAddin/Engine"
Cohesion: 0.19
Nodes (8): Decoded, getPool(), pointMaterial, PointTilePlugin, pointUniforms, setPointSize(), frame, placeAtAnchor()

### Community 51 - "SentinelAddin"
Cohesion: 0.13
Nodes (15): 3d-tiles-renderer, camera-controls, @sparkjsdev/spark, @thatopen-platform/fragments-beta, @thatopen/services, @thatopen/ui, three, dependencies (+7 more)

### Community 52 - "SentinelAddin/Workflow"
Cohesion: 0.17
Nodes (7): ChangePriority, DocumentOpenedEventArgs, IUpdater, Dictionary, Document, SentinelUpdater, UpdaterId

### Community 53 - "reality-capture/lib"
Cohesion: 0.20
Nodes (6): Sentinel.Standards, DuplicateTypeAction, DuplicateTypeNamesHandlerArgs, IDuplicateTypeNamesHandler, DocPage, UseDestinationTypes

### Community 54 - "src/setups"
Cohesion: 0.05
Nodes (39): 0. Cross-cutting synthesis & build order, 1.1 Core functional backbone & logic, 1.2 Graphics feasibility (all already proven in `visibility-panel.ts`), 1.3 Trust-gap protocol, 1.4 Web implementation blueprint, 1.5 Unfair advantage, 1. Solibri Model Checker + IDS → web build-spec, 2.1 Core functional backbone & logic (+31 more)

### Community 55 - "SentinelAddin/Updaters"
Cohesion: 0.24
Nodes (10): detectDrawings(), DRAWING_CATS, DrawingScan, buildProjectTree(), labelFor(), LABELS, TreeCategory, TreeInstance (+2 more)

### Community 56 - "SentinelAddin/Standards"
Cohesion: 0.26
Nodes (13): attrVal(), ClashRun, itemsFor(), pickGuid(), runClash(), Aabb, boxesClash(), Clash (+5 more)

### Community 57 - "WebApp"
Cohesion: 0.18
Nodes (4): InspectionAction, InspectionInstances, InstanceKind, InstanceRow

### Community 58 - "src/setups"
Cohesion: 0.11
Nodes (17): Category, NewValue, OldValue, RequestedBy, When, RequestList, SubHeader, Window (+9 more)

### Community 59 - "sentinel-core/adapter"
Cohesion: 0.12
Nodes (11): CheckBox, Sentinel.Engine, Sentinel.UI, Sentinel.Updaters, Brush, IReadOnlyList, Visibility, RuleCard (+3 more)

### Community 60 - "src/sentinel-core"
Cohesion: 0.33
Nodes (5): IReadOnlyList, IsoCheck, IsoGapAnalyzer, IsoGapReport, IsoStatus

### Community 61 - "SentinelAddin/UI"
Cohesion: 0.27
Nodes (4): Action, Document, Element, AutoFixExecution

### Community 62 - "SentinelAddin"
Cohesion: 0.24
Nodes (8): clipper(), HelperPanelController, ActionTool, ModeTool, PanelTool, ToggleTool, Tool, toolbar()

### Community 63 - "SentinelAddin"
Cohesion: 0.22
Nodes (6): ClipEdges, ClipperToolComponent, clipperToolImpl(), SectionStyle, ManagedTool, ToolModeManagerComponent

### Community 64 - "SentinelAddin/Standards"
Cohesion: 0.17
Nodes (3): BG, Format, LoadIntoWorldOpts

### Community 65 - "SentinelAddin/Standards"
Cohesion: 0.27
Nodes (6): BuiltInParameter, BuiltInCategory, Document, Element, string, IfcPreFlightScanner

### Community 66 - "SentinelAddin/Standards"
Cohesion: 0.25
Nodes (9): ExternalDefinitionCreationOptions, ForgeTypeId, ParameterType, Definition, Is(), ParamTypeFor(), StandardsCompat, SpecFor() (+1 more)

### Community 67 - "SentinelAddin/Workflow"
Cohesion: 0.06
Nodes (36): 3. Restart the dev server, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant, 🤖 Assistant (+28 more)

### Community 68 - "src/setups"
Cohesion: 0.36
Nodes (9): List, BrowserOrgSpec, NamingRuleSpec, Provenance, ProvisionSet, SharedParamSpec, SourceModel, ViewTemplateSpec (+1 more)

### Community 69 - "src/setups"
Cohesion: 0.06
Nodes (30): 1. Executive Summary, 2. Tool-by-Tool Assessment, 3. SYNCHRO 4D Deep-Dive (primary reference), 4. Cross-Cutting Problems (ranked by evidence strength), 4D BIM Construction Sequencing Software — Market Analysis, 5. Ranked Opportunities for a Web Platform, 6. Key uncertainties flagged, Tier 1 — build first (high impact, high feasibility) (+22 more)

### Community 70 - "SentinelAddin/Engine"
Cohesion: 0.22
Nodes (9): @types/three, typescript, vite, vitest, devDependencies, @types/three, typescript, vite (+1 more)

### Community 71 - "SentinelAddin/Standards"
Cohesion: 0.29
Nodes (5): areaMeasurement(), canvasOf(), lengthMeasurement(), NOTE: the click-to-add-point vs. double-click-to-create flow is worth a live, ModeTool

### Community 72 - "SentinelAddin/UI"
Cohesion: 0.19
Nodes (11): char, Document, double, ElementId, Guid, HashSet, IList, UIApplication (+3 more)

### Community 73 - "WebApp"
Cohesion: 0.38
Nodes (5): Document, Func, GoldenModelExtractor, JsonSerializerOptions, StandardsPack

### Community 74 - "SentinelAddin/UI"
Cohesion: 0.18
Nodes (12): BoundingBoxXYZ, BuiltInCategory, Document, double, Element, IEnumerable, List, XYZ (+4 more)

### Community 75 - "SentinelAddin"
Cohesion: 0.27
Nodes (8): CONTAINS_KEYS, isolateStoreyByName(), norm(), StoreyIsolation, val(), SheetItem, SheetSet, Viewport

### Community 76 - "sentinel-core/adapter"
Cohesion: 0.27
Nodes (5): CameraTools, firstWorld(), run(), cameraViews(), VIEWS

### Community 77 - "sentinel-core/adapter"
Cohesion: 0.24
Nodes (6): esc(), fmtDate(), FRAGS_Model, issuePanel(), STATUS_COLOR, Topic

### Community 78 - "src/setups"
Cohesion: 0.12
Nodes (16): 0. The three findings that shape everything, 1. The landscape by lifecycle stage, 2. The cost a firm pays today (the pitch, quantified), 3. Beachheads (moments of market dislocation to exploit), 4. Ranked target shortlist — what to deconstruct & replicate first, 4D scheduling — *clean gap: no browser-native mid-market 4D exists* 🎯, 5. Next step, 5D costing / take-off — *no web-native NRM/CESMM estimator exists* 🎯 (+8 more)

### Community 79 - "SentinelAddin/Engine"
Cohesion: 0.22
Nodes (8): net10.0-windows, net48, net8.0-windows, Nice3point.Revit.Api.RevitAPI ($(RevitVersion).*), Nice3point.Revit.Api.RevitAPIUI ($(RevitVersion).*), PdfPig (0.1.*), System.Text.Json (8.0.*), Microsoft.NET.Sdk

### Community 80 - "SentinelAddin"
Cohesion: 0.22
Nodes (7): PreloadReport, Document, int, List, string, GhostFamilyPreloader, PreloadReport

### Community 81 - "SentinelAddin/GhostBuilder"
Cohesion: 0.16
Nodes (10): DomainScore, Scorecard, DateTimeOffset, List, DomainScore, HealthScorecard, Scorecard, DateTimeOffset (+2 more)

### Community 82 - "SentinelAddin/Engine"
Cohesion: 0.20
Nodes (10): scripts, bcf:serve, bridge:upload, bridge:watch, build, dev, login, publish (+2 more)

### Community 83 - "WebApp"
Cohesion: 0.18
Nodes (15): attr(), COSTABLE, fromModel(), num(), prefer(), QtoResult, readQto(), toQuantities() (+7 more)

### Community 84 - "src/setups"
Cohesion: 0.12
Nodes (15): Build, Debugging "IFC not responding", Features built into `src/main.ts`, Files produced (`C:\Users\yazan\ThatOpenCompany\Launchpad\Sentinel\`), Key decisions / bugs caught, Known LOD-200 simplifications (marked `ponytail:`), Offline asset details, Open follow-ups (+7 more)

### Community 85 - "reality-capture/lib"
Cohesion: 0.25
Nodes (3): HiddenTilesClient, HiddenTilesOptions, HiddenTilesPlugin

### Community 86 - "SentinelAddin/GhostBuilder"
Cohesion: 0.29
Nodes (12): accessToken(), currentSession(), currentUser(), onAuthChange(), sendEmailCode(), signInWithPassword(), signOut(), supabase() (+4 more)

### Community 87 - "SentinelAddin/Engine"
Cohesion: 0.14
Nodes (13): 1. Authoring & design tools, 2. Coordination · clash · model-checking / QA-QC · issue tracking, 2a. Federation & clash, 2b. Model checking / QA-QC, 2c. Issue tracking / BCF backbones, 3. Revit data & parameter plugins *(replicate as a bundled feature — this layer commoditizes to $0)*, 4. 4D scheduling / construction sequencing, 5. 5D costing / quantity take-off (+5 more)

### Community 88 - "SentinelAddin/UI"
Cohesion: 0.32
Nodes (5): cardHeader(), DEFAULT, emptyState(), HelperContent, helperPanel()

### Community 91 - "src/setups"
Cohesion: 0.46
Nodes (6): hex(), control(), stylesTool(), styles(), StyleSetting, stylesLastBg

### Community 92 - "SentinelAddin/UI"
Cohesion: 0.14
Nodes (13): Codebase analysis · AECO market research · That Open Company bridge · Killer-feature pitch, KF-1 · IFC Delivery Contract — "CI/CD for IFC" ⭐ highest conviction, KF-2 · Coordination Memory — clash intelligence that learns the office, KF-3 · Living Handover — COBie/twin data assembled continuously, not at PC, KF-4 · Cross-Model Referee — multi-file rule enforcement at CDE level, KF-5 (opportunistic) · Void Marketplace — the openings workflow as a protocol, Phase 1 — What we have built (capability audit), Phase 2 — Market research: where the industry is bleeding (July 2026) (+5 more)

### Community 93 - "SentinelAddin"
Cohesion: 0.29
Nodes (5): ISelectionFilter, Reference, Element, XYZ, CadImportFilter

### Community 94 - "SentinelAddin"
Cohesion: 0.18
Nodes (10): RoiEntry, RoiSummary, DateTimeOffset, Dictionary, double, List, object, RoiEntry (+2 more)

### Community 95 - "SentinelAddin"
Cohesion: 0.48
Nodes (6): Baseline, costPanel(), esc(), fmtDate(), money(), qtyFmt()

### Community 96 - "SentinelAddin/Engine"
Cohesion: 0.22
Nodes (4): Sentinel.Coordination, BcfConfig, BcfIssuesCommand, BcfOp

### Community 97 - "SentinelAddin"
Cohesion: 0.27
Nodes (10): IEnumerable, List, BcfComment, BcfComponent, BcfComponents, BcfHistory, BcfTopic, BcfViewpoint (+2 more)

### Community 98 - "SentinelAddin"
Cohesion: 0.17
Nodes (11): 1. Codebase & idea synthesis — what we've built, 2. Market gap analysis — 3 bottlenecks worth attacking, 3. Killer features — 3 to 5, evaluating your three concepts, 4. The pick + architecture — **KF-B: IDS validation + colour-coding**, 5. Development rules (agreed), Data model (the IDS spec, parsed), Phase B1 — Logic (no visuals; log to console/report), Phase B2 — Visuals (only after B1 verifies) (+3 more)

### Community 99 - "SentinelAddin"
Cohesion: 0.17
Nodes (10): IExternalEventHandler, ElementSet, ExternalCommandData, Result, UIApplication, BuildOfficeSystemCommand, IngestDocumentsCommand, LoadOfficeSystemCommand (+2 more)

### Community 102 - "src/setups"
Cohesion: 0.50
Nodes (3): STAGES, Topic, TOPICS

### Community 105 - "WebApp"
Cohesion: 0.17
Nodes (12): 0. What already exists (build on, don't reinvent), B1. Quantity take-off — `sentinel-core/quantities.ts` (pure, like `scanner.ts`), B2. Rate library — `sentinel-core/rates.json` (editable), B3. BoQ aggregation — `buildBoQ(quantities, rates): BoQ`, B4. The 5D panel — `setups/cost-panel.ts`, ✅ Built (Phase 1 — v1.0.5), Data flow, Files (+4 more)

### Community 110 - "WebApp"
Cohesion: 0.17
Nodes (11): Adding a built-in feature (the general pattern), Architecture, Built-in components, Commands, Configuration, How this app works, Key libraries, Loading a BIM model (+3 more)

### Community 111 - "WebApp"
Cohesion: 0.17
Nodes (11): 0. The core idea (why this is the spine, not another feature), 1. The JSON schema — `standards-pack.json`, 2. The extraction pipeline (mirror the `LayerMapper` tier pattern), 3. "Extract from Active Document" — the C# scraper, 4. Human-in-the-loop review UI, 5. The Builder (execution) — `Sentinel.Standards.StandardsBuilder`, 6. How it plugs into everything (no rewrites), 7. MVP cut (build this first — proves the spine, zero AI) (+3 more)

### Community 112 - "WebApp/src"
Cohesion: 0.17
Nodes (12): 10. Issues & RFIs, 11. The gate loop (the payoff), 1. Project (landing) — the command center, 2. Copilot — grounded answers, 3. QA — the scan, 4. Cost · 5D, 5. Tender ⚖ (front of the lifecycle), 6. 4D — sequence simulation (+4 more)

### Community 118 - "CHAT_TRANSCRIPT.md"
Cohesion: 0.18
Nodes (10): 1. Install the frontend components and UI library, 2. Overwrite main.ts with the fully-featured BIM boilerplate, 🤖 Assistant, 🤖 Assistant, Full Chat Transcript, Save the raw output directly to your Sentinel directory, 🧑 User, 🧑 User (+2 more)

### Community 119 - "Sentinel — BIM Coordinator Plugin for Revit"
Cohesion: 0.18
Nodes (10): 1. The Idea, 2. Market Analysis — Key Findings, 3. Decisions Made, 4. Ruleset — Grounded in BDS V1.4 Documents, 5. Architecture (agreed), 6. Build Plan, 7. Files Produced, 8. Immediate Next Steps (+2 more)

### Community 120 - "3D Authoring → real IFC — scope"
Cohesion: 0.20
Nodes (9): 1. Goal & non-goals, 2. Architecture — "edit layer + bake" (recommended), 3. IFC content per element (the hard part), 3D Authoring → real IFC — scope, 4. Integration touchpoints (all verified in the current code), 5. Levels / placement, 6. Phasing & effort, 7. Open decisions (+1 more)

### Community 121 - "Sentinel — Auth + RLS design (the "C4")"
Cohesion: 0.20
Nodes (9): 1. Principle, 2. Auth model, 3. Roles & permission matrix, 4. RLS policy design (per table), 5. The one subtlety that makes rollout non-breaking, 6. Staged rollout (each stage independently shippable, app never dark), 7. What changes, file by file, 8. Open decisions / risks (+1 more)

### Community 122 - "Sentinel Platform — Pilot Onboarding (first run in ~15 min)"
Cohesion: 0.20
Nodes (10): 0. Prerequisites (once), 1. Start the backend (30 sec), 2. Open the app, 3. Load a model, 4. Walk the workflow (the A→Z tour), Data & backup, Multi-user / shared pilot, Revit side (optional) (+2 more)

### Community 123 - "BcfIssuesWindow"
Cohesion: 0.31
Nodes (4): ListBox, IReadOnlyList, TextBlock, BcfIssuesWindow

### Community 124 - "Sentinel.Workflow"
Cohesion: 0.22
Nodes (6): Sentinel.Workflow, OverrideGraphicSettings, List, Settings, ElementId, SavedState

### Community 125 - "Sentinel Platform — A→Z Manual Test Script"
Cohesion: 0.22
Nodes (4): Prereqs, Report back, Sentinel Platform — A→Z Manual Test Script, What's already verified headlessly (you don't need to re-check)

### Community 126 - "Sentinel — Strategic Deep Review & Sector-Defining Positioning"
Cohesion: 0.22
Nodes (8): 0. Executive summary, Part I — Internal Deep Review: Weaknesses & Resolutions, Part II — The Market: pain, priced and dated, Part III — The white space & the wedge, Part IV — The sector-changing play, Part V — Honest risks & what to validate, Resolutions — recommended order of attack, Sentinel — Strategic Deep Review & Sector-Defining Positioning

### Community 127 - "Sentinel — Full Test Report"
Cohesion: 0.22
Nodes (8): 1. Automated results, 2. Bugs found & fixed, 3. Code review — no further bugs; known limitations (by design), 4. Revit in-process load smoke-test — ✅ PASS, 5. What I could NOT test — manual GUI checklist for you, 6. Addendum (2026-07-16) — deferred items closed + bridge hardening, BCF service — verified behaviour, Sentinel — Full Test Report

### Community 128 - "DeliveryContract"
Cohesion: 0.25
Nodes (6): EntityLimit, EntityRequirement, List, DeliveryContract, EntityLimit, EntityRequirement

### Community 129 - "Overnight work report — 2026-07-16"
Cohesion: 0.25
Nodes (7): 1. Headline: the CDE is real and running, 2. Also shipped, 3. Verification status (honest), 4. ⚠️ Two things only you can do, 5. Where the roadmap stands, 6. Commits this session, Overnight work report — 2026-07-16

### Community 130 - "The Sentinel Platform — from a Revit plugin to a project-delivery operating system"
Cohesion: 0.25
Nodes (8): 2. The idea, developed — a project-delivery operating system, 3. Platform architecture (layers), 4. Sentinel already seeds ~40% of this, 5. Roadmap — Sentinel → Platform, 6. First version (the prototype), The dimensions, as views on one model, The lifecycle, as gated workflows, The Sentinel Platform — from a Revit plugin to a project-delivery operating system

### Community 131 - "LocalGhostBuilder"
Cohesion: 0.25
Nodes (6): IDisposable, CancellationToken, HttpClient, IEnumerable, string, LocalGhostBuilder

### Community 132 - "Sentinel — Plugin Summary & Tool Guide"
Cohesion: 0.25
Nodes (7): Fix flow (⚡ buttons in the panel), Key file locations, Known gaps (pre-pilot backlog), Ribbon — Coordination panel, Ribbon — Quality panel, Ribbon — Workflow panel, Sentinel — Plugin Summary & Tool Guide

### Community 133 - "fragments-facts.ts"
Cohesion: 0.43
Nodes (7): attr(), extractFromModel(), ExtractOptions, flattenParams(), TARGET_CATEGORIES, toFact(), RuleTarget

### Community 134 - ".Read"
Cohesion: 0.52
Nodes (4): DocPage, IReadOnlyList, List, DocumentTextReader

### Community 135 - "Phase 2 — Technical Spec: Time, Cost & Gates across the lifecycle"
Cohesion: 0.29
Nodes (6): 4D MVP cut (this turn), A. 4D — schedule ↔ elements + sequence simulation  ← building now, B. 5D full (later slice), C. Stage gates everywhere (later slice), D. RFIs / submittals / approvals (later slice), Phase 2 — Technical Spec: Time, Cost & Gates across the lifecycle

### Community 136 - "1. Market analysis — where AEC/BIM software actually breaks"
Cohesion: 0.29
Nodes (7): 1. Market analysis — where AEC/BIM software actually breaks, B1 — Fragmentation & the interoperability tax (the root cause), B2 — The standards & governance gap (Sentinel's opening), B3 — Lifecycle discontinuity (the dimensions are islands), B4 — Access & cost lock‑in, B5 — Productivity & rework, B6 — AI is bolted on, not grounded

### Community 137 - "Sentinel — Install (Revit 2021–2027)"
Cohesion: 0.29
Nodes (6): Build + install (one command), Manual single-version build, One-time prerequisite, Sentinel — Install (Revit 2021–2027), Uninstall, Version compatibility notes

### Community 138 - "plans-panel.ts"
Cohesion: 0.38
Nodes (6): box(), ensureSectionStyle(), elevText(), Level, PanelState, plansPanel()

### Community 139 - "Part A — The Project Shell"
Cohesion: 0.33
Nodes (6): A1. The governed-dataset metadata model, A2. The project-store service, A3. The Project Home panel — `setups/project-shell.ts`, A4. Stage gates = standards-as-code at every boundary, A5. Multi-project home, Part A — The Project Shell

### Community 140 - "Phase 3 — Technical Spec: Handover & the Golden Thread"
Cohesion: 0.33
Nodes (5): 6D MVP cut (this turn), A. 6D — embodied carbon  ← building now, B. 7D — asset register + COBie handover (later slice), C. Owner / FM portal + golden thread (later slice), Phase 3 — Technical Spec: Handover & the Golden Thread

### Community 141 - "CdeSyncGuard"
Cohesion: 0.33
Nodes (4): DocumentSynchronizedWithCentralEventArgs, Regex, string, CdeSyncGuard

### Community 142 - "Sentinel Platform"
Cohesion: 0.33
Nodes (6): Configuration, How it fits together, More docs, Quick start (pilot), Sentinel Platform, What you get (16 tabs, one dataset)

### Community 143 - ".ToRevit"
Cohesion: 0.40
Nodes (4): eye, fwd, XYZ, up

### Community 144 - "ClashManager.cs"
Cohesion: 0.50
Nodes (3): ClashItem, Severity, Severity

### Community 145 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **812 isolated node(s):** `Severity`, `EntityRequirement`, `EntityLimit`, `DomainScore`, `State` (+807 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Sentinel.Engine` connect `sentinel-core/adapter` to `DeliveryContract`, `SentinelAddin/Standards`, `SentinelAddin/Engine`, `SentinelAddin/GhostBuilder`, `SentinelAddin/Standards`, `src/setups`, `src/setups`, `src/setups`, `CdeSyncGuard`, `src/setups`, `ClashManager.cs`, `SentinelAddin/GhostBuilder`, `SentinelAddin/Engine`, `reality-capture/lib`, `SentinelAddin/UI`, `Sentinel.Workflow`, `SentinelAddin`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `Sentinel.Workflow` connect `Sentinel.Workflow` to `src/sentinel-core`, `src/sentinel-core`, `SentinelAddin/GhostBuilder`, `src/setups`, `sentinel-core/adapter`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `Sentinel.UI` connect `sentinel-core/adapter` to `SentinelAddin/Engine`, `SentinelAddin`, `src/setups`, `SentinelAddin/GhostBuilder`, `WebApp/bridge`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `Severity`, `EntityRequirement`, `EntityLimit` to the rest of the system?**
  _814 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SentinelAddin/UI` be split into smaller, more focused modules?**
  _Cohesion score 0.13725490196078433 - nodes in this community are weakly interconnected._
- **Should `SentinelAddin/UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07731694828469023 - nodes in this community are weakly interconnected._
- **Should `WebApp/bridge` be split into smaller, more focused modules?**
  _Cohesion score 0.08220211161387632 - nodes in this community are weakly interconnected._