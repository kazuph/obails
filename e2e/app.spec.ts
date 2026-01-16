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
    await expect(page.locator('#thino-btn')).toBeVisible();
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

  test('should toggle Thino panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const thinoPanel = page.locator('#thino-panel');

    // Initially hidden
    await expect(thinoPanel).not.toBeVisible();

    // Click Thino button
    await page.click('#thino-btn');

    // Should be visible
    await expect(thinoPanel).toBeVisible();
  });

  test('should have resize handles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#sidebar-resize')).toBeVisible();
    await expect(page.locator('#editor-resize')).toBeVisible();
  });

  test('should have backlinks panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.backlinks-panel')).toBeVisible();
    await expect(page.locator('.backlinks-panel h3')).toHaveText('Backlinks');
  });
});

test.describe('Editor', () => {
  test('should have editor textarea', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#editor')).toBeVisible();
  });

  test('should have preview pane', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.preview-pane')).toBeVisible();
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
