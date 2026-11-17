"""The old ribbon: 44 items = 38 commands + 6 dropdown containers. Fails if a command class listed in docs/ux/ribbon-coverage.md is no longer registered on the ribbon (App.cs)."""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parents[2]
listed = re.findall(r"\| `(\w+Command)` \|", (root / "docs/ux/ribbon-coverage.md").read_text(encoding="utf-8"))
app = (root / "SentinelAddin/App.cs").read_text(encoding="utf-8")
missing = [c for c in listed if f'"Sentinel.Commands.{c}"' not in app]
assert len(listed) >= 38, f"coverage list too short: {len(listed)}"
assert not missing, f"no longer on the ribbon: {missing}"
print(f"ribbon coverage: {len(listed)}/{len(listed)} commands registered")
