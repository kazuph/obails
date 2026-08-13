import { describe, expect, it } from "vitest";
import { getQuickSwitcherResults, type QuickSwitcherNote } from "../../lib/quick-switcher";

const notes: QuickSwitcherNote[] = [
  { path: "projects/Meeting Notes.md", title: "Meeting Notes", aliases: ["Standup"] },
  { path: "ideas/Map.md", title: "Map", aliases: ["Mind map"] },
  { path: "archive/Minutes.md", title: "Minutes", aliases: [] },
];

describe("quick-switcher", () => {
  it("finds note titles with prefix, substring, and fuzzy matching", () => {
    expect(getQuickSwitcherResults(notes, "meet", [])[0]).toMatchObject({
      kind: "note",
      note: { path: "projects/Meeting Notes.md" },
    });
    expect(getQuickSwitcherResults(notes, "ting no", [])[0]).toMatchObject({
      kind: "note",
      note: { path: "projects/Meeting Notes.md" },
    });
    expect(getQuickSwitcherResults(notes, "mtns", [])[0]).toMatchObject({
      kind: "note",
      note: { path: "projects/Meeting Notes.md" },
    });
  });

  it("matches frontmatter aliases and does not offer creation for an exact alias", () => {
    const results = getQuickSwitcherResults(notes, "standup", []);
    expect(results).toEqual([
      expect.objectContaining({
        kind: "note",
        matchedTerm: "Standup",
        note: expect.objectContaining({ path: "projects/Meeting Notes.md" }),
      }),
    ]);
  });

  it("shows persisted recent notes when the query is empty", () => {
    const results = getQuickSwitcherResults(notes, "", ["archive/Minutes.md", "projects/Meeting Notes.md", "missing.md"]);
    expect(results.map((result) => result.kind === "note" ? result.note.path : result.name)).toEqual([
      "archive/Minutes.md",
      "projects/Meeting Notes.md",
    ]);
  });

  it("offers an exact-name note creation action when no exact note exists", () => {
    expect(getQuickSwitcherResults(notes, "Meeting Notes.md", [])).not.toContainEqual(
      expect.objectContaining({ kind: "create" })
    );
    const results = getQuickSwitcherResults(notes, "Meeting agenda", []);
    expect(results.at(-1)).toEqual({ kind: "create", name: "Meeting agenda" });
  });
});
