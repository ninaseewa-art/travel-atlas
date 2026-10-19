import { useState } from 'react';
import type { FormEvent } from 'react';
import { MapPin, Save } from 'lucide-react';
import { categories, normalizeTags, placeSchema, duplicateOf } from './domain';
import type { Place, Collection } from './domain';
import Modal from './Modal';
import { Map2D } from './World';
export default function Editor({
  initial,
  places,
  collections,
  onClose,
  onSave,
}: {
  initial: Place;
  places: Place[];
  collections: Collection[];
  onClose: () => void;
  onSave: (p: Place, date?: string) => Promise<void>;
}) {
  const [p, setP] = useState(initial),
    [tags, setTags] = useState(initial.tags.join(', ')),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [map, setMap] = useState(false),
    [date, setDate] = useState(''),
    [coordinates, setCoordinates] = useState({
      lat: initial.id ? String(initial.lat) : '',
      lng: initial.id ? String(initial.lng) : '',
    });
  const field = (key: keyof Place, value: unknown) => setP((v) => ({ ...v, [key]: value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const result = placeSchema.safeParse({ ...p, ...coordinates, tags: normalizeTags(tags) });
    if (!result.success) {
      setError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    const candidate: Place = { ...p, ...result.data };
    if (
      candidate.primary_category === 'hotels' &&
      candidate.price &&
      candidate.price.unit !== 'night'
    ) {
      setError('Для отеля цена указывается за ночь');
      return;
    }
    const duplicate = duplicateOf(candidate, places);
    if (
      duplicate &&
      !confirm(
        `Похожее место «${duplicate.name}» уже существует рядом. Создать отдельную запись? Чтобы объединить данные, отмените и отредактируйте существующую карточку.`,
      )
    )
      return;
    setBusy(true);
    try {
      await onSave({ ...candidate, ...result.data }, date || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={p.id ? 'Редактировать место' : 'Новая точка на нашей карте'}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={submit} className="editor">
        <p className="muted">
          Сначала сохраните место, затем добавьте фотографии в его карточке. Координаты
          подтверждаете вы.
        </p>
        <div className="form-grid">
          <label className="span-2">
            Название *
            <input
              autoComplete="off"
              required
              maxLength={200}
              value={p.name}
              onChange={(e) => field('name', e.target.value)}
              placeholder="Место, в которое хочется вернуться"
            />
          </label>
          <label>
            Страна *
            <input
              required
              value={p.country}
              onChange={(e) => field('country', e.target.value)}
              placeholder="Италия"
            />
          </label>
          <label>
            Город
            <input value={p.city} onChange={(e) => field('city', e.target.value)} />
          </label>
          <label>
            Регион
            <input value={p.region} onChange={(e) => field('region', e.target.value)} />
          </label>
          <label>
            Адрес
            <input value={p.address} onChange={(e) => field('address', e.target.value)} />
          </label>
          <label>
            Категория
            <select
              aria-label="Категория"
              value={p.primary_category}
              onChange={(e) => field('primary_category', e.target.value)}
            >
              {categories.map((c) => (
                <option key={c[0]} value={c[0]}>
                  {c[2]} {c[1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Статус
            <select
              aria-label="Статус"
              value={p.status}
              onChange={(e) => field('status', e.target.value)}
            >
              <option value="want_to_go">Мечтаем</option>
              <option value="visited">Уже были</option>
            </select>
          </label>
          <label>
            Широта *
            <input
              type="number"
              step="any"
              required
              min={-90}
              max={90}
              value={coordinates.lat}
              onChange={(e) => setCoordinates((v) => ({ ...v, lat: e.target.value }))}
            />
          </label>
          <label>
            Долгота *
            <input
              type="number"
              step="any"
              required
              min={-180}
              max={180}
              value={coordinates.lng}
              onChange={(e) => setCoordinates((v) => ({ ...v, lng: e.target.value }))}
            />
          </label>
        </div>
        <button type="button" className="secondary" onClick={() => setMap(!map)}>
          <MapPin size={16} />
          {map ? 'Скрыть карту' : 'Выбрать координаты на карте'}
        </button>
        {map && (
          <div className="picker">
            <Map2D
              places={[]}
              onSelect={() => {}}
              onPick={(lat, lng) => setCoordinates({ lat: String(lat), lng: String(lng) })}
            />
          </div>
        )}
        <div className="form-grid">
          <label className="span-2">
            Описание
            <textarea
              value={p.description}
              onChange={(e) => field('description', e.target.value)}
              rows={3}
            />
          </label>
          <label className="span-2">
            Личные заметки
            <textarea value={p.notes} onChange={(e) => field('notes', e.target.value)} rows={3} />
          </label>
          <label>
            Официальный сайт
            <input
              type="url"
              placeholder="https://…"
              value={p.website_url}
              onChange={(e) => field('website_url', e.target.value)}
            />
          </label>
          <label>
            Бронирование / билеты
            <input
              type="url"
              placeholder="https://…"
              value={p.booking_url}
              onChange={(e) => field('booking_url', e.target.value)}
            />
          </label>
          <label>
            Сезон
            <select
              aria-label="Сезон"
              value={p.season}
              onChange={(e) => field('season', e.target.value)}
            >
              <option value="">Не указан</option>
              {['Весна', 'Лето', 'Осень', 'Зима', 'Круглый год'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Добавить дату посещения
            <input
              type="date"
              value={date}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={(e) => {
                setDate(e.target.value);
                if (e.target.value) field('status', 'visited');
              }}
            />
          </label>
          <label className="span-2">
            Теги через запятую
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="горы, вдвоём, длинные выходные"
              list="tag-options"
            />
            <datalist id="tag-options">
              {[...new Set(places.flatMap((p) => p.tags))].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        </div>
        <fieldset>
          <legend>Коллекции · можно выбрать несколько</legend>
          <div className="chips">
            {collections.map((c) => (
              <label key={c.id} className="check-chip">
                <input
                  type="checkbox"
                  checked={p.collection_ids.includes(c.id)}
                  onChange={(e) =>
                    field(
                      'collection_ids',
                      e.target.checked
                        ? [...p.collection_ids, c.id]
                        : p.collection_ids.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
            {!collections.length && (
              <span className="muted">Создайте коллекцию в разделе «Коллекции».</span>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>Ориентировочная цена</legend>
          <label className="check-line">
            <input
              type="checkbox"
              checked={!!p.price}
              onChange={(e) =>
                field(
                  'price',
                  e.target.checked
                    ? {
                        amount_min: 0,
                        currency: 'EUR',
                        unit: p.primary_category === 'hotels' ? 'night' : 'visit',
                        source_url: '',
                        checked_at: null,
                      }
                    : null,
                )
              }
            />
            Указать цену (без автоматического обновления)
          </label>
          {p.price && (
            <div className="form-grid">
              <label>
                От
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={p.price.amount_min}
                  onChange={(e) =>
                    field('price', { ...p.price, amount_min: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                До (необязательно)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={p.price.amount_max ?? ''}
                  onChange={(e) =>
                    field('price', {
                      ...p.price,
                      amount_max: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Валюта
                <select
                  aria-label="Валюта"
                  value={p.price.currency}
                  onChange={(e) => field('price', { ...p.price, currency: e.target.value })}
                >
                  {Intl.supportedValuesOf('currency').map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Единица
                <select
                  aria-label="Единица"
                  value={p.price.unit}
                  onChange={(e) => field('price', { ...p.price, unit: e.target.value })}
                >
                  <option value="night">За ночь</option>
                  <option value="ticket">За билет</option>
                  <option value="person">На человека</option>
                  <option value="visit">За посещение</option>
                </select>
              </label>
              <label>
                Источник цены
                <input
                  type="url"
                  value={p.price.source_url}
                  onChange={(e) => field('price', { ...p.price, source_url: e.target.value })}
                  placeholder="https://…"
                />
              </label>
              <label>
                Дата проверки
                <input
                  type="date"
                  value={p.price.checked_at ?? ''}
                  onChange={(e) =>
                    field('price', { ...p.price, checked_at: e.target.value || null })
                  }
                />
              </label>
            </div>
          )}
        </fieldset>
        <label className="check-line">
          <input
            type="checkbox"
            checked={p.favorite}
            onChange={(e) => field('favorite', e.target.checked)}
          />
          В избранном
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="form-actions">
          <span className="muted">Сохранение в наше приватное пространство</span>
          <button disabled={busy} className="primary" type="submit">
            <Save size={16} />
            {busy ? 'Сохраняем…' : 'Сохранить место'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
