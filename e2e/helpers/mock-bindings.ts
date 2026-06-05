/**
 * Wails Bindings Mock for E2E Tests
 *
 * Playwrightのブラウザ環境ではWailsのバインディングが動作しないため、
 * モックデータを提供してフロントエンドをテスト可能にする
 */

import { Page } from '@playwright/test';
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
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        infos.push({
          Name: entry.name,
          Path: relativePath,
          IsDir: true,
          name: entry.name,
          path: relativePath,
          isDir: true,
          ModTime: new Date().toISOString(),
          Size: 0,
          Children: [],
          modifiedAt: new Date().toISOString(),
          children: [],
        });
        addDir(fullPath, relativePath);
      } else {
        const stats = fs.statSync(fullPath);
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

type MockLastOpenedFile = { path: string; fileType: string } | null;

type MockBindingOptions = {
  initialLastOpenedFile?: MockLastOpenedFile;
};

/**
 * ページにWailsバインディングのモックを設定する
 */
export async function setupMockBindings(page: Page, options: MockBindingOptions = {}): Promise<void> {
  const files = loadTestFiles();
  const fileInfos = generateFileInfos();
  let lastOpenedFile: MockLastOpenedFile = options.initialLastOpenedFile ?? null;
  const readBinaryCalls: string[] = [];

  await page.exposeFunction('__wailsMockReadBinaryCalls', () => readBinaryCalls.slice());

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

  await page.route('**/wails/runtime', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fallback();
      return;
    }

    const body = JSON.parse(request.postData() || '{}');
    const call = body.args || {};
    const methodID = call.methodID;
    const args = call.args || [];

    let value: any = null;
    switch (methodID) {
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
      // FileService.ListDirectoryTree
      case 767112173:
        value = fileInfos;
        break;
      // FileService.ReadFile
      case 1935931844:
        value = files[args[0]] || '# File not found';
        break;
      // FileService.ReadBinaryFile
      case 797232813:
        readBinaryCalls.push(String(args[0] || ''));
        value = files[args[0]] || '';
        break;
      // FileService.ImportExternalFile
      case 3954866026: {
        const sourcePath = String(args[0] || '');
        const targetFolder = String(args[1] || '');
        const fileName = sourcePath.split('/').pop() || 'imported.md';
        const relativePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
        addMockMarkdownFile(files, fileInfos, relativePath);
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
      // LinkService.GetBacklinks
      case 1256122864:
      // LinkService.GetLinkInfo
      case 1099033032:
        value = [];
        break;
      // StateService.GetLastOpenedFile
      case 235349142:
        value = lastOpenedFile;
        break;
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
  await page.addInitScript(({ files, fileInfos, initialLastOpenedFile }) => {
    // @wailsio/runtime の $Call.ByID をモック
    (window as any).__wails_mock_files = files;
    (window as any).__wails_mock_fileInfos = fileInfos;
    (window as any).__wails_mock_lastOpenedFile = initialLastOpenedFile;
    (window as any).__wails_mock_openExternalCalls = [];
    (window as any).__wails_mock_readBinaryCalls = [];

    // CancellablePromise風のオブジェクトを作成
    const createMockPromise = <T>(value: T): Promise<T> & { cancel: () => void } => {
      const p = Promise.resolve(value) as Promise<T> & { cancel: () => void };
      p.cancel = () => {};
      return p;
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

            // FileService.ReadBinaryFile (ID: 797232813)
            case 797232813:
              (window as any).__wails_mock_readBinaryCalls.push(String(args[0] || ''));
              return createMockPromise(files[args[0]] || '');

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

            // LinkService.GetBacklinks
            case 1256122864:
              return createMockPromise([]);

            // LinkService.GetLinkInfo
            case 1099033032:
              return createMockPromise([]);

            // StateService.GetLastOpenedFile
            case 235349142:
              return createMockPromise((window as any).__wails_mock_lastOpenedFile ?? null);

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

            // GraphService.GetFullGraph
            case 312528985:
              return createMockPromise({
                nodes: fileInfos.filter((f: any) => !(f.isDir ?? f.IsDir)).map((f: any) => ({
                  id: f.path ?? f.Path,
                  label: (f.name ?? f.Name).replace('.md', ''),
                  Val: 1,
                })),
                links: [],
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
  }, { files, fileInfos, initialLastOpenedFile: lastOpenedFile });
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
    const editor = document.getElementById('editor') as HTMLTextAreaElement;
    if (editor) {
      editor.value = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
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
