import { test, expect } from '@playwright/test';
const openImporter = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('button', { name: 'Добавить место', exact: true }).click();
  await page.getByRole('button', { name: 'По скриншоту', exact: true }).click();
};
test('настоящий OCR в браузере: выбор полей, подтверждение точки и отсутствие передачи изображения', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const posts: string[] = [],
    errors: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://nominatim.openstreetmap.org/search?**', (route) =>
    route.fulfill({
      json: [
        {
          place_id: 22,
          lat: '46.01',
          lon: '9.25',
          display_name: 'Aurora, Como, Italia',
          address: { country: 'Италия', town: 'Комо' },
        },
      ],
    }),
  );
  await openImporter(page);
  await page
    .getByLabel('Выбрать скриншот', { exact: true })
    .setInputFiles('tests/fixtures/screenshot.png');
  await expect(page.getByLabel('Текст со скриншота', { exact: true })).toHaveValue(
    /HOTEL AURORA/i,
    { timeout: 90000 },
  );
  await expect(page.getByLabel('Подтвердите название места', { exact: true })).toHaveValue(
    /HOTEL AURORA/i,
  );
  await page.getByLabel('Цена со скриншота', { exact: true }).selectOption('0');
  await page.getByLabel('Название и город для поиска на карте').fill('Hotel Aurora, Como');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByRole('button', { name: /Aurora, Como, Italia/ })).toBeVisible();
  await page.getByRole('button', { name: /Aurora, Como, Italia/ }).click();
  await page.getByRole('button', { name: /Проверить карточку/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Название *', { exact: true })).toHaveValue(/HOTEL AURORA/i);
  await expect(dialog.getByLabel('Широта *', { exact: true })).toHaveValue('46.01');
  await expect(dialog.getByLabel('Страна *', { exact: true })).toHaveValue('Италия');
  await expect(dialog.getByLabel('Категория', { exact: true })).toHaveValue('hotels');
  await expect(dialog.getByLabel('От', { exact: true })).toHaveValue('190');
  await expect(dialog.getByLabel('Единица', { exact: true })).toHaveValue('night');
  await expect(dialog.getByRole('button', { name: 'Сохранить место' })).toBeDisabled();
  await page.screenshot({
    path: `test-results/${info.project.name}-screenshot-import.png`,
    fullPage: true,
  });
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});
test('ручное подтверждение текста не придумывает координаты и без результатов поиска доступна карта', async ({
  page,
}) => {
  await page.route('https://nominatim.openstreetmap.org/search?**', (route) =>
    route.fulfill({ json: [] }),
  );
  await openImporter(page);
  await page.getByLabel('Текст со скриншота', { exact: true }).fill('Музей мечты\nЦена $200');
  await page.getByLabel('Подтвердите название места', { exact: true }).fill('Музей мечты');
  await page.getByLabel('Название и город для поиска на карте').fill('Музей мечты');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByText(/Ничего не найдено/)).toBeVisible();
  await page.getByLabel('Цена со скриншота', { exact: true }).selectOption('0');
  await expect(page.getByRole('button', { name: /Проверить карточку/ })).toBeDisabled();
  await page.getByLabel('Валюта цены', { exact: true }).selectOption('USD');
  await page.getByRole('button', { name: /Проверить карточку/ }).click();
  await expect(page.getByLabel('Широта *', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Долгота *', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: /Выбрать координаты на карте/ }).click();
  await expect(page.locator('.picker .leaflet-host')).toBeVisible();
});
test('неверный формат файла показывает ошибку, форма остаётся доступной', async ({ page }) => {
  await openImporter(page);
  await page
    .getByLabel('Выбрать скриншот', { exact: true })
    .setInputFiles({ name: 'fake.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('Поддерживаются');
  await expect(page.getByLabel('Текст со скриншота')).toBeVisible();
});
test('при ошибке языковой модели импорт не зависает, ручной ввод остаётся доступным', async ({
  page,
}) => {
  await page.route('**/ocr/lang/*.traineddata.gz', (route) => route.abort());
  await openImporter(page);
  await page
    .getByLabel('Выбрать скриншот', { exact: true })
    .setInputFiles('tests/fixtures/screenshot.png');
  await expect(page.getByRole('alert')).toContainText('распознавание', { timeout: 15000 });
  await expect(page.getByLabel('Текст со скриншота', { exact: true })).toBeVisible();
  await page.getByLabel('Подтвердите название места', { exact: true }).fill('Вручную после ошибки');
  await page.getByRole('button', { name: /Проверить карточку/ }).click();
  await expect(page.getByLabel('Название *', { exact: true })).toHaveValue('Вручную после ошибки');
});
