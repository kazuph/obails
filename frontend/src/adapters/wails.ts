import * as ConfigService from "../../bindings/github.com/kazuph/obails/services/configservice.js";
import * as FileService from "../../bindings/github.com/kazuph/obails/services/fileservice.js";
import * as NoteService from "../../bindings/github.com/kazuph/obails/services/noteservice.js";
import * as LinkService from "../../bindings/github.com/kazuph/obails/services/linkservice.js";
import * as WindowService from "../../bindings/github.com/kazuph/obails/services/windowservice.js";
import type { IAppAdapters } from "./types";

/**
 * Creates Wails backend adapters for production use
 */
export function createWailsAdapters(): IAppAdapters {
  return {
    config: {
      getConfig: () => ConfigService.GetConfig(),
      openConfigFile: () => ConfigService.OpenConfigFile(),
    },
    file: {
      listDirectoryTree: () => FileService.ListDirectoryTree(),
      createFile: (path, content) => FileService.CreateFile(path, content),
      moveFile: (src, dest) => FileService.MoveFile(src, dest),
      deletePath: (path) => FileService.DeletePath(path),
      readFile: (path) => FileService.ReadFile(path),
      readBinaryFile: (path) => FileService.ReadBinaryFile(path),
      openExternal: (path) => FileService.OpenExternal(path),
    },
    note: {
      getNote: (path) => NoteService.GetNote(path),
      saveNote: (path, content) => NoteService.SaveNote(path, content),
      getTodayDailyNote: () => NoteService.GetTodayDailyNote(),
      getTodayThinos: () => NoteService.GetTodayThinos(),
      addThino: (content) => NoteService.AddThino(content),
    },
    link: {
      getBacklinks: (path) => LinkService.GetBacklinks(path),
      getOutgoingLinks: (path) => LinkService.GetLinkInfo(path),
      rebuildIndex: () => LinkService.RebuildIndex(),
    },
    window: {
      toggleMaximise: () => WindowService.ToggleMaximise(),
    },
  };
}
