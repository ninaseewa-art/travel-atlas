import { test, expect } from '@playwright/test';
test('честная настройка, демо, поиск, фильтры и мобильная карточка', async ({ page }, info) => {
  await page.route('**/map-ru.json', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Мир большой. Мечты — общие.' })).toBeVisible();
  await expect(page.getByText('Данные не сохраняются, пока база не подключена.')).toBeVisible();
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await expect(page.getByText(/Демонстрационные места/)).toBeVisible();
  await page.getByRole('button', { name: 'Карта', exact: true }).first().click();
  await expect(page.locator('.leaflet-host')).toBeVisible();
  await page.getByRole('button', { name: 'Все места', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Поиск мест' }).fill('доломит');
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page.locator('.place-open').first().click();
  await expect(page.getByRole('dialog', { name: 'Доломитовые Альпы' })).toBeVisible();
  await expect(page.getByText('Не указана', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактировать', exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/${info.project.name}-detail.png`, fullPage: true });
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await page.getByRole('button', { name: /Фильтры/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Замки', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Показать 1 мест' }).click();
  await expect(page.locator('.place-card')).toHaveCount(1);
  await expect(page.locator('.place-card')).toContainText('Нойшванштайн');
  await page.reload();
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await expect(page.getByText('Фильтры применены')).toBeVisible();
});
test('без WebGL и без тайлов остаётся карта и доступ к местам', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/map-ru.json', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await expect(page.locator('.leaflet-host')).toBeVisible();
  await expect(page.getByText('Базовая карта · названия на русском')).toBeVisible();
  await expect(page.locator('.map-dot')).toHaveCount(5);
});
test('3D-глобус загружает локальную Землю и не ломает страницу', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/map-ru.json', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('region', { name: /3D-глобус/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `test-results/${info.project.name}-globe.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('названия стран и городов доступны на глобусе и без тайлов', async ({ page }, info) => {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/map-ru.json', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  const toggle = page.getByRole('button', { name: 'Названия', exact: true });
  await expect(page.locator('.globe-labels .country').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.globe-labels')).toContainText('Алжир');
  await toggle.click();
  await expect(page.locator('.globe-labels')).toHaveCount(0);
  await toggle.click();
  await expect(page.locator('.globe-labels .country').first()).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-geographic-globe.png`,
    fullPage: true,
  });
  const globe = page.getByRole('region', { name: /3D-глобус/ });
  await globe.focus();
  for (let i = 0; i < 6; i++) {
    await globe.press('+');
    // Each keyboard zoom animates for 200 ms; let it finish before the next step.
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.globe-labels .city').first()).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.getByText('Базовая карта · названия на русском')).toBeVisible();
  await expect(page.locator('.map-labels .country').first()).toBeVisible();
  const map = page.locator('.leaflet-host');
  // Zoom into a visible map region; more city labels become available as the scale increases.
  await page.getByRole('button', { name: 'Приблизить', exact: true }).click();
  await expect(page.locator('.map-labels .city').first()).toBeVisible();
  await expect(map).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-geographic-map.png`,
    fullPage: true,
  });
});
