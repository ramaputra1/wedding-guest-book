/**
 * Signing in with a PIN (owner request before go-live): the field asks for
 * the PIN and brings up the number pad, a wrong PIN says so, and the server's
 * guess limit is shown in its own words (tests/login-lock.spec.ts proves it).
 */
import { expect, test } from '@playwright/test';

test('the sign-in asks for the PIN, shows the number pad, and says when it is wrong', async ({ page }) => {
  await page.goto('/ipad1');
  await expect(page.getByLabel('Enter the PIN')).toBeVisible();
  await expect(page.locator('#passphrase')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#passphrase')).toHaveAttribute('type', 'password');

  await page.locator('#passphrase').fill('000000');
  await page.keyboard.press('Enter');
  await expect(page.locator('.sign-in__problem')).toHaveText("That PIN didn't match. Check it and try again.");
  await expect(page.locator('#passphrase')).toHaveAttribute('aria-invalid', 'true');
});

test('when the server is holding sign-ins, the page says how long to wait', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'retry-after': '600' },
      body: JSON.stringify({ code: 'too_many_attempts', message: 'Too many wrong tries. Try again in 10 minutes.' }),
    }),
  );
  await page.goto('/ipad2');
  await page.locator('#passphrase').fill('191226');
  await page.keyboard.press('Enter');
  await expect(page.locator('.sign-in__problem')).toHaveText('Too many wrong tries. Try again in 10 minutes.');
});
