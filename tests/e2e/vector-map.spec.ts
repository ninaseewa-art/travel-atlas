import { test, expect } from '@playwright/test';
test('векторная карта запускается, показывает метки и открывает сохранённое место', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // No third-party network needed to exercise MapLibre's real WebGL lifecycle and DOM markers.
  await page.route('**/map-ru.json', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#c3dce2' } },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.vector-map-host .map-dot')).toHaveCount(5);
  await page
    .locator('.vector-map-host')
    .getByRole('button', { name: 'Опера Гарнье', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Опера Гарнье' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.getByRole('main').getByRole('button', { name: 'Глобус', exact: true }).click();
  await expect(page.getByRole('region', { name: /3D-глобус/ })).toBeVisible();
  expect(errors).toEqual([]);
});
