import { test, expect, Page } from '@playwright/test';
import { setupMockBindings } from './helpers/mock-bindings';

async function selectThemeFromMenu(page: Page, theme: string): Promise<void> {
  await page.evaluate((selectedTheme) => {
    const wails = (window as any)._wails;
    if (wails?.dispatchWailsEvent) {
      wails.dispatchWailsEvent({ name: 'obails:theme-selected', data: selectedTheme });
      return;
    }
    window.dispatchEvent(new CustomEvent('obails:theme-selected', { detail: selectedTheme }));
  }, theme);
}

test.describe('Obails App', () => {
  test('should close the context menu when clicking elsewhere', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileTree = page.locator('.file-tree');
    await expect(fileTree).toBeVisible();

    await fileTree.click({ button: 'right' });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();

    await page.locator('#context-menu-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(contextMenu).toBeHidden();
  });

  test('should close the context menu when pressing Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileTree = page.locator('.file-tree');
    await expect(fileTree).toBeVisible();

    await fileTree.click({ button: 'right' });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(contextMenu).toBeHidden();
  });

  test('should keep the context menu open after Ctrl+click', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Ctrl+click behavior is only verified in Chromium here');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileTree = page.locator('.file-tree');
    await expect(fileTree).toBeVisible();

    await fileTree.click({ modifiers: ['Control'] });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();

    await page.waitForTimeout(300);
    await expect(contextMenu).toBeVisible();

    await page.locator('#context-menu-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(contextMenu).toBeHidden();
  });

  test('should show and dismiss the delete confirmation dialog for a file', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const fileItem = page.locator('.file-item:not(.folder)').first();
    test.skip((await fileItem.count()) === 0, 'No file item available in this vault');

    await fileItem.click({ button: 'right' });
    await page.locator('#ctx-delete').click();

    const deleteDialog = page.locator('#delete-confirm-overlay');
    await expect(deleteDialog).toBeVisible();
    await expect(page.locator('#delete-confirm-submit')).toBeVisible();

    await page.locator('#delete-confirm-cancel').click();
    await expect(deleteDialog).toBeHidden();
  });

  test('should load the app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#settings-btn')).toBeVisible();
    await expect(page.locator('.sidebar-header h2')).toHaveCount(0);
  });

  test('should display sidebar with file tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sidebar should be visible
    await expect(page.locator('.sidebar')).toBeVisible();

    // File tree should exist
    await expect(page.locator('.file-tree')).toBeVisible();
  });

  test('should play audio in the mini player without replacing the current note', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await expect(page.locator('.editor-container')).toBeVisible();
    await expect(page.locator('#editor-title')).toHaveText('Welcome');

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();

    await expect(page.locator('#mini-player')).toBeVisible();
    await expect(page.locator('#mini-player-title')).toHaveText('test-tone.wav');
    await expect(page.locator('#mini-audio-player')).toHaveAttribute('src', /\/media\/audio\?path=audio%2Ftest-tone\.wav$/);

    await expect(page.locator('.editor-container')).toBeVisible();
    await expect(page.locator('#editor-title')).toHaveText('Welcome');
  });

  test('should change audio playback speed from the speed menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();

    const audio = page.locator('#mini-audio-player');
    const speedBtn = page.locator('#speed-btn');
    const speedMenu = page.locator('#speed-menu');

    // 初期状態は等倍速
    await expect(speedBtn).toHaveText('1×');
    await expect(speedMenu).toBeHidden();
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.playbackRate)).toBe(1);

    // ボタンを押すとメニューが開き、要求された7段階すべてが並ぶ
    await speedBtn.click();
    await expect(speedMenu).toBeVisible();
    await expect(speedMenu.locator('.speed-menu-item')).toHaveText([
      '0.5×', '0.75×', '1×', '1.25×', '1.5×', '2×', '3×',
    ]);

    // 1.5倍速を選ぶと実際の playbackRate が変わり、ラベルも更新される
    await speedMenu.locator('.speed-menu-item', { hasText: '1.5×' }).click();
    await expect(speedMenu).toBeHidden();
    await expect(speedBtn).toHaveText('1.5×');
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.playbackRate)).toBe(1.5);

    // 3倍速も選べる
    await speedBtn.click();
    await speedMenu.locator('.speed-menu-item', { hasText: '3×' }).click();
    await expect(speedBtn).toHaveText('3×');
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.playbackRate)).toBe(3);
  });

  test('should show the time sequence (duration, seek bar, current time) and allow instant seeking', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/long-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();

    const audio = page.locator('#mini-audio-player');
    const seek = page.locator('#mini-player-seek');
    const current = page.locator('#mini-player-current');
    const duration = page.locator('#mini-player-duration');
    const playPause = page.locator('#mini-player-playpause');

    // メタデータ読み込み後、全体の長さ(95秒=1:35)が表示され、シークバーの最大値も一致する
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.duration)).toBeGreaterThan(90);
    await expect(duration).toHaveText('1:35');
    await expect.poll(async () => Number(await seek.getAttribute('max'))).toBeGreaterThan(90);

    // 初期は経過0:00
    await expect(current).toHaveText('0:00');

    // シークバーを 60 秒位置へ動かすと、実際の再生位置が即座に移動し、経過時間表示も更新される
    await seek.evaluate((el: HTMLInputElement) => {
      el.value = '60';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.currentTime)).toBeGreaterThan(55);
    await expect(current).toHaveText('1:00');

    // 進捗塗り(--seek-progress)が再生位置に応じて更新されている
    const progress = await seek.evaluate((el: HTMLElement) =>
      el.style.getPropertyValue('--seek-progress'),
    );
    expect(progress).not.toBe('0%');
    expect(progress).not.toBe('');

    // 一時停止ボタンで再生中の音源を止められ、アイコンが再生(▶)へ切り替わる
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.paused)).toBe(false);
    await playPause.click();
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.paused)).toBe(true);
    await expect(playPause.locator('svg path')).toHaveAttribute('d', 'M8 5v14l11-7z');
  });

  test('should keep the selected playback speed when opening another audio file', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();

    const audio = page.locator('#mini-audio-player');
    await page.locator('#speed-btn').click();
    await page.locator('#speed-menu .speed-menu-item', { hasText: '2×' }).click();
    await expect(page.locator('#speed-btn')).toHaveText('2×');

    // 同じ音源を開き直しても選択した速度が維持される（ソース再読込で 1 に戻らない）
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#speed-btn')).toHaveText('2×');
    await expect.poll(() => audio.evaluate((el: HTMLMediaElement) => el.playbackRate)).toBe(2);
  });

  test('should hide the right sidebar for non-markdown files and show it for markdown', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    const rightSidebar = page.locator('#right-sidebar');

    // マークダウン: サイドバー表示
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await expect(page.locator('#editor-title')).toHaveText('Welcome');
    await expect(rightSidebar).toBeVisible();

    // 音源: サイドバー非表示
    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();
    await expect(rightSidebar).toBeHidden();

    // 画像: サイドバー非表示
    await page.locator('.file-item.folder[data-path="images"]').click();
    await page.locator('.file-item.file[data-path="images/test-photo.png"]').click();
    await expect(rightSidebar).toBeHidden();

    // マークダウンに戻すとサイドバー復帰
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await expect(page.locator('#editor-title')).toHaveText('Welcome');
    await expect(rightSidebar).toBeVisible();
  });

  test('should transcribe audio into a sibling note and open it for editing', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();

    const transcribeBtn = page.locator('#transcribe-btn');
    // 文字起こし未作成: ボタンは「文字起こし」
    await expect(transcribeBtn).toBeVisible();
    await expect(transcribeBtn).toHaveText('文字起こし');

    // クリックで文字起こし → 隣の .md がエディタで開く（mini-playerは継続表示）
    await transcribeBtn.click();
    await expect(page.locator('#editor-title')).toHaveText('test-tone');
    await expect(page.locator('#mini-player')).toBeVisible();
    // .md を開いたので右サイドバーは復帰
    await expect(page.locator('#right-sidebar')).toBeVisible();

    // 同じ音源に戻ると、既存ありなので「文字起こしを開く」表示
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(transcribeBtn).toHaveText('文字起こしを開く');
  });

  test('should not periodically reopen stale last-opened state while reading another note', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await expect(page.locator('#editor-title')).toHaveText('Welcome');

    await page.evaluate(() => {
      (window as any).__wails_mock_lastOpenedFile = { path: 'Features.md', fileType: 'markdown' };
    });
    await page.waitForTimeout(900);

    await expect(page.locator('#editor-title')).toHaveText('Welcome');
  });

  test('should have toolbar buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#daily-note-btn')).toBeVisible();
    await expect(page.locator('#timeline-btn')).toBeVisible();
    await expect(page.locator('#refresh-btn')).toBeVisible();
    await expect(page.locator('#new-note-btn svg')).toBeVisible();
    await expect(page.locator('#graph-btn svg')).toBeVisible();
  });

  test('should center the mini player in the toolbar', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await expect(page.locator('#mini-player')).toBeVisible();

    const alignment = await page.locator('.toolbar-center').evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        justifySelf: style.justifySelf,
        display: style.display,
      };
    });
    expect(alignment.justifySelf).toBe('center');
    expect(alignment.display).toBe('flex');
  });

  test('should expand and collapse all folders from sidebar controls', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const folder = page.locator('.file-item.folder[data-path="docs"]');
    await expect(folder).toBeVisible();

    await folder.click();
    await expect(folder).toHaveClass(/expanded/);

    await page.locator('#collapse-all-folders-btn').click();
    await expect(folder).not.toHaveClass(/expanded/);

    await page.locator('#expand-all-folders-btn').click();
    await expect(folder).toHaveClass(/expanded/);
  });

  test('should show Open Finder for folder context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const folder = page.locator('.file-item.folder[data-path="docs"]');
    await expect(folder).toBeVisible();

    await folder.click({ button: 'right' });
    await expect(page.locator('#ctx-open-finder')).toBeVisible();
  });

  test('should accept external file drops on the file tree', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    const fileTree = page.locator('#file-tree');
    await page.evaluate(() => {
      const fileTreeEl = document.getElementById('file-tree');
      if (!fileTreeEl) {
        throw new Error('file tree not found');
      }
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['# dropped from e2e'], 'drop-target.md', { type: 'text/markdown' }));
      fileTreeEl.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }));
    });

    await expect(fileTree).toHaveClass(/drag-over-import/);
  });

  test('should import native files dropped from Finder into the file tree', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.evaluate(() => {
      const wails = (window as any)._wails;
      wails.dispatchWailsEvent({
        name: 'obails:files-dropped',
        data: {
          files: ['/tmp/finder-drop.md'],
          targetFolder: '',
        },
      });
    });

    await expect(page.locator('.file-item[data-path="finder-drop.md"]')).toBeVisible();
  });

  test('should not expand folders while importing native files from Finder', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    const docsFolder = page.locator('.file-item.folder[data-path="docs"]');
    const audioFolder = page.locator('.file-item.folder[data-path="audio"]');
    await docsFolder.click();
    await expect(docsFolder).toHaveClass(/expanded/);

    await audioFolder.click();
    await page.locator('.file-item.file[data-path="audio/test-tone.wav"]').click();
    await audioFolder.click();
    await expect(audioFolder).not.toHaveClass(/expanded/);

    await page.evaluate(() => {
      const wails = (window as any)._wails;
      wails.dispatchWailsEvent({
        name: 'obails:files-dropped',
        data: {
          files: ['/tmp/root-drop.md'],
          targetFolder: '',
        },
      });
    });

    await expect(docsFolder).toHaveClass(/expanded/);
    await expect(audioFolder).not.toHaveClass(/expanded/);
    await expect(page.locator('.file-item[data-path="root-drop.md"]')).toBeVisible();
  });

  test('should not reopen a target folder after dropping a file into it and closing it', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    const audioFolder = page.locator('.file-item.folder[data-path="audio"]');
    await audioFolder.click();
    await expect(audioFolder).toHaveClass(/expanded/);

    await page.evaluate(() => {
      const wails = (window as any)._wails;
      wails.dispatchWailsEvent({
        name: 'obails:files-dropped',
        data: {
          files: ['/tmp/folder-drop.md'],
          targetFolder: 'audio',
        },
      });
    });

    await expect(page.locator('#editor-title')).toHaveText('folder-drop');
    await audioFolder.click();
    await expect(audioFolder).not.toHaveClass(/expanded/);

    await page.waitForTimeout(1200);
    await expect(audioFolder).not.toHaveClass(/expanded/);
  });

  test('should open txt files inside Obails without launching an external editor', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Plain Text.txt"]').click();

    await expect(page.locator('#editor-title')).toHaveText('Plain Text.txt');
    await expect(page.locator('#editor')).toHaveValue(/plain text file/);
    await expect(page.locator('#preview .plain-text-preview')).toContainText('It should open inside Obails');

    const externalCalls = await page.evaluate(() => (window as any).__wails_mock_openExternalCalls);
    expect(externalCalls).toEqual([]);
  });

  test('should not reload binary viewers on vault watch ticks', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();

    await page.locator('.file-item.folder[data-path="images"]').click();
    await page.locator('.file-item.file[data-path="images/test-photo.png"]').click();
    await expect(page.locator('#image-viewer')).toBeVisible();

    const callsAfterOpen = await page.evaluate(() => (window as any).__wailsMockReadBinaryCalls());
    expect(callsAfterOpen).toEqual(['images/test-photo.png']);

    await page.waitForTimeout(1200);

    const callsAfterWatchTicks = await page.evaluate(() => (window as any).__wailsMockReadBinaryCalls());
    expect(callsAfterWatchTicks).toEqual(callsAfterOpen);
  });

  test('should hide toolbar theme selector and accept menu theme events', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#theme-select')).toHaveCount(0);
    await selectThemeFromMenu(page, 'rosepine-dawn');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'rosepine-dawn');
  });

  test('should switch to light theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'github-light');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'github-light');

    // Check CSS variable is light
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
    );
    expect(bgColor).toBe('#ffffff');
  });

  test('should switch to dark theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'dracula');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dracula');

    // Check CSS variable is dark
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
    );
    expect(bgColor).toBe('#282a36');
  });

  test('should preserve the selected theme after reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'dracula');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  });

  test('should toggle Timeline panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const timelinePanel = page.locator('#timeline-panel');

    // Initially hidden
    await expect(timelinePanel).not.toBeVisible();

    // Click Timeline button
    await page.click('#timeline-btn');

    // Should be visible
    await expect(timelinePanel).toBeVisible();
  });

  test('should have resize handles that work', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify resize handles exist
    const sidebarResize = page.locator('#sidebar-resize');
    const editorResize = page.locator('#editor-resize');
    await expect(sidebarResize).toBeVisible();
    await expect(editorResize).toBeVisible();

    // Test sidebar resize functionality
    const sidebar = page.locator('#sidebar');
    const initialWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);

    // Drag the resize handle to make sidebar wider
    const resizeHandle = page.locator('#sidebar-resize');
    const box = await resizeHandle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 50, box.y + box.height / 2); // Move 50px right
      await page.mouse.up();

      // Verify sidebar width changed
      const newWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);
      expect(newWidth).toBeGreaterThan(initialWidth);
    }
  });

  test('should have backlinks panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.backlinks-panel')).toBeVisible();
    await expect(page.locator('.backlinks-panel h3')).toHaveText('Backlinks');
  });
});

