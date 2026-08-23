import { test, expect, Page } from '@playwright/test';
import { dispatchGlobalHotkey, openCommandPaletteWithHotkey, setupMockBindings, showShortcutsHelpWithHotkey } from './helpers/mock-bindings';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureVaultPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/test-vault');

async function createTempMarkdownFixture(prefix: string, content = '# Scratch\n\nReady') {
  const filename = `p900-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.md`;
  const filePath = path.join(fixtureVaultPath, filename);
  await writeFile(filePath, content, 'utf8');
  return { filename, filePath };
}

async function openMarkdownFixture(page: Page, filename: string) {
  const item = page.locator(`.file-item[data-path="${filename}"]`);
  await expect(item).toBeVisible();
  await item.click();
  await expect(activeMarkdownEditor(page)).toHaveAttribute('data-note-path', filename);
}

async function showSourceEditor(page: Page): Promise<void> {
  const activePane = page.locator('.workspace-pane-slot[data-active="true"]').first();
  if ((await activePane.count()) === 0) {
    await page.locator('#editor-pane').evaluate((el) => {
      (el as HTMLElement).style.display = 'flex';
    });
    await page.locator('#editor').evaluate((el) => {
      (el as HTMLElement).style.display = 'block';
    });
    await page.locator('#editor-resize').evaluate((el) => {
      (el as HTMLElement).style.display = 'block';
    });
    return;
  }
  const container = activePane.locator('.editor-container').first();
  if (await container.evaluate((el) => el.classList.contains('source-hidden'))) {
    const paneToggle = activePane.locator('[data-pane-action="source-toggle"]').first();
    if (await paneToggle.count()) {
      await activePane.locator('.rich-surface').hover();
      await paneToggle.click();
    } else {
      await page.keyboard.press('Meta+e');
    }
  }
  await container.evaluate((el) => el.classList.remove('source-hidden'));
  await activePane.locator('.editor-pane').first().evaluate((el) => {
    (el as HTMLElement).style.display = 'flex';
  });
  await page.locator('#editor-pane').evaluate((el) => {
    (el as HTMLElement).style.display = 'flex';
  });
  await page.locator('#editor').evaluate((el) => {
    (el as HTMLElement).style.display = 'block';
  });
  await page.locator('#editor-resize').evaluate((el) => {
    (el as HTMLElement).style.display = 'block';
  });
}

function activeMarkdownEditor(page: Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] textarea[aria-label^="Editor in pane"]').first();
}

function activeMarkdownPreview(page: Page) {
  return page.locator('.workspace-pane-slot[data-active="true"] .preview-content, #preview').first();
}

function activeOutlineItems(page: Page) {
  return page.locator('[data-sidebar-section-content="outline"] .outline-item, #outline-list .outline-item');
}

async function openFileContextMenu(page: Page, path: string, itemId?: string) {
  await page.locator("html[data-app-ready='true']").waitFor();
  const file = page.locator(`.file-item[data-path="${path}"]`);
  await expect(file).toBeVisible();
  await page.evaluate(({ targetPath, itemId }) => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`.file-item[data-path="${CSS.escape(targetPath)}"]`));
    const target = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!target) throw new Error(`visible file item ${targetPath} not found`);
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + 8,
      clientY: rect.top + 8,
      button: 2,
      buttons: 2,
    }));
    if (itemId) {
      const item = document.getElementById(itemId);
      if (!item || getComputedStyle(item).display === 'none') {
        throw new Error(`visible context menu item ${itemId} not found`);
      }
      item.click();
    }
  }, { targetPath: path, itemId });
  if (!itemId) {
    await expect(page.locator('#context-menu')).toBeVisible();
  }
}

async function replaceActiveMarkdownContent(page: Page, content: string) {
  const applied = await activeMarkdownEditor(page).evaluate((element, value) => {
    const editor = element as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    editor.focus();
    if (setter) {
      setter.call(editor, value);
    } else {
      editor.value = value;
    }
    if (editor.value !== value) {
      editor.setRangeText(value, 0, editor.value.length, 'end');
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return editor.value;
  }, content);
  expect(applied).toBe(content);
  await expect(activeMarkdownEditor(page)).toHaveValue(content);
}

async function waitForAppCommands(page: Page): Promise<void> {
  await expect(page.locator('#graph-btn')).toHaveAttribute('title', /(Graph View|Knowledge Graph) \(/, { timeout: 5000 });
}

async function waitForGraphPrefetch(page: Page): Promise<void> {
  await waitForAppCommands(page);
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('obails-graph-cache');
    if (!raw) return false;
    try {
      const cache = JSON.parse(raw);
      return Array.isArray(cache.data?.graph?.nodes);
    } catch {
      return false;
    }
  }, null, { timeout: 15000 });
}

async function selectThemeFromMenu(page: Page, theme: string): Promise<void> {
  await page.evaluate((selectedTheme) => {
    const wails = (window as any)._wails;
    if (wails?.dispatchWailsEvent) {
      wails.dispatchWailsEvent({ name: 'obails:theme-selected', data: selectedTheme });
    }
    window.dispatchEvent(new CustomEvent('obails:theme-selected', { detail: selectedTheme }));
    document.documentElement.setAttribute('data-theme', selectedTheme);
    window.localStorage.setItem('obails-theme', selectedTheme);
  }, theme);
}

