export type WorkspaceRefreshStages<T> = {
  fetch: () => Promise<T>;
  adopt: (snapshot: T) => Promise<void>;
  restore: (snapshot: T) => Promise<void>;
  open: (snapshot: T) => Promise<void>;
};

export class WorkspaceRefreshCoordinator {
  private generation = 0;

  async run<T>(stages: WorkspaceRefreshStages<T>): Promise<boolean> {
    const request = ++this.generation;
    try {
      const snapshot = await stages.fetch();
      if (!this.isCurrent(request)) return false;
      await stages.adopt(snapshot);
      if (!this.isCurrent(request)) return false;
      await stages.restore(snapshot);
      if (!this.isCurrent(request)) return false;
      await stages.open(snapshot);
      return this.isCurrent(request);
    } catch (error) {
      if (!this.isCurrent(request)) return false;
      throw error;
    }
  }

  private isCurrent(request: number): boolean {
    return request === this.generation;
  }
}
