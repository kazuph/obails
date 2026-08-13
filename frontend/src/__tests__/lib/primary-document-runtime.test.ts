import { describe, expect, it } from "vitest";
import { PrimaryDocumentRuntime } from "../../lib/primary-document-runtime";
import { createEditableDocument } from "../../lib/file-save-state";

describe("PrimaryDocumentRuntime", () => {
  it("keeps history and queued CAS work scoped to its own runtime", async () => {
    const savedByFirst: string[] = [];
    const first = new PrimaryDocumentRuntime(async (intent) => { savedByFirst.push(intent.content); });
    const second = new PrimaryDocumentRuntime(async () => {});
    const document = createEditableDocument("markdown", { path: "note.md", content: "before", revision: "r1" }, 1);

    first.history.rebase({ path: "note.md", kind: "markdown" }, { content: "before", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    first.history.recordEdit({ path: "note.md", kind: "markdown" }, { content: "after", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    first.saveScheduler.schedule({ document, snapshot: { ...document.snapshot }, content: "after" }, 0);
    await first.saveScheduler.flush();

    expect(first.history.current({ path: "note.md", kind: "markdown" })?.content).toBe("after");
    expect(second.history.current({ path: "note.md", kind: "markdown" })).toBeNull();
    expect(savedByFirst).toEqual(["after"]);
  });
});

describe("PrimaryDocumentRuntime transitions", () => {
  it("does not commit a stale open after a newer generation begins", async () => {
    let resolveFirst!: (value: { snapshot: { path: string; content: string; revision: string }; value: string }) => void;
    const firstLoad = new Promise<{ snapshot: { path: string; content: string; revision: string }; value: string }>((resolve) => { resolveFirst = resolve; });
    const runtime = new PrimaryDocumentRuntime(async () => {});
    const firstGeneration = runtime.beginOpen();
    const first = runtime.coordinateOpen({ path: "first.md", kind: "markdown", generation: firstGeneration, load: () => firstLoad, commit: () => { throw new Error("stale transition must not commit"); }, fail: () => {} });
    const secondGeneration = runtime.beginOpen();
    const second = runtime.coordinateOpen({ path: "second.md", kind: "markdown", generation: secondGeneration, load: async () => ({ snapshot: { path: "second.md", content: "second", revision: "r2" }, value: "second" }), commit: () => {}, fail: () => {} });

    resolveFirst({ snapshot: { path: "first.md", content: "first", revision: "r1" }, value: "first" });
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(runtime.currentFilePath).toBe("second.md");
    expect(runtime.activeEditableDocument?.kind).toBe("markdown");
  });

  it("keeps path and kind identity on the active CAS document", async () => {
    const runtime = new PrimaryDocumentRuntime(async () => {});
    await runtime.coordinateOpen({ path: "notes/plan.html", kind: "html", load: async () => ({ snapshot: { path: "notes/plan.html", content: "<p>plan</p>", revision: "r1" }, value: null }), commit: () => {}, fail: () => {} });

    expect(runtime.currentFilePath).toBe("notes/plan.html");
    expect(runtime.activeEditableDocument?.snapshot.path).toBe("notes/plan.html");
    expect(runtime.activeEditableDocument?.kind).toBe("html");
  });

  it("guards async follow-up work when a newer open begins during publication", async () => {
    let releaseFollowUp!: () => void;
    const followUp = new Promise<void>((resolve) => { releaseFollowUp = resolve; });
    const runtime = new PrimaryDocumentRuntime(async () => {});
    const published: string[] = [];
    const first = runtime.coordinateOpen({
      path: "first.md",
      kind: "markdown",
      load: async () => ({ snapshot: { path: "first.md", content: "first", revision: "r1" }, value: "first" }),
      commit: () => { published.push("first-sync"); },
      afterCommit: async (_document, _value, isCurrent) => {
        await followUp;
        if (isCurrent()) published.push("first-async");
      },
      fail: () => {},
    });
    await Promise.resolve();
    const second = runtime.coordinateOpen({ path: "second.md", kind: "markdown", load: async () => ({ snapshot: { path: "second.md", content: "second", revision: "r2" }, value: "second" }), commit: () => { published.push("second-sync"); }, fail: () => {} });
    releaseFollowUp();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(published).toEqual(["first-sync", "second-sync"]);
  });

  it("clears the failed transition identity before invoking failure recovery", async () => {
    const runtime = new PrimaryDocumentRuntime(async () => {});
    let identityWasCleared = false;
    await expect(runtime.coordinateOpen({ path: "broken.md", kind: "markdown", load: async () => ({ snapshot: { path: "broken.md", content: "broken", revision: "r1" }, value: null }), commit: () => { throw new Error("commit failed"); }, fail: () => { identityWasCleared = runtime.currentFilePath === null && runtime.activeEditableDocument === null; } })).resolves.toBe(false);

    expect(identityWasCleared).toBe(true);
  });

  it("migrates the active document path and history to the renamed identity without opening a second document", () => {
    const runtime = new PrimaryDocumentRuntime(async () => {});
    const document = createEditableDocument("markdown", { path: "notes/Old Name.md", content: "draft", revision: "r1" }, runtime.beginOpen());
    runtime.currentFilePath = document.snapshot.path;
    runtime.activeEditableDocument = document;
    runtime.history.rebase({ path: "notes/Old Name.md", kind: "markdown" }, { content: "draft", selectionStart: 2, selectionEnd: 5, scrollTop: 8 });

    runtime.rewritePathIdentity("notes/Old Name.md", "notes/New Name.md", false);

    expect(runtime.currentFilePath).toBe("notes/New Name.md");
    expect(runtime.activeEditableDocument).toBe(document);
    expect(runtime.activeEditableDocument?.snapshot.path).toBe("notes/New Name.md");
    expect(runtime.history.current({ path: "notes/Old Name.md", kind: "markdown" })).toBeNull();
    expect(runtime.history.current({ path: "notes/New Name.md", kind: "markdown" })).toEqual({
      content: "draft",
      selectionStart: 2,
      selectionEnd: 5,
      scrollTop: 8,
    });
  });
});