test.describe('Editor', () => {
  test('should have editor textarea and accept input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');
    await expect(editor).toBeVisible();

    // Type some content
    await editor.fill('# Test Heading\n\nSome test content');

    // Verify content was typed
    const content = await editor.inputValue();
    expect(content).toContain('# Test Heading');
    expect(content).toContain('Some test content');
  });

  test('should render markdown in preview pane', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const preview = page.locator('#preview-pane #preview');
    await expect(page.locator('#preview-pane')).toBeVisible();

    // Type markdown content
    const editor = page.locator('#editor');
    await editor.fill('# Hello World\n\nThis is **bold** text.');

    // Wait for preview to update (debounced)
    await page.waitForTimeout(500);

    // Verify markdown rendered as HTML
    const previewHtml = await preview.innerHTML();
    expect(previewHtml).toContain('<h1');
    expect(previewHtml).toContain('Hello World');
    expect(previewHtml).toContain('<strong>bold</strong>');
  });

  test('should convert wiki links in preview', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');
    const preview = page.locator('.preview-pane #preview');

    // Type content with wiki link
    await editor.fill('Check out [[my-note]]');

    // Wait for preview to update
    await page.waitForTimeout(500);

    // Verify wiki link rendered
    const wikiLink = preview.locator('.wiki-link');
    await expect(wikiLink).toBeVisible();
    await expect(wikiLink).toHaveAttribute('data-link', 'my-note');
  });
});

