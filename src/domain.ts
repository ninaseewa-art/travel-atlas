import { z } from 'zod';
export const categories = [
  ['hotels', 'Отели и проживание', '⌂'],
  ['restaurants', 'Рестораны и кафе', '☕'],
  ['theatres', 'Театры', '◈'],
  ['opera', 'Оперные театры', '♫'],
  ['ballet', 'Балет', '✧'],
  ['museums', 'Музеи', '▥'],
  ['galleries', 'Галереи и выставки', '▣'],
  ['libraries', 'Библиотеки', '▤'],
  ['castles', 'Замки и дворцы', '♜'],
  ['architecture', 'Архитектура', '⌂'],
  ['history', 'Исторические места', '◷'],
  ['nature', 'Природа', '❋'],
  ['mountains', 'Горы', '△'],
  ['waterfalls', 'Водопады', '≋'],
  ['lakes', 'Озёра', '≈'],
  ['beaches', 'Пляжи', '☀'],
  ['gardens', 'Сады и парки', '♧'],
  ['bookshops', 'Книжные магазины', '▤'],
  ['cinemas', 'Кинотеатры', '▸'],
  ['concerts', 'Концертные залы', '♪'],
  ['festivals', 'Фестивали', '✺'],
  ['adventures', 'Активности и приключения', '↗'],
  ['cities', 'Города и районы', '⌘'],
  ['other', 'Другое', '•'],
] as const;
export const category = (id: string) => categories.find((c) => c[0] === id) ?? categories[23];
export interface Collection {
  id: string;
  name: string;
  sort_order: number;
}
export interface Photo {
  id: string;
  storage_path: string;
  attribution: string;
  sort_order: number;
  url?: string;
}
export interface Price {
  amount_min: number;
  amount_max?: number | null;
  currency: string;
  unit: 'night' | 'ticket' | 'person' | 'visit';
  source_url: string;
  checked_at: string | null;
}
export interface Visit {
  id: string;
  visited_on: string;
  notes: string;
  created_by: string;
}
export interface Place {
  id: string;
  workspace_id: string;
  name: string;
  country: string;
  region: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  primary_category: string;
  status: 'want_to_go' | 'visited';
  description: string;
  notes: string;
  website_url: string;
  booking_url: string;
  favorite: boolean;
  season: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  tags: string[];
  collection_ids: string[];
  photos: Photo[];
  price: Price | null;
  visits: Visit[];
}
export const safeUrl = (s: string) => {
  try {
    const u = new URL(s);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
};
const urlSchema = z
  .string()
  .trim()
  .refine(
    (s) => s === '' || safeUrl(s),
    'Нужен полный адрес http:// или https:// без логина и пароля',
  );
export const priceSchema = z
  .object({
    amount_min: z.coerce.number().min(0),
    amount_max: z.coerce.number().min(0).nullable().optional(),
    currency: z.string().refine((s) => {
      try {
        return Intl.supportedValuesOf('currency').includes(s);
      } catch {
        return /^[A-Z]{3}$/.test(s);
      }
    }, 'Выберите валюту ISO 4217'),
    unit: z.enum(['night', 'ticket', 'person', 'visit']),
    source_url: urlSchema,
    checked_at: z.string().nullable(),
  })
  .refine((p) => p.amount_max == null || p.amount_max >= p.amount_min, 'Максимум меньше минимума');
export const placeSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(200),
  country: z.string().trim().min(1, 'Укажите страну').max(100),
  region: z.string().max(200),
  city: z.string().max(200),
  address: z.string().max(500),
  lat: z.preprocess((v) => (v === '' || v == null ? NaN : v), z.coerce.number().min(-90).max(90)),
  lng: z.preprocess((v) => (v === '' || v == null ? NaN : v), z.coerce.number().min(-180).max(180)),
  primary_category: z
    .string()
    .refine((s) => categories.some((c) => c[0] === s), 'Выберите категорию'),
  status: z.enum(['want_to_go', 'visited']),
  description: z.string().max(10000),
  notes: z.string().max(20000),
  website_url: urlSchema,
  booking_url: urlSchema,
  favorite: z.boolean(),
  season: z.string().max(100),
  tags: z.array(z.string().min(1).max(60)).max(30),
  collection_ids: z.array(z.string().uuid()).max(100),
  price: priceSchema.nullable(),
});
export const normalizeTags = (value: string) => [
  ...new Set(
    value
      .split(',')
      .map((t) => t.trim().toLocaleLowerCase('ru'))
      .filter(Boolean),
  ),
];
export const blankPlace = (): Place => ({
  id: '',
  workspace_id: '',
  name: '',
  country: '',
  region: '',
  city: '',
  address: '',
  lat: 0,
  lng: 0,
  primary_category: 'other',
  status: 'want_to_go',
  description: '',
  notes: '',
  website_url: '',
  booking_url: '',
  favorite: false,
  season: '',
  created_at: '',
  updated_at: '',
  created_by: '',
  tags: [],
  collection_ids: [],
  photos: [],
  price: null,
  visits: [],
});
export interface Filters {
  query: string;
  countries: string[];
  cities: string[];
  regions: string[];
  categories: string[];
  collections: string[];
  tags: string[];
  status: string;
  favorite: boolean;
  seasons: string[];
  maxBudget: string;
  currency: string;
}
export const emptyFilters: Filters = {
  query: '',
  countries: [],
  cities: [],
  regions: [],
  categories: [],
  collections: [],
  tags: [],
  status: '',
  favorite: false,
  seasons: [],
  maxBudget: '',
  currency: 'EUR',
};
export function filterPlaces(places: Place[], f: Filters) {
  const q = f.query.trim().toLocaleLowerCase('ru');
  return places.filter(
    (p) =>
      (!q ||
        [p.name, p.country, p.city, p.region, p.description, p.notes, ...p.tags]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(q)) &&
      (!f.countries.length || f.countries.includes(p.country)) &&
      (!f.cities.length || f.cities.includes(p.city)) &&
      (!f.regions.length || f.regions.includes(p.region)) &&
      (!f.categories.length || f.categories.includes(p.primary_category)) &&
      (!f.collections.length || p.collection_ids.some((c) => f.collections.includes(c))) &&
      (!f.tags.length || p.tags.some((t) => f.tags.includes(t))) &&
      (!f.status || p.status === f.status) &&
      (!f.favorite || p.favorite) &&
      (!f.seasons.length || f.seasons.includes(p.season)) &&
      (f.maxBudget === '' ||
        (!!p.price &&
          p.price.currency === f.currency &&
          p.price.amount_min <= Number(f.maxBudget))),
  );
}
export const priceText = (p: Price | null) =>
  p
    ? `${new Intl.NumberFormat('ru', { style: 'currency', currency: p.currency, maximumFractionDigits: 2 }).format(p.amount_min)}${p.amount_max != null ? ` – ${p.amount_max}` : ''} ${{ night: 'за ночь', ticket: 'за билет', person: 'на человека', visit: 'за посещение' }[p.unit]}`
    : 'Не указана';
