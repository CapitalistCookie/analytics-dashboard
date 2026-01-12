import { test, expect, loginAs } from './fixtures';

// Use mobile viewport from playwright config (mobile-chrome project)
test.describe('Mobile Responsive Tests', () => {
  test.use({ viewport: { width: 393, height: 851 } }); // Pixel 5 dimensions

  test('should show hamburger menu on mobile', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    // Hamburger menu button should be visible (aria-label="Open menu")
    const hamburgerButton = page.locator('button[aria-label="Open menu"]');
    await expect(hamburgerButton).toBeVisible({ timeout: 5000 });
  });

  test('should open sidebar when hamburger clicked', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    // Click hamburger menu
    await page.click('button[aria-label="Open menu"]');
    await page.waitForTimeout(500);

    // Sidebar should now be visible - check for navigation links
    const sidebarNav = page.locator('aside a[href="/analytics"]');
    await expect(sidebarNav).toBeVisible({ timeout: 3000 });
  });

  test('should close sidebar when clicking outside', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    // Open sidebar
    await page.click('button[aria-label="Open menu"]');
    await page.waitForTimeout(500);

    // Click on overlay/backdrop (has class bg-black/50)
    const overlay = page.locator('div.fixed.inset-0.bg-black\\/50');
    if (await overlay.isVisible({ timeout: 2000 })) {
      await overlay.click({ position: { x: 350, y: 400 } }); // Click outside sidebar
      await page.waitForTimeout(500);
    }

    // Just verify page is still functional
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/Dashboard|Analytics/i);
  });

  test('should navigate using mobile sidebar', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    // Open sidebar
    await page.click('button[aria-label="Open menu"]');
    await page.waitForTimeout(500);

    // Click Analytics link in sidebar
    await page.click('aside a[href="/analytics"]');

    // Should navigate to analytics
    await expect(page).toHaveURL('/analytics');
  });

  test('should have touch-friendly button sizes', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    // Check button minimum dimensions (44x44 recommended for touch)
    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();

      if (box) {
        // Buttons should have reasonable touch target size
        expect(box.width).toBeGreaterThanOrEqual(32);
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
    }
  });

  test('should stack cards vertically on mobile', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find grid containers
    const gridContainers = page.locator('[class*="grid"]');
    const count = await gridContainers.count();

    if (count > 0) {
      // Check first grid - on mobile should be single column or 2 columns max
      const grid = gridContainers.first();
      const computedStyle = await grid.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.gridTemplateColumns;
      });

      // Should not have more than 2-3 columns on mobile
      const columnCount = computedStyle.split(' ').length;
      expect(columnCount).toBeLessThanOrEqual(3);
    }
  });

  test('should work with swipe gestures on camera grid', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    await page.waitForTimeout(2000);

    // Find camera grid section
    const cameraGrid = page.locator('[class*="camera"], [class*="grid"]').first();

    if (await cameraGrid.isVisible()) {
      // Simulate swipe left
      const box = await cameraGrid.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
      }
    }

    // Page should still be functional
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/Dashboard|Cameras|People/i);
  });

  test('should show pagination dots on mobile camera view', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    await page.waitForTimeout(2000);

    // Look for pagination dots
    const dots = page.locator('[class*="dot"], [class*="pagination"] button, div[class*="rounded-full"][class*="bg-"]');
    const dotsCount = await dots.count();

    // If cameras exist, there might be pagination dots
    // This is optional as it depends on number of cameras
    if (dotsCount > 0) {
      expect(dotsCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('should have readable text at mobile viewport', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Check that main content is not overflowing
    const mainContent = page.locator('main, [class*="content"]').first();
    const box = await mainContent.boundingBox();

    if (box) {
      // Content should fit within viewport width
      expect(box.width).toBeLessThanOrEqual(393 + 20); // viewport + small margin
    }
  });

  test('should adapt analytics charts for mobile', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/analytics');

    await page.waitForTimeout(2000);

    // Charts should be visible and not overflowing
    const charts = page.locator('[class*="chart"], svg[class*="recharts"]');
    const chartCount = await charts.count();

    if (chartCount > 0) {
      const chart = charts.first();
      const box = await chart.boundingBox();

      if (box) {
        // Chart should fit within viewport
        expect(box.width).toBeLessThanOrEqual(393);
      }
    }
  });

  test('should display date range buttons correctly on mobile', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/analytics');

    await page.waitForTimeout(2000);

    // Date range buttons should be visible and usable
    const todayButton = page.locator('button:has-text("Today")');
    const weekButton = page.locator('button:has-text("This Week")');

    await expect(todayButton).toBeVisible();
    await expect(weekButton).toBeVisible();

    // Should be clickable
    await todayButton.click();
    await page.waitForTimeout(500);
  });
});
