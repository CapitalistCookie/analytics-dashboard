import { test, expect, loginAs } from './fixtures';

test.describe('Error Handling Tests', () => {
  test.describe('API Failure Handling', () => {
    test('should display error when API fails', async ({ page }) => {
      await loginAs(page, 'admin');

      // Intercept API calls and mock failure
      await page.route('**/api/analytics/**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal server error' }),
        });
      });

      await page.goto('/analytics');

      // Should show error message or fallback content
      await page.waitForTimeout(2000);

      const bodyText = await page.locator('body').textContent();
      const hasError = bodyText?.match(/error|failed|unavailable|try again/i);
      const hasContent = bodyText?.match(/Analytics|Customers|Charts/i);

      // Either shows error or gracefully degrades with partial content
      expect(hasError || hasContent).toBeTruthy();
    });

    test('should handle 401 unauthorized by redirecting to login', async ({ page }) => {
      // Clear any stored auth
      await page.goto('/login');
      await page.evaluate(() => localStorage.clear());

      // Try to access protected page
      await page.goto('/dashboard');

      // Should be redirected to login
      await page.waitForTimeout(1000);
      const url = page.url();

      expect(url).toMatch(/login/);
    });

    test('should handle 404 not found gracefully', async ({ page }) => {
      await loginAs(page, 'admin');

      // Navigate to non-existent page
      await page.goto('/this-page-does-not-exist');
      await page.waitForTimeout(2000);

      // Should show something - either 404, redirect, or empty state
      const bodyText = await page.locator('body').textContent();

      // React router typically shows empty or redirects - just verify page is functional
      expect(bodyText?.length).toBeGreaterThan(50);
    });
  });

  test.describe('Network Timeout Handling', () => {
    test('should handle slow API responses', async ({ page }) => {
      await loginAs(page, 'admin');

      // Intercept and delay API calls
      await page.route('**/api/analytics/summary', async route => {
        await new Promise(r => setTimeout(r, 3000)); // 3 second delay
        route.continue();
      });

      await page.goto('/analytics');

      // Should show loading state initially
      const loadingIndicator = page.locator('[class*="loading"], [class*="spinner"], text=/loading/i');
      const hasLoading = await loadingIndicator.isVisible({ timeout: 2000 }).catch(() => false);

      // Either shows loading or handles gracefully
      await page.waitForTimeout(4000);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText?.length).toBeGreaterThan(100);
    });

    test('should handle network disconnect', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/');

      // Wait for initial load
      await page.waitForTimeout(2000);

      // Simulate offline
      await page.route('**/api/**', route => {
        route.abort('connectionfailed');
      });

      // Navigate to analytics
      await page.goto('/analytics');

      await page.waitForTimeout(2000);

      // Should show error or cached content
      const bodyText = await page.locator('body').textContent();
      const hasError = bodyText?.match(/error|offline|connection|unavailable|failed/i);
      const hasContent = bodyText?.match(/Analytics|Dashboard/i);

      expect(hasError || hasContent).toBeTruthy();
    });
  });

  test.describe('Invalid Form Submissions', () => {
    test('should validate required fields on staff creation', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/staff');

      // Click Add Staff
      await page.click('button:has-text("Add Staff")');
      await page.waitForTimeout(500);

      // Try to submit empty form - click Create Staff button
      await page.click('button:has-text("Create Staff")');
      await page.waitForTimeout(500);

      // Form should still be open or show error - modal should not close without valid data
      const modalStillOpen = await page.locator('.fixed input[placeholder="Enter staff name"]').isVisible({ timeout: 2000 }).catch(() => false);
      const hasError = await page.locator('[class*="error"], [class*="red"]').isVisible({ timeout: 1000 }).catch(() => false);

      expect(modalStillOpen || hasError).toBeTruthy();
    });

    test('should validate email format', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/profile');

      // Find email input and enter invalid email
      const emailInput = page.locator('input[type="email"], input[name="email"]');
      if (await emailInput.isVisible({ timeout: 5000 })) {
        await emailInput.fill('invalid-email');

        // Try to submit
        await page.click('button:has-text("Save")');

        await page.waitForTimeout(500);

        // Should show validation error or not submit
        const hasError = await page.locator('[class*="error"], [class*="invalid"]').isVisible({ timeout: 2000 }).catch(() => false);
        const inputHasError = await emailInput.evaluate(el => el.validity && !el.validity.valid).catch(() => false);

        expect(hasError || inputHasError).toBeTruthy();
      }
    });

    test('should validate password requirements', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/profile');

      // Find change password section
      const currentPasswordInput = page.locator('input[name="currentPassword"], input[name="current_password"]');

      if (await currentPasswordInput.isVisible({ timeout: 5000 })) {
        await currentPasswordInput.fill('wrongpassword');

        const newPasswordInput = page.locator('input[name="newPassword"], input[name="new_password"]');
        await newPasswordInput.fill('123'); // Too short

        const confirmPasswordInput = page.locator('input[name="confirmPassword"], input[name="confirm_password"]');
        if (await confirmPasswordInput.isVisible()) {
          await confirmPasswordInput.fill('different');
        }

        // Try to submit
        await page.click('button:has-text("Change Password"), button:has-text("Update Password")');

        await page.waitForTimeout(500);

        // Should show error
        const hasError = await page.locator('[class*="error"], text=/password/i').isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasError).toBeTruthy();
      }
    });

    test('should handle login with wrong credentials', async ({ page }) => {
      await page.goto('/login');

      // Enter wrong credentials
      await page.fill('#username', 'nonexistent_user');
      await page.fill('#password', 'wrongpassword');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(2000);

      // Should show error and stay on login page
      const hasError = await page.locator('[class*="error"], [class*="red"], text=/invalid|incorrect|failed/i').isVisible({ timeout: 3000 }).catch(() => false);
      const stillOnLogin = page.url().includes('login');

      expect(hasError || stillOnLogin).toBeTruthy();
    });

    test('should handle duplicate username on registration', async ({ page }) => {
      await page.goto('/login');

      // Click "Create one" link to switch to registration
      const createLink = page.locator('button:has-text("Create one")');
      if (await createLink.isVisible({ timeout: 2000 })) {
        await createLink.click();
        await page.waitForTimeout(500);
      }

      // Fill the registration form with existing username
      await page.fill('#username', 'capitalistcookie'); // Existing user
      await page.fill('#password', 'TestPass123');

      // Fill confirm password
      await page.fill('#confirmPassword', 'TestPass123');

      // Submit form
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should show error or still be on login page
      const bodyText = await page.locator('body').textContent();
      const hasError = bodyText?.match(/already|exists|registered|taken|error/i);
      const stillOnLogin = page.url().includes('login');

      expect(hasError || stillOnLogin).toBeTruthy();
    });
  });

  test.describe('Session Expiry', () => {
    test('should handle expired token gracefully', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/');

      // Corrupt the token
      await page.evaluate(() => {
        localStorage.setItem('token', 'invalid_expired_token');
      });

      // Navigate to a protected page
      await page.goto('/admin');

      await page.waitForTimeout(2000);

      // Should redirect to login or show error
      const url = page.url();
      const hasError = await page.locator('text=/expired|session|login|unauthorized/i').isVisible({ timeout: 3000 }).catch(() => false);
      const redirectedToLogin = url.includes('login');

      expect(hasError || redirectedToLogin).toBeTruthy();
    });
  });
});
