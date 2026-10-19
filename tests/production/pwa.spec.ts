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
  await page.route('**/map-ru.json', (route) => route.abort());
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
  await page.route('**/map-ru.json', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.map-dot')).toHaveCount(5);
  await expect(page.locator('.leaflet-atlas-base-pane path')).not.toHaveCount(0);
  await expect(page.locator('.map-labels .country').first()).toBeVisible();
});
test('production CSP: локальный worker векторной карты загружается и обрабатывает геоданные', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/map-ru.json', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          sample: {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'Point', coordinates: [12, 28] },
                },
              ],
            },
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#c3dce2' } },
          {
            id: 'sample',
            type: 'circle',
            source: 'sample',
            paint: { 'circle-radius': 8, 'circle-color': '#356b5d' },
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.vector-map-host')).toHaveAttribute('aria-busy', 'false', {
    timeout: 20000,
  });
  await expect(page.locator('.vector-map-host .map-dot')).toHaveCount(5);
  expect(errors).toEqual([]);
});
