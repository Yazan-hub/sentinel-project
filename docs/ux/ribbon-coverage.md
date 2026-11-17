# Ribbon coverage (UX slice 1)

Every command the ribbon registered at 617ae9a2 and where it is now. `tools/ribbon-coverage/check.py` fails if any listed class is no longer registered in `SentinelAddin/App.cs`.

| Old button | Command class | New place |
|---|---|---|
| Show\nPanel | `ShowPanelCommand` | top button Sentinel |
| Change\nRequests | `ShowRequestsCommand` | slide-out > Changes > Change\nRequests |
| BCF\nIssues | `BcfIssuesCommand` | Issues > BCF\nIssues |
| Clash Manager | `ClashManagerCommand` | Issues > Clash Manager |
| Clash Register | `ClashRegisterCommand` | Issues > Clash Register |
| Review\nFlag | `SetupWorkflowCommand` | More > Review\nFlag |
| Review AI\nProposals | `ReviewChangesetsCommand` | slide-out > Changes > Review AI\nProposals |
| Applied AI\nChanges | `AppliedChangesCommand` | slide-out > Changes > Applied AI\nChanges |
| Scan\nNow | `ScanNowCommand` | slide-out > Checks > Scan\nNow |
| Health\nScorecard | `ScorecardCommand` | slide-out > Checks > Health\nScorecard |
| Rule\nSet | `ShowRulesetCommand` | slide-out > Checks > Rule\nSet |
| IFC Pre-Flight | `IfcPreFlightCommand` | slide-out > Checks > IFC Pre-Flight |
| IFC Delivery Gate | `IfcDeliveryGateCommand` | slide-out > Publish tools > IFC Delivery Gate |
| Sanitize .rfa | `SanitizeFamilyCommand` | slide-out > Checks > Sanitize .rfa |
| Heal Loaded Families | `SanitizeLoadedCommand` | slide-out > Checks > Heal Loaded Families |
| MEP\nOpenings | `MepVoidsCommand` | slide-out > Changes > MEP\nOpenings |
| MEP\nType Check | `MepTypeCheckCommand` | slide-out > Checks > MEP\nType Check |
| Naming\nManager | `NamingManagerCommand` | slide-out > Checks > Naming\nManager |
| Governed\nPublish | `GovernedPublishCommand` | slide-out > Publish tools > Governed\nPublish |
| Publish Sheets | `PublishSheetsCommand` | slide-out > Publish tools > Publish Sheets |
| Publish Views | `PublishViewsCommand` | slide-out > Publish tools > Publish Views |
| Project Setup | `ProjectSetupCommand` | More > Project Setup |
| Sign in | `SignInCommand` | More > Sign in |
| PC Settings | `PcSettingsCommand` | More > PC Settings |
| Build Office System | `BuildOfficeSystemCommand` | More > Build Office System |
| Apply Standard | `LoadOfficeSystemCommand` | More > Apply Standard |
| Ingest Docs | `IngestDocumentsCommand` | More > Ingest Docs |
| Modelling Guideline | `GuidelineEditorCommand` | More > Modelling Guideline |
| IFC Export Mapping | `IfcExportEditorCommand` | More > IFC Export Mapping |
| Protection | `ProtectionCommand` | More > Protection |
| 1 · Datum from Drawings | `DatumFromDrawingsCommand` | Build > 1 · Datum from Drawings |
| 2 · Ghost Builder | `GhostBuilderCommand` | Build > 2 · Ghost Builder |
| 2b · Photo Massing | `MassingFromImagesCommand` | Build > 2b · Photo Massing |
| 2c · Shell a Mass | `ShellMassCommand` | Build > 2c · Shell a Mass |
| 3 · Annotate Views | `AnnotateViewsCommand` | Build > 3 · Annotate Views |
| 4 · Promote (DD) | `PromoteWallsCommand` | Build > 4 · Promote (DD) |
| 5 · Provenance | `ProvenanceCommand` | Build > 5 · Provenance |
| ROI\nDashboard | `RoiDashboardCommand` | More > ROI\nDashboard |

New buttons: Check, Fix, Publish (journey windows over the commands above).