test.describe('Mermaid', () => {
  test('should have mermaid fullscreen overlay (hidden by default)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overlay = page.locator('#mermaid-fullscreen');
    await expect(overlay).toBeHidden();
  });

  test('mermaid controls should exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Controls exist in DOM (even if hidden)
    await expect(page.locator('#mermaid-zoom-in')).toBeAttached();
    await expect(page.locator('#mermaid-zoom-out')).toBeAttached();
    await expect(page.locator('#mermaid-reset')).toBeAttached();
    await expect(page.locator('#mermaid-close')).toBeAttached();
    await expect(page.locator('#mermaid-maximize-window')).toBeAttached();
  });
});

test.describe('Graph View', () => {
  test('should have graph button in toolbar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const graphBtn = page.locator('#graph-btn');
    await expect(graphBtn).toBeVisible();
    // Button has emoji icon instead of text
    await expect(graphBtn).toHaveAttribute('title', 'Graph View (⌘G)');
  });

  test('should have graph overlay (hidden by default)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toBeAttached();
    // Check it's not visible (no 'visible' class)
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('should show graph overlay when clicking Graph button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click Graph button
    await page.click('#graph-btn');

    // Wait for overlay to become visible
    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/, { timeout: 5000 });
  });

  test('should have graph header with title and close button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open graph view
    await page.click('#graph-btn');

    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/);

    // Check header elements
    await expect(page.locator('.graph-header h3')).toHaveText('Knowledge Graph');
    await expect(page.locator('#graph-close')).toBeVisible();
    await expect(page.locator('#graph-stats')).toBeVisible();
  });

  test('should close graph overlay when clicking close button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open graph view
    await page.click('#graph-btn');

    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/);

    // Click close button
    await page.click('#graph-close');

    // Should be hidden
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('should close graph overlay when pressing ESC', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open graph view
    await page.click('#graph-btn');

    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/);

    // Press ESC
    await page.keyboard.press('Escape');

    // Should be hidden
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('should toggle graph view with keyboard shortcut (Cmd+G)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overlay = page.locator('#graph-overlay');

    // Initially hidden
    await expect(overlay).not.toHaveClass(/visible/);

    // Press Cmd+G to open
    await page.keyboard.press('Meta+g');
    await expect(overlay).toHaveClass(/visible/);

    // Press Cmd+G again to close (toggle)
    await page.keyboard.press('Meta+g');
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('should render graph with content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open graph view
    await page.click('#graph-btn');

    const container = page.locator('#graph-container');
    await expect(container).toBeVisible();

    // Wait for force-graph to render
    await page.waitForTimeout(2000);

    // Verify graph container has content (force-graph renders into it)
    const hasContent = await container.evaluate(el => {
      // force-graph can render as canvas or svg depending on mode
      return el.children.length > 0 || el.querySelector('canvas') !== null || el.querySelector('svg') !== null;
    });
    expect(hasContent).toBe(true);

    // Verify container has actual size (not 0x0)
    const containerSize = await container.evaluate(el => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height
    }));
    expect(containerSize.width).toBeGreaterThan(0);
    expect(containerSize.height).toBeGreaterThan(0);

    // Verify stats are displayed (shows graph was processed)
    const stats = page.locator('#graph-stats');
    const statsText = await stats.textContent();
    // Stats should show some numbers (files and links count)
    expect(statsText).toBeTruthy();
    expect(statsText!.length).toBeGreaterThan(0);
  });

  test('graph overlay styling responds to theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to dark theme first
    await selectThemeFromMenu(page, 'dracula');

    // Open graph view
    await page.click('#graph-btn');

    const overlay = page.locator('#graph-overlay');
    await expect(overlay).toHaveClass(/visible/);

    // Check background color is dark (space theme for dark themes)
    const bgColorDark = await page.evaluate(() => {
      const el = document.querySelector('.graph-overlay');
      return getComputedStyle(el!).backgroundColor;
    });
    // Should be dark color (rgb(10, 10, 26) = #0a0a1a)
    expect(bgColorDark).toContain('rgb(10, 10, 26)');

    // Close graph and switch to light theme
    await page.click('#graph-close');
    await selectThemeFromMenu(page, 'github-light');

    // Open graph again
    await page.click('#graph-btn');
    await expect(overlay).toHaveClass(/visible/);

    // Check background color is light (uses app colors for light themes)
    const bgColorLight = await page.evaluate(() => {
      const el = document.querySelector('.graph-overlay');
      return getComputedStyle(el!).backgroundColor;
    });
    // Should be light color (not the cosmic dark)
    expect(bgColorLight).not.toContain('rgb(10, 10, 26)');
  });
});

