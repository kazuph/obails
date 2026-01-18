import type {
  IAppAdapters,
  IConfigAdapter,
  IFileAdapter,
  INoteAdapter,
  ILinkAdapter,
  IWindowAdapter,
  Note,
  FileInfo,
  Config,
  Thino,
  Backlink,
  Link,
} from "./types";

/**
 * Creates stub adapters for testing
 * All methods return empty/default values or resolve immediately
 */
export function createStubAdapters(
  overrides?: Partial<IAppAdapters>
): IAppAdapters {
  const defaultConfig: IConfigAdapter = {
    getConfig: async () => null,
    openConfigFile: async () => {},
  };

  const defaultFile: IFileAdapter = {
    listDirectoryTree: async () => [],
    createFile: async () => {},
    moveFile: async () => {},
    deletePath: async () => {},
    readFile: async () => "",
    readBinaryFile: async () => "",
    openExternal: async () => {},
  };

  const defaultNote: INoteAdapter = {
    getNote: async () => null,
    saveNote: async () => {},
    getTodayDailyNote: async () => null,
    getTodayThinos: async () => [],
    addThino: async () => {},
  };

  const defaultLink: ILinkAdapter = {
    getBacklinks: async () => [],
    getOutgoingLinks: async () => [],
    rebuildIndex: async () => {},
  };

  const defaultWindow: IWindowAdapter = {
    toggleMaximise: async () => {},
  };

  return {
    config: { ...defaultConfig, ...overrides?.config },
    file: { ...defaultFile, ...overrides?.file },
    note: { ...defaultNote, ...overrides?.note },
    link: { ...defaultLink, ...overrides?.link },
    window: { ...defaultWindow, ...overrides?.window },
  };
}

/**
 * Helper to create a mock note for testing
 */
export function createMockNote(
  overrides?: Partial<Note>
): Note {
  return {
    path: "test.md",
    title: "Test Note",
    content: "# Test\n\nTest content",
    ...overrides,
  } as Note;
}

/**
 * Helper to create a mock file info for testing
 */
export function createMockFileInfo(
  overrides?: Partial<FileInfo>
): FileInfo {
  return {
    name: "test.md",
    path: "test.md",
    isDir: false,
    children: null,
    ...overrides,
  } as FileInfo;
}

/**
 * Helper to create a mock thino for testing
 */
export function createMockThino(
  overrides?: Partial<Thino>
): Thino {
  return {
    time: "10:00",
    content: "Test thino content",
    ...overrides,
  } as Thino;
}

/**
 * Helper to create a mock backlink for testing
 */
export function createMockBacklink(
  overrides?: Partial<Backlink>
): Backlink {
  return {
    sourcePath: "other.md",
    sourceTitle: "Other Note",
    context: "...links to [[test]]...",
    ...overrides,
  } as Backlink;
}

/**
 * Helper to create a mock config for testing
 */
export function createMockConfig(
  overrides?: Partial<Config>
): Config {
  return {
    Vault: {
      Path: "/test/vault",
    },
    ...overrides,
  } as Config;
}

/**
 * Helper to create a mock link for testing
 */
export function createMockLink(
  overrides?: Partial<Link>
): Link {
  return {
    text: "target-note",
    targetPath: "target-note.md",
    exists: true,
    ...overrides,
  } as Link;
}
