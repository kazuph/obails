/**
 * Visual Regression Tests for README Screenshots
 *
 * このテストファイルはREADME用のスクリーンショットを生成し、
 * リグレッションテストとしても機能する。
 *
 * 実行方法:
 *   pnpm test e2e/visual-regression.spec.ts
 *
 * スクリーンショット出力先:
 *   docs/screenshots/
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { injectMockFileTree, setEditorContent, injectMockGraphData, injectMockTimelineEntries } from './helpers/mock-bindings';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.resolve(__dirname, '../docs/screenshots');
const TEST_VAULT_PATH = path.resolve(__dirname, 'fixtures/test-vault');

// テスト用ファイルのコンテンツをロード
function loadTestFile(filename: string): string {
  const filePath = path.join(TEST_VAULT_PATH, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return `# ${filename}\n\nFile not found.`;
}

// テスト全体で使用する設定
test.describe.configure({ mode: 'serial' });

test.describe('Visual Regression - README Screenshots', () => {
  // 共通のセットアップ
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wailsバインディングが動作しないブラウザ環境用にモックデータを注入
    await injectMockFileTree(page);

    // ファイルツリーが表示されるまで待機
    await page.waitForSelector('.file-tree .file-item', { timeout: 5000 });
  });

  /**
   * ファイルを開くヘルパー関数（モックデータを直接設定）
   */
  async function openFile(page: Page, filename: string): Promise<void> {
    // ファイルアイテムをハイライト（視覚的フィードバック）
    const fileItem = page.locator(`.file-tree .file-item[data-path*="${filename.replace('.md', '')}"]`);
    if (await fileItem.count() > 0) {
      await fileItem.evaluate(el => el.classList.add('selected'));
    }

    // テストファイルのコンテンツを読み込んでエディタに設定
    const content = loadTestFile(filename);
    await setEditorContent(page, content);

    // エディタタイトルを更新
    await page.evaluate((name) => {
      const title = document.getElementById('editor-title');
      if (title) title.textContent = name;
    }, filename);

    // プレビューの更新を待機
    await page.waitForTimeout(800);
  }

  /**
   * テーマを切り替えるヘルパー関数
   */
  async function switchTheme(page: Page, theme: string): Promise<void> {
    const themeSelect = page.locator('#theme-select');
    await themeSelect.selectOption(theme);
    await page.waitForTimeout(300); // テーマ適用を待機
  }

  test('01 - Main Screen with GitHub Light Theme', async ({ page }) => {
    // Welcome.mdを開く
    await openFile(page, 'Welcome.md');

    // GitHub Lightテーマに設定
    await switchTheme(page, 'github-light');

    // スクリーンショット撮影
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'main-light.png'),
      fullPage: false,
    });

    // 検証: テーマが正しく適用されている
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'github-light');
  });

  test('02 - Main Screen with Dracula Theme', async ({ page }) => {
    await openFile(page, 'Welcome.md');
    await switchTheme(page, 'dracula');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'main-dark.png'),
      fullPage: false,
    });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dracula');
  });

  test('03 - Catppuccin Mocha Theme', async ({ page }) => {
    await openFile(page, 'Features.md');
    await switchTheme(page, 'catppuccin');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'theme-catppuccin.png'),
      fullPage: false,
    });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'catppuccin');
  });

  test('04 - Tokyo Night Theme', async ({ page }) => {
    await openFile(page, 'Code Examples.md');
    await switchTheme(page, 'tokyonight');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'theme-tokyonight.png'),
      fullPage: false,
    });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'tokyonight');
  });

  test('05 - Mermaid Diagram Display', async ({ page }) => {
    await openFile(page, 'Mermaid Demo.md');
    await switchTheme(page, 'github-light');

    // Mermaidのレンダリングを待機
    await page.waitForSelector('.preview-pane .mermaid svg, .preview-pane [data-mermaid-processed]', {
      timeout: 10000
    }).catch(() => {
      // Mermaidがレンダリングされない場合もある
    });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'mermaid-diagram.png'),
      fullPage: false,
    });
  });

  test('06 - Code Syntax Highlighting', async ({ page }) => {
    await openFile(page, 'Code Examples.md');
    await switchTheme(page, 'github-light');

    // コードブロックのハイライトを待機
    await page.waitForSelector('.preview-pane pre code', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'code-highlight.png'),
      fullPage: false,
    });
  });

  test('07 - Outline Panel', async ({ page }) => {
    await openFile(page, 'Features.md');
    await switchTheme(page, 'github-light');

    // アウトラインパネルの更新を待機
    await page.waitForSelector('#outline-list .outline-item', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'outline-panel.png'),
      fullPage: false,
    });

    // 検証: アウトラインアイテムが存在する
    const outlineItems = page.locator('#outline-list .outline-item');
    await expect(outlineItems.first()).toBeVisible();
  });

  test('08 - Graph View', async ({ page }) => {
    await openFile(page, 'Welcome.md');
    await switchTheme(page, 'dracula');

    // グラフビューを開く
    await page.click('#graph-btn');

    // グラフオーバーレイが表示されるまで待機
    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/, { timeout: 5000 });

    // モックのグラフデータを注入
    await injectMockGraphData(page);
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'graph-view.png'),
      fullPage: false,
    });

    // グラフを閉じる
    await page.click('#graph-close');
  });

  test('09 - Timeline Panel', async ({ page }) => {
    await openFile(page, 'dailynotes/2025-01-19.md');
    await switchTheme(page, 'github-light');

    // タイムラインパネルを開く
    await page.click('#timeline-btn');

    const timelinePanel = page.locator('#timeline-panel');
    await expect(timelinePanel).toBeVisible({ timeout: 5000 });

    // モックのタイムラインエントリを注入
    await injectMockTimelineEntries(page);

    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'timeline-panel.png'),
      fullPage: false,
    });

    // パネルを閉じる
    await page.click('#timeline-btn');
  });

  test('10 - Wiki Links in Preview', async ({ page }) => {
    await openFile(page, 'Welcome.md');
    await switchTheme(page, 'github-light');

    // Wiki-linkが表示されるまで待機
    await page.waitForSelector('.preview-pane .wiki-link', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'wiki-links.png'),
      fullPage: false,
    });

    // 検証: Wiki-linkが存在する
    const wikiLinks = page.locator('.preview-pane .wiki-link');
    await expect(wikiLinks.first()).toBeVisible();
  });

  test('11 - File Search', async ({ page }) => {
    await switchTheme(page, 'github-light');

    // 検索入力フィールドにフォーカス
    const searchInput = page.locator('#file-search-input');
    await searchInput.click();
    await searchInput.fill('Mermaid');

    // 検索結果のフィルタリングを待機
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'file-search.png'),
      fullPage: false,
    });

    // 検索をクリア
    await page.click('#file-search-clear');
  });

  test('12 - Multiple Themes Gallery', async ({ page }) => {
    await openFile(page, 'Welcome.md');

    const themes = [
      'github-light',
      'solarized-light',
      'one-light',
      'catppuccin-latte',
      'rosepine-dawn',
      'catppuccin',
      'dracula',
      'nord',
      'solarized',
      'onedark',
      'gruvbox',
      'tokyonight'
    ];

    for (const theme of themes) {
      await switchTheme(page, theme);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `theme-${theme}.png`),
        fullPage: false,
      });
    }

    // 最後にGitHub Lightに戻す
    await switchTheme(page, 'github-light');
  });
});

