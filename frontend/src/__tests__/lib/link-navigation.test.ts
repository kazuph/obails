import { describe, expect, it } from "vitest";
import {
  findFragmentLine,
  getCreatePathForInternalLink,
  getWikiLinkQueryAtCursor,
  getWikiLinkSuggestions,
  parseInternalLinkTarget,
} from "../../lib/link-navigation";

describe("link navigation helpers", () => {
  it("separates decoded heading and block fragments from an internal target", () => {
    expect(parseInternalLinkTarget("notes/Plan%20A.md#Next%20steps")).toEqual({
      target: "notes/Plan A.md",
      fragment: "Next steps",
      fragmentType: "heading",
    });
    expect(parseInternalLinkTarget("notes/Plan.md#^decision-1")).toEqual({
      target: "notes/Plan.md",
      fragment: "decision-1",
      fragmentType: "block",
    });
  });

  it("keeps the requested relative target when creating a missing note", () => {
    expect(getCreatePathForInternalLink("projects/New Plan", "inbox/source.md", "wikilink")).toBe("projects/New Plan.md");
    expect(getCreatePathForInternalLink("../New Plan.md", "inbox/source.md", "markdown")).toBe("New Plan.md");
    expect(getCreatePathForInternalLink("../../outside", "inbox/source.md", "markdown")).toBeNull();
    expect(getCreatePathForInternalLink("folder/..", "inbox/source.md", "wikilink")).toBeNull();
  });

  it("finds only an unfinished wiki-link target at the cursor", () => {
    expect(getWikiLinkQueryAtCursor("See [[plan", 10)).toEqual({ start: 6, query: "plan" });
    expect(getWikiLinkQueryAtCursor("See [[plan]] next", 11)).toBeNull();
  });

  it("offers filenames and aliases, preserving an alias insertion target", () => {
    const suggestions = getWikiLinkSuggestions([
      { path: "projects/Meeting Notes.md", title: "Meeting Notes", aliases: ["Standup"] },
    ], "stand");

    expect(suggestions).toEqual([expect.objectContaining({
      matchedTerm: "Standup",
      insertTarget: "Standup",
      resolvesAlias: true,
    })]);
  });

  it("locates heading and block targets in source", () => {
    const content = "# Overview\nText\nDecision ^ship-it";
    expect(findFragmentLine(content, "Overview", "heading")).toBe(0);
    expect(findFragmentLine(content, "ship-it", "block")).toBe(2);
  });

  it("uses the existing heading contract for setext headings", () => {
    expect(findFragmentLine("Plan\n====\n\n    # not a heading", "Plan", "heading")).toBe(0);
  });
});
