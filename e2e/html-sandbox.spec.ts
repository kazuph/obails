import { test, expect } from '@playwright/test';

test('HTML preview executes scripts while isolating the parent application', async ({ page }) => {
  await page.goto('/');
  await page.locator('#html-editor-container').evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });
  await page.locator('#html-editor-container').evaluate((element) => element.classList.remove('source-hidden'));
  await page.locator('#html-editor').fill(`<!doctype html><html><body>
    <button id="button">click</button><canvas id="canvas" width="10" height="10"></canvas>
    <div id="result"></div><script>
    const result = document.querySelector('#result');
    let parentBlocked = false, topBlocked = false, runtimeBlocked = false, serviceBlocked = false;
    try { void parent.document.body; } catch (e) { parentBlocked = true; }
    try { void top.document.body; } catch (e) { topBlocked = true; }
    try { void parent.wails; } catch (e) { runtimeBlocked = true; }
    try { void top.go; } catch (e) { serviceBlocked = true; }
    document.querySelector('#button').onclick = () => {
      const ctx = document.querySelector('#canvas').getContext('2d');
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 10, 10);
      requestAnimationFrame(() => setTimeout(() => {
        result.textContent = JSON.stringify({parentBlocked, topBlocked, runtimeBlocked, serviceBlocked, pixel: ctx.getImageData(0,0,1,1).data[0]});
      }, 0));
    };
    </script></body></html>`);
  const frame = page.frameLocator('#html-preview');
  await expect(page.locator('#html-preview')).toHaveAttribute('sandbox', 'allow-scripts');
  // With the Chrome channel used on CI, Playwright's pointer click does not reach this sandboxed frame.
  // Fire the click inside the frame so the test still checks the page's own event handler.
  await frame.locator('#button').dispatchEvent('click');
  await expect(frame.locator('#result')).toHaveText('{"parentBlocked":true,"topBlocked":true,"runtimeBlocked":true,"serviceBlocked":true,"pixel":255}');
});

test('HTML preview scrolls to both edges of oversized content', async ({ page }) => {
  await page.goto('/');
  await page.locator('#html-editor-container').evaluate((element) => { (element as HTMLElement).style.display = 'flex'; });
  await page.locator('#html-editor-container').evaluate((element) => element.classList.remove('source-hidden'));
  await page.locator('#html-editor').fill('<!doctype html><html><body style="margin:0"><div style="width:4000px;height:4000px"></div></body></html>');
  const body = page.frameLocator('#html-preview').locator('body');
  await expect.poll(() => body.evaluate(() => document.documentElement.scrollWidth)).toBe(4000);
  const edges = await body.evaluate(() => {
    const root = document.scrollingElement!;
    root.scrollTo(0, 0);
    const start = { x: root.scrollLeft, y: root.scrollTop };
    root.scrollTo(root.scrollWidth, root.scrollHeight);
    return { start, x: root.scrollLeft, y: root.scrollTop, maxX: root.scrollWidth - root.clientWidth, maxY: root.scrollHeight - root.clientHeight };
  });
  expect(edges.start).toEqual({ x: 0, y: 0 });
  expect(edges.maxX).toBeGreaterThan(0);
  expect(edges.maxY).toBeGreaterThan(0);
  expect(edges.x).toBe(edges.maxX);
  expect(edges.y).toBe(edges.maxY);
});
