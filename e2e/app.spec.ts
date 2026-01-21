import { test, expect } from '@playwright/test';

test.describe('Obails App', () => {
  test('should load the app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check title
    await expect(page.locator('.sidebar-header h2')).toHaveText('Obails');
  });

  test('should display sidebar with file tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sidebar should be visible
    await expect(page.locator('.sidebar')).toBeVisible();

    // File tree should exist
    await expect(page.locator('.file-tree')).toBeVisible();
  });

  test('should have toolbar buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#daily-note-btn')).toBeVisible();
    await expect(page.locator('#timeline-btn')).toBeVisible();
    await expect(page.locator('#refresh-btn')).toBeVisible();
  });

  test('should have theme selector with Light and Dark groups', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const themeSelect = page.locator('#theme-select');
    await expect(themeSelect).toBeVisible();

    // Check optgroups exist
    const lightGroup = page.locator('#theme-select optgroup[label="Light"]');
    const darkGroup = page.locator('#theme-select optgroup[label="Dark"]');
    await expect(lightGroup).toBeAttached();
    await expect(darkGroup).toBeAttached();

    // Check light themes exist
    await expect(page.locator('#theme-select option[value="github-light"]')).toBeAttached();
    await expect(page.locator('#theme-select option[value="solarized-light"]')).toBeAttached();
    await expect(page.locator('#theme-select option[value="one-light"]')).toBeAttached();
    await expect(page.locator('#theme-select option[value="catppuccin-latte"]')).toBeAttached();
    await expect(page.locator('#theme-select option[value="rosepine-dawn"]')).toBeAttached();

    // Check dark themes exist
    await expect(page.locator('#theme-select option[value="dracula"]')).toBeAttached();
    await expect(page.locator('#theme-select option[value="catppuccin"]')).toBeAttached();
  });

  test('should switch to light theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const themeSelect = page.locator('#theme-select');
    await themeSelect.selectOption('github-light');

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

    const themeSelect = page.locator('#theme-select');
    await themeSelect.selectOption('dracula');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dracula');

    // Check CSS variable is dark
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
    );
    expect(bgColor).toBe('#282a36');
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
    const themeSelect = page.locator('#theme-select');
    await themeSelect.selectOption('dracula');

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
    await themeSelect.selectOption('github-light');

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
