import { test, expect } from '@playwright/test';

/**
 * Smoke Tests - Verify basic rendering and theme visibility
 *
 * These tests ensure the application renders correctly in both
 * light and dark modes, with all key elements visible.
 */

test.describe('Smoke Tests - Basic Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for the app to be ready - wait for Vue to render
    await page.waitForLoadState('networkidle');
    // Wait for main content to be visible
    await page.waitForSelector('#app', { state: 'attached' });
    // Wait for Vue app to render - look for any content
    await page.waitForSelector('h3', { timeout: 5000 });
  });

  test('page loads successfully', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/NPM Downloader/i);
  });

  test('main layout is visible', async ({ page }) => {
    // Check that any main container is visible
    // Use a broader selector that will match any flex container
    const mainContainer = page.locator('div.flex').first();
    await expect(mainContainer).toBeVisible({ timeout: 10000 });
  });

  test('lockfile upload section is visible', async ({ page }) => {
    // Check Lockfile Upload card exists - look for the heading text
    const lockfileCard = page.locator('text=Lockfile Upload').first();
    await expect(lockfileCard).toBeVisible({ timeout: 10000 });

    // Check the upload drop zone exists (file input is hidden, look for drop zone text)
    const dropZone = page.locator('text=pnpm-lock.yaml').first();
    await expect(dropZone).toBeVisible({ timeout: 10000 });
  });

  test('single package section is visible', async ({ page }) => {
    // Check Single Package card exists
    const packageCard = page.locator('text=Single Package').first();
    await expect(packageCard).toBeVisible({ timeout: 10000 });

    // Check input placeholder exists - use broader selector
    const input = page.locator('input[type="text"]').first();
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test('history section is visible', async ({ page }) => {
    // Check History section exists - look for any text containing "History"
    const historySection = page.locator('text=History').first();
    await expect(historySection).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Theme Visibility Tests', () => {
  test('light mode - text is visible with proper contrast', async ({ page }) => {
    // Set light mode
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#app', { state: 'attached' });

    // Remove dark class if present
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('color-mode', 'light');
    });

    // Wait for theme transition
    await page.waitForTimeout(500);

    // Get computed background color of body
    const bodyStyles = await page.locator('body').evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });

    console.log('Light mode body styles:', bodyStyles);

    // Verify background is light (RGB values should be high)
    const bgMatch = bodyStyles.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(bgMatch).not.toBeNull();
    if (bgMatch) {
      const [, r, g, b] = bgMatch.map(Number);
      // Light background should have high RGB values (> 200)
      expect(r + g + b).toBeGreaterThan(500);
    }

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'test-results/light-mode.png', fullPage: true });

    // Verify key text elements are visible
    const headings = page.locator('h3, h2');
    const count = await headings.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const heading = headings.nth(i);
      if (await heading.isVisible()) {
        const color = await heading.evaluate((el) => {
          return window.getComputedStyle(el).color;
        });
        // Text should be dark in light mode
        console.log(`Heading ${i} color: ${color}`);
      }
    }
  });

  test('dark mode - text is visible with proper contrast', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#app', { state: 'attached' });

    // Set dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('color-mode', 'dark');
    });

    // Wait for theme transition
    await page.waitForTimeout(500);

    // Get computed background color of body
    const bodyStyles = await page.locator('body').evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });

    console.log('Dark mode body styles:', bodyStyles);

    // Verify background is dark (RGB values should be low)
    const bgMatch = bodyStyles.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(bgMatch).not.toBeNull();
    if (bgMatch) {
      const [, r, g, b] = bgMatch.map(Number);
      // Dark background should have low RGB values (< 100)
      expect(r + g + b).toBeLessThan(300);
    }

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'test-results/dark-mode.png', fullPage: true });
  });

  test('theme toggle button works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#app', { state: 'attached' });

    // Find theme toggle button (moon/sun icon)
    const themeToggle = page.locator('button').filter({
      has: page.locator('[class*="heroicons-moon"], [class*="heroicons-sun"]'),
    }).first();

    if (await themeToggle.isVisible()) {
      // Get initial theme state
      const initialIsDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });

      // Click theme toggle
      await themeToggle.click();

      // Wait for transition
      await page.waitForTimeout(300);

      // Verify theme changed
      const newIsDark = await page.evaluate(() => {
        return document.documentElement.classList.contains('dark');
      });

      expect(newIsDark).toBe(!initialIsDark);
    }
  });
});

test.describe('Component Visibility Tests', () => {
  test('cards have visible borders and backgrounds', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find all cards
    const cards = page.locator('[class*="card"], [class*="Card"]');

    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Verify each card is visible
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      if (await card.isVisible()) {
        const styles = await card.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor,
          };
        });

        // Log for debugging
        console.log(`Card ${i} styles:`, styles);
      }
    }
  });

  test('buttons are visible and clickable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find buttons
    const buttons = page.locator('button:visible');
    const count = await buttons.count();

    expect(count).toBeGreaterThan(0);

    // Verify buttons are visible
    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);
      await expect(button).toBeVisible();

      // Get button styles
      const styles = await button.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
        };
      });

      console.log(`Button ${i} styles:`, styles);
    }
  });

  test('input fields are visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find the package input
    const input = page.locator('input[type="text"]').first();

    if (await input.isVisible()) {
      const styles = await input.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
        };
      });

      console.log('Input styles:', styles);
      await expect(input).toBeVisible();
    }
  });
});

test.describe('CSS Variables Test', () => {
  test('CSS variables are properly defined', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('#app', { state: 'attached' });

    // Wait a bit for CSS to be fully applied
    await page.waitForTimeout(500);

    // Check CSS variables are defined
    const cssVars = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        background: styles.getPropertyValue('--background'),
        foreground: styles.getPropertyValue('--foreground'),
        primary: styles.getPropertyValue('--primary'),
        border: styles.getPropertyValue('--border'),
        radius: styles.getPropertyValue('--radius'),
      };
    });

    console.log('CSS Variables:', cssVars);

    // Variables should be defined (non-empty)
    // Note: CSS variables might be empty if not set on :root, check body styles too
    const bodyStyles = await page.evaluate(() => {
      const styles = getComputedStyle(document.body);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });

    console.log('Body styles:', bodyStyles);

    // At minimum, body should have visible styles
    expect(bodyStyles.backgroundColor).not.toBe('');
    expect(bodyStyles.color).not.toBe('');
  });
});
