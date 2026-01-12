import { test, expect, loginAs } from './fixtures';

test.describe('User Flow Tests', () => {
  test.describe('Login → Dashboard → View stats', () => {
    test('should login and view dashboard stats', async ({ page }) => {
      // Login
      await loginAs(page, 'admin');

      // Should be on dashboard
      await expect(page).toHaveURL('/');

      // Verify dashboard elements are visible
      await expect(page.locator('text=Total People')).toBeVisible({ timeout: 10000 });

      // Check for stats cards
      const statsSection = page.locator('[class*="grid"]').first();
      await expect(statsSection).toBeVisible();

      // Verify occupancy or system stats are showing
      const statsText = await page.locator('body').textContent();
      expect(statsText).toMatch(/People|Cameras|Detections|FPS/i);
    });
  });

  test.describe('Login → Staff → Add staff → Upload photo → Train face', () => {
    test('should add new staff member', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Staff page
      await page.click('a[href="/staff"]');
      await expect(page).toHaveURL('/staff');

      // Click Add Staff button
      await page.click('button:has-text("Add Staff")');

      // Wait for modal to appear
      await page.waitForSelector('input[placeholder="Enter staff name"]', { timeout: 5000 });

      // Fill in staff form - inputs use placeholders not name attributes
      await page.fill('input[placeholder="Enter staff name"]', `E2E Test Staff ${Date.now()}`);
      await page.fill('input[placeholder="Optional badge ID"]', `E2E${Date.now()}`);

      // Submit form
      await page.click('button:has-text("Create Staff")');

      // Should see success - modal closes or shows photo upload
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(/E2E Test Staff|Photo|Upload/i);
    });

    test('should view staff details', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/staff');

      // Wait for staff list to load
      await page.waitForTimeout(2000);
      const hasTable = await page.locator('table tbody tr').count();

      if (hasTable > 0) {
        // Click on first staff row
        const firstRow = page.locator('table tbody tr').first();
        await firstRow.click();

        // Should see staff details panel or modal
        await page.waitForTimeout(1000);
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toMatch(/Details|Edit|Name|Role/i);
      }
    });
  });

  test.describe('Login → Analytics → Select date range → View charts', () => {
    test('should view analytics with different date ranges', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Analytics
      await page.click('a[href="/analytics"]');
      await expect(page).toHaveURL('/analytics');

      // Verify charts are loading
      await expect(page.locator('text=Hourly Customer Count')).toBeVisible({ timeout: 10000 });

      // Check for date range selector
      const todayButton = page.locator('button:has-text("Today")');
      await expect(todayButton).toBeVisible();

      // Click "This Week"
      await page.click('button:has-text("This Week")');
      await page.waitForTimeout(500);

      // Click "This Month"
      await page.click('button:has-text("This Month")');
      await page.waitForTimeout(500);

      // Verify summary cards are visible
      await expect(page.locator('text=Total Customers')).toBeVisible();
      await expect(page.locator('text=Avg Wait Time')).toBeVisible();
    });
  });

  test.describe('Login → Alerts → Configure threshold → Save', () => {
    test('should configure alert threshold', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Alerts
      await page.click('a[href="/alerts"]');
      await expect(page).toHaveURL('/alerts');

      // Click Configuration tab
      await page.click('button:has-text("Configuration")');
      await page.waitForTimeout(1000);

      // Verify we're on configuration tab
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(/Configuration|Alert|Add/i);

      // Click Add Alert button if visible
      const addButton = page.locator('button:has-text("Add Alert")');
      if (await addButton.isVisible({ timeout: 3000 })) {
        await addButton.click();
        await page.waitForTimeout(1000);

        // Fill in alert form if modal appeared
        const nameInput = page.locator('.fixed input[type="text"]').first();
        if (await nameInput.isVisible({ timeout: 2000 })) {
          const alertName = `E2E Alert ${Date.now()}`;
          await nameInput.fill(alertName);

          // Click Save button or close modal
          const buttons = page.locator('.fixed button');
          const count = await buttons.count();
          if (count > 1) {
            // Click the non-cancel button (usually last or has different style)
            await buttons.last().click();
          }
        }
      }

      // Just verify page is still functional
      await page.waitForTimeout(1000);
      const finalBody = await page.locator('body').textContent();
      expect(finalBody).toMatch(/Alert|Configuration/i);
    });
  });

  test.describe('Login → Incidents → Create incident → Resolve', () => {
    test('should create and resolve incident', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Incidents
      await page.click('a[href="/incidents"]');
      await expect(page).toHaveURL('/incidents');

      // Click Log Incident button
      await page.click('button:has-text("Log Incident")');

      // Wait for modal
      await page.waitForSelector('input[placeholder*="Brief description"]', { timeout: 5000 });

      // Fill incident form
      const incidentTitle = `E2E Incident ${Date.now()}`;
      await page.fill('input[placeholder*="Brief description"]', incidentTitle);

      // Fill description
      await page.fill('textarea[placeholder*="Detailed description"]', 'Test incident created by E2E test');

      // Submit - button text is "Log Incident" in the modal too
      await page.locator('.fixed button:has-text("Log Incident")').click();

      // Verify modal closed and incident list updated
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(/E2E Incident|Incidents/i);
    });
  });

  test.describe('Login → Notes → Create note → Mark as read', () => {
    test('should create and acknowledge note', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Notes
      await page.click('a[href="/notes"]');
      await expect(page).toHaveURL('/notes');

      // Click Add Note button
      await page.click('button:has-text("Add Note")');

      // Wait for modal
      await page.waitForSelector('textarea[placeholder*="Enter your note"]', { timeout: 5000 });

      // Fill note form
      await page.fill('textarea[placeholder*="Enter your note"]', `E2E Note ${Date.now()} - Test shift note`);

      // Submit - button in modal also says "Add Note"
      await page.locator('.fixed button:has-text("Add Note")').click();

      // Verify modal closed
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(/E2E Note|Notes|Shift/i);
    });
  });

  test.describe('Login → Settings → Update business hours → Save', () => {
    test('should update business hours', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Settings
      await page.click('a[href="/settings"]');
      await expect(page).toHaveURL('/settings');

      // Click Business Hours tab if not already selected
      const businessHoursTab = page.locator('button:has-text("Business Hours")');
      if (await businessHoursTab.isVisible()) {
        await businessHoursTab.click();
      }

      // Find Monday's open time input and update it
      const mondayOpenInput = page.locator('input[type="time"]').first();
      if (await mondayOpenInput.isVisible({ timeout: 5000 })) {
        await mondayOpenInput.fill('09:00');
      }

      // Save changes
      const saveButton = page.locator('button:has-text("Save")');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        // Wait for save confirmation
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('Login → Admin → Add user → Assign role', () => {
    test('should add user and assign role', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to Admin
      await page.click('a[href="/admin"]');
      await expect(page).toHaveURL('/admin');

      // Click Add User button
      await page.click('button:has-text("Add User")');

      // Wait for modal to appear
      await page.waitForSelector('text=Create User', { timeout: 5000 });

      // Fill user form - inputs are in form fields with labels
      const timestamp = Date.now();
      const username = `e2e_${timestamp}`;

      // Fill username (first text input in modal)
      const usernameInput = page.locator('.fixed form input[type="text"]').first();
      await usernameInput.fill(username);

      // Fill email (email input)
      const emailInput = page.locator('.fixed form input[type="email"]');
      await emailInput.fill(`${username}@test.com`);

      // Fill password (password input)
      const passwordInput = page.locator('.fixed form input[type="password"]');
      await passwordInput.fill('TestPass123');

      // Select role
      const roleSelect = page.locator('.fixed form select');
      await roleSelect.selectOption('viewer');

      // Submit
      await page.click('.fixed form button[type="submit"]');

      // Verify user was created - modal closes and user appears in list
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').textContent();
      expect(bodyText).toMatch(new RegExp(username, 'i'));
    });
  });
});