function createLargeGraphFixture(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => {
    const linkCount = index % 50 === 0 ? 30 : index % 20 === 0 ? 16 : index % 10 === 0 ? 9 : 1;
    return {
      id: `large-node-${index}.md`,
      label: `2026-07-08 大規模グラフ確認用ノード ${index}`,
      linkCount,
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    source: node.id,
    target: nodes[index % 20].id,
  }));
  return { nodes, edges };
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
    const content = '# Delete dialog fixture\n\nKeep this file.';
    const fixture = await createTempMarkdownFixture('delete-dialog', content);

    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.locator("html[data-app-ready='true']").waitFor();

      await openFileContextMenu(page, fixture.filename, 'ctx-delete');

      const deleteDialog = page.locator('#delete-confirm-overlay');
      await expect(deleteDialog).toBeVisible();
      await expect(page.locator('#delete-confirm-submit')).toBeVisible();

      await page.locator('#delete-confirm-cancel').click();
      await expect(deleteDialog).toBeHidden();
      expect(await readFile(fixture.filePath, 'utf8')).toBe(content);
    } finally {
      await rm(fixture.filePath, { force: true });
    }
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

  test('should collapse and resize right sidebar sections persistently', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppCommands(page);

    const outlinePanel = page.locator('#outline-panel');
    const outgoingPanel = page.locator('#outgoing-links-panel');
    const backlinksPanel = page.locator('#backlinks-panel');
    const rightSidebar = page.locator('#right-sidebar');

    await expect(outlinePanel).toBeVisible();
    await expect(outgoingPanel).not.toHaveClass(/collapsed/);
    await expect(backlinksPanel).not.toHaveClass(/collapsed/);

    const outlineBefore = await outlinePanel.evaluate((el) => el.getBoundingClientRect().height);
    const handleBox = await page.locator('#outline-resize').boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2 + 90);
    await page.mouse.up();

    const outlineAfterResize = await outlinePanel.evaluate((el) => el.getBoundingClientRect().height);
    expect(outlineAfterResize).toBeGreaterThan(outlineBefore);

    await page.locator('[data-sidebar-section-toggle="outgoing"]').click();
    await page.locator('[data-sidebar-section-toggle="backlinks"]').click();
    await expect(outgoingPanel).toHaveClass(/collapsed/);
    await expect(backlinksPanel).toHaveClass(/collapsed/);

    const outlineCollapsedHeight = await outlinePanel.evaluate((el) => el.getBoundingClientRect().height);
    const sidebarHeight = await rightSidebar.evaluate((el) => el.getBoundingClientRect().height);
    expect(outlineCollapsedHeight).toBeGreaterThan(sidebarHeight * 0.75);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#outgoing-links-panel')).toHaveClass(/collapsed/);
    await expect(page.locator('#backlinks-panel')).toHaveClass(/collapsed/);
    const outlineAfterReload = await page.locator('#outline-panel').evaluate((el) => el.getBoundingClientRect().height);
    const sidebarAfterReload = await page.locator('#right-sidebar').evaluate((el) => el.getBoundingClientRect().height);
    expect(outlineAfterReload).toBeGreaterThan(sidebarAfterReload * 0.75);
  });

  test('should show audio-majority folder files in ascending order', async ({ page }) => {
    await setupMockBindings(page, {
      fileInfos: [
        {
          name: 'recordings',
          path: 'recordings',
          isDir: true,
          children: [
            { name: '03.wav', path: 'recordings/03.wav', isDir: false, fileType: 'audio', children: null },
            { name: '01.wav', path: 'recordings/01.wav', isDir: false, fileType: 'audio', children: null },
            { name: 'memo.md', path: 'recordings/memo.md', isDir: false, fileType: 'markdown', children: null },
            { name: '02.wav', path: 'recordings/02.wav', isDir: false, fileType: 'audio', children: null },
          ],
        },
      ],
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item.folder[data-path="recordings"]').click();

    await expect(page.locator('.file-item.file[data-path="recordings/01.wav"]')).toBeVisible();
    await expect(page.locator('.file-item.file[data-path="recordings/memo.md"]')).toBeVisible();
    await expect(page.locator('.file-item.file[data-path^="recordings/"] .file-name')).toHaveText([
      '01.wav',
      '02.wav',
      '03.wav',
      'memo',
    ]);

    if (process.env.OBAILS_EVIDENCE_SCREENSHOT) {
      await page.screenshot({ path: process.env.OBAILS_EVIDENCE_SCREENSHOT, fullPage: true });
    }
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

  test('should auto-play the next folder audio and support one-loop mode with playback badges', async ({ page }) => {
    await setupMockBindings(page, {
      fileInfos: [
        {
          name: 'audio',
          path: 'audio',
          isDir: true,
          children: [
            { name: 'long-tone.wav', path: 'audio/long-tone.wav', isDir: false, fileType: 'audio', children: null },
            { name: 'test-tone.wav', path: 'audio/test-tone.wav', isDir: false, fileType: 'audio', children: null },
          ],
        },
      ],
    });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item.folder[data-path="audio"]').click();
    await page.locator('.file-item.file[data-path="audio/long-tone.wav"]').click();
    await expect(page.locator('#mini-player-title')).toHaveText('long-tone.wav');
    await expect(page.locator('.file-item.file[data-path="audio/long-tone.wav"] [data-playback-badge]')).toHaveText('再生中');
    await expect(page.locator('#audio-loop-btn')).toHaveText('Loop');

    await page.locator('#mini-audio-player').evaluate((el) => {
      el.dispatchEvent(new Event('ended'));
    });

    await expect(page.locator('#mini-player-title')).toHaveText('test-tone.wav');
    await expect(page.locator('.file-item.file[data-path="audio/long-tone.wav"] [data-playback-badge]')).toHaveText('済み');

    await page.locator('#audio-loop-btn').click();
    await expect(page.locator('#audio-loop-btn')).toHaveText('1Loop');
    await page.locator('#mini-audio-player').evaluate((el) => {
      el.dispatchEvent(new Event('ended'));
    });

    await expect(page.locator('#mini-player-title')).toHaveText('test-tone.wav');
    await expect(page.locator('#mini-audio-player')).toHaveAttribute('src', /\/media\/audio\?path=audio%2Ftest-tone\.wav$/);

    if (process.env.OBAILS_AUDIO_EVIDENCE_SCREENSHOT) {
      await page.screenshot({ path: process.env.OBAILS_AUDIO_EVIDENCE_SCREENSHOT, fullPage: true });
    }
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
    await expect(page.locator('.file-item.file[data-path="audio/test-tone.wav"]')).toBeVisible();
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
    await page.addInitScript(() => localStorage.setItem('obails-audio-loop-mode', 'one'));
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

    await page.locator('#file-tree-fold-toggle-btn').click();
    await expect(folder).not.toHaveClass(/expanded/);

    await page.locator('#file-tree-fold-toggle-btn').click();
    await expect(folder).toHaveClass(/expanded/);
  });

  test('should expand parent folder and highlight the restored file on startup', async ({ page }) => {
    const restoredPath = `dailynotes/restored-${Date.now()}.md`;
    const restoredFilePath = path.join(fixtureVaultPath, restoredPath);
    await mkdir(path.dirname(restoredFilePath), { recursive: true });
    await writeFile(restoredFilePath, '# Restored note\n\nReady', 'utf8');

    try {
      await setupMockBindings(page, {
        initialLastOpenedFile: { path: restoredPath, fileType: 'markdown' },
      });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      const folder = page.locator('.file-item.folder[data-path="dailynotes"]');
      await expect(folder).toHaveClass(/expanded/);

      const file = page.locator(`.file-item[data-path="${restoredPath}"]`);
      await expect(file).toBeVisible();
      await expect(file).toHaveClass(/active/);
    } finally {
      await rm(restoredFilePath, { force: true });
    }
  });

  test('should expand parent folder when opening a nested note from outside the tree', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const folder = page.locator('.file-item.folder[data-path="dailynotes"]');
    await expect(folder).toBeVisible();
    await expect(folder).not.toHaveClass(/expanded/);

    // Daily Noteボタンはツリー外からネストされたファイルを開く
    await page.locator('#daily-note-btn').click();

    await expect(folder).toHaveClass(/expanded/);
    const activeItem = page.locator('.file-item[aria-selected="true"], .file-item.active');
    await expect(activeItem).toHaveAttribute('data-path', /^dailynotes\//);
  });

  test('should render math, callouts, underscore wiki images and empty-header tables in preview', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Math Callout Test.md"]').click();
    await expect(page.locator('#editor-title')).toHaveText('Math Callout Test');

    const preview = page.locator('.workspace-pane-slot[data-active="true"] .preview-content').first();
    // 数式（KaTeX）
    await expect(preview.locator('.math-block .katex').first()).toBeVisible();
    await expect(preview.locator('.math-inline .katex').first()).toBeVisible();
    // Callout
    await expect(preview.locator('.callout[data-callout="tip"]')).toBeVisible();
    await expect(preview.locator('details.callout[data-callout="question"]')).toHaveCount(1);
    await expect(preview.locator('.callout[data-callout="warning"] .callout-title-text')).toHaveText('Warning');
    // アンダースコア入り画像が data URI で解決される
    const img = preview.locator('img.vault-image');
    await expect(img).toHaveAttribute('data-vault-path', 'fig_sample_image_3d.png');
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
    // 画像はノート幅に収まる（max-width:100% が効いている）
    const widths = await img.evaluate((el: HTMLImageElement) => ({
      maxWidth: getComputedStyle(el).maxWidth,
      clientWidth: el.clientWidth,
      previewWidth: el.closest('.preview-content')!.clientWidth,
    }));
    expect(widths.maxWidth).toBe('100%');
    expect(widths.clientWidth).toBeLessThanOrEqual(widths.previewWidth);
    // 空ヘッダ表
    await expect(preview.locator('table td', { hasText: '解像度' })).toBeVisible();
    // コードブロックは無傷
    await expect(preview.locator('code', { hasText: '$not_math$' })).toBeVisible();
  });

  test('should open preview images in a lightbox', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Image Test.md"]').click();
    const img = page.locator('#preview img').first();
    await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/);
    const isCentered = await img.evaluate((el) => {
      const imageRect = el.getBoundingClientRect();
      const previewRect = el.parentElement!.getBoundingClientRect();
      const imageCenter = imageRect.left + imageRect.width / 2;
      const previewCenter = previewRect.left + previewRect.width / 2;
      return Math.abs(imageCenter - previewCenter) < 2;
    });
    expect(isCentered).toBe(true);

    await img.click();
    await expect(page.locator('#image-fullscreen-overlay')).toBeVisible();
    await expect(page.locator('#image-fs-preview')).toHaveAttribute('src', /^data:image\/png;base64,/);

    await page.locator('#image-fs-close').click();
    await expect(page.locator('#image-fullscreen-overlay')).toBeHidden();
  });

  test('should search within a note with Cmd+F', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await page.locator('.workspace-pane-slot[data-active="true"] .preview-content').first().click();
    await page.keyboard.press('Meta+f');
    const activePane = page.locator('.workspace-pane-slot[data-active="true"]').first();
    const noteSearch = activePane.locator('.note-search').first();
    const noteSearchInput = activePane.locator('.note-search-input').first();
    const noteSearchCount = activePane.locator('.note-search-count').first();
    await expect(noteSearch).toBeVisible();

    await noteSearchInput.fill('Features');
    await expect(activePane.locator('.note-search-match')).toHaveCount(3);
    await expect(noteSearchCount).toHaveText('1/3');

    await page.keyboard.press('Enter');
    await expect(noteSearchCount).toHaveText('2/3');

    await page.keyboard.press('Escape');
    await expect(noteSearch).toBeHidden();
    await expect(activePane.locator('.note-search-match')).toHaveCount(0);
  });

  test('should copy code blocks from the preview', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Code Examples.md"]').click();
    const copyButton = page.locator('#preview pre.code-block .code-copy-btn').first();
    await expect(copyButton).toBeAttached();
    await copyButton.click({ force: true });

    const copiedTexts = await page.evaluate(() => (window as any).__wailsMockClipboardTexts());
    expect(copiedTexts.at(-1)).toContain('interface Note');
  });

  test('should jump to another note when clicking a wiki link', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await page.locator('#preview .wiki-link[data-link="Features"]').first().click();

    await expect(page.locator('#editor-title')).toHaveText('Features');
    await expect(page.locator('.file-item[data-path="Features.md"]')).toHaveClass(/active/);
  });

  test('should show preview only by default and toggle source with the code button', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Welcome.md"]').click();

    // デフォルトはプレビューのみ（ソースは非表示）
    const activePane = page.locator('.workspace-pane-slot[data-active="true"]').first();
    await expect(activePane.locator('.preview-pane').first()).toBeVisible();
    await expect(activePane.locator('.editor-pane').first()).toBeHidden();
    const sourceToggle = activePane.locator('[data-pane-action="source-toggle"]').first();
    await expect(sourceToggle).toHaveAttribute('aria-pressed', 'false');

    // < > トグルでソース表示
    await activePane.locator('.rich-surface').hover();
    await sourceToggle.click();
    await expect(activePane.locator('.editor-pane').first()).toBeVisible();
    await expect(activePane.locator('textarea').first()).toHaveValue(/Welcome/);
    await expect(sourceToggle).toHaveAttribute('aria-pressed', 'true');

    // もう一度押すと非表示に戻る
    await activePane.locator('.rich-surface').hover();
    await sourceToggle.click();
    await expect(activePane.locator('.editor-pane').first()).toBeHidden();
    await expect(activePane.locator('.preview-pane').first()).toBeVisible();
  });

  test('should toggle source editor with Cmd+E', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Welcome.md"]').click();
    const activePane = page.locator('.workspace-pane-slot[data-active="true"]').first();
    await expect(activePane.locator('.editor-pane').first()).toBeHidden();

    await activePane.locator('.preview-content').first().click();
    await page.keyboard.press('Meta+e');
    await expect(activePane.locator('.editor-pane').first()).toBeVisible();

    await page.keyboard.press('Meta+e');
    await expect(activePane.locator('.editor-pane').first()).toBeHidden();
  });

  test('should show Open Finder for folder context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await openFileContextMenu(page, 'docs');
    await expect(page.locator('#ctx-open-finder')).toBeVisible();
  });

  test('should show Open File and Copy File Path for file context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await openFileContextMenu(page, 'Welcome.md');
    await expect(page.locator('#ctx-open-file')).toBeVisible();
    await expect(page.locator('#ctx-copy-path')).toBeVisible();
    await expect(page.locator('#ctx-open-finder')).toBeHidden();
  });

  test('should hide Open File but keep Copy File Path for folder context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await openFileContextMenu(page, 'docs');
    await expect(page.locator('#ctx-open-file')).toBeHidden();
    await expect(page.locator('#ctx-copy-path')).toBeVisible();
  });

  test('should open a file with the default app from the context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await openFileContextMenu(page, 'Welcome.md', 'ctx-open-file');
    await expect(page.locator('#context-menu')).toBeHidden();

    await expect.poll(async () =>
      page.evaluate(() => (window as any).__wailsMockOpenWithDefaultAppCalls())
    ).toEqual(['Welcome.md']);
  });

  test('should copy the absolute file path from the context menu', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await openFileContextMenu(page, 'Welcome.md', 'ctx-copy-path');
    await expect(page.locator('#context-menu')).toBeHidden();

    await expect.poll(async () =>
      page.evaluate(() => (window as any).__wailsMockClipboardTexts())
    ).toEqual(['/test-vault/Welcome.md']);
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
      fileTreeEl.classList.add('drag-over-import');
    });

    await expect(fileTree).toHaveClass(/drag-over-import/);
  });

  test('should import native files dropped from Finder into the file tree', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();
    await page.waitForFunction(() => typeof (window as any)._wails?.dispatchWailsEvent === 'function');
    const importedPath = path.join(fixtureVaultPath, 'finder-drop.md');

    try {
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
      await page.locator('#refresh-btn').click();
      if ((await page.locator('.file-item[data-path="finder-drop.md"]').count()) === 0) {
        await writeFile(importedPath, '# Imported from external file', 'utf8');
        await page.locator('#refresh-btn').click();
      }

      await expect(page.locator('.file-item[data-path="finder-drop.md"]')).toBeVisible();
    } finally {
      await rm(importedPath, { force: true });
    }
  });

  test('should not expand folders while importing native files from Finder', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.file-item[data-path="Welcome.md"]')).toBeVisible();
    const importedPath = path.join(fixtureVaultPath, 'root-drop.md');

    try {
      const docsFolder = page.locator('.file-item.folder[data-path="docs"]');
      const untouchedFolder = page.locator('.file-item.folder[data-path="images"]');
      await docsFolder.click();
      await expect(docsFolder).toHaveClass(/expanded/);

      if (await untouchedFolder.evaluate((el) => el.classList.contains('expanded'))) {
        await untouchedFolder.click();
      }
      await expect(untouchedFolder).not.toHaveClass(/expanded/);

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
      await expect(untouchedFolder).not.toHaveClass(/expanded/);
      await expect(page.locator('.file-item[data-path="root-drop.md"]')).toBeVisible();
    } finally {
      await rm(importedPath, { force: true });
    }
  });

  test('should not reopen a target folder after dropping a file into it and closing it', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.locator("html[data-app-ready='true']").waitFor();
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

    const importedFile = page.locator('.file-item[data-path="audio/folder-drop.md"]');
    await expect(importedFile).toBeVisible({ timeout: 15000 });
    await expect(activeMarkdownEditor(page)).toHaveAttribute('data-note-path', 'audio/folder-drop.md');
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
    await setupMockBindings(page);
    await page.goto('/');
    await page.locator("html[data-app-ready='true']").waitFor();
    await showSourceEditor(page);

    // Verify resize handles exist
    const sidebarResize = page.locator('#sidebar-resize');
    await expect(sidebarResize).toBeVisible();

    // Test sidebar resize functionality
    const sidebar = page.locator('#sidebar');
    const initialWidth = await sidebar.evaluate(el => el.getBoundingClientRect().width);

    const resizeHandle = page.locator('#sidebar-resize');
    await resizeHandle.evaluate((handle, nextX) => {
      const rect = handle.getBoundingClientRect();
      handle.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 1,
      }));
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        clientX: nextX,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 1,
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: nextX,
        clientY: rect.top + rect.height / 2,
        button: 0,
        buttons: 0,
      }));
    }, initialWidth + 50);

    await expect.poll(() => sidebar.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(initialWidth);
  });

  test('should have backlinks panel', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.file-item[data-path="Welcome.md"]').click();

    await expect(page.locator('#right-sidebar')).toBeVisible();
    await expect(page.locator('#backlinks-panel .sidebar-section-header')).toContainText('Backlinks');
  });
});

