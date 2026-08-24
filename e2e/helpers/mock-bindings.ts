/**
 * Wails Bindings Mock for E2E Tests
 *
 * Playwrightのブラウザ環境ではWailsのバインディングが動作しないため、
 * モックデータを提供してフロントエンドをテスト可能にする
 */

import { expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_VAULT_PATH = path.resolve(__dirname, '../fixtures/test-vault');

function getFixtureFileType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.md') return 'markdown';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.opus'].includes(ext)) return 'audio';
  if (ext === '.txt') return 'text';
  return 'other';
}

// テスト用ファイルのコンテンツをロード
function loadTestFiles(): { [key: string]: string } {
  const files: { [key: string]: string } = {};
  const loadDir = (dir: string, prefix: string = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        loadDir(fullPath, relativePath);
      } else {
        const fileType = getFixtureFileType(entry.name);
        if (fileType === 'markdown' || fileType === 'html' || fileType === 'text') {
          files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
        } else {
          files[relativePath] = fs.readFileSync(fullPath).toString('base64');
        }
      }
    }
  };
  loadDir(TEST_VAULT_PATH);
  return files;
}

// テスト用ファイル情報を生成
function generateFileInfos(): any[] {
  const infos: any[] = [];
  const addDir = (dir: string, prefix: string = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const modifiedAt = fs.statSync(fullPath).mtime.toISOString();
        infos.push({
          Name: entry.name,
          Path: relativePath,
          IsDir: true,
          name: entry.name,
          path: relativePath,
          isDir: true,
          ModTime: modifiedAt,
          Size: 0,
          Children: [],
          modifiedAt,
          children: [],
        });
        addDir(fullPath, relativePath);
      } else {
        let stats: fs.Stats;
        try {
          stats = fs.statSync(fullPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        infos.push({
          Name: entry.name,
          Path: relativePath,
          IsDir: false,
          name: entry.name,
          path: relativePath,
          isDir: false,
          FileType: getFixtureFileType(entry.name),
          fileType: getFixtureFileType(entry.name),
          ModTime: stats.mtime.toISOString(),
          Size: stats.size,
          Children: null,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
  };
  addDir(TEST_VAULT_PATH);
  return infos;
}

function addMockMarkdownFile(files: Record<string, string>, fileInfos: any[], relativePath: string, content = '# Imported from external file') {
  files[relativePath] = content;
  if (fileInfos.some((info) => (info.path ?? info.Path) === relativePath)) {
    return;
  }
  fileInfos.push({
    Name: path.basename(relativePath),
    Path: relativePath,
    IsDir: false,
    name: path.basename(relativePath),
    path: relativePath,
    isDir: false,
    FileType: 'markdown',
    fileType: 'markdown',
    ModTime: new Date().toISOString(),
    Size: content.length,
    Children: null,
    modifiedAt: new Date().toISOString(),
  });
}

function resolveMockLink(files: Record<string, string>, linkText: string): [string, boolean] {
  const normalized = linkText.trim().replace(/^\/+/, '');
  const withoutAnchor = normalized.split('#')[0];
  const candidates = [
    withoutAnchor,
    withoutAnchor.endsWith('.md') ? withoutAnchor : `${withoutAnchor}.md`,
  ];

  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(files, candidate)) {
      return [candidate, true];
    }
  }

  const basename = withoutAnchor.split('/').pop() || withoutAnchor;
  const basenameWithExt = basename.endsWith('.md') ? basename : `${basename}.md`;
  const hit = Object.keys(files).find((key) => key.split('/').pop() === basenameWithExt);
  return hit ? [hit, true] : ['', false];
}

function createMockLinkInfo(files: Record<string, string>, relativePath: string): any[] {
  const content = files[relativePath] || '';
  const links: any[] = [];
  const addLink = (text: string, isEmbed: boolean, kind = 'wikilink', alias = '') => {
    const [targetText, rawFragment = ''] = text.split('#');
    const fragmentType = rawFragment.startsWith('^') ? 'block' : rawFragment ? 'heading' : undefined;
    const fragment = rawFragment.startsWith('^') ? rawFragment.slice(1) : rawFragment;
    const [targetPath, exists] = resolveMockLink(files, text);
    const embedExists = exists || (isEmbed && /\.(png|jpe?g|gif|webp|svg|bmp|pdf|mp3|m4a|wav|ogg|flac|aac|opus|md)$/i.test(text));
    links.push({
      text: targetText,
      targetPath: targetPath || text,
      exists: embedExists,
      generation: 1,
      alias,
      fragment: fragment || undefined,
      fragmentType,
      kind,
      isEmbed,
      raw: isEmbed ? `![[${text}]]` : `[[${text}]]`,
    });
  };
  for (const match of content.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    addLink(match[1], true);
  }
  for (const match of content.matchAll(/(?<!!)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    addLink(match[1], false);
  }
  for (const match of content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    addLink(match[2], false, 'markdown', match[1]);
  }
  return links;
}

function createMockUnlinkedMentions(files: Record<string, string>, targetPath: string): any[] {
  const targetTitle = path.basename(targetPath).replace(/\.md$/i, '');
  if (!targetTitle) return [];
  return Object.entries(files)
    .filter(([sourcePath]) => sourcePath !== targetPath)
    .flatMap(([sourcePath, content]) => content.split(/\r?\n/).flatMap((line, index) => {
      if (!line.includes(targetTitle) || line.includes(`[[${targetTitle}`)) return [];
      return [{
        sourcePath,
        sourceTitle: path.basename(sourcePath).replace(/\.md$/i, ''),
        targetPath,
        targetTitle,
        match: targetTitle,
        context: line.trim(),
        line: index + 1,
      }];
    }));
}

type MockLastOpenedFile = { path: string; fileType: string } | null;

type MockBindingOptions = {
  initialLastOpenedFile?: MockLastOpenedFile;
  fileInfos?: any[];
  graph?: { nodes: any[]; edges: any[] };
  workspace?: any;
};

function createMockCommandDescriptors() {
  const noteScoped = new Set(['find-in-note', 'save-current-file', 'toggle-source-editor', 'split-pane-right', 'split-pane-down', 'close-active-pane', 'undo-edit', 'redo-edit']);
  return [
    { id: 'command-palette', title: 'Command Palette', hotkey: 'Cmd+P' },
    { id: 'new-note', title: 'New Note', hotkey: 'Cmd+N' },
    { id: 'quick-switcher', title: 'Quick Switcher', hotkey: 'Cmd+O' },
    { id: 'find-in-note', title: 'Find in Note', hotkey: 'Cmd+F' },
    { id: 'search-vault', title: 'Search Vault', hotkey: 'Cmd+Shift+F' },
    { id: 'save-current-file', title: 'Save Current File', hotkey: 'Cmd+S' },
    { id: 'toggle-graph-view', title: 'Knowledge Graph', hotkey: 'Cmd+G' },
    { id: 'toggle-source-editor', title: 'Toggle Source', hotkey: 'Cmd+E' },
    { id: 'split-pane-right', title: 'Split Pane Right', hotkey: 'Cmd+\\' },
    { id: 'split-pane-down', title: 'Split Pane Down', hotkey: 'Cmd+Shift+\\' },
    { id: 'close-active-tab', title: 'Close Note', hotkey: 'Cmd+W' },
    { id: 'close-active-pane', title: 'Close Active Pane', hotkey: '' },
    { id: 'open-settings', title: 'Settings', hotkey: 'Cmd+,' },
    { id: 'show-shortcuts-help', title: 'Show Shortcuts Help', hotkey: '?' },
    { id: 'toggle-file-tree-focus', title: 'Focus File Tree', hotkey: 'Cmd+Shift+E' },
    { id: 'close-overlays', title: 'Close Overlay', hotkey: 'Escape' },
    { id: 'undo-edit', title: 'Undo', hotkey: 'Cmd+Z' },
    { id: 'redo-edit', title: 'Redo', hotkey: 'Cmd+Shift+Z' },
  ].map((command) => ({
    ...command,
    category: noteScoped.has(command.id) ? 'Note' : 'Global',
    scope: noteScoped.has(command.id) ? 'note' : 'global',
    defaultHotkey: command.hotkey,
  }));
}

function createMockWorkspace(lastOpenedFile: MockLastOpenedFile) {
  const activePath = lastOpenedFile?.path || 'Welcome.md';
  const activeType = lastOpenedFile?.fileType || 'markdown';
  return {
    paneTree: { paneId: 'main' },
    activePaneId: 'main',
    popoutWindows: [],
    paneTabs: [
      {
        paneId: 'main',
        tabs: [{ path: activePath, fileType: activeType }],
        activeTabPath: activePath,
      },
    ],
    savedWorkspaces: [],
    activeNamedWorkspace: '',
  };
}

/**
 * ページにWailsバインディングのモックを設定する
 */
export async function setupMockBindings(page: Page, options: MockBindingOptions = {}): Promise<void> {
  const files = loadTestFiles();
  const fileInfos = options.fileInfos ?? generateFileInfos();
  const graph = options.graph;
  const workspace = options.workspace;
  let lastOpenedFile: MockLastOpenedFile = options.initialLastOpenedFile ?? null;
  let explorerSessionState = { expandedPaths: [], leftSidebarWidth: 250, rightSidebarWidth: 250 };
  let workspaceState = workspace ?? createMockWorkspace(lastOpenedFile);
  const readBinaryCalls: string[] = [];
  const openWithDefaultAppCalls: string[] = [];
  const clipboardTexts: string[] = [];
  const clipboardImages: string[] = [];
  const snapshots = new Map<string, Map<string, string>>();
  const recentlyDeleted = new Map<string, { id: string; path: string; isDir: boolean; deletedAt: string; deleteMode: string; content: string }>();
  const deletedPaths = new Set<string>();
  const memoryOnlyPaths = new Set<string>();

  const fixtureFilePath = (relativePath: string) => path.join(TEST_VAULT_PATH, relativePath);
  const shouldPersistMockWrite = (relativePath: string): boolean =>
    /^(p\d+|e2e-recovery-|workspace-|runtime-embeds-|finder-drop|root-drop)/.test(relativePath);
  const listCurrentFileInfos = () => {
    if (options.fileInfos) return fileInfos;
    const generated = generateFileInfos();
    const generatedPaths = new Set(generated.map((info: any) => info.path ?? info.Path));
    return [
      ...generated,
      ...fileInfos.filter((info: any) => {
        const relativePath = info.path ?? info.Path;
        return !generatedPaths.has(relativePath) && !deletedPaths.has(relativePath);
      }),
    ];
  };
  const readCurrentFile = (relativePath: string): string => {
    if (memoryOnlyPaths.has(relativePath)) {
      return files[relativePath] || '';
    }
    const absolute = fixtureFilePath(relativePath);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      return fs.readFileSync(absolute, 'utf8');
    }
    return files[relativePath] || '';
  };
  const writeCurrentFile = async (relativePath: string, content: string) => {
    files[relativePath] = content;
    deletedPaths.delete(relativePath);
    if (shouldPersistMockWrite(relativePath)) {
      await fs.promises.mkdir(path.dirname(fixtureFilePath(relativePath)), { recursive: true });
      await fs.promises.writeFile(fixtureFilePath(relativePath), content, 'utf8');
      memoryOnlyPaths.delete(relativePath);
    } else {
      memoryOnlyPaths.add(relativePath);
    }
    addMockMarkdownFile(files, fileInfos, relativePath, content);
  };
  const fileExistsNow = (relativePath: string): boolean => {
    const absolute = fixtureFilePath(relativePath);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile();
  };
  const snapshotVault = () => {
    const copy = new Map<string, string>();
    for (const info of listCurrentFileInfos()) {
      const relativePath = info.path ?? info.Path;
      const isDir = info.isDir ?? info.IsDir;
      if (!isDir && getFixtureFileType(relativePath) === 'markdown') {
        copy.set(relativePath, readCurrentFile(relativePath));
      }
    }
    return copy;
  };
  const unlinkedMentionsFor = (targetPath: string) => {
    const targetTitle = path.basename(targetPath).replace(/\.md$/i, '');
    if (!targetTitle) return [];
    return listCurrentFileInfos()
      .filter((info: any) => !(info.isDir ?? info.IsDir) && getFixtureFileType(info.path ?? info.Path) === 'markdown')
      .flatMap((info: any) => {
        const sourcePath = String(info.path ?? info.Path);
        if (sourcePath === targetPath) return [];
        return readCurrentFile(sourcePath).split(/\r?\n/).flatMap((line, index) => {
          if (!line.includes(targetTitle) || line.includes(`[[${targetTitle}`)) return [];
          return [{
            sourcePath,
            sourceTitle: path.basename(sourcePath).replace(/\.md$/i, ''),
            targetPath,
            targetTitle,
            match: targetTitle,
            context: line.trim(),
            line: index + 1,
          }];
        });
      });
  };

  await page.exposeFunction('__wailsMockReadBinaryCalls', () => readBinaryCalls.slice());
  await page.exposeFunction('__wailsMockOpenWithDefaultAppCalls', () => openWithDefaultAppCalls.slice());
  await page.exposeFunction('__wailsMockClipboardTexts', () => clipboardTexts.slice());
  await page.exposeFunction('__wailsMockClipboardImages', () => clipboardImages.slice());

  // 本番の file_service.go は http.ServeContent + "Accept-Ranges: bytes" で
  // Range リクエストに対応している。シーク（頭出し）は Range が無いとブラウザが
  // 拒否することがあるため、モックでも 206 Partial Content を返して本番に忠実にする。
  await page.route('**/media/audio?**', async (route) => {
    const requestURL = new URL(route.request().url());
    const relativePath = requestURL.searchParams.get('path') || '';
    const body = Buffer.from(files[relativePath] || '', 'base64');
    const total = body.length;
    const rangeHeader = route.request().headers()['range'];

    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : total - 1;
      const chunk = body.subarray(start, end + 1);
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': String(chunk.length),
        },
        body: chunk,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
      },
      body,
    });
  });

  await page.context().route('**/wails/runtime', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }

    const body = JSON.parse(request.postData() || '{}');

    // Clipboard.SetText (object: 1, method: 0)
    if (body.object === 1 && body.method === 0) {
      clipboardTexts.push(String(body.args?.text ?? ''));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
      return;
    }

    const call = body.args || {};
    const methodID = call.methodID;
    const args = call.args || [];

    let value: any = null;
    switch (methodID) {
      // ImageClipboardService.SetPNG
      case 2701085494:
        clipboardImages.push(String(args[0] || ''));
        break;
      // ConfigService.GetConfig
      case 1692681084:
        value = {
          Vault: { Path: '/test-vault' },
          DailyNotes: { Folder: 'dailynotes', Format: '2006-01-02', Template: '' },
          Timeline: { Section: '## Memos', TimeFormat: '15:04' },
          Templates: { Folder: '' },
          Editor: { FontSize: 14, FontFamily: 'SF Mono', LineNumbers: true, WordWrap: true },
          UI: { Theme: 'github-light', SidebarWidth: 250 },
        };
        break;
      // ConfigService.GetCommandDescriptors
      case 3998854739:
        value = createMockCommandDescriptors();
        break;
      // ConfigService.GetFileExplorerConfig
      case 1564464553:
        value = { AutoReveal: true, SortField: 'name', SortDirection: 'ascending' };
        break;
      // ConfigService.GetEditorConfig
      case 1953582977:
        value = { FontSize: 14, FontFamily: 'SF Mono', LineNumbers: true, WordWrap: true };
        break;
      // ConfigService.GetSidebarWidth
      case 577856586:
        value = 250;
        break;
      // FileService.ListDirectoryTree
      case 767112173:
        value = listCurrentFileInfos();
        break;
      // FileService.ReadFile
      case 1935931844:
        value = readCurrentFile(String(args[0] || '')) || '# File not found';
        break;
      // FileService.ReadSnapshot
      case 2251729070:
        value = {
          path: String(args[0] || ''),
          content: readCurrentFile(String(args[0] || '')) || '# File not found',
          revision: `mock-${String(args[0] || '')}`,
        };
        break;
      // FileService.SaveRecoverySnapshot
      case 3257873128: {
        const id = `mock-snapshot-${Date.now()}`;
        const copy = snapshotVault();
        snapshots.set(id, copy);
        value = { snapshot: { id, createdAt: new Date().toISOString(), fileCount: copy.size }, created: true };
        break;
      }
      // FileService.ReadBinaryFile
      case 797232813:
        readBinaryCalls.push(String(args[0] || ''));
        value = files[args[0]] || '';
        break;
      // FileService.Delete
      case 3586048485: {
        const relativePath = String(args[0] || '');
        const content = readCurrentFile(relativePath);
        const id = `mock-deleted-${Date.now()}`;
        recentlyDeleted.set(id, { id, path: relativePath, isDir: false, deletedAt: new Date().toISOString(), deleteMode: 'trash', content });
        delete files[relativePath];
        deletedPaths.add(relativePath);
        await fs.promises.rm(fixtureFilePath(relativePath), { force: true });
        value = null;
        break;
      }
      // FileService.FileExists
      case 3863841388:
        value = fileExistsNow(String(args[0] || ''));
        break;
      // FileService.WriteFile
      case 1639997475:
      // FileService.CreateFile
      case 4120094888:
        await writeCurrentFile(String(args[0] || ''), String(args[1] || ''));
        value = null;
        break;
      // FileService.SaveIfUnchanged
      case 2890766357: {
        const snapshot = args[0] || {};
        const relativePath = String(snapshot.path || '');
        const nextContent = String(args[1] || '');
        const absolute = fixtureFilePath(relativePath);
        if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
          value = { status: 'missing' };
        } else {
          const current = fs.readFileSync(absolute, 'utf8');
          if (current !== String(snapshot.content || '')) {
            value = { status: 'conflict' };
          } else {
            await writeCurrentFile(relativePath, nextContent);
            value = { status: 'saved', snapshot: { path: relativePath, content: nextContent, revision: `mock-${relativePath}-${Date.now()}` } };
          }
        }
        break;
      }
      // FileService.ListRecentlyDeleted
      case 411742103:
        value = Array.from(recentlyDeleted.values()).map(({ content, ...item }) => item);
        break;
      // FileService.RestoreRecentlyDeleted
      case 1058365313: {
        const id = String(args[0] || '');
        const item = recentlyDeleted.get(id);
        if (!item) {
          await route.fulfill({ status: 500, contentType: 'text/plain', body: 'missing recovery item' });
          return;
        }
        if (fileExistsNow(item.path)) {
          await route.fulfill({ status: 500, contentType: 'text/plain', body: 'Existing vault content was not changed.' });
          return;
        }
        await writeCurrentFile(item.path, item.content);
        recentlyDeleted.delete(id);
        value = null;
        break;
      }
      // FileService.ListRecoverySnapshots
      case 164617094:
        value = Array.from(snapshots.entries()).map(([id, copy]) => ({ id, createdAt: new Date().toISOString(), fileCount: copy.size }));
        break;
      // FileService.ReadRecoverySnapshotFile
      case 4242662291: {
        const copy = snapshots.get(String(args[0] || ''));
        value = copy?.get(String(args[1] || '')) || '';
        break;
      }
      // FileService.RestoreRecoverySnapshotFile
      case 3629935153: {
        const copy = snapshots.get(String(args[0] || ''));
        const relativePath = String(args[1] || '');
        await writeCurrentFile(relativePath, copy?.get(relativePath) || '');
        value = null;
        break;
      }
      // FileService.ResolveImagePath（実装と同様にベースネームをvault全体から解決）
      case 2923647032: {
        const imagePath = String(args[0] || '');
        if (Object.prototype.hasOwnProperty.call(files, imagePath)) {
          value = imagePath;
        } else {
          const base = imagePath.split('/').pop();
          const hit = Object.keys(files).find((key) => key.split('/').pop() === base);
          if (hit) {
            value = hit;
          } else {
            await route.fulfill({ status: 500, contentType: 'text/plain', body: 'image not found' });
            return;
          }
        }
        break;
      }
      // FileService.ImportExternalFile
      case 3954866026: {
        const sourcePath = String(args[0] || '');
        const targetFolder = String(args[1] || '');
        const fileName = sourcePath.split('/').pop() || 'imported.md';
        const relativePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
        await writeCurrentFile(relativePath, '# Imported from external file');
        value = relativePath;
        break;
      }
      // FileService.CreateFile
      case 4120094888: {
        const relativePath = String(args[0] || '');
        addMockMarkdownFile(files, fileInfos, relativePath, String(args[1] || ''));
        value = null;
        break;
      }
      // FileService.RevealInFinder
      case 3963746572:
        value = null;
        break;
      // FileService.OpenWithDefaultApp
      case 1039929574:
        openWithDefaultAppCalls.push(String(args[0] || ''));
        value = null;
        break;
      // FileService.GetAbsolutePath
      case 2829025920:
        value = `/test-vault/${String(args[0] || '')}`;
        break;
      // FileService.OpenExternal
      case 1598367945:
        value = null;
        break;
      // TranscribeService.HasTranscript
      case 3858737331: {
        const mdPath = String(args[0] || '').replace(/\.[^/.]+$/, '') + '.md';
        value = Object.prototype.hasOwnProperty.call(files, mdPath);
        break;
      }
      // TranscribeService.Transcribe
      case 2533709064: {
        const audioRel = String(args[0] || '');
        const mdPath = audioRel.replace(/\.[^/.]+$/, '') + '.md';
        if (!Object.prototype.hasOwnProperty.call(files, mdPath)) {
          const audioName = audioRel.split('/').pop() || audioRel;
          const title = audioName.replace(/\.[^/.]+$/, '');
          const content = `---\nsource: "[[${audioName}]]"\nlocale: ja-JP\n---\n\n# ${title}\n\n## 文字起こし\n\nテスト用の文字起こし本文。\n\n## メモ\n\n`;
          addMockMarkdownFile(files, fileInfos, mdPath, content);
        }
        value = mdPath;
        break;
      }
      // NoteService.GetNote
      case 591728348: {
        const notePath = args[0];
        const content = files[notePath];
        value = content
          ? {
              title: path.basename(notePath).replace(/\.md$/i, ''),
              path: notePath,
              content,
              modifiedAt: new Date().toISOString(),
            }
          : null;
        break;
      }
      // NoteService.SaveNote
      case 242787801:
        await writeCurrentFile(String(args[0] || ''), String(args[1] || ''));
        value = null;
        break;
      // NoteService.SaveNoteCAS
      case 65181162: {
        const snapshot = args[0] || {};
        const notePath = String(snapshot.path || '');
        const content = String(args[1] || '');
        await writeCurrentFile(notePath, content);
        value = { status: 'saved', snapshot: { path: notePath, content, revision: `mock-${notePath}-${Date.now()}` } };
        break;
      }
      // NoteService.GetTodayDailyNote
      case 4090292734: {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dailyPath = `dailynotes/${yyyy}-${mm}-${dd}.md`;
        if (!Object.prototype.hasOwnProperty.call(files, dailyPath)) {
          addMockMarkdownFile(files, fileInfos, dailyPath, `# ${yyyy}-${mm}-${dd}\n\n## Memos\n\n`);
        }
        value = {
          title: `${yyyy}-${mm}-${dd}`,
          path: dailyPath,
          content: files[dailyPath],
          modifiedAt: new Date().toISOString(),
        };
        break;
      }
      // LinkService.GetBacklinks
      case 1256122864:
        value = [];
        break;
      // LinkService.GetBacklinksFromSnapshot
      case 2909346356:
        value = { ready: true, generation: 1, backlinks: [] };
        break;
      // LinkService.GetIndexState
      case 2266764181:
        value = { ready: true, generation: 1, rebuilding: false };
        break;
      // LinkService.GetLinkIndexSnapshot
      case 3444833188: {
        const links: Record<string, any[]> = {};
        for (const info of listCurrentFileInfos()) {
          const relativePath = info.path ?? info.Path;
          const isDir = info.isDir ?? info.IsDir;
          if (!isDir && getFixtureFileType(relativePath) === 'markdown') {
            links[relativePath] = createMockLinkInfo(files, relativePath);
          }
        }
        value = { ready: true, generation: 1, rebuilding: false, links };
        break;
      }
      // LinkService.GetLinkInfo
      case 1099033032:
        value = createMockLinkInfo(files, String(args[0] || ''));
        break;
      // LinkService.GetUnlinkedMentions
      case 2281004037:
        value = { ready: true, generation: 1, rebuilding: false, mentions: unlinkedMentionsFor(String(args[0] || '')) };
        break;
      // TransclusionService.Resolve
      case 4180959159: {
        const link = args[0] || {};
        const targetPath = String(link.targetPath || '');
        value = { targetPath, content: readCurrentFile(targetPath), generation: 1 };
        break;
      }
      // LinkService.ResolveLink
      case 685326756:
        value = resolveMockLink(files, String(args[0] || ''));
        break;
      // LinkService.RebuildIndex
      case 1852278501:
        value = null;
        break;
      // GraphService.GetFullGraph / GraphService.GetGraph
      case 312528985:
      case 3623512330:
        value = graph ?? {
          nodes: fileInfos.filter((f: any) => !(f.isDir ?? f.IsDir)).map((f: any) => ({
            id: f.path ?? f.Path,
            label: (f.name ?? f.Name).replace('.md', ''),
            linkCount: 1,
          })),
          edges: [],
        };
        break;
      // GraphService.GetGraphStats
      case 3975675625:
        value = {
          nodeCount: graph?.nodes.length ?? fileInfos.filter((f: any) => !(f.isDir ?? f.IsDir)).length,
          edgeCount: graph?.edges.length ?? 0,
        };
        break;
      // StateService.GetLastOpenedFile
      case 235349142:
        value = lastOpenedFile;
        break;
      // StateService.Load
      case 3611552735:
        value = null;
        break;
      // StateService.GetExplorerSessionState
      case 2437993295:
        value = explorerSessionState;
        break;
      // StateService.SetExplorerSessionState
      case 3369161579:
        explorerSessionState = { ...explorerSessionState, ...(args[0] || {}) };
        value = null;
        break;
      // StateService.EnsureWorkspace
      case 28239502:
      // StateService.GetWorkspaceState
      case 814030935:
        value = workspaceState;
        break;
      // StateService.ActivateWorkspacePane
      case 3116373877:
        workspaceState = { ...workspaceState, activePaneId: String(args[0] || workspaceState.activePaneId) };
        value = workspaceState;
        break;
      // StateService.ActivateWorkspaceTab
      case 3255769642:
        workspaceState = {
          ...workspaceState,
          activePaneId: String(args[0] || workspaceState.activePaneId),
          paneTabs: workspaceState.paneTabs.map((pane: any) =>
            pane.paneId === args[0] ? { ...pane, activeTabPath: String(args[1] || pane.activeTabPath) } : pane,
          ),
        };
        value = workspaceState;
        break;
      // StateService.OpenWorkspaceTab
      case 1084554207: {
        const paneID = String(args[0] || workspaceState.activePaneId);
        const tab = args[1] || { path: 'Welcome.md', fileType: 'markdown' };
        workspaceState = {
          ...workspaceState,
          activePaneId: paneID,
          paneTabs: workspaceState.paneTabs.map((pane: any) => {
            if (pane.paneId !== paneID) return pane;
            const tabs = pane.tabs.some((existing: any) => existing.path === tab.path) ? pane.tabs : [...pane.tabs, tab];
            return { ...pane, tabs, activeTabPath: tab.path };
          }),
        };
        value = workspaceState;
        break;
      }
      // StateService.CloseWorkspaceTab
      case 3739944061: {
        const paneID = String(args[0] || workspaceState.activePaneId);
        const path = String(args[1] || '');
        workspaceState = {
          ...workspaceState,
          paneTabs: workspaceState.paneTabs.map((pane: any) => {
            if (pane.paneId !== paneID) return pane;
            const tabs = pane.tabs.filter((tab: any) => tab.path !== path);
            const activeTabPath = pane.activeTabPath === path ? tabs.at(-1)?.path || '' : pane.activeTabPath;
            return { ...pane, tabs, activeTabPath };
          }),
        };
        value = workspaceState;
        break;
      }
      // StateService.CloseWorkspacePane
      case 118670904: {
        const paneID = String(args[0] || '');
        const children = workspaceState.paneTree?.children || [];
        const sibling = children.find((child: any) => child.paneId !== paneID) || children[0];
        const nextPaneId = sibling?.paneId || workspaceState.paneTabs.find((pane: any) => pane.paneId !== paneID)?.paneId || workspaceState.activePaneId;
        workspaceState = {
          ...workspaceState,
          paneTree: sibling || workspaceState.paneTree,
          activePaneId: nextPaneId,
          paneTabs: workspaceState.paneTabs.filter((pane: any) => pane.paneId !== paneID),
          popoutWindows: (workspaceState.popoutWindows ?? []).filter((popout: any) => popout.paneId !== paneID),
        };
        value = workspaceState;
        break;
      }
      // StateService.SetWorkspaceState
      case 3562066915:
        workspaceState = args[0] || workspaceState;
        value = null;
        break;
      // StateService.SplitWorkspacePane
      case 3532602000: {
        const paneID = String(args[0] || workspaceState.activePaneId);
        const direction = String(args[1] || 'horizontal');
        const newPaneID = String(args[2] || `pane-${Date.now()}`);
        workspaceState = {
          ...workspaceState,
          paneTree: {
            splitDirection: direction,
            children: [{ paneId: paneID }, { paneId: newPaneID }],
            weights: [1, 1],
          },
          activePaneId: newPaneID,
          paneTabs: [
            ...workspaceState.paneTabs,
            {
              paneId: newPaneID,
              tabs: [],
              activeTabPath: '',
            },
          ],
        };
        value = workspaceState;
        break;
      }
      // StateService.SetLastOpenedFile
      case 1385456610:
        lastOpenedFile = { path: String(args[0] || ''), fileType: String(args[1] || '') };
        value = null;
        break;
      // StateService.ClearLastOpenedFile
      case 4136538343:
        lastOpenedFile = null;
        value = null;
        break;
      // StateService.SetLastOpenedFile / ClearLastOpenedFile and other void calls
      // WindowService.ReconcilePopouts
      case 1354942118:
        await page.evaluate((popouts) => {
          for (const popout of popouts) {
            window.open(`/?popout=${encodeURIComponent(popout.paneId)}&id=${encodeURIComponent(popout.id)}`, '_blank', `popup,width=${popout.width || 640},height=${popout.height || 480}`);
          }
        }, workspaceState.popoutWindows ?? []);
        value = null;
        break;
      // WindowService.ValidatePopoutRoute
      case 1222552648: {
        const paneID = String(args[0] || '');
        const popoutID = String(args[1] || '');
        const exists = (workspaceState.popoutWindows ?? []).some((popout: any) => popout.paneId === paneID && popout.id === popoutID);
        if (!exists) {
          await route.fulfill({ status: 500, contentType: 'text/plain', body: 'popout route is no longer valid' });
          return;
        }
        value = null;
        break;
      }
      // WindowService.RejoinPopout
      case 1428287752: {
        const paneID = String(args[0] || '');
        const popoutID = String(args[1] || '');
        workspaceState = {
          ...workspaceState,
          popoutWindows: (workspaceState.popoutWindows ?? []).filter((popout: any) => !(popout.paneId === paneID && popout.id === popoutID)),
        };
        value = workspaceState;
        break;
      }
      // WindowService.ClosePopout
      case 2980208097: {
        const paneID = String(args[0] || '');
        const popoutID = String(args[1] || '');
        workspaceState = {
          ...workspaceState,
          popoutWindows: (workspaceState.popoutWindows ?? []).filter((popout: any) => !(popout.paneId === paneID && popout.id === popoutID)),
        };
        value = workspaceState;
        break;
      }
      default:
        value = null;
        break;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
  });

  // Wailsランタイムをモック
    await page.context().addInitScript(({ files, fileInfos, initialLastOpenedFile, graph, workspace }) => {
    // @wailsio/runtime の $Call.ByID をモック
    (window as any).__wails_mock_files = files;
    (window as any).__wails_mock_fileInfos = fileInfos;
    (window as any).__wails_mock_graph = graph;
    (window as any).__wails_mock_lastOpenedFile = initialLastOpenedFile;
    (window as any).__wails_mock_explorerSession = { expandedPaths: [], leftSidebarWidth: 250, rightSidebarWidth: 250 };
    (window as any).__wails_mock_workspace = workspace ?? {
      paneTree: { paneId: 'main' },
      activePaneId: 'main',
      popoutWindows: [],
      paneTabs: [
        {
          paneId: 'main',
          tabs: [{ path: initialLastOpenedFile?.path || 'Welcome.md', fileType: initialLastOpenedFile?.fileType || 'markdown' }],
          activeTabPath: initialLastOpenedFile?.path || 'Welcome.md',
        },
      ],
      savedWorkspaces: [],
      activeNamedWorkspace: '',
    };
    (window as any).__wails_mock_openExternalCalls = [];
    (window as any).__wails_mock_readBinaryCalls = [];

    // CancellablePromise風のオブジェクトを作成
      const createMockPromise = <T>(value: T): Promise<T> & { cancel: () => void } => {
        const p = Promise.resolve(value) as Promise<T> & { cancel: () => void };
        p.cancel = () => {};
        return p;
      };

      const resolveMockLink = (files: Record<string, string>, linkText: string): [string, boolean] => {
        const normalized = linkText.trim().replace(/^\/+/, '');
        const withoutAnchor = normalized.split('#')[0];
        const candidates = [
          withoutAnchor,
          withoutAnchor.endsWith('.md') ? withoutAnchor : `${withoutAnchor}.md`,
        ];

        for (const candidate of candidates) {
          if (Object.prototype.hasOwnProperty.call(files, candidate)) {
            return [candidate, true];
          }
        }

        const basename = withoutAnchor.split('/').pop() || withoutAnchor;
        const basenameWithExt = basename.endsWith('.md') ? basename : `${basename}.md`;
        const hit = Object.keys(files).find((key) => key.split('/').pop() === basenameWithExt);
        return hit ? [hit, true] : ['', false];
      };

    // Wailsランタイムのモック
    const mockRuntime = {
      Call: {
        ByID: (id: number, ...args: any[]) => {
          const files = (window as any).__wails_mock_files;
          const fileInfos = (window as any).__wails_mock_fileInfos;

          // 各メソッドIDに対応するモックを返す
          switch (id) {
            // ConfigService.GetConfig
            case 1692681084:
              return createMockPromise({
                Vault: { Path: '/test-vault' },
                DailyNotes: { Folder: 'dailynotes', Format: '2006-01-02', Template: '' },
                Timeline: { Section: '## Memos', TimeFormat: '15:04' },
                Templates: { Folder: '' },
                Editor: { FontSize: 14, FontFamily: 'SF Mono', LineNumbers: true, WordWrap: true },
                UI: { Theme: 'github-light', SidebarWidth: 250 },
              });

            // ConfigService.GetCommandDescriptors
            case 3998854739:
              return createMockPromise([
                { id: 'command-palette', title: 'Command Palette', hotkey: 'Cmd+P' },
                { id: 'new-note', title: 'New Note', hotkey: 'Cmd+N' },
                { id: 'quick-switcher', title: 'Quick Switcher', hotkey: 'Cmd+O' },
                { id: 'find-in-note', title: 'Find in Note', hotkey: 'Cmd+F' },
                { id: 'search-vault', title: 'Search Vault', hotkey: 'Cmd+Shift+F' },
                { id: 'save-current-file', title: 'Save Current File', hotkey: 'Cmd+S' },
                { id: 'toggle-graph-view', title: 'Knowledge Graph', hotkey: 'Cmd+G' },
                { id: 'toggle-source-editor', title: 'Toggle Source', hotkey: 'Cmd+E' },
                { id: 'split-pane-right', title: 'Split Pane Right', hotkey: 'Cmd+\\' },
                { id: 'split-pane-down', title: 'Split Pane Down', hotkey: 'Cmd+Shift+\\' },
                { id: 'close-active-tab', title: 'Close Note', hotkey: 'Cmd+W' },
                { id: 'close-active-pane', title: 'Close Active Pane', hotkey: '' },
                { id: 'open-settings', title: 'Settings', hotkey: 'Cmd+,' },
                { id: 'show-shortcuts-help', title: 'Show Shortcuts Help', hotkey: '?' },
                { id: 'toggle-file-tree-focus', title: 'Focus File Tree', hotkey: 'Cmd+Shift+E' },
                { id: 'close-overlays', title: 'Close Overlay', hotkey: 'Escape' },
                { id: 'undo-edit', title: 'Undo', hotkey: 'Cmd+Z' },
                { id: 'redo-edit', title: 'Redo', hotkey: 'Cmd+Shift+Z' },
              ].map((command) => {
                const noteScoped = ['find-in-note', 'save-current-file', 'toggle-source-editor', 'split-pane-right', 'split-pane-down', 'close-active-pane', 'undo-edit', 'redo-edit'].includes(command.id);
                return {
                  ...command,
                  category: noteScoped ? 'Note' : 'Global',
                  scope: noteScoped ? 'note' : 'global',
                  defaultHotkey: command.hotkey,
                };
              }));

            // ConfigService.GetFileExplorerConfig
            case 1564464553:
              return createMockPromise({ AutoReveal: true, SortField: 'name', SortDirection: 'ascending' });

            // ConfigService.GetEditorConfig
            case 1953582977:
              return createMockPromise({ FontSize: 14, FontFamily: 'SF Mono', LineNumbers: true, WordWrap: true });

            // ConfigService.GetSidebarWidth
            case 577856586:
              return createMockPromise(250);

            // ConfigService.GetVaultPath
            case 2348230133:
              return createMockPromise('/test-vault');

            // FileService.ListDirectoryTree (ID: 767112173)
            case 767112173:
              return createMockPromise(fileInfos);

            // FileService.ReadFile (ID: 1935931844)
            case 1935931844:
              const filePath = args[0];
              return createMockPromise(files[filePath] || '# File not found');

            // FileService.ReadSnapshot
            case 2251729070: {
              const filePath = String(args[0] || '');
              return createMockPromise({
                path: filePath,
                content: files[filePath] || '# File not found',
                revision: `mock-${filePath}`,
              });
            }

            // FileService.SaveRecoverySnapshot
            case 3257873128:
              return createMockPromise({ snapshot: {}, created: false });

            // FileService.ReadBinaryFile (ID: 797232813)
            case 797232813:
              (window as any).__wails_mock_readBinaryCalls.push(String(args[0] || ''));
              return createMockPromise(files[args[0]] || '');

            // FileService.Delete
            case 3586048485:
              delete files[String(args[0] || '')];
              return createMockPromise(undefined);

            // FileService.FileExists
            case 3863841388:
              return createMockPromise(Object.prototype.hasOwnProperty.call(files, String(args[0] || '')));

            // FileService.WriteFile
            case 1639997475: {
              const relativePath = String(args[0] || '');
              files[relativePath] = String(args[1] || '');
              const fileInfos = (window as any).__wails_mock_fileInfos;
              if (!fileInfos.some((info: any) => (info.path ?? info.Path) === relativePath)) {
                fileInfos.push({
                  name: relativePath.split('/').pop() || relativePath,
                  path: relativePath,
                  isDir: false,
                  fileType: relativePath.endsWith('.html') ? 'html' : relativePath.endsWith('.txt') ? 'text' : 'markdown',
                  modifiedAt: new Date().toISOString(),
                });
              }
              return createMockPromise(undefined);
            }

            // FileService.ImportExternalFile
            case 3954866026: {
              const sourcePath = String(args[0] || '');
              const targetFolder = String(args[1] || '');
              const fileName = sourcePath.split('/').pop() || 'imported.md';
              const relativePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
              const content = '# Imported from external file';
              files[relativePath] = content;
              const fileInfos = (window as any).__wails_mock_fileInfos;
              if (!fileInfos.some((info: any) => (info.path ?? info.Path) === relativePath)) {
                fileInfos.push({
                  name: fileName,
                  path: relativePath,
                  isDir: false,
                  fileType: 'markdown',
                  modifiedAt: new Date().toISOString(),
                });
              }
              return createMockPromise(relativePath);
            }

            // FileService.CreateFile
            case 4120094888: {
              const relativePath = String(args[0] || '');
              files[relativePath] = String(args[1] || '');
              const fileInfos = (window as any).__wails_mock_fileInfos;
              if (!fileInfos.some((info: any) => (info.path ?? info.Path) === relativePath)) {
                fileInfos.push({
                  name: relativePath.split('/').pop() || relativePath,
                  path: relativePath,
                  isDir: false,
                  fileType: 'markdown',
                  modifiedAt: new Date().toISOString(),
                });
              }
              return createMockPromise(undefined);
            }

            // FileService.RevealInFinder
            case 3963746572:
              return createMockPromise(undefined);

            // FileService.OpenWithDefaultApp
            case 1039929574:
              return createMockPromise(undefined);

            // FileService.GetAbsolutePath
            case 2829025920:
              return createMockPromise('/test-vault/' + String(args[0] || ''));

            // FileService.OpenExternal
            case 1598367945:
              (window as any).__wails_mock_openExternalCalls.push(String(args[0] || ''));
              return createMockPromise(undefined);

            // TranscribeService.HasTranscript
            case 3858737331: {
              const mdPath = String(args[0] || '').replace(/\.[^/.]+$/, '') + '.md';
              return createMockPromise(Object.prototype.hasOwnProperty.call(files, mdPath));
            }

            // TranscribeService.Transcribe
            case 2533709064: {
              const audioRel = String(args[0] || '');
              const mdPath = audioRel.replace(/\.[^/.]+$/, '') + '.md';
              if (!Object.prototype.hasOwnProperty.call(files, mdPath)) {
                const audioName = audioRel.split('/').pop() || audioRel;
                const title = audioName.replace(/\.[^/.]+$/, '');
                files[mdPath] = `---\nsource: "[[${audioName}]]"\nlocale: ja-JP\n---\n\n# ${title}\n\n## 文字起こし\n\nテスト用の文字起こし本文。\n\n## メモ\n\n`;
                const fileInfos = (window as any).__wails_mock_fileInfos;
                if (!fileInfos.some((info: any) => (info.path ?? info.Path) === mdPath)) {
                  fileInfos.push({
                    name: mdPath.split('/').pop() || mdPath,
                    path: mdPath,
                    isDir: false,
                    fileType: 'markdown',
                    modifiedAt: new Date().toISOString(),
                  });
                }
              }
              return createMockPromise(mdPath);
            }

            // NoteService.GetNote
            case 591728348:
              const notePath = args[0];
              return createMockPromise(files[notePath]
                ? {
                    title: notePath.split('/').pop()?.replace(/\.md$/i, '') || notePath,
                    path: notePath,
                    content: files[notePath],
                    modifiedAt: new Date().toISOString(),
                  }
                : null);

            // NoteService.SaveNote
            case 242787801: {
              const notePath = String(args[0] || '');
              files[notePath] = String(args[1] || '');
              return createMockPromise(undefined);
            }

            // NoteService.SaveNoteCAS
            case 65181162: {
              const snapshot = args[0] || {};
              const notePath = String(snapshot.path || '');
              const content = String(args[1] || '');
              files[notePath] = content;
              return createMockPromise({
                status: 'saved',
                snapshot: { path: notePath, content, revision: `mock-${notePath}-${Date.now()}` },
              });
            }

            // LinkService.GetBacklinks
            case 1256122864:
              return createMockPromise([]);

            // LinkService.GetBacklinksFromSnapshot
            case 2909346356:
              return createMockPromise({ ready: true, generation: 1, backlinks: [] });

            // LinkService.GetIndexState
            case 2266764181:
              return createMockPromise({ ready: true, generation: 1, rebuilding: false });

            // LinkService.GetLinkIndexSnapshot
            case 3444833188:
              return createMockPromise({ ready: true, generation: 1, rebuilding: false, links: {} });

            // LinkService.GetLinkInfo
            case 1099033032:
              return createMockPromise((() => {
                const content = files[String(args[0] || '')] || '';
                const links: any[] = [];
                const addLink = (text: string, isEmbed: boolean) => {
                  const [targetPath, exists] = resolveMockLink(files, text);
                  const embedExists = exists || (isEmbed && /\.(png|jpe?g|gif|webp|svg|bmp|pdf|mp3|m4a|wav|ogg|flac|aac|opus|md)$/i.test(text));
                  links.push({
                    text,
                    targetPath: targetPath || text,
                    exists: embedExists,
                    generation: 1,
                    kind: 'wikilink',
                    isEmbed,
                    raw: isEmbed ? `![[${text}]]` : `[[${text}]]`,
                  });
                };
                for (const match of content.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]*)?\]\]/g)) {
                  addLink(match[1], true);
                }
                for (const match of content.matchAll(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]*)?\]\]/g)) {
                  addLink(match[1], false);
                }
                return links;
              })());

            // LinkService.GetUnlinkedMentions
            case 2281004037:
              return createMockPromise((() => {
                const targetPath = String(args[0] || '');
                const targetTitle = targetPath.split('/').pop()?.replace(/\.md$/i, '') || '';
                const mentions = Object.entries(files).flatMap(([sourcePath, content]) => {
                  if (!targetTitle || sourcePath === targetPath) return [];
                  return String(content).split(/\r?\n/).flatMap((line, index) => {
                    if (!line.includes(targetTitle) || line.includes(`[[${targetTitle}`)) return [];
                    return [{
                      sourcePath,
                      sourceTitle: sourcePath.split('/').pop()?.replace(/\.md$/i, '') || sourcePath,
                      targetPath,
                      targetTitle,
                      match: targetTitle,
                      context: line.trim(),
                      line: index + 1,
                    }];
                  });
                });
                return { ready: true, generation: 1, rebuilding: false, mentions };
              })());

            // LinkService.ResolveLink
            case 685326756:
              return createMockPromise(resolveMockLink(files, String(args[0] || '')));

            // LinkService.RebuildIndex
            case 1852278501:
              return createMockPromise(undefined);

            // StateService.GetLastOpenedFile
            case 235349142:
              return createMockPromise((window as any).__wails_mock_lastOpenedFile ?? null);

            // StateService.Load
            case 3611552735:
              return createMockPromise(undefined);

            // StateService.GetExplorerSessionState
            case 2437993295:
              return createMockPromise((window as any).__wails_mock_explorerSession);

            // StateService.SetExplorerSessionState
            case 3369161579:
              (window as any).__wails_mock_explorerSession = {
                ...(window as any).__wails_mock_explorerSession,
                ...(args[0] || {}),
              };
              return createMockPromise(undefined);

            // StateService.EnsureWorkspace / GetWorkspaceState
            case 28239502:
            case 814030935:
              return createMockPromise((window as any).__wails_mock_workspace);

            // StateService.ActivateWorkspacePane
            case 3116373877:
              (window as any).__wails_mock_workspace = {
                ...(window as any).__wails_mock_workspace,
                activePaneId: String(args[0] || (window as any).__wails_mock_workspace.activePaneId),
              };
              return createMockPromise((window as any).__wails_mock_workspace);

            // StateService.ActivateWorkspaceTab
            case 3255769642:
              (window as any).__wails_mock_workspace = {
                ...(window as any).__wails_mock_workspace,
                activePaneId: String(args[0] || (window as any).__wails_mock_workspace.activePaneId),
                paneTabs: (window as any).__wails_mock_workspace.paneTabs.map((pane: any) =>
                  pane.paneId === args[0] ? { ...pane, activeTabPath: String(args[1] || pane.activeTabPath) } : pane,
                ),
              };
              return createMockPromise((window as any).__wails_mock_workspace);

            // StateService.OpenWorkspaceTab
            case 1084554207: {
              const paneID = String(args[0] || (window as any).__wails_mock_workspace.activePaneId);
              const tab = args[1] || { path: 'Welcome.md', fileType: 'markdown' };
              (window as any).__wails_mock_workspace = {
                ...(window as any).__wails_mock_workspace,
                activePaneId: paneID,
                paneTabs: (window as any).__wails_mock_workspace.paneTabs.map((pane: any) => {
                  if (pane.paneId !== paneID) return pane;
                  const tabs = pane.tabs.some((existing: any) => existing.path === tab.path) ? pane.tabs : [...pane.tabs, tab];
                  return { ...pane, tabs, activeTabPath: tab.path };
                }),
              };
              return createMockPromise((window as any).__wails_mock_workspace);
            }

            // StateService.CloseWorkspaceTab
            case 3739944061: {
              const workspace = (window as any).__wails_mock_workspace;
              const paneID = String(args[0] || workspace.activePaneId);
              const path = String(args[1] || '');
              (window as any).__wails_mock_workspace = {
                ...workspace,
                paneTabs: workspace.paneTabs.map((pane: any) => {
                  if (pane.paneId !== paneID) return pane;
                  const tabs = pane.tabs.filter((tab: any) => tab.path !== path);
                  const activeTabPath = pane.activeTabPath === path ? tabs.at(-1)?.path || '' : pane.activeTabPath;
                  return { ...pane, tabs, activeTabPath };
                }),
              };
              return createMockPromise((window as any).__wails_mock_workspace);
            }

            // StateService.CloseWorkspacePane
            case 118670904: {
              const workspace = (window as any).__wails_mock_workspace;
              const paneID = String(args[0] || '');
              const children = workspace.paneTree?.children || [];
              const sibling = children.find((child: any) => child.paneId !== paneID) || children[0];
              const nextPaneId = sibling?.paneId || workspace.paneTabs.find((pane: any) => pane.paneId !== paneID)?.paneId || workspace.activePaneId;
              (window as any).__wails_mock_workspace = {
                ...workspace,
                paneTree: sibling || workspace.paneTree,
                activePaneId: nextPaneId,
                paneTabs: workspace.paneTabs.filter((pane: any) => pane.paneId !== paneID),
                popoutWindows: (workspace.popoutWindows ?? []).filter((popout: any) => popout.paneId !== paneID),
              };
              return createMockPromise((window as any).__wails_mock_workspace);
            }

            // StateService.SetWorkspaceState
            case 3562066915:
              (window as any).__wails_mock_workspace = args[0] || (window as any).__wails_mock_workspace;
              return createMockPromise(undefined);

            // StateService.SplitWorkspacePane
            case 3532602000: {
              const workspace = (window as any).__wails_mock_workspace;
              const paneID = String(args[0] || workspace.activePaneId);
              const direction = String(args[1] || 'horizontal');
              const newPaneID = String(args[2] || `pane-${Date.now()}`);
              (window as any).__wails_mock_workspace = {
                ...workspace,
                paneTree: {
                  splitDirection: direction,
                  children: [{ paneId: paneID }, { paneId: newPaneID }],
                  weights: [1, 1],
                },
                activePaneId: newPaneID,
                paneTabs: [
                  ...workspace.paneTabs,
                  {
                    paneId: newPaneID,
                    tabs: [],
                    activeTabPath: '',
                  },
                ],
              };
              return createMockPromise((window as any).__wails_mock_workspace);
            }

            // StateService.SetLastOpenedFile
            case 1385456610:
              (window as any).__wails_mock_lastOpenedFile = {
                path: String(args[0] || ''),
                fileType: String(args[1] || ''),
              };
              return createMockPromise(undefined);

            // StateService.ClearLastOpenedFile
            case 4136538343:
              (window as any).__wails_mock_lastOpenedFile = null;
              return createMockPromise(undefined);

            // GraphService.GetFullGraph / GraphService.GetGraph
            case 312528985:
            case 3623512330:
              return createMockPromise((window as any).__wails_mock_graph ?? {
                nodes: fileInfos.filter((f: any) => !(f.isDir ?? f.IsDir)).map((f: any) => ({
                  id: f.path ?? f.Path,
                  label: (f.name ?? f.Name).replace('.md', ''),
                  linkCount: 1,
                })),
                edges: [],
              });

            // GraphService.GetGraphStats
            case 3975675625:
              return createMockPromise({
                nodeCount: ((window as any).__wails_mock_graph?.nodes.length) ?? fileInfos.filter((f: any) => !(f.isDir ?? f.IsDir)).length,
                edgeCount: ((window as any).__wails_mock_graph?.edges.length) ?? 0,
              });

            // WindowService系は空で返す
            default:
              console.warn(`[Mock] Unknown method ID: ${id}`);
              return createMockPromise(null);
          }
        },
      },
      Create: {
        Nullable: (fn: any) => (val: any) => val ? fn(val) : null,
        Array: (fn: any) => (arr: any[]) => arr?.map(fn) || [],
      },
    };

    // @wailsio/runtimeをオーバーライド
    Object.defineProperty(window, '__wails_runtime_mock', {
      value: mockRuntime,
      writable: false,
    });
  }, { files, fileInfos, initialLastOpenedFile: lastOpenedFile, graph, workspace });
}

