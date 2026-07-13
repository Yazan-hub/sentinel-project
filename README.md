# Sentinel Project — unified repo

- RevitPlugin/  — Sentinel C#/.NET Revit add-in (BDS BIM governance)
- WebApp/       — That Open Platform-facing web app (Node/TypeScript)
- config/       — template config only (.env.template, appsettings.template.json)
- _NeedsReview/ — files/folders migrated but not confidently classified; check and move by hand
- docs/         — architecture notes, roadmap

## First run after migration
1. Review everything under _NeedsReview/ and move it into RevitPlugin/, WebApp/, or docs/ as appropriate, then delete the folder.
2. Copy config/.env.template to config/.env and fill in your real That Open Platform API key. Never commit .env.
3. For the .NET side, prefer 'dotnet user-secrets' over appsettings.json for the real key locally.
4. Run 'git status' to sanity-check nothing under node_modules/bin/obj/.env is staged before your first commit.