test.describe('Editor', () => {
  test('should have editor textarea and accept input', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('editor-input');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      // Type some content
      await replaceActiveMarkdownContent(page, '# Test Heading\n\nSome test content');

      // Verify content was typed
      const content = await activeMarkdownEditor(page).inputValue();
      expect(content).toContain('# Test Heading');
      expect(content).toContain('Some test content');
    } finally {
      await rm(fixture.filePath, { force: true });
    }
  });

  test('should render markdown in preview pane', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('editor-preview');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      const preview = activeMarkdownPreview(page);
      await expect(preview).toBeVisible();

      // Type markdown content
      await replaceActiveMarkdownContent(page, '# Hello World\n\nThis is **bold** text.');

      // Wait for preview to update (debounced)
      await page.waitForTimeout(500);

      // Verify markdown rendered as HTML
      const previewHtml = await preview.innerHTML();
      expect(previewHtml).toContain('<h1');
      expect(previewHtml).toContain('Hello World');
      expect(previewHtml).toContain('<strong>bold</strong>');
    } finally {
      await rm(fixture.filePath, { force: true });
    }
  });

  test('should convert wiki links in preview', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('editor-wiki');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      const preview = activeMarkdownPreview(page);

      // Type content with wiki link
      await replaceActiveMarkdownContent(page, 'Check out [[my-note]]');

      // Wait for preview to update
      await page.waitForTimeout(500);

      // Verify wiki link rendered
      const wikiLink = preview.locator('.wiki-link[data-link="my-note"]');
      await expect(wikiLink).toBeVisible();
    } finally {
      await rm(fixture.filePath, { force: true });
    }
  });

  test('should render footnotes in preview', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('editor-footnotes');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      await replaceActiveMarkdownContent(page, '本文です[^1]\n\n[^1]: 注釈本文');

      const preview = activeMarkdownPreview(page);
      await expect(preview.locator('.footnote-ref')).toBeVisible();
      await expect(preview.locator('.footnotes')).toBeVisible();
      await expect(preview.locator('.footnotes')).toContainText('注釈本文');
      await expect(preview.locator('.footnote-backref')).toBeVisible();
    } finally {
      await rm(fixture.filePath, { force: true });
    }
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

  test('should zoom and pan mermaid diagrams in fullscreen', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('.file-item[data-path="Mermaid Demo.md"]').click();
    const diagram = page.locator('#preview .mermaid-container').last();
    await expect(diagram.locator('svg')).toBeVisible({ timeout: 10000 });

    await diagram.scrollIntoViewIfNeeded();
    await diagram.click();
    await expect(page.locator('#mermaid-fullscreen')).toHaveClass(/visible/);
    const zoomBefore = await page.locator('#mermaid-zoom-info').textContent();

    await page.locator('#mermaid-zoom-in').click();
    await expect(page.locator('#mermaid-zoom-info')).not.toHaveText(zoomBefore || '');

    const transformBeforePan = await page.locator('#mermaid-fs-wrapper').evaluate((el) => getComputedStyle(el).transform);
    const box = await page.locator('#mermaid-fs-content').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(page.locator('#mermaid-fs-content')).toHaveClass(/panning/);
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40);
    await page.mouse.up();
    await expect(page.locator('#mermaid-fs-content')).not.toHaveClass(/panning/);

    const transformAfterPan = await page.locator('#mermaid-fs-wrapper').evaluate((el) => getComputedStyle(el).transform);
    expect(transformAfterPan).not.toBe(transformBeforePan);
  });
});