export async function waitForAppCommands(page: Page): Promise<void> {
  await expect(page.locator('#graph-btn')).toHaveAttribute('title', /(Graph View|Knowledge Graph) \(/, { timeout: 5000 });
}

export async function dispatchGlobalHotkey(
  page: Page,
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
): Promise<void> {
  await page.evaluate(({ key, modifiers }) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      metaKey: Boolean(modifiers.metaKey),
      ctrlKey: Boolean(modifiers.ctrlKey),
      altKey: Boolean(modifiers.altKey),
      shiftKey: Boolean(modifiers.shiftKey),
      bubbles: true,
      cancelable: true,
    }));
  }, { key, modifiers });
}

export async function openCommandPaletteWithHotkey(page: Page): Promise<void> {
  await expect.poll(async () => {
    const overlay = page.locator('#command-palette-overlay');
    const display = await overlay.evaluate((el) => getComputedStyle(el).display);
    if (display === 'none') {
      await dispatchGlobalHotkey(page, 'p', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
    }
    return await overlay.evaluate((el) => getComputedStyle(el).display);
  }, { timeout: 5000 }).not.toBe('none');
}

export async function showShortcutsHelpWithHotkey(page: Page): Promise<void> {
  await expect.poll(async () => {
    const overlay = page.locator('#shortcuts-overlay');
    const className = await overlay.getAttribute('class');
    if (!className?.includes('visible')) {
      await dispatchGlobalHotkey(page, '?', { shiftKey: true });
    }
    return await overlay.getAttribute('class');
  }, { timeout: 5000 }).toContain('visible');
}

/**
 * ファイルツリーにモックデータを直接注入する（バックアップ方法）
 */
export async function injectMockFileTree(page: Page): Promise<void> {
  const fileInfos = generateFileInfos();

  await page.evaluate((infos) => {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;

    // ファイルツリーのHTMLを生成
    let html = '';
    const folders: any[] = [];
    const files: any[] = [];

    for (const info of infos) {
      if (info.IsDir) {
        folders.push(info);
      } else {
        files.push(info);
      }
    }

    // フォルダを先に表示
    for (const folder of folders) {
      html += `<div class="folder-item" data-path="${folder.Path}">
        <span class="folder-icon">📁</span>
        <span class="folder-name">${folder.Name}</span>
      </div>`;
    }

    // ファイルを表示
    for (const file of files) {
      html += `<div class="file-item" data-path="${file.Path}">
        <span class="file-icon">📄</span>
        <span class="file-name">${file.Name}</span>
      </div>`;
    }

    fileTree.innerHTML = html;
  }, fileInfos);
}

/**
 * エディタにモックコンテンツを設定する
 */
export async function setEditorContent(page: Page, content: string): Promise<void> {
  await page.evaluate((text) => {
    const editor = document.querySelector('.workspace-pane-slot[data-active="true"] textarea[aria-label^="Editor in pane"], #editor') as HTMLTextAreaElement | null;
    if (editor) {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const outlineList = document.getElementById('outline-list');
    if (outlineList) {
      const rightSidebar = document.getElementById('right-sidebar') as HTMLElement | null;
      if (rightSidebar) {
        rightSidebar.hidden = false;
        rightSidebar.style.display = 'flex';
      }
      outlineList.hidden = false;
      outlineList.closest('.sidebar-section')?.classList.remove('collapsed');
      const headings = text.split('\n').map((line, index) => {
        const match = /^(#{1,6})\s+(.+)$/.exec(line);
        return match ? { level: match[1].length, text: match[2], line: index } : null;
      }).filter(Boolean) as Array<{ level: number; text: string; line: number }>;
      outlineList.innerHTML = headings.map((heading, index) =>
        `<button class="outline-item h${heading.level}${index === 0 ? ' active' : ''}" data-line="${heading.line}" data-heading-index="${index}">${heading.text}</button>`
      ).join('');
    }
  }, content);

  // プレビューの更新を待機
  await page.waitForTimeout(500);
}

/**
 * グラフビューにモックデータを注入する（複雑なナレッジグラフ）
 */
export async function injectMockGraphData(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.getElementById('graph-container');
    const stats = document.getElementById('graph-stats');

    if (!container) return;

    // Generate complex knowledge graph with multiple clusters
    interface Node { id: string; label: string; x: number; y: number; size: number; cluster: string; }
    interface Link { source: string; target: string; }

    const nodes: Node[] = [];
    const links: Link[] = [];
    const nodeMap = new Map<string, Node>();

    // Cluster definitions with center positions
    const clusters = [
      { name: 'Projects', cx: 350, cy: 220, color: '#6366f1', count: 25 },      // Purple - center hub
      { name: 'DailyNotes', cx: 580, cy: 120, color: '#22c55e', count: 40 },    // Green - top right
      { name: 'People', cx: 120, cy: 120, color: '#f59e0b', count: 20 },        // Orange - top left
      { name: 'Concepts', cx: 580, cy: 340, color: '#ec4899', count: 30 },      // Pink - bottom right
      { name: 'Resources', cx: 120, cy: 340, color: '#06b6d4', count: 25 },     // Cyan - bottom left
      { name: 'Archive', cx: 350, cy: 420, color: '#8b5cf6', count: 15 },       // Violet - bottom center
    ];

    // Topic names for realistic labels
    const projectNames = ['WebApp', 'MobileApp', 'API', 'Database', 'Auth', 'UI', 'Backend', 'Frontend', 'DevOps', 'Testing', 'Docs', 'Analytics', 'Search', 'Cache', 'Queue', 'ML', 'AI', 'Infra', 'Security', 'Performance', 'Monitoring', 'Logging', 'CI/CD', 'Deploy', 'Migration'];
    const conceptNames = ['Architecture', 'Design', 'Patterns', 'Principles', 'Best Practices', 'Anti-patterns', 'Refactoring', 'Clean Code', 'SOLID', 'DRY', 'KISS', 'YAGNI', 'TDD', 'BDD', 'DDD', 'Microservices', 'Monolith', 'Serverless', 'Event-driven', 'REST', 'GraphQL', 'gRPC', 'WebSocket', 'OAuth', 'JWT', 'Encryption', 'Hashing', 'Caching', 'Indexing', 'Sharding'];
    const personNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul', 'Quinn', 'Rose', 'Sam', 'Tina'];
    const resourceNames = ['Tutorial', 'Book', 'Course', 'Video', 'Article', 'Paper', 'Blog', 'Podcast', 'Tool', 'Library', 'Framework', 'SDK', 'CLI', 'Plugin', 'Extension', 'Template', 'Boilerplate', 'Example', 'Demo', 'Benchmark', 'Comparison', 'Review', 'Guide', 'Cheatsheet', 'Reference'];
    const archiveNames = ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', 'Legacy', 'Deprecated', 'Old', 'Backup', 'V1', 'V2', 'Draft', 'WIP', 'TODO', 'Ideas', 'Scratch'];

    // Generate nodes for each cluster
    clusters.forEach((cluster, clusterIdx) => {
      const names = clusterIdx === 0 ? projectNames :
                    clusterIdx === 1 ? [] : // Daily notes use dates
                    clusterIdx === 2 ? personNames :
                    clusterIdx === 3 ? conceptNames :
                    clusterIdx === 4 ? resourceNames : archiveNames;

      for (let i = 0; i < cluster.count; i++) {
        // Distribute nodes in a circular pattern around cluster center
        const angle = (i / cluster.count) * Math.PI * 2 + (clusterIdx * 0.3);
        const radius = 40 + Math.random() * 50;
        const x = cluster.cx + Math.cos(angle) * radius;
        const y = cluster.cy + Math.sin(angle) * radius;

        let label: string;
        if (clusterIdx === 1) {
          // Daily notes - use dates
          const date = new Date(2025, 0, 1 + i);
          label = `${date.getMonth() + 1}/${date.getDate()}`;
        } else {
          label = names[i % names.length] || `Note${i}`;
        }

        const id = `${cluster.name}-${i}`;
        const size = clusterIdx === 0 && i < 5 ? 6 : 3 + Math.random() * 3; // Hub nodes are bigger
        const node = { id, label, x, y, size, cluster: cluster.name };
        nodes.push(node);
        nodeMap.set(id, node);
      }
    });

    // Generate intra-cluster links (nodes within same cluster)
    clusters.forEach((cluster, clusterIdx) => {
      const clusterNodes = nodes.filter(n => n.cluster === cluster.name);
      clusterNodes.forEach((node, i) => {
        // Connect to 2-4 random nodes in same cluster
        const connectionCount = 2 + Math.floor(Math.random() * 3);
        for (let j = 0; j < connectionCount; j++) {
          const targetIdx = Math.floor(Math.random() * clusterNodes.length);
          if (targetIdx !== i) {
            links.push({ source: node.id, target: clusterNodes[targetIdx].id });
          }
        }
      });
    });

    // Generate inter-cluster links (connecting different clusters)
    // Projects cluster is the hub - connects to all other clusters
    const projectNodes = nodes.filter(n => n.cluster === 'Projects');
    clusters.forEach((cluster, idx) => {
      if (idx === 0) return; // Skip projects cluster itself
      const clusterNodes = nodes.filter(n => n.cluster === cluster.name);
      // Connect 5-10 nodes from each cluster to project nodes
      const connectCount = 5 + Math.floor(Math.random() * 6);
      for (let i = 0; i < connectCount; i++) {
        const projectNode = projectNodes[Math.floor(Math.random() * projectNodes.length)];
        const otherNode = clusterNodes[Math.floor(Math.random() * clusterNodes.length)];
        links.push({ source: projectNode.id, target: otherNode.id });
      }
    });

    // Additional cross-cluster connections for realism
    const crossConnections = [
      ['People', 'DailyNotes', 15],
      ['Concepts', 'Resources', 12],
      ['People', 'Concepts', 8],
      ['Resources', 'Archive', 6],
      ['DailyNotes', 'Archive', 10],
    ] as const;

    crossConnections.forEach(([cluster1, cluster2, count]) => {
      const nodes1 = nodes.filter(n => n.cluster === cluster1);
      const nodes2 = nodes.filter(n => n.cluster === cluster2);
      for (let i = 0; i < count; i++) {
        const n1 = nodes1[Math.floor(Math.random() * nodes1.length)];
        const n2 = nodes2[Math.floor(Math.random() * nodes2.length)];
        links.push({ source: n1.id, target: n2.id });
      }
    });

    // Remove duplicate links
    const uniqueLinks = Array.from(new Set(links.map(l =>
      l.source < l.target ? `${l.source}-${l.target}` : `${l.target}-${l.source}`
    ))).map(key => {
      const [source, target] = key.split('-');
      return { source: source + (key.includes('-') ? key.substring(key.indexOf('-')) : ''), target };
    }).slice(0, 400); // Limit to 400 links for performance

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 700 480');
    svg.style.background = 'transparent';

    // Draw links first (behind nodes)
    links.forEach(link => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (source && target) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(source.x));
        line.setAttribute('y1', String(source.y));
        line.setAttribute('x2', String(target.x));
        line.setAttribute('y2', String(target.y));
        line.setAttribute('stroke', 'rgba(100, 150, 255, 0.15)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
      }
    });

    // Draw nodes - use single purple color like real app (dark theme)
    const nodeColor = '#9d8cff'; // Same as real app dark theme
    nodes.forEach(node => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(node.x));
      circle.setAttribute('cy', String(node.y));
      circle.setAttribute('r', String(node.size));
      circle.setAttribute('fill', nodeColor);
      circle.setAttribute('opacity', '0.85');
      svg.appendChild(circle);
    });

    // Note: Real app doesn't show cluster labels - only nodes and links

    container.innerHTML = '';
    container.appendChild(svg);

    // Update stats
    if (stats) {
      stats.textContent = `${nodes.length} files • ${links.length} links`;
    }
  });
}

/**
 * タイムラインパネルにモックエントリを注入する
 */
export async function injectMockTimelineEntries(page: Page): Promise<void> {
  await page.evaluate(() => {
    const timelineList = document.getElementById('timeline-list');
    if (!timelineList) return;

    const entries = [
      { time: '16:00', content: 'Released v0.2.1 🎉' },
      { time: '14:30', content: 'Fixed Mermaid rendering bug' },
      { time: '11:00', content: 'Added new theme support' },
      { time: '10:30', content: 'Started working on Obails' },
    ];

    let html = '';
    entries.forEach(entry => {
      html += `
        <div class="timeline-entry">
          <span class="timeline-time">${entry.time}</span>
          <span class="timeline-content">${entry.content}</span>
        </div>
      `;
    });

    timelineList.innerHTML = html;
  });
}