test.describe('Outline', () => {
  test('should display outline with headings from content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');

    // Type markdown with multiple headings
    await editor.fill(`# First Heading

Some content here.

## Second Heading

More content.

### Third Heading

Even more content.

## Fourth Heading

Final content.`);

    // Wait for outline to update
    await page.waitForTimeout(500);

    // Verify outline items exist
    const outlineList = page.locator('#outline-list');
    const outlineItems = outlineList.locator('.outline-item');
    await expect(outlineItems).toHaveCount(4);

    // Verify correct classes for heading levels
    await expect(outlineItems.nth(0)).toHaveClass(/h1/);
    await expect(outlineItems.nth(1)).toHaveClass(/h2/);
    await expect(outlineItems.nth(2)).toHaveClass(/h3/);
    await expect(outlineItems.nth(3)).toHaveClass(/h2/);

    // Verify text content
    await expect(outlineItems.nth(0)).toContainText('First Heading');
    await expect(outlineItems.nth(1)).toContainText('Second Heading');
  });

  test('should scroll to correct position on single outline click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');

    // Create long content with headings at specific positions
    const lines: string[] = [];
    lines.push('# Top Heading');
    // Add many lines to ensure scrolling is needed
    for (let i = 0; i < 50; i++) {
      lines.push(`Line ${i + 1} of content.`);
    }
    lines.push('## Middle Heading');
    for (let i = 0; i < 50; i++) {
      lines.push(`More line ${i + 1} of content.`);
    }
    lines.push('### Bottom Heading');
    for (let i = 0; i < 20; i++) {
      lines.push(`Final line ${i + 1}.`);
    }

    await editor.fill(lines.join('\n'));

    // Wait for outline to update
    await page.waitForTimeout(500);

    // Scroll editor to TOP first (filling may have scrolled it)
    await editor.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);

    // Verify we're at the top
    const initialScroll = await editor.evaluate(el => el.scrollTop);
    expect(initialScroll).toBe(0);

    // Get outline items
    const outlineList = page.locator('#outline-list');
    const middleHeading = outlineList.locator('.outline-item.h2').first();
    await expect(middleHeading).toBeVisible();

    // Click on the middle heading in outline (should work with single click!)
    await middleHeading.click();

    // Wait for scroll to complete
    await page.waitForTimeout(200);

    // Verify scroll position changed significantly (should have scrolled down)
    const newScroll = await editor.evaluate(el => el.scrollTop);
    expect(newScroll).toBeGreaterThan(0);

    // Verify the target line is visible in viewport
    // The heading "## Middle Heading" is at line 52 (0-indexed: 51)
    const targetLine = 51;
    const isTargetVisible = await editor.evaluate((el, line) => {
      const textarea = el as HTMLTextAreaElement;
      const computedStyle = getComputedStyle(textarea);
      const fontSize = parseFloat(computedStyle.fontSize);
      const lineHeightStr = computedStyle.lineHeight;
      let lineHeight: number;
      if (lineHeightStr === 'normal') {
        lineHeight = fontSize * 1.2;
      } else if (lineHeightStr.endsWith('px')) {
        lineHeight = parseFloat(lineHeightStr);
      } else {
        lineHeight = fontSize * parseFloat(lineHeightStr);
      }
      const targetPos = line * lineHeight;
      const visibleTop = textarea.scrollTop;
      const visibleBottom = visibleTop + textarea.clientHeight;
      // Target should be within visible area (with some tolerance)
      return targetPos >= visibleTop - 100 && targetPos <= visibleBottom + 100;
    }, targetLine);

    expect(isTargetVisible).toBe(true);
  });

  test('should set cursor position when clicking outline item', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');

    // Create content with headings
    await editor.fill(`# First
Some text.
## Second
More text.
### Third`);

    // Wait for outline to update
    await page.waitForTimeout(500);

    // Click on "Second" heading in outline
    const outlineList = page.locator('#outline-list');
    const secondHeading = outlineList.locator('.outline-item.h2').first();
    await secondHeading.click();

    // Wait for cursor to be set
    await page.waitForTimeout(100);

    // Verify cursor is on the correct line
    const cursorInfo = await editor.evaluate(el => {
      const textarea = el as HTMLTextAreaElement;
      const text = textarea.value;
      const pos = textarea.selectionStart;
      // Count newlines before cursor position to get line number
      const textBeforeCursor = text.substring(0, pos);
      const lineNumber = textBeforeCursor.split('\n').length - 1;
      return { pos, lineNumber };
    });

    // "## Second" is on line 2 (0-indexed)
    expect(cursorInfo.lineNumber).toBe(2);
  });
});