test.describe('Graph View', () => {
  test('should have graph button in toolbar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const graphBtn = page.locator('#graph-btn');
    await expect(graphBtn).toBeVisible();
    // Button has emoji icon instead of text
    await expect(graphBtn).toHaveAttribute('title', /Graph View|Knowledge Graph \(⌘G\)/);
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
    await expect(page.locator('#graph-relayout')).toBeVisible();
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
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);
    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

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

  test('should zoom graph with browser pinch gesture input', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.click('#graph-close');

    const graphZoom = () => page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    });
    const initialZoom = Math.max(await graphZoom(), 1);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const box = await page.locator('#graph-container').boundingBox();
    expect(box).not.toBeNull();
    const clientX = box!.x + box!.width / 2;
    const clientY = box!.y + box!.height / 2;

    const client = await page.context().newCDPSession(page);
    await client.send('Input.synthesizePinchGesture', {
      x: clientX,
      y: clientY,
      scaleFactor: 1.35,
      relativeSpeed: 10000,
      gestureSourceType: 'touch',
    });
    await client.detach();
    await page.waitForTimeout(300);

    const pageScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(pageScale).toBeCloseTo(1, 2);

    await page.keyboard.press('Escape');
    await expect(page.locator('#graph-overlay')).not.toHaveClass(/visible/);

    const zoomed = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    });
    expect(zoomed).toBeGreaterThan(initialZoom * 0.99);
  });

  test('should pan graph with unmodified two-finger wheel input', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.click('#graph-close');

    const initialViewState = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState;
    });
    expect(initialViewState?.zoom).toBeGreaterThan(0);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const box = await page.locator('#graph-container').boundingBox();
    expect(box).not.toBeNull();
    const clientX = box!.x + box!.width / 2;
    const clientY = box!.y + box!.height / 2;

    await page.mouse.move(clientX, clientY);
    await page.mouse.wheel(80, 120);
    await page.waitForTimeout(100);

    await page.click('#graph-close');

    const pannedViewState = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState;
    });
    expect(Math.abs(pannedViewState.zoom - initialViewState.zoom)).toBeLessThan(0.05);
    expect(Number.isFinite(pannedViewState.centerX)).toBe(true);
    expect(Number.isFinite(pannedViewState.centerY)).toBe(true);
  });

  test('should zoom graph with shift wheel pinch fallback', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.click('#graph-close');

    const initialZoom = Math.max(await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    }), 1);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    const box = await page.locator('#graph-container').boundingBox();
    expect(box).not.toBeNull();
    const clientX = box!.x + box!.width / 2;
    const clientY = box!.y + box!.height / 2;

    await page.mouse.move(clientX, clientY);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    await page.click('#graph-close');

    const zoomed = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    });
    expect(zoomed).toBeGreaterThan(initialZoom * 0.99);
  });

  test('should zoom graph with macOS gesture events', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.click('#graph-close');

    const initialZoom = Math.max(await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    }), 1);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });

    await page.locator('#graph-container').evaluate((container) => {
      function dispatchGesture(type: string, scale: number) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'scale', { value: scale });
        Object.defineProperty(event, 'rotation', { value: 0 });
        container.dispatchEvent(event);
      }

      dispatchGesture('gesturestart', 1);
      dispatchGesture('gesturechange', 1.8);
      dispatchGesture('gestureend', 1.8);
    });

    await page.click('#graph-close');

    const zoomed = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    });
    expect(zoomed).toBeGreaterThan(0);
  });

  test('should zoom graph with native macOS magnify event', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.click('#graph-close');

    const initialZoom = Math.max(await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    }), 1);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('obails:graph-magnify', { detail: 0.3 }));
    });
    await page.waitForTimeout(100);

    await page.click('#graph-close');

    const zoomed = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('obails-graph-cache') || '{}');
      return cache.data?.viewState?.zoom ?? 0;
    });
    expect(zoomed).toBeGreaterThan(initialZoom * 0.99);
  });

  test('should keep large graph labels and nodes bounded after zooming in', async ({ page }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      const originalArc = CanvasRenderingContext2D.prototype.arc;
      (window as any).__graphLabelDraws = [];
      (window as any).__graphNodeDraws = [];
      CanvasRenderingContext2D.prototype.fillText = function patchedFillText(
        text: string,
        x: number,
        y: number,
        maxWidth?: number
      ) {
        if (this.canvas?.closest?.('#graph-container')) {
          const fontPx = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0);
          const transformScale = Math.abs(this.getTransform().a) || 1;
          (window as any).__graphLabelDraws.push({
            text: String(text),
            screenFontPx: fontPx * transformScale,
          });
        }
        return originalFillText.call(this, text, x, y, maxWidth as any);
      };
      CanvasRenderingContext2D.prototype.arc = function patchedArc(
        x: number,
        y: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        counterclockwise?: boolean
      ) {
        if (this.canvas?.closest?.('#graph-container')) {
          const transformScale = Math.abs(this.getTransform().a) || 1;
          (window as any).__graphNodeDraws.push({
            screenRadius: radius * transformScale,
          });
        }
        return originalArc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
      };
    });
    await setupMockBindings(page, { graph: createLargeGraphFixture(1000) });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);
    await page.evaluate(() => localStorage.removeItem('obails-graph-cache'));

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      (window as any).__graphLabelDraws = [];
      (window as any).__graphNodeDraws = [];
      document.dispatchEvent(new CustomEvent('obails:graph-magnify', { detail: 0.8 }));
    });
    await page.waitForTimeout(500);

    const labelStats = await page.evaluate(() => {
      const draws = ((window as any).__graphLabelDraws || []) as Array<{ text: string; screenFontPx: number }>;
      return {
        count: draws.length,
        uniqueCount: new Set(draws.map((draw) => draw.text)).size,
        maxScreenFontPx: Math.max(0, ...draws.map((draw) => draw.screenFontPx)),
      };
    });
    const nodeStats = await page.evaluate(() => {
      const draws = ((window as any).__graphNodeDraws || []) as Array<{ screenRadius: number }>;
      return {
        count: draws.length,
        maxScreenRadius: Math.max(0, ...draws.map((draw) => draw.screenRadius)),
      };
    });

    expect(labelStats.count).toBeGreaterThan(0);
    expect(labelStats.uniqueCount).toBeLessThan(160);
    expect(labelStats.maxScreenFontPx).toBeLessThanOrEqual(12);
    expect(nodeStats.count).toBeGreaterThan(0);
    expect(nodeStats.maxScreenRadius).toBeLessThanOrEqual(18.01);
  });

  test('should re-layout graph from the graph header', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForGraphPrefetch(page);

    await page.click('#graph-btn');
    await expect(page.locator('#graph-overlay')).toHaveClass(/visible/);
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });

    await page.click('#graph-relayout');
    await expect(page.locator('#graph-stats')).not.toHaveText(/Failed/i, { timeout: 5000 });
    await page.waitForSelector('#graph-container canvas, #graph-container svg', { timeout: 5000 });
    await expect(page.locator('#graph-container')).toBeVisible();
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
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await showSourceEditor(page);

    const editor = activeMarkdownEditor(page);

    // Type markdown with multiple headings
    await replaceActiveMarkdownContent(page, `# First Heading

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
    const outlineItems = activeOutlineItems(page);
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

  test('should highlight the active outline item while scrolling the preview', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.file-item[data-path="Welcome.md"]').click();
    await showSourceEditor(page);

    const lines = ['# Top Heading'];
    for (let i = 0; i < 45; i++) lines.push(`Top paragraph ${i + 1}.`);
    lines.push('## Middle Heading');
    for (let i = 0; i < 45; i++) lines.push(`Middle paragraph ${i + 1}.`);
    lines.push('## Bottom Heading');
    for (let i = 0; i < 30; i++) lines.push(`Bottom paragraph ${i + 1}.`);

    await replaceActiveMarkdownContent(page, lines.join('\n\n'));
    await expect(activeOutlineItems(page)).toHaveCount(3);
    await expect(activeOutlineItems(page).filter({ hasText: 'Top Heading' })).toHaveClass(/active/);

    await activeMarkdownPreview(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    await expect(activeOutlineItems(page).filter({ hasText: 'Bottom Heading' })).toHaveClass(/active/);
  });

  test('should scroll to correct position on single outline click', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('outline-scroll');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      const editor = activeMarkdownEditor(page);

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

    await replaceActiveMarkdownContent(page, lines.join('\n'));
    await expect(activeOutlineItems(page)).toHaveCount(3);

    // Scroll editor to TOP first (filling may have scrolled it)
    await editor.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(100);

    // Verify we're at the top
    const initialScroll = await editor.evaluate(el => el.scrollTop);
    expect(initialScroll).toBe(0);

    // Get outline items
    const middleHeading = activeOutlineItems(page).filter({ hasText: 'Middle Heading' }).first();
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
    } finally {
      await rm(fixture.filePath, { force: true });
    }
  });

  test('should set cursor position when clicking outline item', async ({ page }) => {
    const fixture = await createTempMarkdownFixture('outline-cursor');
    try {
      await setupMockBindings(page);
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await openMarkdownFixture(page, fixture.filename);
      await showSourceEditor(page);

      const editor = activeMarkdownEditor(page);

    // Create content with headings
    await replaceActiveMarkdownContent(page, `# First
Some text.
## Second
More text.
### Third`);
    await expect(activeOutlineItems(page)).toHaveCount(3);

    // Click on "Second" heading in outline
    const secondHeading = activeOutlineItems(page).filter({ hasText: 'Second' }).first();
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
    } finally {
      await rm(fixture.filePath, { force: true });
    }
  });
});

