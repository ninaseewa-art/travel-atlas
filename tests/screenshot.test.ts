import { describe, expect, it, vi, afterEach } from 'vitest';
import { extractScreenshot, searchLocations } from '../src/screenshot';
afterEach(() => vi.unstubAllGlobals());
describe('Извлечение полей из OCR — только кандидаты', () => {
  it('отделяет названия от UI, ссылок и цены', () => {
    const result = extractScreenshot(
      'Instagram\nHOTEL AURORA\nLake Como, Italy\n190 EUR per night\nwww.aurora.example\nShare',
    );
    expect(result.names).toEqual(['HOTEL AURORA', 'Lake Como, Italy']);
    expect(result.prices).toEqual([
      { amount_min: 190, currency: 'EUR', unit: 'night', checked_at: null, source_url: '' },
    ]);
    expect(result.websites).toEqual(['https://www.aurora.example']);
    expect(result.category).toBe('hotels');
    expect(result).not.toHaveProperty('lat');
    expect(result).not.toHaveProperty('lng');
  });
  it('поддерживает русские цены, десятичные и разделители тысяч', () => {
    const r = extractScreenshot('Отель у озера\n12 500 ₽ за ночь\n1.234,56 EUR\nUSD 1,234.56');
    expect(r.prices.map((p) => p.amount_min)).toEqual([12500, 1234.56, 1234.56]);
    expect(r.prices[0].currency).toBe('RUB');
  });
  it('не угадывает валюту по неоднозначным $ или ¥', () => {
    const r = extractScreenshot('$200 per night\n300 ¥');
    expect(r.prices.map((p) => p.currency)).toEqual(['', '']);
  });
  it('пустой текст не создаёт фиктивные данные, опасные URL не попадают в поля', () => {
    expect(extractScreenshot('')).toEqual({
      names: [],
      prices: [],
      websites: [],
      category: undefined,
    });
    expect(
      extractScreenshot('javascript:alert(1)\nhttps://user:pass@example.com').websites,
    ).toEqual([]);
  });
  it('без результатов поиска возвращает пустой список, не координаты по умолчанию', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const result = await searchLocations('No place ' + Date.now(), new AbortController().signal);
    expect(result).toEqual([]);
  });
  it('отбрасывает некорректные координаты и соблюдает лимит поиска', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5000000000000);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { place_id: 1, lat: '99', lon: '1', display_name: 'Invalid', address: {} },
        {
          place_id: 2,
          lat: '46',
          lon: '9',
          display_name: 'Lake Como, Italy',
          address: { country: 'Италия', town: 'Комо' },
        },
      ],
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await searchLocations('Aurora confirmed', new AbortController().signal);
    expect(result).toHaveLength(1);
    expect(result[0].country).toBe('Италия');
    await expect(searchLocations('Other place', new AbortController().signal)).rejects.toThrow(
      'секунду',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
