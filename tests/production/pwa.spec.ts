import { test, expect } from '@playwright/test';
test('production PWA: manifest, иконки, service worker, оболочка и базовая карта без сети', async ({
  page,
  context,
  request,
}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.name).toBe('Наш атлас');
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.ok()).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto('/collections');
  await expect(page.getByRole('button', { name: /Посмотреть демонстрационный/ })).toBeVisible();
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await expect(
    page.getByText('Нет сети. Просмотр загруженных данных; изменения недоступны.'),
  ).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.map-dot')).toHaveCount(5);
  await expect(page.locator('.leaflet-atlas-base-pane path')).not.toHaveCount(0);
  await expect(page.locator('.map-labels .country').first()).toBeVisible();
});