test.describe('Visual Regression - Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // モックファイルツリーを注入
    await injectMockFileTree(page);
    await page.waitForSelector('.file-tree .file-item', { timeout: 5000 });
  });

  test('File tree folder expansion', async ({ page }) => {
    // dailynotesフォルダがあれば展開
    const folderItem = page.locator('.file-tree .folder-item').first();
    if (await folderItem.isVisible()) {
      await folderItem.click();
      await page.waitForTimeout(300);
    }

    // 展開状態のスクリーンショット
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'file-tree-expanded.png'),
      fullPage: false,
    });
  });

  test('Editor resize handles', async ({ page }) => {
    // エディタを入力状態に
    const editor = page.locator('#editor');
    await editor.fill('# Resize Demo\n\nDrag the resize handles to adjust pane sizes.');

    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'editor-resize.png'),
      fullPage: false,
    });
  });

  test('Backlinks panel with links', async ({ page }) => {
    // Featuresを開く（Welcomeからリンクされている）
    const fileItem = page.locator('.file-tree .file-item[data-path*="Features"]');
    if (await fileItem.isVisible()) {
      await fileItem.click();
      await page.waitForTimeout(1000);

      // バックリンクパネルを確認
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'backlinks-panel.png'),
        fullPage: false,
      });
    }
  });
});
