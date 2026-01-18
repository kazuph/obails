import type {
  Note,
  FileInfo,
  Config,
  Timeline,
  Backlink,
  Link,
} from "../../bindings/github.com/kazuph/obails/models/models.js";

/**
 * Config service adapter interface
 */
export interface IConfigAdapter {
  getConfig(): Promise<Config | null>;
  openConfigFile(): Promise<void>;
}

/**
 * File service adapter interface
 */
export interface IFileAdapter {
  listDirectoryTree(): Promise<FileInfo[]>;
  createFile(path: string, content: string): Promise<void>;
  moveFile(sourcePath: string, destPath: string): Promise<void>;
  deletePath(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<string>; // Returns base64 encoded content
  openExternal(path: string): Promise<void>; // Open file with system default app
}

/**
 * Note service adapter interface
 */
export interface INoteAdapter {
  getNote(path: string): Promise<Note | null>;
  saveNote(path: string, content: string): Promise<void>;
  getTodayDailyNote(): Promise<Note | null>;
  getTodayTimelines(): Promise<Timeline[]>;
  addTimeline(content: string): Promise<void>;
}

/**
 * Link service adapter interface
 */
export interface ILinkAdapter {
  getBacklinks(path: string): Promise<Backlink[]>;
  getOutgoingLinks(path: string): Promise<Link[]>;
  rebuildIndex(): Promise<void>;
}

/**
 * Window service adapter interface
 */
export interface IWindowAdapter {
  toggleMaximise(): Promise<void>;
}

/**
 * Combined app adapters interface
 */
export interface IAppAdapters {
  config: IConfigAdapter;
  file: IFileAdapter;
  note: INoteAdapter;
  link: ILinkAdapter;
  window: IWindowAdapter;
}

// Re-export model types for convenience
export type { Note, FileInfo, Config, Timeline, Backlink, Link };