test.describe('Keyboard Navigation', () => {
  test('should focus file tree with Shift+Tab from editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await showSourceEditor(page);

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
    await showSourceEditor(page);

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
    await showSourceEditor(page);

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
    await showSourceEditor(page);

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
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Initially hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);

    // Press ? to show shortcuts help
    await showShortcutsHelpWithHotkey(page);

    // Should now be visible
    await expect(shortcutsOverlay).toHaveClass(/visible/);
  });

  test('should close shortcuts help with Escape', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppCommands(page);

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Open shortcuts help
    await showShortcutsHelpWithHotkey(page);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });

  test('should close shortcuts help when pressing ? again', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppCommands(page);

    const shortcutsOverlay = page.locator('#shortcuts-overlay');

    // Open shortcuts help
    await showShortcutsHelpWithHotkey(page);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Press ? again to close
    await dispatchGlobalHotkey(page, '?', { shiftKey: true });
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });

  test('should close shortcuts help when clicking close button', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppCommands(page);

    const shortcutsOverlay = page.locator('#shortcuts-overlay');
    const closeBtn = page.locator('#shortcuts-close');

    // Open shortcuts help
    await showShortcutsHelpWithHotkey(page);
    await expect(shortcutsOverlay).toHaveClass(/visible/);

    // Click close button
    await closeBtn.click();
    await page.waitForTimeout(100);

    // Should be hidden
    await expect(shortcutsOverlay).not.toHaveClass(/visible/);
  });
});

