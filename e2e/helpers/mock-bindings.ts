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
      } else if (entry.name.endsWith('.md')) {
        files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
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
          ModTime: new Date().toISOString(),
          Size: 0,
          Children: [],
        });
        addDir(fullPath, relativePath);
      } else if (entry.name.endsWith('.md')) {
        const stats = fs.statSync(fullPath);
        infos.push({
          Name: entry.name,
          Path: relativePath,
          IsDir: false,
          ModTime: stats.mtime.toISOString(),
          Size: stats.size,
          Children: null,
        });
      }
    }
  };
  addDir(TEST_VAULT_PATH);
  return infos;
}

/**
 * ページにWailsバインディングのモックを設定する
 */
export async function setupMockBindings(page: Page): Promise<void> {
  const files = loadTestFiles();
  const fileInfos = generateFileInfos();

  // Wailsランタイムをモック
  await page.addInitScript(({ files, fileInfos }) => {
    // @wailsio/runtime の $Call.ByID をモック
    (window as any).__wails_mock_files = files;
    (window as any).__wails_mock_fileInfos = fileInfos;

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
            case 1234567890:
              return createMockPromise({
                Vault: { Path: '/test-vault' },
                DailyNotes: { Folder: 'dailynotes', Format: '2006-01-02', Template: '' },
                Timeline: { Section: '## Memos', TimeFormat: '15:04' },
                Templates: { Folder: '' },
                Editor: { FontSize: 14, FontFamily: 'SF Mono', LineNumbers: true, WordWrap: true },
                UI: { Theme: 'github-light', SidebarWidth: 250 },
              });

            // ConfigService.GetVaultPath
            case 3456789012:
              return createMockPromise('/test-vault');

            // FileService.ListDirectoryTree (ID: 767112173)
            case 767112173:
              return createMockPromise(fileInfos);

            // FileService.ReadFile (ID: 1935931844)
            case 1935931844:
              const filePath = args[0];
              return createMockPromise(files[filePath] || '# File not found');

            // LinkService.GetBacklinks
            case 5678901234:
              return createMockPromise([]);

            // LinkService.GetOutgoingLinks
            case 6789012345:
              return createMockPromise([]);

            // StateService.GetLastOpenedFile
            case 7890123456:
              return createMockPromise(null);

            // StateService.SetLastOpenedFile
            case 8901234567:
              return createMockPromise(undefined);

            // GraphService.GetGraph
            case 9012345678:
              return createMockPromise({
                Nodes: fileInfos.filter((f: any) => !f.IsDir).map((f: any) => ({
                  Id: f.Path,
                  Label: f.Name.replace('.md', ''),
                  Val: 1,
                })),
                Links: [],
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
  }, { files, fileInfos });
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
 * グラフビューにモックデータを注入する
 */
export async function injectMockGraphData(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.getElementById('graph-container');
    const stats = document.getElementById('graph-stats');

    if (!container) return;

    // SVGでシンプルなグラフを描画
    const nodes = [
      { id: 'welcome', label: 'Welcome', x: 350, y: 200 },
      { id: 'features', label: 'Features', x: 550, y: 150 },
      { id: 'mermaid', label: 'Mermaid Demo', x: 550, y: 300 },
      { id: 'code', label: 'Code Examples', x: 200, y: 150 },
      { id: 'daily', label: '2025-01-19', x: 200, y: 300 },
    ];

    const links = [
      { source: 'welcome', target: 'features' },
      { source: 'welcome', target: 'mermaid' },
      { source: 'welcome', target: 'code' },
      { source: 'features', target: 'welcome' },
      { source: 'features', target: 'code' },
      { source: 'daily', target: 'features' },
    ];

    // SVG作成
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 700 450');
    svg.style.background = 'transparent';

    // リンクを描画
    links.forEach(link => {
      const source = nodes.find(n => n.id === link.source);
      const target = nodes.find(n => n.id === link.target);
      if (source && target) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(source.x));
        line.setAttribute('y1', String(source.y));
        line.setAttribute('x2', String(target.x));
        line.setAttribute('y2', String(target.y));
        line.setAttribute('stroke', 'rgba(100, 150, 255, 0.5)');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
      }
    });

    // ノードを描画
    nodes.forEach(node => {
      // 円
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(node.x));
      circle.setAttribute('cy', String(node.y));
      circle.setAttribute('r', '25');
      circle.setAttribute('fill', node.id === 'welcome' ? '#6495ED' : '#4169E1');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);

      // ラベル
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(node.x));
      text.setAttribute('y', String(node.y + 45));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-family', 'system-ui');
      text.textContent = node.label;
      svg.appendChild(text);
    });

    container.innerHTML = '';
    container.appendChild(svg);

    // 統計を更新
    if (stats) {
      stats.textContent = '5 files • 6 links';
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
