import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
const login = async (page: Page, n = 1) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Пароль', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(process.env[`ATLAS_TEST_OWNER${n}_EMAIL`]!);
  await page
    .getByLabel('Пароль', { exact: true })
    .fill(process.env[`ATLAS_TEST_OWNER${n}_PASSWORD`]!);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Весь мир перед нами.' })).toBeVisible();
};
test('реальные Auth + CRUD + фото + две коллекции + посещение + reload + второй владелец', async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.getByRole('button', { name: 'Добавить место' }).click();
  const form = page.getByRole('dialog');
  const name = `Тестовое место ${info.project.name}`;
  await form.getByLabel('Название *', { exact: true }).fill(name);
  await form.getByLabel('Страна *', { exact: true }).fill('Италия');
  await form.getByLabel('Город', { exact: true }).fill('Рим');
  await form.getByLabel('Широта *', { exact: true }).fill('41.9028');
  await form.getByLabel('Долгота *', { exact: true }).fill('12.4964');
  await form.getByLabel('Категория', { exact: true }).selectOption('castles');
  await form.getByLabel('Теги через запятую').fill('горы, вдвоём');
  await form.getByText('Замки', { exact: true }).click();
  await form.getByText('Романтические места', { exact: true }).click();
  await form.getByRole('button', { name: 'Сохранить место' }).click();
  const detail = page.getByRole('dialog', { name });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('#вдвоём', { exact: true })).toBeVisible();
  await expect(detail.getByText('Романтические места', { exact: true })).toBeVisible();
  await detail.locator('input[type=file]').setInputFiles('public/icons/icon-192.png');
  await expect(detail.locator('.photo-strip img')).toHaveCount(1);
  await detail.getByLabel('Дата посещения', { exact: true }).fill('2026-10-01');
  await detail.getByRole('button', { name: 'Мы здесь были' }).click();
  await expect(detail.locator('.status-pill')).toContainText('Уже были');
  await detail.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Личные заметки')
    .fill('Сохранено в настоящем PostgreSQL');
  await page.getByRole('button', { name: 'Сохранить место' }).click();
  await expect(page.getByText('Сохранено в настоящем PostgreSQL')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.reload();
  await page.getByRole('textbox', { name: 'Поиск мест' }).fill(name);
  await page.locator('.place-open').first().click();
  await expect(page.getByText('Сохранено в настоящем PostgreSQL')).toBeVisible();
  await expect(page.locator('.photo-strip img')).toHaveCount(1);
  const context2 = await browser.newContext();
  const second = await context2.newPage();
  await login(second, 2);
  await second.getByRole('textbox', { name: 'Поиск мест' }).fill(name);
  await expect(second.locator('.place-card')).toHaveCount(1);
  await second.locator('.place-open').first().click();
  await expect(second.getByText('Сохранено в настоящем PostgreSQL')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Личные заметки')
    .fill('Изменено вдвоём без перезагрузки');
  await page.route('**/rest/v1/rpc/save_place', (route) => route.abort());
  await page.getByRole('button', { name: 'Сохранить место' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.unroute('**/rest/v1/rpc/save_place');
  await page.getByRole('button', { name: 'Сохранить место' }).click();
  await expect(second.getByText('Изменено вдвоём без перезагрузки')).toBeVisible({
    timeout: 75000,
  });
  await context2.close();
  await page.screenshot({ path: `test-results/${info.project.name}-saved.png`, fullPage: true });
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page
    .getByRole('button', {
      name: info.project.name.includes('iphone') ? 'Ещё' : 'Настройки',
      exact: true,
    })
    .click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт всех записей в JSON' }).click();
  const file = await downloaded;
  const backup = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(backup.places.some((p: { name: string }) => p.name === name)).toBe(true);
  expect(backup.photos.length).toBe(1);
  expect(backup.categories.length).toBe(24);
  expect(backup.memberships.length).toBe(2);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('.place-open').first().click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Удалить место', exact: true }).click();
  await expect(page.getByRole('dialog', { name })).toHaveCount(0);
  await expect(page.locator('.place-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('скриншот: настоящий OCR → проверенная карточка → приватный файл → сохранение после reload', async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page);
  await page.getByRole('button', { name: 'Добавить место', exact: true }).click();
  await page.getByRole('button', { name: 'По скриншоту', exact: true }).click();
  await page
    .getByLabel('Выбрать скриншот', { exact: true })
    .setInputFiles('tests/fixtures/screenshot.png');
  await expect(page.getByLabel('Текст со скриншота', { exact: true })).toHaveValue(
    /HOTEL AURORA/i,
    { timeout: 60000 },
  );
  await page.getByLabel('Цена со скриншота', { exact: true }).selectOption('0');
  await page.getByRole('checkbox', { name: /Сохранить скриншот в приватной карточке/ }).check();
  await page.getByRole('checkbox', { name: /Добавить распознанный текст/ }).check();
  await page.getByRole('button', { name: /Проверить карточку/ }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Широта *', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('Долгота *', { exact: true })).toHaveValue('');
  await form.getByLabel('Страна *', { exact: true }).fill('Италия');
  await form.getByLabel('Широта *', { exact: true }).fill('46.01');
  await form.getByLabel('Долгота *', { exact: true }).fill('9.25');
  await form.getByRole('button', { name: 'Сохранить место' }).click();
  const detail = page.getByRole('dialog', { name: /HOTEL AURORA/ });
  await expect(detail).toBeVisible();
  await expect(detail.locator('.photo-strip img')).toHaveCount(1);
  await expect(detail.getByRole('heading', { name: /за ночь/ })).toBeVisible();
  await expect(detail.getByText(/Дата проверки не указана/)).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await page.reload();
  await page.getByRole('textbox', { name: 'Поиск мест' }).fill('HOTEL AURORA');
  await page.locator('.place-open').first().click();
  await expect(page.locator('.photo-strip img')).toHaveCount(1);
  await expect(page.getByText('Скриншот, добавленный владельцем', { exact: true })).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Удалить место', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(0);
});
test('личный ключ GPT, готовая карточка через API и отзыв доступа', async ({ page }, info) => {
  await login(page);
  const settings = () =>
    page
      .getByRole('button', {
        name: info.project.name.includes('iphone') ? 'Ещё' : 'Настройки',
        exact: true,
      })
      .click();
  await settings();
  await page.getByRole('button', { name: 'Создать ключ подключения', exact: true }).click();
  const key = page.getByLabel('Ключ для поля API Key в настройках Actions');
  await expect(key).toBeVisible();
  await expect(key).toHaveAttribute('type', 'password');
  const token = await key.inputValue();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать схему Actions' }).click();
  const schema = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(schema.servers[0].url).toBe(process.env.ATLAS_TEST_URL + '/functions/v1/atlas-gpt');
  const { createHandler } = await import('../../supabase/functions/atlas-gpt/index');
  const handler = createHandler({
    url: process.env.ATLAS_TEST_URL!,
    key: process.env.ATLAS_TEST_ANON_KEY!,
  });
  const name = 'Замок из GPT ' + info.project.name;
  const response = await handler(
    new Request('https://local/functions/v1/atlas-gpt/places', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        place: {
          name,
          country: 'Германия',
          lat: 47.5576,
          lng: 10.7498,
          primary_category: 'castles',
          description:
            'О месте\nГотовое описание\nОсобенности\nАрхитектура\nАтмосфера\nВозможное ощущение сказки',
          tags: ['замок'],
        },
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).saved).toBe(true);
  await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск мест' }).fill(name);
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page.locator('.place-open').click();
  await expect(page.getByRole('dialog', { name })).toContainText('Возможное ощущение сказки');
  await page.getByRole('button', { name: 'Закрыть карточку' }).click();
  await settings();
  await expect(page.getByLabel('Ключ для поля API Key в настройках Actions')).toHaveCount(0);
  await page.getByRole('button', { name: 'Отключить доступ GPT', exact: true }).click();
  await expect(
    page.getByText('Доступ GPT отключён. Сохранённые места остались в атласе.'),
  ).toBeVisible();
  const revoked = await handler(
    new Request('https://local/functions/v1/atlas-gpt/places', {
      headers: { authorization: 'Bearer ' + token },
    }),
  );
  expect(revoked.status).toBe(401);
});
