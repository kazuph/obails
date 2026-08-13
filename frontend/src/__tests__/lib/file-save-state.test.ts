import { describe, expect, it } from "vitest";
import {
  CapturedSaveScheduler,
  captureSaveIntent,
  createEditableDocument,
  isCurrentOpenGeneration,
} from "../../lib/file-save-state";

describe("P-004〜P-006 snapshot-bound saves", () => {
  it("flushes the document and content captured before a file switch", async () => {
    const saved: Array<{ path: string; content: string; revision: string }> = [];
    const document = createEditableDocument("markdown", {
      path: "first.md",
      content: "disk value",
      revision: "revision-a",
    }, 1);
    const scheduler = new CapturedSaveScheduler(async (intent) => {
      saved.push({
        path: intent.snapshot.path,
        content: intent.content,
        revision: intent.snapshot.revision,
      });
    });

    scheduler.schedule(captureSaveIntent(document, "edited first"), 60_000);
    await scheduler.flush();

    expect(saved).toEqual([{
      path: "first.md",
      content: "edited first",
      revision: "revision-a",
    }]);
  });

  it("keeps only the latest captured edit for the same pending debounce", async () => {
    const saved: string[] = [];
    const document = createEditableDocument("text", {
      path: "plain.txt",
      content: "disk value",
      revision: "revision-a",
    }, 3);
    const scheduler = new CapturedSaveScheduler(async (intent) => {
      saved.push(intent.content);
    });

    scheduler.schedule(captureSaveIntent(document, "first edit"), 60_000);
    scheduler.schedule(captureSaveIntent(document, "latest edit"), 60_000);
    await scheduler.flush();

    expect(saved).toEqual(["latest edit"]);
  });

  it("updates a queued edit to the revision produced by the preceding save", async () => {
    const document = createEditableDocument("markdown", {
      path: "note.md",
      content: "disk value",
      revision: "revision-a",
    }, 1);
    const revisions: string[] = [];
    let releaseFirstSave: (() => void) | undefined;
    let firstSaveStarted: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstSaveStarted = resolve;
    });
    const scheduler = new CapturedSaveScheduler(async (intent) => {
      revisions.push(intent.snapshot.revision);
      if (intent.content === "first edit") {
        firstSaveStarted?.();
        await firstSave;
        document.snapshot = {
          path: "note.md",
          content: "first edit",
          revision: "revision-b",
        };
        scheduler.updatePendingSnapshot(document, document.snapshot);
      }
    });

    scheduler.schedule(captureSaveIntent(document, "first edit"), 0);
    await started;
    scheduler.schedule(captureSaveIntent(document, "second edit"), 60_000);
    releaseFirstSave?.();
    await scheduler.flush();

    expect(revisions).toEqual(["revision-a", "revision-b"]);
  });

  it("binds HTML delayed saves to the edited path and revision", async () => {
    const saved: Array<{ path: string; content: string; revision: string }> = [];
    const document = createEditableDocument("html", {
      path: "notes/page.html",
      content: "<p>disk value</p>",
      revision: "revision-html",
    }, 2);
    const scheduler = new CapturedSaveScheduler(async (intent) => {
      saved.push({
        path: intent.snapshot.path,
        content: intent.content,
        revision: intent.snapshot.revision,
      });
    });

    scheduler.schedule(captureSaveIntent(document, "<p>edited</p>"), 60_000);
    await scheduler.flush();

    expect(saved).toEqual([{
      path: "notes/page.html",
      content: "<p>edited</p>",
      revision: "revision-html",
    }]);
  });
});

describe("P-007〜P-011 save state", () => {
  it("rejects stale open responses after a newer navigation generation", () => {
    expect(isCurrentOpenGeneration(4, 5)).toBe(false);
    expect(isCurrentOpenGeneration(5, 5)).toBe(true);
  });
});
