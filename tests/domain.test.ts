import { describe, it, expect } from 'vitest';
import {
  blankPlace,
  demoPlaces,
  demoCollections,
  duplicateOf,
  emptyFilters,
  filterPlaces,
  normalizeTags,
  placeSchema,
  priceSchema,
  priceText,
  safeUrl,
} from '../src/domain';
describe('Данные и фильтры', () => {
  it('нормализует и дедуплицирует теги', () =>
    expect(normalizeTags('  ГОРЫ, горы, вдвоём, , Кофе ')).toEqual(['горы', 'вдвоём', 'кофе']));
  it('OR внутри групп, AND между группами', () => {
    const f = {
      ...emptyFilters,
      countries: ['Италия', 'Германия'],
      collections: [demoCollections[1].id],
    };
    expect(filterPlaces(demoPlaces, f).map((p) => p.name)).toEqual(['Доломитовые Альпы']);
  });
  it('ищет по описанию, тегам и городу без учёта регистра', () => {
    expect(filterPlaces(demoPlaces, { ...emptyFilters, query: 'ВДВОЁМ' })).toHaveLength(1);
    expect(filterPlaces(demoPlaces, { ...emptyFilters, query: 'ШВАНГАУ' })).toHaveLength(1);
    expect(filterPlaces(demoPlaces, { ...emptyFilters, query: 'скальные' })).toHaveLength(1);
  });
  it('сочетает посещение и избранное', () =>
    expect(
      filterPlaces(demoPlaces, { ...emptyFilters, status: 'visited', favorite: true }),
    ).toHaveLength(0));
  it('сравнивает бюджеты только в одной валюте', () => {
    const p = {
      ...demoPlaces[0],
      price: {
        amount_min: 100,
        currency: 'EUR',
        unit: 'night' as const,
        source_url: '',
        checked_at: null,
      },
    };
    expect(filterPlaces([p], { ...emptyFilters, maxBudget: '150', currency: 'EUR' })).toHaveLength(
      1,
    );
    expect(filterPlaces([p], { ...emptyFilters, maxBudget: '150', currency: 'USD' })).toHaveLength(
      0,
    );
    expect(filterPlaces([p], { ...emptyFilters, maxBudget: '50', currency: 'EUR' })).toHaveLength(
      0,
    );
  });
  it('проверяет границы координат и обязательные поля', () => {
    const p = { ...blankPlace(), name: 'Точка', country: 'Мир' };
    expect(placeSchema.safeParse(p).success).toBe(true);
    for (const bad of [
      { lat: 91 },
      { lng: -181 },
      { name: '' },
      { country: '' },
      { lat: NaN },
      { lat: '' },
      { lng: '' },
    ])
      expect(placeSchema.safeParse({ ...p, ...bad }).success).toBe(false);
  });
  it('отклоняет опасные ссылки', () => {
    for (const u of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com',
      'https://u:pass@example.com',
      'not url',
    ])
      expect(safeUrl(u)).toBe(false);
    expect(safeUrl('https://example.com/path?q=yes')).toBe(true);
    expect(
      placeSchema.safeParse({ ...demoPlaces[0], website_url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
  it('не допускает отрицательных цен, выдуманных валют и обратного диапазона', () => {
    const p = { amount_min: 100, currency: 'EUR', unit: 'night', source_url: '', checked_at: null };
    expect(priceSchema.safeParse(p).success).toBe(true);
    for (const bad of [{ amount_min: -1 }, { amount_max: 50 }, { currency: 'ZZZ' }])
      expect(priceSchema.safeParse({ ...p, ...bad }).success).toBe(false);
    expect(priceText(null)).toBe('Не указана');
    expect(priceText(p as Parameters<typeof priceText>[0])).toContain('за ночь');
  });
  it('выявляет близкие дубли, исключает саму запись и далёкие одноимённые места', () => {
    const p = { ...demoPlaces[0], id: 'new', name: ' ДОЛОМИТОВЫЕ АЛЬПЫ ' };
    expect(duplicateOf(p, demoPlaces)?.id).toBe(demoPlaces[0].id);
    expect(duplicateOf(demoPlaces[0], demoPlaces)).toBeUndefined();
    expect(duplicateOf({ ...p, lat: -20 }, demoPlaces)).toBeUndefined();
  });
});
