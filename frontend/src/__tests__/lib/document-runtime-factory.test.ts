import { describe, expect, it } from "vitest";
import { createEditableDocument } from "../../lib/file-save-state";
import { DocumentRuntimeFactory, type AuthoritativeWorkspaceSnapshot } from "../../lib/document-runtime-factory";

function snapshotFor(paneIds: ReadonlyArray<string>): AuthoritativeWorkspaceSnapshot {
  return {
    paneTree: paneIds.length === 1
      ? { paneId: paneIds[0] }
      : { splitDirection: "horizontal", children: paneIds.map((paneId) => ({ paneId })), weights: paneIds.map(() => 1) },
    activePaneId: paneIds[0],
    paneTabs: paneIds.map((paneId) => ({ paneId, tabs: [] })),
  };
}

function snapshotWithout(paneId: string): AuthoritativeWorkspaceSnapshot {
  const remaining = paneId === "left" ? "right" : "left";
  return snapshotFor([remaining]);
}

describe("DocumentRuntimeFactory", () => {
  it("creates independent identity, history, selection, and save queues for each pane", async () => {
    const saved: Array<{ paneId: string; runtime: ReturnType<DocumentRuntimeFactory["forPane"]>; content: string }> = [];
    const factory = new DocumentRuntimeFactory(async (paneId, runtime, intent) => { saved.push({ paneId, runtime, content: intent.content }); });
    const left = factory.forPane("left");
    const right = factory.forPane("right");
    const leftDocument = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, left.beginOpen());
    const rightDocument = createEditableDocument("html", { path: "right.html", content: "<p>right</p>", revision: "r2" }, right.beginOpen());

    left.activeEditableDocument = leftDocument;
    left.currentFilePath = leftDocument.snapshot.path;
    right.activeEditableDocument = rightDocument;
    right.currentFilePath = rightDocument.snapshot.path;
    left.history.rebase({ path: "left.md", kind: "markdown" }, { content: "left", selectionStart: 1, selectionEnd: 2, scrollTop: 3 });
    right.history.rebase({ path: "right.html", kind: "html" }, { content: "<p>right</p>", selectionStart: 4, selectionEnd: 5, scrollTop: 6 });
    left.saveScheduler.schedule({ document: leftDocument, snapshot: leftDocument.snapshot, content: "left saved" }, 0);
    right.saveScheduler.schedule({ document: rightDocument, snapshot: rightDocument.snapshot, content: "right saved" }, 0);
    await Promise.all([left.saveScheduler.flush(), right.saveScheduler.flush()]);

    expect(left).not.toBe(right);
    expect(left.currentFilePath).toBe("left.md");
    expect(right.currentFilePath).toBe("right.html");
    expect(left.openGeneration).toBe(1);
    expect(right.openGeneration).toBe(1);
    expect(left.history.current({ path: "left.md", kind: "markdown" })?.selectionStart).toBe(1);
    expect(right.history.current({ path: "right.html", kind: "html" })?.selectionStart).toBe(4);
    expect(saved.map(({ content }) => content)).toEqual(["left saved", "right saved"]);
    expect(saved).toEqual([
      { paneId: "left", runtime: left, content: "left saved" },
      { paneId: "right", runtime: right, content: "right saved" },
    ]);
  });

  it("keeps a pane runtime stable until its pane is transactionally closed", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    const right = factory.forPane("right");

    expect(factory.forPane("left")).toBe(left);
    expect(await factory.closePane("left", async (paneId) => snapshotWithout(paneId))).not.toBeNull();
    expect(factory.forPane("left")).not.toBe(left);
    expect(factory.forPane("right")).toBe(right);
  });

  it("replaces only the current pane identity when audio opens", () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    const right = factory.forPane("right");
    left.setNonEditablePath("audio/briefing.wav");
    right.setNonEditablePath("notes/right.md");

    expect(left.currentFilePath).toBe("audio/briefing.wav");
    expect(left.activeEditableDocument).toBeNull();
    expect(right.currentFilePath).toBe("notes/right.md");
  });

  it("allows local DOM publish for both panes while shared UI stays active-pane scoped", () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    const right = factory.forPane("right");
    const leftGeneration = left.beginOpen();
    const rightGeneration = right.beginOpen();

    expect(leftGeneration).toBe(rightGeneration);
    expect(factory.canPublishLocal("left", left, leftGeneration)).toBe(true);
    expect(factory.canPublishLocal("right", right, rightGeneration)).toBe(true);
    expect(factory.canPublishShared("left", left, leftGeneration, "left")).toBe(true);
    expect(factory.canPublishShared("right", right, rightGeneration, "left")).toBe(false);

    // An active-pane switch rejects a stale shared callback but not the pane's
    // own editor/preview restore.
    expect(factory.canPublishLocal("left", left, leftGeneration)).toBe(true);
    expect(factory.canPublishShared("left", left, leftGeneration, "right")).toBe(false);

    left.beginOpen();
    expect(factory.canPublishLocal("left", left, leftGeneration)).toBe(false);
    expect(factory.canPublishShared("left", left, leftGeneration, "left")).toBe(false);
  });

  it("keeps runtime and history when flush fails, backend rejects, or snapshot retains the pane", async () => {
    const saveFailure = new Error("save failed");
    const factory = new DocumentRuntimeFactory(async () => { throw saveFailure; });
    const left = factory.forPane("left");
    const document = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, left.beginOpen());
    left.activeEditableDocument = document;
    left.currentFilePath = document.snapshot.path;
    left.history.rebase({ path: "left.md", kind: "markdown" }, { content: "left", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    left.saveScheduler.schedule({ document, snapshot: document.snapshot, content: "pending" }, 0);
    let backendCalls = 0;

    expect(await factory.closePane("left", async () => { backendCalls += 1; return snapshotWithout("left"); })).toBeNull();
    expect(factory.forPane("left")).toBe(left);
    expect(left.history.current({ path: "left.md", kind: "markdown" })?.content).toBe("left");
    expect(backendCalls).toBe(0);

    const rejectFactory = new DocumentRuntimeFactory(async () => {});
    const rejectRuntime = rejectFactory.forPane("left");
    const rejectDocument = createEditableDocument("markdown", { path: "reject.md", content: "reject", revision: "r1" }, rejectRuntime.beginOpen());
    rejectRuntime.activeEditableDocument = rejectDocument;
    rejectRuntime.history.rebase({ path: "reject.md", kind: "markdown" }, { content: "reject", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    const rejected = await rejectFactory.closePane("left", async () => { throw new Error("backend rejected"); });
    expect(rejected).toBeNull();
    expect(rejectFactory.forPane("left")).toBe(rejectRuntime);
    expect(rejectRuntime.history.current({ path: "reject.md", kind: "markdown" })?.content).toBe("reject");

    const failureFactory = new DocumentRuntimeFactory(async () => {});
    const failureRuntime = failureFactory.forPane("left");
    const failureDocument = createEditableDocument("markdown", { path: "failure.md", content: "failure", revision: "r1" }, failureRuntime.beginOpen());
    failureRuntime.activeEditableDocument = failureDocument;
    failureRuntime.history.rebase({ path: "failure.md", kind: "markdown" }, { content: "failure", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    failureDocument.failure = "conflict";
    let failureBackendCalls = 0;
    expect(await failureFactory.closePane("left", async () => { failureBackendCalls += 1; return snapshotWithout("left"); })).toBeNull();
    expect(failureFactory.forPane("left")).toBe(failureRuntime);
    expect(failureBackendCalls).toBe(0);
    expect(failureRuntime.history.current({ path: "failure.md", kind: "markdown" })?.content).toBe("failure");

    const staleFactory = new DocumentRuntimeFactory(async () => {});
    const staleRuntime = staleFactory.forPane("left");
    const staleDocument = createEditableDocument("markdown", { path: "stale.md", content: "stale", revision: "r1" }, staleRuntime.beginOpen());
    staleRuntime.activeEditableDocument = staleDocument;
    staleRuntime.history.rebase({ path: "stale.md", kind: "markdown" }, { content: "stale", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    const staleResult = await staleFactory.closePane("left", async () => ({ paneTree: { paneId: "left" }, activePaneId: "left", paneTabs: [{ paneId: "left", tabs: [] }] }));
    expect(staleResult).toBeNull();
    expect(staleFactory.forPane("left")).toBe(staleRuntime);
    expect(staleRuntime.history.current({ path: "stale.md", kind: "markdown" })?.content).toBe("stale");

    const malformedFactory = new DocumentRuntimeFactory(async () => {});
    const malformedRuntime = malformedFactory.forPane("left");
    expect(await malformedFactory.closePane("left", async () => ({}))).toBeNull();
    expect(malformedFactory.forPane("left")).toBe(malformedRuntime);

    const emptyFactory = new DocumentRuntimeFactory(async () => {});
    const emptyRuntime = emptyFactory.forPane("left");
    expect(await emptyFactory.closePane("left", async () => ({ paneTree: null, paneTabs: [] }))).toBeNull();
    expect(emptyFactory.forPane("left")).toBe(emptyRuntime);
  });

  it("commits pending-save teardown only after the authoritative snapshot removes the pane", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    factory.forPane("right");
    const document = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, left.beginOpen());
    left.activeEditableDocument = document;
    left.currentFilePath = document.snapshot.path;
    left.history.rebase({ path: "left.md", kind: "markdown" }, { content: "left", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    left.saveScheduler.schedule({ document, snapshot: document.snapshot, content: "saved" }, 0);

    const closedSnapshot = await factory.closePane("left", async (paneId) => snapshotWithout(paneId));
    expect(closedSnapshot).toEqual(snapshotWithout("left"));
    expect(factory.forPane("left")).not.toBe(left);
    expect(left.history.current({ path: "left.md", kind: "markdown" })).toBeNull();
  });

  it("uses the same prepare/snapshot/commit contract for bulk retention", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    const middle = factory.forPane("middle");
    const right = factory.forPane("right");

    let callbackCalls = 0;
    const snapshot = await factory.retainPanes(["left"], async (targetPaneIds, runtimes) => {
      callbackCalls += 1;
      expect(targetPaneIds).toEqual(["middle", "right"]);
      expect(runtimes.get("middle")).toBe(middle);
      expect(runtimes.get("right")).toBe(right);
      expect(runtimes.size).toBe(2);
      return snapshotFor(["left"]);
    });
    expect(snapshot).toEqual(snapshotFor(["left"]));
    expect(callbackCalls).toBe(1);
    expect(factory.forPane("left")).toBe(left);
    expect(factory.forPane("middle")).not.toBe(middle);
    expect(factory.forPane("right")).not.toBe(right);

    const failureFactory = new DocumentRuntimeFactory(async () => {});
    const failureLeft = failureFactory.forPane("left");
    const failureRight = failureFactory.forPane("right");
    const leftDocument = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, failureLeft.beginOpen());
    failureLeft.activeEditableDocument = leftDocument;
    failureLeft.history.rebase({ path: "left.md", kind: "markdown" }, { content: "left", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    const rightDocument = createEditableDocument("markdown", { path: "right.md", content: "right", revision: "r1" }, failureRight.beginOpen());
    failureRight.activeEditableDocument = rightDocument;
    failureRight.history.rebase({ path: "right.md", kind: "markdown" }, { content: "right", selectionStart: 0, selectionEnd: 0, scrollTop: 0 });
    let failureCallbackCalls = 0;
    let backendMutations = 0;

    expect(await failureFactory.retainPanes([], async (targetPaneIds, runtimes) => {
      failureCallbackCalls += 1;
      expect(targetPaneIds).toEqual(["left", "right"]);
      expect(runtimes.get("left")).toBe(failureLeft);
      expect(runtimes.get("right")).toBe(failureRight);
      throw new Error("bulk backend rejected before atomic mutation");
    })).toBeNull();
    expect(failureCallbackCalls).toBe(1);
    expect(backendMutations).toBe(0);
    expect(failureFactory.forPane("left")).toBe(failureLeft);
    expect(failureFactory.forPane("right")).toBe(failureRight);
    expect(failureLeft.history.current({ path: "left.md", kind: "markdown" })?.content).toBe("left");
    expect(failureRight.history.current({ path: "right.md", kind: "markdown" })?.content).toBe("right");
  });

  it("rejects new pane saves while teardown is closing, then reopens the gate on failure", async () => {
    const factory = new DocumentRuntimeFactory(async () => {});
    const left = factory.forPane("left");
    factory.forPane("right");
    const document = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, left.beginOpen());
    left.activeEditableDocument = document;
    let release!: () => void;
    const backend = new Promise<void>((resolve) => { release = resolve; });
    const closePromise = factory.closePane("left", async () => {
      await backend;
      return snapshotWithout("left");
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(factory.isPaneClosing("left")).toBe(true);
    expect(factory.scheduleSave("left", { document, snapshot: document.snapshot, content: "blocked" }, 0)).toBe(false);
    expect(await factory.saveNow("left", { document, snapshot: document.snapshot, content: "blocked immediately" })).toBe(false);
    release();
    expect(await closePromise).toEqual(snapshotWithout("left"));
    expect(factory.isPaneClosing("left")).toBe(false);
  });

  it("reopens the save gate when the authoritative backend mutation fails", async () => {
    const saved: string[] = [];
    const factory = new DocumentRuntimeFactory(async (_paneId, _runtime, intent) => { saved.push(intent.content); });
    const left = factory.forPane("left");
    const document = createEditableDocument("markdown", { path: "left.md", content: "left", revision: "r1" }, left.beginOpen());
    left.activeEditableDocument = document;

    expect(await factory.closePane("left", async () => { throw new Error("backend rejected"); })).toBeNull();
    expect(factory.isPaneClosing("left")).toBe(false);
    expect(await factory.saveNow("left", { document, snapshot: document.snapshot, content: "saved after failure" })).toBe(true);
    expect(saved).toEqual(["saved after failure"]);
  });
});
