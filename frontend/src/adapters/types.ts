import type {
  Note,
  FileInfo,
  Config,
  Thino,
  Backlink,
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
}

/**
 * Note service adapter interface
 */
export interface INoteAdapter {
  getNote(path: string): Promise<Note | null>;
  saveNote(path: string, content: string): Promise<void>;
  getTodayDailyNote(): Promise<Note | null>;
  getTodayThinos(): Promise<Thino[]>;
  addThino(content: string): Promise<void>;
}

/**
 * Link service adapter interface
 */
export interface ILinkAdapter {
  getBacklinks(path: string): Promise<Backlink[]>;
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
export type { Note, FileInfo, Config, Thino, Backlink };