export function duplicateOf(p: Place, others: Place[]) {
  return others.find(
    (o) =>
      o.id !== p.id &&
      o.name.trim().toLocaleLowerCase() === p.name.trim().toLocaleLowerCase() &&
      Math.hypot(o.lat - p.lat, (o.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) < 0.02,
  );
}
export const demoCollections: Collection[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Замки', sort_order: 0 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Природные чудеса', sort_order: 1 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Балет и опера', sort_order: 2 },
];
export const demoPlaces: Place[] = [
  [
    'Доломитовые Альпы',
    'Италия',
    'Кортина-д’Ампеццо',
    46.5405,
    12.1357,
    'mountains',
    1,
    'Там, где хочется остановить время. Скальные вершины, тихие тропы и воздух, который запоминается.',
  ],
  [
    'Замок Нойшванштайн',
    'Германия',
    'Швангау',
    47.5576,
    10.7498,
    'castles',
    0,
    'Сказочный силуэт среди баварских гор.',
  ],
  [
    'Опера Гарнье',
    'Франция',
    'Париж',
    48.8719,
    2.3316,
    'opera',
    2,
    'Вечер, посвящённый музыке и архитектуре.',
  ],
  [
    'Киото',
    'Япония',
    'Киото',
    35.0116,
    135.7681,
    'cities',
    1,
    'Сады, маленькие улочки и сезон цветения.',
  ],
  [
    'Патагония',
    'Аргентина',
    'Эль-Чальтен',
    -49.3315,
    -72.8863,
    'nature',
    1,
    'Большое путешествие на край света.',
  ],
].map((a, i) => ({
  ...blankPlace(),
  id: `demo-${i}`,
  name: a[0] as string,
  country: a[1] as string,
  city: a[2] as string,
  lat: a[3] as number,
  lng: a[4] as number,
  primary_category: a[5] as string,
  collection_ids: [demoCollections[a[6] as number].id],
  description: a[7] as string,
  tags: i === 0 ? ['горы', 'вдвоём'] : ['мечта'],
  favorite: i < 2,
  status: i === 2 ? 'visited' : 'want_to_go',
}));