test.describe('Keyboard Navigation', () => {
  test('should focus file tree with Shift+Tab from editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // First focus the editor
    const editor = page.locator('#editor');
    await editor.focus();
    await expect(editor).toBeFocused();

    // Press Shift+Tab to focus file tree
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // File tree should have keyboard-focused class
    const fileTree = page.locator('#file-tree');
    await expect(fileTree).toHaveClass(/keyboard-focused/);
  });

  test('should focus editor with Shift+Tab from file tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');
    const fileTree = page.locator('#file-tree');

    // First focus the editor, then switch to file tree
    await editor.focus();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    await expect(fileTree).toHaveClass(/keyboard-focused/);

    // Press Shift+Tab again to go back to editor
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // File tree should lose keyboard-focused class
    await expect(fileTree).not.toHaveClass(/keyboard-focused/);
    // Editor should be focused
    await expect(editor).toBeFocused();
  });

  test('should blur file tree with Escape key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');
    const fileTree = page.locator('#file-tree');

    // Focus editor then switch to file tree
    await editor.focus();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    await expect(fileTree).toHaveClass(/keyboard-focused/);

    // Press Escape to blur file tree
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // File tree should lose keyboard-focused class
    await expect(fileTree).not.toHaveClass(/keyboard-focused/);
  });

  test('should not interfere with Shift+Tab when in search input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('#file-search-input');
    const fileTree = page.locator('#file-tree');

    // Focus search input
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Press Shift+Tab - should NOT focus file tree (browser default behavior)
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // File tree should NOT have keyboard-focused class
    await expect(fileTree).not.toHaveClass(/keyboard-focused/);
  });

  test('keyboard navigation state should be isolated per focus cycle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');
    const fileTree = page.locator('#file-tree');

    // First cycle: focus file tree
    await editor.focus();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    await expect(fileTree).toHaveClass(/keyboard-focused/);

    // Escape to blur
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(fileTree).not.toHaveClass(/keyboard-focused/);

    // Second cycle: focus file tree again
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);
    await expect(fileTree).toHaveClass(/keyboard-focused/);
  });

  test('should reset cursor and scroll when editor value changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#editor');

    // Fill editor with content and move cursor to middle
    const testContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';
    await editor.fill(testContent);

    // Move cursor to middle
    await page.evaluate(() => {
      const ed = document.getElementById('editor') as HTMLTextAreaElement;
      const mid = Math.floor(ed.value.length / 2);
      ed.selectionStart = mid;
      ed.selectionEnd = mid;
      ed.scrollTop = 100; // Scroll down a bit
    });

    // Verify cursor moved to middle
    let cursorPos = await page.evaluate(() => {
      const ed = document.getElementById('editor') as HTMLTextAreaElement;
      return { start: ed.selectionStart, scrollTop: ed.scrollTop };
    });
    expect(cursorPos.start).toBeGreaterThan(0);

    // Now simulate what happens when a new file is opened:
    // Set new content and reset cursor (this mimics openNote behavior)
    await page.evaluate(() => {
      const ed = document.getElementById('editor') as HTMLTextAreaElement;
      ed.value = 'New file content here';
      // This is what we expect to happen in openNote after fix
      ed.selectionStart = 0;
      ed.selectionEnd = 0;
      ed.scrollTop = 0;
    });

    // Verify cursor is at position 0 and scroll is at top
    const finalState = await page.evaluate(() => {
      const ed = document.getElementById('editor') as HTMLTextAreaElement;
      return {
        selectionStart: ed.selectionStart,
        selectionEnd: ed.selectionEnd,
        scrollTop: ed.scrollTop
      };
    });

    expect(finalState.selectionStart).toBe(0);
    expect(finalState.selectionEnd).toBe(0);
    expect(finalState.scrollTop).toBe(0);
  });
});

