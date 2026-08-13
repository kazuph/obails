export type EditableFileKind = "markdown" | "text" | "html";

export type FileSnapshot = {
  path: string;
  content: string;
  revision: string;
};

export type EditableDocument = {
  kind: EditableFileKind;
  snapshot: FileSnapshot;
  generation: number;
  failure: "conflict" | "missing" | "error" | null;
};

export type SaveIntent = {
  document: EditableDocument;
  snapshot: FileSnapshot;
  content: string;
};

export function createEditableDocument(
  kind: EditableFileKind,
  snapshot: FileSnapshot,
  generation: number,
): EditableDocument {
  return {
    kind,
    snapshot: { ...snapshot },
    generation,
    failure: null,
  };
}

export function captureSaveIntent(
  document: EditableDocument,
  content: string,
): SaveIntent {
  return {
    document,
    snapshot: { ...document.snapshot },
    content,
  };
}

export function isCurrentOpenGeneration(
  responseGeneration: number,
  activeGeneration: number,
): boolean {
  return responseGeneration === activeGeneration;
}

export class CapturedSaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: SaveIntent | null = null;
  private queued: SaveIntent[] = [];
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly save: (intent: SaveIntent) => Promise<void>) {}

  schedule(intent: SaveIntent, delay: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.pending = intent;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending !== intent) {
        return;
      }
      this.pending = null;
      this.enqueue(intent);
    }, delay);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.pending) {
      const pending = this.pending;
      this.pending = null;
      this.enqueue(pending);
      await this.inFlight;
    }

    await this.inFlight;
  }

  async saveNow(intent: SaveIntent): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
    this.enqueue(intent);
    await this.inFlight;
  }

  cancel(document: EditableDocument): void {
    if (this.pending?.document !== document) {
      return;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  updatePendingSnapshot(document: EditableDocument, snapshot: FileSnapshot): void {
    const update = (intent: SaveIntent) => {
      if (intent.document === document) {
        intent.snapshot = { ...snapshot };
      }
    };
    if (this.pending) {
      update(this.pending);
    }
    this.queued.forEach(update);
  }

  private enqueue(intent: SaveIntent): void {
    this.queued.push(intent);
    this.inFlight = this.inFlight.then(async () => {
      try {
        await this.save(intent);
      } finally {
        this.queued = this.queued.filter((queuedIntent) => queuedIntent !== intent);
      }
    });
  }
}
