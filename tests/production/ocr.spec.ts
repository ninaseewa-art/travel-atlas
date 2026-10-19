import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test('локальный OCR работает с production CSP без unsafe-eval и внешних запросов', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90000);
  const requests: string[] = [],
    errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto('/');
  expect(response!.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'");
  expect(response!.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  await page.getByRole('button', { name: /Посмотреть демонстрационный/ }).click();
  await page.getByRole('button', { name: 'Добавить место', exact: true }).click();
  await page.getByRole('button', { name: 'По скриншоту', exact: true }).click();
  await page
    .getByLabel('Выбрать скриншот', { exact: true })
    .setInputFiles('tests/fixtures/screenshot.png');
  await expect(page.getByLabel('Текст со скриншота', { exact: true })).toHaveValue(
    /HOTEL AURORA/i,
    { timeout: 60000 },
  );
  expect(
    requests.every((u) => u.startsWith(baseURL!) || u.startsWith('blob:') || u.startsWith('data:')),
  ).toBe(true);
  expect(errors).toEqual([]);
});