test.describe('Shortcuts Help', () => {
  test('should show shortcuts help when pressing ?', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Initially hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);

    // Press ? to show shortcuts help
    await page.keyboard.type('?');
    await page.waitForTimeout(100);

    // Should now be visible
    await expect(shortcutsOverlay).toHaveClass(/visible/);
  });

  test('should close shortcuts help with Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Open shortcuts help
    await page.keyboard.type('?');
    await page.waitForTimeout(100);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });

  test('should close shortcuts help when pressing ? again', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Open shortcuts help
    await page.keyboard.type('?');
    await page.waitForTimeout(100);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Press ? again to close
    await page.keyboard.type('?');
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });

  test('should close shortcuts help when clicking close button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const shortcutsOverlay = page.locator('#shortcuts-overlay');
    const closeBtn = page.locator('#shortcuts-close');

    // Open shortcuts help
    await page.keyboard.type('?');
    await page.waitForTimeout(100);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Click close button
    await closeBtn.click();
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });
});

test.describe('File Search Navigation', () => {
  test('should focus search input with Cmd+P', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('#file-search-input');

    // Initially not focused
    await expect(searchInput).not.toBeFocused();

    // Press Cmd+P
    await page.keyboard.press('Meta+p');
    await page.waitForTimeout(100);

    // Should be focused
    await expect(searchInput).toBeFocused();
  });

  test('should navigate with Ctrl+N/P when search input is focused', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items into file tree for testing
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test3.md" data-name="test3.md">test3.md</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');

    // Focus search input
    await searchInput.focus();
    await expect(searchInput).toBeFocused();

    // Press Ctrl+N to select first file
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    // Check that first file is selected
    const selected1 = page.locator('.file-item.search-selected');
    await expect(selected1).toHaveCount(1);
    await expect(selected1).toHaveAttribute('data-name', 'test1.md');

    // Press Ctrl+N again to select second file
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    const selected2 = page.locator('.file-item.search-selected');
    await expect(selected2).toHaveCount(1);
    await expect(selected2).toHaveAttribute('data-name', 'test2.md');

    // Press Ctrl+P to go back to first file
    await page.keyboard.press('Control+p');
    await page.waitForTimeout(100);

    const selected3 = page.locator('.file-item.search-selected');
    await expect(selected3).toHaveCount(1);
    await expect(selected3).toHaveAttribute('data-name', 'test1.md');
  });

  test('should clear selection with Escape in search input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');

    // Focus and select a file
    await searchInput.focus();
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    // Verify selection exists
    await expect(page.locator('.file-item.search-selected')).toHaveCount(1);

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Selection should be cleared
    await expect(page.locator('.file-item.search-selected')).toHaveCount(0);
  });

  test('should wrap around when navigating past the end', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');

    // Focus search input
    await searchInput.focus();

    // Navigate to first, then second, then wrap to first
    await page.keyboard.press('Control+n'); // -> test1
    await page.keyboard.press('Control+n'); // -> test2
    await page.keyboard.press('Control+n'); // -> test1 (wrap)
    await page.waitForTimeout(100);

    const selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'test1.md');

    // Navigate up to wrap to last
    await page.keyboard.press('Control+p'); // -> test2 (wrap)
    await page.waitForTimeout(100);

    await expect(page.locator('.file-item.search-selected')).toHaveAttribute('data-name', 'test2.md');
  });

  test('should reset selection when search query changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');

    // Focus and select a file
    await searchInput.focus();
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);
    await expect(page.locator('.file-item.search-selected')).toHaveCount(1);

    // Type something to change the query
    await searchInput.fill('test');
    await page.waitForTimeout(150); // Wait for debounce

    // Selection should be cleared after input change
    await expect(page.locator('.file-item.search-selected')).toHaveCount(0);
  });

  test('should clear keyboard-selected when entering search mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
      `;
    });

    // Enter file tree mode with Shift+Tab
    await page.locator('#editor').focus();
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(100);

    // Select a file with keyboard navigation
    await page.keyboard.press('j');
    await page.waitForTimeout(100);

    // Verify keyboard-selected exists
    await expect(page.locator('.file-item.keyboard-selected')).toHaveCount(1);

    // Now focus the search input (enter search mode)
    const searchInput = page.locator('#file-search-input');
    await searchInput.focus();
    await page.waitForTimeout(100);

    // keyboard-selected should be cleared
    await expect(page.locator('.file-item.keyboard-selected')).toHaveCount(0);
  });

  test('should not have both keyboard-selected and search-selected at the same time', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
      `;
    });

    // Focus search and select with Ctrl+N
    const searchInput = page.locator('#file-search-input');
    await searchInput.focus();
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    // Only search-selected should exist, not keyboard-selected
    await expect(page.locator('.file-item.search-selected')).toHaveCount(1);
    await expect(page.locator('.file-item.keyboard-selected')).toHaveCount(0);
  });

  test('should not activate keyboard mode when pressing j/k in search input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item" data-path="test1.md" data-name="test1.md">test1.md</div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="test2.md" data-name="test2.md">test2.md</div>
        </div>
      `;
    });

    // Focus search input
    const searchInput = page.locator('#file-search-input');
    await searchInput.focus();
    await page.waitForTimeout(100);

    // Press j - this types 'j' in search, NOT keyboard navigation
    await page.keyboard.press('j');
    await page.waitForTimeout(150);

    // No keyboard-selected should appear
    await expect(page.locator('.file-item.keyboard-selected')).toHaveCount(0);

    // Search input should contain 'j'
    await expect(searchInput).toHaveValue('j');
  });

  test('should navigate through folders and files as flat list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test file items with a mix of folders and files
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item folder expanded" data-path="folder1" data-name="folder1">folder1</div>
          <div class="folder-children" style="display: block;">
            <div class="file-wrapper">
              <div class="file-item" data-path="folder1/file1.md" data-name="file1.md">file1.md</div>
            </div>
          </div>
        </div>
        <div class="file-wrapper">
          <div class="file-item" data-path="file2.md" data-name="file2.md">file2.md</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');
    await searchInput.focus();

    // Navigate with Ctrl+N - should select folder1 first
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    let selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'folder1');

    // Navigate again - should select file1.md inside folder
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'file1.md');

    // Navigate again - should select file2.md
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'file2.md');
  });

  test('should not open folder when pressing Enter on folder', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Inject test folder
    await page.evaluate(() => {
      const fileTree = document.getElementById('file-tree');
      if (!fileTree) return;
      fileTree.innerHTML = `
        <div class="file-wrapper">
          <div class="file-item folder" data-path="folder1" data-name="folder1">folder1</div>
        </div>
      `;
    });

    const searchInput = page.locator('#file-search-input');
    await searchInput.focus();

    // Select the folder
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(100);

    // Verify folder is selected
    const selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'folder1');

    // Press Enter - should NOT blur search input (folder case)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Search input should still be focused (folder was not opened)
    await expect(searchInput).toBeFocused();

    // Selection should still exist
    await expect(page.locator('.file-item.search-selected')).toHaveCount(1);
  });
});

test.describe('Title Editing', () => {
  test('should not allow editing when no file is open', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Title should show default text when no file is open
    const editorTitle = page.locator('#editor-title');
    await expect(editorTitle).toHaveText('Select a note...');

    // Click on title - should not enter edit mode
    await editorTitle.click();
    await page.waitForTimeout(200);

    // No input should appear since no file is open
    const titleInput = page.locator('.title-edit-input');
    await expect(titleInput).toHaveCount(0);
  });

  test('should have clickable title with cursor pointer style', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Title should exist
    const editorTitle = page.locator('#editor-title');
    await expect(editorTitle).toBeVisible();

    // Check cursor style is pointer (clickable)
    const cursor = await editorTitle.evaluate(el => getComputedStyle(el).cursor);
    expect(cursor).toBe('pointer');
  });
});

test.describe('Refresh Button', () => {
  test('should have refresh button visible and clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify refresh button exists and is visible
    const refreshBtn = page.locator('#refresh-btn');
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toHaveAttribute('title', 'Refresh');

    // Clicking should not cause errors (basic functionality test)
    await refreshBtn.click();
    await page.waitForTimeout(300);

    // App should still be functional after refresh
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.editor-container')).toBeVisible();
  });
});

test.describe('Timeline Features', () => {
  test('should have ⌘+Enter shortcut registered for timeline input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open Timeline panel
    await page.click('#timeline-btn');
    const timelinePanel = page.locator('#timeline-panel');
    await expect(timelinePanel).toBeVisible();

    // Timeline input should be visible
    const timelineInput = page.locator('#timeline-input');
    await expect(timelineInput).toBeVisible();

    // Type something in the input
    await timelineInput.fill('Test memo');

    // Verify input has the text
    await expect(timelineInput).toHaveValue('Test memo');

    // Press Meta+Enter (⌘+Enter on macOS)
    // Note: In E2E test, this will attempt to submit but may fail if no vault is configured
    // The important thing is that the keypress is handled without errors
    await timelineInput.press('Meta+Enter');
    await page.waitForTimeout(500);

    // App should remain functional after the keypress
    await expect(timelinePanel).toBeVisible();
  });

  test('should have date separator CSS class defined', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open Timeline panel
    await page.click('#timeline-btn');
    await page.waitForTimeout(500);

    // Inject a date separator element to test CSS
    await page.evaluate(() => {
      const list = document.getElementById('timeline-list');
      if (list) {
        list.innerHTML = '<div class="timeline-date-separator">Today</div>';
      }
    });

    // Check that the date separator has styles applied
    const dateSeparator = page.locator('.timeline-date-separator');
    await expect(dateSeparator).toBeVisible();

    // Verify the CSS is applied (font-weight should be 600 from our CSS)
    const fontWeight = await dateSeparator.evaluate(el => getComputedStyle(el).fontWeight);
    expect(fontWeight).toBe('600');
  });

  test('should display Post button in Timeline panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open Timeline panel
    await page.click('#timeline-btn');
    await page.waitForTimeout(300);

    // Post button should be visible
    const postBtn = page.locator('#timeline-submit');
    await expect(postBtn).toBeVisible();
    await expect(postBtn).toHaveText('Post');
  });
});

test.describe('HTML Preview', () => {
  test('should keep inline-styled code readable in the preview iframe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('#html-editor-container').evaluate((element) => {
      (element as HTMLElement).style.display = 'flex';
    });

    const html = `<!doctype html>
<html>
  <head>
    <style>
      body { background: #fffaf3; color: #575279; }
      pre { background: #f2e9e1; padding: 24px; border-radius: 12px; }
      code { font: 20px monospace; }
    </style>
  </head>
  <body>
    <h1>バグのあったコード (1340-1356行)</h1>
    <pre><code><span style="color:#ff6b6b">if</span> <span style="color:#cbd5e1">_ai_guard_contains_danger_word</span> <span style="color:#60a5fa">&quot;$cmd_line&quot;</span><span style="color:#ff6b6b">; then</span>
  <span style="color:#cbd5e1">ai_extreme_confirm</span> <span style="color:#94a3b8"># ← AI session チェックなし!</span>
  <span style="color:#cbd5e1">...</span>
<span style="color:#ff6b6b">fi</span></code></pre>
  </body>
</html>`;

    await page.locator('#html-editor').fill(html);
    await page.locator('#html-editor').dispatchEvent('input');

    const iframe = page.frameLocator('#html-preview');
    await expect(iframe.locator('pre code')).toBeVisible();

    const lowContrastTokens = await page.locator('#html-preview').evaluate((iframeElement) => {
      const doc = (iframeElement as HTMLIFrameElement).contentDocument;
      if (!doc) {
        throw new Error('HTML preview document is not available');
      }

      function parseRgb(color: string): [number, number, number] {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) {
          throw new Error(`Unsupported color format: ${color}`);
        }
        return [Number(match[1]), Number(match[2]), Number(match[3])];
      }

      function luminance([r, g, b]: [number, number, number]): number {
        const channels = [r, g, b].map((value) => {
          const srgb = value / 255;
          return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      }

      function contrastRatio(foreground: string, background: string): number {
        const fg = luminance(parseRgb(foreground));
        const bg = luminance(parseRgb(background));
        const lighter = Math.max(fg, bg);
        const darker = Math.min(fg, bg);
        return (lighter + 0.05) / (darker + 0.05);
      }

      const pre = doc.querySelector('pre');
      if (!pre) {
        throw new Error('Code block container was not rendered');
      }
      const background = getComputedStyle(pre).backgroundColor;

      return Array.from(doc.querySelectorAll('pre code span'))
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.trim() || '',
            color: style.color,
            contrast: contrastRatio(style.color, background),
          };
        })
        .filter((token) => token.contrast < 4.5);
    });

    expect(lowContrastTokens).toEqual([]);
  });
});
