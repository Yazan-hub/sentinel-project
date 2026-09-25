using Sentinel.Coordination;

namespace Sentinel.Engine;

/// <summary>
/// The IDS the bridge judges this project by — ids@n on the project, else on its office, else none — for
/// DISPLAY only. Revit never posts an IDS: the bridge resolves it itself on every /propose and the response
/// names what judged (ProposalResult.IdsLabel). Blocking (≤ 4 s) and never throws — call it off the UI thread.
/// </summary>
public static class IdsSpecFile
{
    public static ResolvedArtefact Resolve(string projectKey) => ArtefactClient.Resolve(projectKey, "ids");
}
