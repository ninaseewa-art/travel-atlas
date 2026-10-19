import { safeUrl } from './domain';
import type { Price } from './domain';
export interface ScreenshotSuggestions {
  names: string[];
  prices: (Omit<Price, 'currency'> & { currency: string })[];
  websites: string[];
  category?: string;
}
const amountNumber = (raw: string) => {
  let value = raw.replace(/[\s\u00a0]/g, '');
  if (value.includes(',') && value.includes('.')) {
    const decimal = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.';
    value = value.replace(decimal === ',' ? /\./g : /,/g, '').replace(',', '.');
  } else if (/[.,]\d{3}$/.test(value)) value = value.replace(/[.,]/g, '');
  else value = value.replace(',', '.');
  return Number(value);
};
const symbolCurrency: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '₽': 'RUB',
  $: '',
  '¥': '',
};
/** Suggestions only: no coordinates, no current-price claims, no remote calls. */
export function extractScreenshot(text: string): ScreenshotSuggestions {
  const clean = text.slice(0, 20000).replace(/\r/g, '');
  const lines = clean
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const names = [
    ...new Set(
      lines.filter(
        (l) =>
          l.length >= 3 &&
          l.length <= 160 &&
          /[\p{L}]{3}/u.test(l) &&
          !/^(?:\d{1,2}:\d{2}|instagram|facebook|tiktok|подписаться|поделиться|сохранить|follow|share|save|book now|забронировать)$/i.test(
            l,
          ) &&
          !/(?:https?:\/\/|www\.|@|\b(?:EUR|USD|RUB|GBP|CHF|JPY|CNY|AED|ZAR)\b|[€$£₽¥])/i.test(l),
      ),
    ),
  ].slice(0, 8);
  const prices: ScreenshotSuggestions['prices'] = [];
  const pattern =
    /(?:(EUR|USD|RUB|GBP|CHF|JPY|CNY|AED|ZAR|[€$£₽¥])\s*(\d(?:[\d\s.,]*\d)?)|(\d(?:[\d\s.,]*\d)?)\s*(EUR|USD|RUB|GBP|CHF|JPY|CNY|AED|ZAR|[€$£₽¥]))/gi;
  for (const line of lines) {
    for (const match of line.matchAll(pattern)) {
      const code = (match[1] || match[4]).toUpperCase();
      const amount = amountNumber(match[2] || match[3]);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) continue;
      prices.push({
        amount_min: amount,
        currency: code in symbolCurrency ? symbolCurrency[code] : code,
        unit: /(?:per\s+night|\/\s*night|за\s+ночь|ноч[ьиь])/i.test(line)
          ? 'night'
          : /(?:ticket|билет)/i.test(line)
            ? 'ticket'
            : 'visit',
        source_url: '',
        checked_at: null,
      });
      if (prices.length >= 5) break;
    }
    if (prices.length >= 5) break;
  }
  const websites = [
    ...new Set(
      (clean.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [])
        .map((s) => {
          const url = s.replace(/[).,;!?]+$/, '');
          return url.startsWith('www.') ? `https://${url}` : url;
        })
        .filter(safeUrl),
    ),
  ].slice(0, 5);
  const category = /\b(hotel|hôtel|resort)\b|отел[ьяи]|гостиниц/i.test(clean)
    ? 'hotels'
    : /\b(museum|musée)\b|музе[йя]/i.test(clean)
      ? 'museums'
      : /\b(theatre|theater)\b|театр/i.test(clean)
        ? 'theatres'
        : /\b(castle|palace)\b|замок|дворец/i.test(clean)
          ? 'castles'
          : undefined;
  return { names, prices, websites, category };
}
export interface LocationCandidate {
  id: string;
  label: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  region: string;
  address: string;
}
let lastSearch = 0;
const cache = new Map<string, LocationCandidate[]>();
/** Explicit user-triggered requests only, no autocomplete. No screenshot or OCR text is sent. */
export async function searchLocations(
  query: string,
  signal: AbortSignal,
): Promise<LocationCandidate[]> {
  const q = query.trim();
  if (q.length < 3 || q.length > 200)
    throw new Error('Введите название и город: от 3 до 200 символов.');
  const cached = cache.get(q);
  if (cached) return cached;
  if (Date.now() - lastSearch < 1200) throw new Error('Подождите секунду перед следующим поиском.');
  lastSearch = Date.now();
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'ru',
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
    referrerPolicy: 'strict-origin',
  });
  if (!r.ok)
    throw new Error('Поиск карты сейчас недоступен. Выберите координаты вручную в карточке.');
  const data: unknown = await r.json();
  if (!Array.isArray(data))
    throw new Error('Некорректный ответ карты. Выберите координаты вручную.');
  const locations: LocationCandidate[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const a = item.address ?? {},
      lat = Number(item.lat),
      lng = Number(item.lon);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180 ||
      typeof item.display_name !== 'string'
    )
      continue;
    locations.push({
      id: String(item.place_id),
      label: item.display_name.slice(0, 1000),
      lat,
      lng,
      country: String(a.country ?? '').slice(0, 100),
      city: String(a.city ?? a.town ?? a.village ?? '').slice(0, 200),
      region: String(a.state ?? '').slice(0, 200),
      address: item.display_name.slice(0, 500),
    });
  }
  if (cache.size >= 30) cache.delete(cache.keys().next().value!);
  cache.set(q, locations);
  return locations;
}
