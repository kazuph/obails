import { describe, expect, it } from "vitest";
import { WorkspaceRefreshCoordinator } from "../../lib/workspace-refresh";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("WorkspaceRefreshCoordinator", () => {
  it("keeps the newer rejoin snapshot when a delayed native-close refresh returns afterward", async () => {
    const coordinator = new WorkspaceRefreshCoordinator();
    const closeSnapshot = deferred<string>();
    const rejoinSnapshot = deferred<string>();
    const applied: string[] = [];
    const restored: string[] = [];
    const opened: string[] = [];
    const stages = (fetch: () => Promise<string>) => ({
      fetch,
      adopt: async (snapshot: string) => { applied.push(snapshot); },
      restore: async (snapshot: string) => { restored.push(snapshot); },
      open: async (snapshot: string) => { opened.push(snapshot); },
    });

    const close = coordinator.run(stages(() => closeSnapshot.promise));
    const rejoin = coordinator.run(stages(() => rejoinSnapshot.promise));
    rejoinSnapshot.resolve("after-rejoin");
    await expect(rejoin).resolves.toBe(true);
    closeSnapshot.resolve("after-close");
    await expect(close).resolves.toBe(false);

    expect(applied).toEqual(["after-rejoin"]);
    expect(restored).toEqual(["after-rejoin"]);
    expect(opened).toEqual(["after-rejoin"]);
  });
});
