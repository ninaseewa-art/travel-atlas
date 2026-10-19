import { createClient } from '@supabase/supabase-js';
import type { Place, Collection, Photo } from './domain';
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured =
  !!url &&
  !!key &&
  !url.includes('YOUR_PROJECT') &&
  (() => {
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  })();
export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
export const db = () => {
  if (!supabase) throw new Error('Подключите Supabase по инструкции README');
  return supabase;
};
export async function claimWorkspace() {
  const { data, error } = await db().rpc('claim_workspace');
  if (error) throw error;
  return data as string;
}
export async function loadCollections(w: string): Promise<Collection[]> {
  const { data, error } = await db()
    .from('collections')
    .select('*')
    .eq('workspace_id', w)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data;
}
export async function loadPlaces(w: string): Promise<Place[]> {
  const { data, error } = await db()
    .from('places')
    .select(
      '*,place_tags(tags(name)),collection_places(collection_id),photos(*),prices(*),visits(*)',
    )
    .eq('workspace_id', w)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const rows = data as unknown as (Place & {
    place_tags: { tags: { name: string } }[];
    collection_places: { collection_id: string }[];
    prices: Place['price'][] | Place['price'];
  })[];
  const paths = rows.flatMap((p) => p.photos.map((f) => f.storage_path));
  const signed = paths.length
    ? await db().storage.from('atlas-photos').createSignedUrls(paths, 3600)
    : null;
  if (signed?.error) throw signed.error;
  const urls = new Map(signed?.data?.map((s) => [s.path, s.signedUrl]));
  return rows.map(({ place_tags, collection_places, prices, ...p }) => ({
    ...p,
    tags: place_tags.map((t) => t.tags.name),
    collection_ids: collection_places.map((c) => c.collection_id),
    price: Array.isArray(prices) ? (prices[0] ?? null) : prices,
    photos: p.photos
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({ ...f, url: urls.get(f.storage_path) ?? undefined })),
    visits: p.visits.sort((a, b) => b.visited_on.localeCompare(a.visited_on)),
  }));
}
export async function savePlace(p: Place, visited_on?: string, visit_notes?: string) {
  const { data, error } = await db().rpc('save_place', {
    p: { ...p, id: p.id || null, updated_at: p.updated_at || null, visited_on, visit_notes },
  });
  if (error) throw error;
  return data as string;
}
export async function uploadPhoto(
  w: string,
  pid: string,
  file: File,
  attribution: string,
  sort_order: number,
) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error(
      'Для MVP используйте JPEG, PNG или WebP. На iPhone экспортируйте HEIC как JPEG.',
    );
  if (file.size > 10 * 1024 * 1024) throw new Error('Максимальный размер фото — 10 МБ');
  // Re-encoding strips EXIF (including the original GPS location) and validates decoding.
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw new Error('Фото слишком большое: максимум 50 мегапикселей');
  }
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось обработать фото'))),
      'image/jpeg',
      0.86,
    ),
  );
  const path = `${w}/${pid}/${crypto.randomUUID()}.jpg`;
  const { error } = await db()
    .storage.from('atlas-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { error: rowError } = await db()
    .from('photos')
    .insert({ workspace_id: w, place_id: pid, storage_path: path, attribution, sort_order });
  if (rowError) {
    const cleanup = await db().storage.from('atlas-photos').remove([path]);
    throw new Error(
      `${rowError.message}${cleanup.error ? ' · Не удалось удалить незавершённую загрузку из Storage' : ''}`,
    );
  }
}
export async function removePhoto(p: Photo) {
  const { error } = await db().from('photos').delete().eq('id', p.id);
  if (error) throw error;
  const { error: storageError } = await db().storage.from('atlas-photos').remove([p.storage_path]);
  if (storageError)
    throw new Error(
      'Фото скрыто, но файл остался в приватном Storage. Повторите очистку в панели Supabase.',
    );
}
export async function deletePlace(p: Place) {
  const { error } = await db().from('places').delete().eq('id', p.id);
  if (error) throw error;
  if (p.photos.length) {
    const { error: e } = await db()
      .storage.from('atlas-photos')
      .remove(p.photos.map((f) => f.storage_path));
    if (e)
      throw new Error(
        'Место удалено. Не удалось очистить приватные файлы фото; удалите их в Storage.',
      );
  }
}
export async function exportWorkspace(w: string) {
  const tables = [
    'workspaces',
    'memberships',
    'places',
    'categories',
    'collections',
    'tags',
    'collection_places',
    'place_tags',
    'place_categories',
    'photos',
    'prices',
    'visits',
    'events',
    'imports',
  ];
  const result: Record<string, unknown> = {
    format: 'nash-atlas',
    version: 1,
    exported_at: new Date().toISOString(),
  };
  for (const t of tables) {
    const query = db().from(t).select('*');
    const { data, error } = await (t === 'categories'
      ? query
      : query.eq(t === 'workspaces' ? 'id' : 'workspace_id', w));
    if (error) throw error;
    result[t] = data;
  }
  return result;
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