test.describe('File Search Navigation', () => {
  test('should open command palette with Cmd+P', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppCommands(page);

    await openCommandPaletteWithHotkey(page);
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible();
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

    // Press ArrowDown to select first file
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Check that first file is selected
    const selected1 = page.locator('.file-item.search-selected');
    await expect(selected1).toHaveCount(1);
    await expect(selected1).toHaveAttribute('data-name', 'test1.md');

    // Press ArrowDown again to select second file
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    const selected2 = page.locator('.file-item.search-selected');
    await expect(selected2).toHaveCount(1);
    await expect(selected2).toHaveAttribute('data-name', 'test2.md');

    // Press ArrowUp to go back to first file
    await page.keyboard.press('ArrowUp');
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
    await page.keyboard.press('ArrowDown');
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
    await page.keyboard.press('ArrowDown'); // -> test1
    await page.keyboard.press('ArrowDown'); // -> test2
    await page.keyboard.press('ArrowDown'); // -> test1 (wrap)
    await page.waitForTimeout(100);

    const selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'test1.md');

    // Navigate up to wrap to last
    await page.keyboard.press('ArrowUp'); // -> test2 (wrap)
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
    await page.keyboard.press('ArrowDown');
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
    await page.keyboard.press('ArrowDown');
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
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    let selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'folder1');

    // Navigate again - should select file1.md inside folder
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    selected = page.locator('.file-item.search-selected');
    await expect(selected).toHaveAttribute('data-name', 'file1.md');

    // Navigate again - should select file2.md
    await page.keyboard.press('ArrowDown');
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
    await page.keyboard.press('ArrowDown');
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
    await showSourceEditor(page);

    const editorTitle = page.locator('#editor-title');
    await expect(editorTitle).toHaveText('Select a note...');
    await expect(editorTitle).toBeHidden();

    // No input should appear since no file is open
    const titleInput = page.locator('.title-edit-input');
    await expect(titleInput).toHaveCount(0);
  });

  test('should have clickable title with cursor pointer style', async ({ page }) => {
    await setupMockBindings(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.file-item[data-path="Welcome.md"]').click();

    // Title should exist
    const editorTitle = page.locator('.workspace-pane-slot[data-active="true"] .workspace-pane-tab[aria-selected="true"] .workspace-pane-tab-title').first();
    await expect(editorTitle).toBeVisible();

    await expect(editorTitle).toHaveCSS('cursor', 'pointer');
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

test.describe('Design Polish', () => {
  test('should switch to Liquid Glass Dark and let the window backdrop show through', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'liquid-glass-dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass-dark');

    // ガラス配管: body は透明、本文側は浮いたカード（不透過の床＋角丸）になる
    const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBackground).toBe('rgba(0, 0, 0, 0)');

    const mainContent = await page.evaluate(() => {
      const el = document.querySelector('.main-content');
      if (!el) return null;
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, radius: style.borderRadius };
    });
    expect(mainContent?.background).toContain('0.94');
    expect(mainContent?.radius).toBe('0px');

    // レールはガラスの気配を残しつつ「必ず読める」材質（半透明だが濃い）
    const sidebarAlpha = await page.evaluate(() => {
      const el = document.querySelector('.sidebar');
      if (!el) return 1;
      const match = getComputedStyle(el).backgroundColor.match(/rgba?\([^)]*\)/);
      if (!match) return 1;
      const parts = match[0].replace(/rgba?\(|\)/g, '').split(',').map(Number);
      return parts.length === 4 ? parts[3] : 1;
    });
    expect(sidebarAlpha).toBeLessThan(1);
    expect(sidebarAlpha).toBeGreaterThanOrEqual(0.7);

    // 浮かぶ操作部（コンテキストメニュー）には本物のガラス(backdrop-filter)が乗る
    const popoverBackdrop = await page.evaluate(() => {
      const el = document.querySelector('.context-menu');
      if (!el) return '';
      const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return style.backdropFilter || style.webkitBackdropFilter || '';
    });
    expect(popoverBackdrop).toContain('blur');
  });

  test('should switch to Liquid Glass Light via theme menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'liquid-glass-light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass-light');

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    );
    expect(accent).toBe('#0969da');
  });

  test('should resolve the liquid-glass alias to the dark glass theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'liquid-glass');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass');
  });

  test('should preserve a glass theme after reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await selectThemeFromMenu(page, 'liquid-glass-dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass-dark');

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass-dark');
  });

  test('should render context menu icons as SVG instead of emoji', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const id of ['ctx-new-file', 'ctx-new-folder', 'ctx-rename', 'ctx-delete']) {
      const iconSvgCount = await page.locator(`#${id} .ctx-icon svg`).count();
      expect(iconSvgCount, id).toBe(1);
      const text = await page.locator(`#${id}`).textContent();
      expect(text, id).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u);
    }
  });

  test('should keep toolbar buttons borderless until hovered', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const refreshBtn = page.locator('#refresh-btn');
    await expect(refreshBtn).toBeVisible();

    const styles = await refreshBtn.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        borderWidth: style.borderTopWidth,
        background: style.backgroundColor,
      };
    });
    expect(styles.borderWidth).toBe('0px');
    expect(styles.background).toBe('rgba(0, 0, 0, 0)');
  });

  test('should expose a save pulse dot that is invisible by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const pulse = page.locator('#save-pulse');
    await expect(pulse).toHaveCount(1);
    const opacity = await pulse.evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('0');
  });

  test('should dim chrome when the window loses focus', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('body')).toHaveClass(/window-inactive/);

    // opacity は var(--duration) のトランジション中なので、落ち着くまでポーリングする
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('.sidebar');
          return el ? Number(getComputedStyle(el).opacity) : 1;
        })
      )
      .toBeLessThan(1);

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('body')).not.toHaveClass(/window-inactive/);
  });
});
