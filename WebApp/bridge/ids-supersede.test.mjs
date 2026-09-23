// F51: an IDS install marks the open IDS topics raised under an older or different IDS; nothing auto-closes.
import { describe, it, expect } from "vitest";
import { supersededBy, closableSuperseded, isOpenIdsTopic } from "./ids-supersede.mjs";

const t = (guid, over = {}) => ({ guid, title: "IDS: IFCDOOR — FireRating (3 failing)", topic_status: "Open", ...over });
const topics = [
  t("old", { ids_ref: "ids@1", ids_source: "project" }),
  t("same", { ids_ref: "ids@2", ids_source: "project" }),
  t("office", { ids_ref: "ids@4", ids_source: "office" }),          // another counter: never "newer" than the project's
  t("client", { ids_ref: null, ids_source: "client" }),
  t("legacy"),                                                        // raised before topics carried a ref
  t("remark", { superseded_by: "ids@1" }),                            // marked by an earlier install, re-marked
  t("already", { ids_ref: "ids@1", ids_source: "project", superseded_by: "ids@2" }),
  t("closed", { ids_ref: "ids@1", ids_source: "project", topic_status: "Closed" }),
  t("resolved", { topic_status: "Resolved" }),
  t("fed", { title: "Federation: FG-01 Duplicate GlobalId (2)" }),
];

describe("superseded IDS topics", () => {
  it("marks open IDS topics from an older project version, another source, or no ref; leaves current, closed and non-IDS ones", () => {
    expect(supersededBy(topics, "ids@2").map((x) => x.guid)).toEqual(["old", "office", "client", "legacy", "remark"]);
    expect(isOpenIdsTopic(topics[9])).toBe(false);
  });
  it("refuses a ref that is not ids@n", () => {
    expect(() => supersededBy(topics, "naming@2")).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("closes only open IDS topics that carry a superseded_by mark", () => {
    const withClosedMark = [...topics, t("closed-sup", { superseded_by: "ids@2", topic_status: "Closed" })];
    expect(closableSuperseded(withClosedMark).map((x) => x.guid)).toEqual(["remark", "already"]);
  });
});
