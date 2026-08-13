import { describe, expect, it } from "vitest";
import {
  DocumentHistory,
  type DocumentIdentity,
  type DocumentSnapshot,
} from "../../lib/document-history";

const markdownNote: DocumentIdentity = { path: "notes/plan.md", kind: "markdown" };
const textNote: DocumentIdentity = { path: "notes/plan.md", kind: "text" };
const htmlNote: DocumentIdentity = { path: "notes/plan.md", kind: "html" };

function snapshot(
  content: string,
  selectionStart = content.length,
  selectionEnd = content.length,
  scrollTop = 0,
): DocumentSnapshot {
  return { content, selectionStart, selectionEnd, scrollTop };
}

describe("DocumentHistory", () => {
  it("keeps Markdown, TXT, and HTML histories independent for the same path", () => {
    const history = new DocumentHistory();
    const markdown = snapshot("# Plan", 2, 5, 30);
    const text = snapshot("Plan", 1, 3, 10);
    const html = snapshot("<h1>Plan</h1>", 4, 8, 50);

    history.rebase(markdownNote, markdown);
    history.rebase(textNote, text);
    history.rebase(htmlNote, html);
    history.recordEdit(markdownNote, snapshot("# Updated", 3, 8, 40));
    history.recordEdit(textNote, snapshot("Updated", 2, 6, 20));
    history.recordEdit(htmlNote, snapshot("<h1>Updated</h1>", 5, 12, 60));

    expect(history.undo(markdownNote)).toEqual(markdown);
    expect(history.undo(textNote)).toEqual(text);
    expect(history.undo(htmlNote)).toEqual(html);
  });

  it("restores content, selection, and scroll position through undo and redo", () => {
    const history = new DocumentHistory();
    const initial = snapshot("first", 1, 4, 12);
    const edited = snapshot("second", 2, 5, 48);

    history.rebase(markdownNote, initial);
    history.recordEdit(markdownNote, edited);

    expect(history.undo(markdownNote)).toEqual(initial);
    expect(history.redo(markdownNote)).toEqual(edited);
  });

  it("retains a note history when switching away and returning", () => {
    const history = new DocumentHistory();
    const planInitial = snapshot("Plan");
    const planEdited = snapshot("Plan updated");

    history.rebase(markdownNote, planInitial);
    history.recordEdit(markdownNote, planEdited);
    history.rebase(textNote, snapshot("Other note"));

    expect(history.undo(markdownNote)).toEqual(planInitial);
    expect(history.redo(markdownNote)).toEqual(planEdited);
  });

  it("discards the redo branch when recording an edit after undo", () => {
    const history = new DocumentHistory();
    const initial = snapshot("first");
    const second = snapshot("second");
    const replacement = snapshot("replacement");

    history.rebase(markdownNote, initial);
    history.recordEdit(markdownNote, second);
    expect(history.undo(markdownNote)).toEqual(initial);

    history.recordEdit(markdownNote, replacement);

    expect(history.redo(markdownNote)).toBeNull();
    expect(history.current(markdownNote)).toEqual(replacement);
  });

  it("does not undo to pre-refresh content after an explicit reset", () => {
    const history = new DocumentHistory();
    const diskContent = snapshot("from disk", 3, 7, 18);

    history.rebase(markdownNote, snapshot("before refresh"));
    history.recordEdit(markdownNote, snapshot("unsaved edit"));
    history.reset(markdownNote, diskContent);

    expect(history.current(markdownNote)).toEqual(diskContent);
    expect(history.undo(markdownNote)).toBeNull();
    expect(history.redo(markdownNote)).toBeNull();
  });

  it("does not undo to pre-reload content after an explicit rebase", () => {
    const history = new DocumentHistory();
    const reloaded = snapshot("reloaded", 2, 5, 9);

    history.rebase(markdownNote, snapshot("opened"));
    history.recordEdit(markdownNote, snapshot("local edit"));
    history.rebase(markdownNote, reloaded);

    expect(history.current(markdownNote)).toEqual(reloaded);
    expect(history.undo(markdownNote)).toBeNull();
  });

  it("migrates a history to a renamed or moved identity", () => {
    const history = new DocumentHistory();
    const movedNote: DocumentIdentity = {
      path: "archive/2026/plan.md",
      kind: "markdown",
    };
    const initial = snapshot("before move");
    const edited = snapshot("after edit");

    history.rebase(markdownNote, initial);
    history.recordEdit(markdownNote, edited);
    history.migrate(markdownNote, movedNote);

    expect(history.current(markdownNote)).toBeNull();
    expect(history.undo(movedNote)).toEqual(initial);
    expect(history.redo(movedNote)).toEqual(edited);
  });

  it("drops a history when its document is deleted or closed", () => {
    const history = new DocumentHistory();

    history.rebase(markdownNote, snapshot("open note"));
    history.recordEdit(markdownNote, snapshot("changed note"));
    history.drop(markdownNote);

    expect(history.current(markdownNote)).toBeNull();
    expect(history.undo(markdownNote)).toBeNull();
    expect(history.redo(markdownNote)).toBeNull();
  });

  it("updates the current view without creating a content undo step", () => {
    const history = new DocumentHistory();
    history.rebase(markdownNote, snapshot("first"));
    history.recordEdit(markdownNote, snapshot("second", 2, 4, 8));

    history.updateCurrentView(markdownNote, { selectionStart: 1, selectionEnd: 3, scrollTop: 42 });

    expect(history.current(markdownNote)).toEqual(snapshot("second", 1, 3, 42));
    expect(history.undo(markdownNote)).toEqual(snapshot("first"));
    expect(history.undo(markdownNote)).toBeNull();
  });
});
