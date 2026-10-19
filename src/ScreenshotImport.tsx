import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, MapPin, ScanText, Search, X } from 'lucide-react';
import { prepareScreenshot, recognizeScreenshot } from './ocr';
import { extractScreenshot, searchLocations } from './screenshot';
import type { LocationCandidate } from './screenshot';
import type { Place } from './domain';
export interface ScreenshotDraft {
  fields: Partial<Place>;
  location: LocationCandidate | null;
  attachment?: File;
}
export default function ScreenshotImport({
  onApply,
  onCancel,
}: {
  onApply: (draft: ScreenshotDraft) => void;
  onCancel: () => void;
}) {
  const [image, setImage] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [confidence, setConfidence] = useState<number | null>(null);
  const [name, setName] = useState(''),
    [query, setQuery] = useState(''),
    [locations, setLocations] = useState<LocationCandidate[]>([]),
    [location, setLocation] = useState<LocationCandidate | null>(null),
    [searching, setSearching] = useState(false),
    [searched, setSearched] = useState(false),
    [searchError, setSearchError] = useState('');
  const [priceIndex, setPriceIndex] = useState(-1),
    [currency, setCurrency] = useState(''),
    [keepImage, setKeepImage] = useState(false),
    [keepText, setKeepText] = useState(false),
    [website, setWebsite] = useState('');
  const recognition = useRef<AbortController | null>(null),
    geocoding = useRef<AbortController | null>(null);
  const suggestions = useMemo(() => extractScreenshot(text), [text]);
  useEffect(
    () => () => {
      recognition.current?.abort();
      geocoding.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!image) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  const process = async (file: File) => {
    recognition.current?.abort();
    geocoding.current?.abort();
    const controller = new AbortController();
    recognition.current = controller;
    setBusy(true);
    setError('');
    setProgress(0);
    setText('');
    setName('');
    setPriceIndex(-1);
    setCurrency('');
    setWebsite('');
    setKeepImage(false);
    setKeepText(false);
    setImage(null);
    setConfidence(null);
    setLocation(null);
    setLocations([]);
    setQuery('');
    setSearchError('');
    setSearched(false);
    setSearching(false);
    try {
      const prepared = await prepareScreenshot(file);
      if (controller.signal.aborted) return;
      setImage(prepared);
      const result = await recognizeScreenshot(
        prepared,
        (p) => {
          if (!controller.signal.aborted)
            setProgress(Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0)));
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setText(result.text);
      setConfidence(result.confidence);
      const found = extractScreenshot(result.text);
      setName(found.names[0] ?? '');
      setQuery(found.names[0] ?? '');
      if (!result.text.trim())
        setError(
          'На изображении не найден читаемый текст. По одной фотографии без текста место надёжно определить нельзя. Заполните название вручную.',
        );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : 'Распознавание недоступно. Введите текст вручную или выберите другой скриншот.',
        );
    } finally {
      if (recognition.current === controller) setBusy(false);
    }
  };
  const search = async () => {
    geocoding.current?.abort();
    const controller = new AbortController();
    geocoding.current = controller;
    setSearching(true);
    setSearchError('');
    setLocations([]);
    setLocation(null);
    setSearched(false);
    try {
      const results = await searchLocations(query, controller.signal);
      if (!controller.signal.aborted) {
        setLocations(results);
        setSearched(true);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setSearchError(
          e instanceof Error ? e.message : 'Поиск недоступен. Выберите координаты вручную.',
        );
    } finally {
      if (geocoding.current === controller) setSearching(false);
    }
  };
  const apply = () => {
    const fields: Partial<Place> = { name: name.trim() };
    if (suggestions.category) fields.primary_category = suggestions.category;
    if (keepText && text.trim())
      fields.notes = `Текст со скриншота (проверьте перед сохранением):\n${text.trim().slice(0, 16000)}`;
    if (website) fields.website_url = website;
    if (priceIndex >= 0 && suggestions.prices[priceIndex])
      fields.price = {
        ...suggestions.prices[priceIndex],
        currency: currency || suggestions.prices[priceIndex].currency,
        ...(suggestions.category === 'hotels' ? { unit: 'night' as const } : {}),
      };
    onApply({ fields, location, attachment: keepImage && image ? image : undefined });
  };
  const selectedPrice = suggestions.prices[priceIndex];
  return (
    <section className="screenshot-import" aria-label="Добавление места по скриншоту">
      <div className="import-intro">
        <ScanText size={25} />
        <div>
          <h3>Из сохранённого скриншота — в нашу мечту</h3>
          <p>
            Распознаём русский и английский текст на вашем устройстве. Изображение не отправляется в
            AI-сервисы. Первое распознавание загрузит языковые модели с нашего сайта.
          </p>
        </div>
      </div>
      <label className={`screenshot-upload ${busy ? 'disabled' : ''}`}>
        <ImagePlus size={25} />
        <strong>{image ? 'Выбрать другой скриншот' : 'Выбрать скриншот'}</strong>
        <span>
          PNG, JPEG, WebP · до 10 МБ. HEIC — если поддерживает ваш браузер, иначе экспортируйте в
          JPEG.
        </span>
        <input
          aria-label="Выбрать скриншот"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void process(file);
            e.target.value = '';
          }}
        />
      </label>
      {preview && (
        <img className="screenshot-preview" src={preview} alt="Предпросмотр выбранного скриншота" />
      )}
      {busy && (
        <div className="ocr-progress" role="status">
          <span>Распознаём текст… {Math.round(progress * 100)}%</span>
          <progress max={1} value={progress} />
          <button
            className="text-button"
            type="button"
            onClick={() => {
              recognition.current?.abort();
              setBusy(false);
              setError(
                'Распознавание отменено. Можно выбрать другой файл или ввести текст вручную.',
              );
            }}
          >
            <X size={14} />
            Отменить распознавание
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!busy && (
        <>
          <label>
            Текст со скриншота
            <textarea
              aria-label="Текст со скриншота"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPriceIndex(-1);
                setWebsite('');
              }}
              rows={5}
              maxLength={20000}
              placeholder="Здесь появится распознанный текст. Его можно исправить или вставить вручную."
            />
          </label>
          {confidence !== null && confidence < 65 && (
            <p className="import-warning">
              Текст распознан неуверенно. Проверьте каждое поле; при необходимости обрежьте
              изображение до названия и адреса.
            </p>
          )}
          {suggestions.names.length > 1 && (
            <fieldset>
              <legend>Возможные названия · выберите нужное</legend>
              <div className="import-candidates">
                {suggestions.names.map((n, i) => (
                  <button
                    type="button"
                    className={name === n ? 'candidate selected' : 'candidate'}
                    key={`${i}-${n}`}
                    onClick={() => {
                      setName(n);
                      setQuery(n);
                      setLocation(null);
                      setLocations([]);
                    }}
                  >
                    {name === n ? <Check size={16} /> : <ScanText size={16} />}
                    <span>{n}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <label>
            Подтвердите название места
            <input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Проверьте или введите вручную"
            />
          </label>
          {!!suggestions.prices.length && (
            <fieldset>
              <legend>Найденные цены · необязательно</legend>
              <p className="muted">
                Цена могла устареть или относиться к другой услуге. Ничего не добавляется, пока вы
                не выберете значение.
              </p>
              <label>
                Цена со скриншота
                <select
                  aria-label="Цена со скриншота"
                  value={priceIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setPriceIndex(i);
                    setCurrency(suggestions.prices[i]?.currency ?? '');
                  }}
                >
                  <option value={-1}>Не добавлять цену</option>
                  {suggestions.prices.map((p, i) => (
                    <option value={i} key={i}>
                      {p.amount_min} {p.currency || '(валюта не определена)'}
                    </option>
                  ))}
                </select>
              </label>
              {priceIndex >= 0 && (
                <>
                  <label>
                    Валюта цены
                    <select
                      aria-label="Валюта цены"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="">Укажите валюту</option>
                      {Intl.supportedValuesOf('currency').map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    Источник — скриншот, дата актуальности неизвестна. Единицу, источник-ссылку и
                    дату проверки можно исправить в карточке.
                  </p>
                </>
              )}
            </fieldset>
          )}
          {!!suggestions.websites.length && (
            <label>
              Ссылка из текста
              <select
                aria-label="Ссылка из текста"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              >
                <option value="">Не добавлять ссылку</option>
                {suggestions.websites.map((url) => (
                  <option key={url}>{url}</option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>Где это находится?</legend>
            <p className="muted">
              Поиск отправляет в OpenStreetMap только введённый ниже запрос. Сам скриншот и полный
              текст не передаются. Можно пропустить поиск и выбрать точку вручную в карточке.
            </p>
            <div className="import-search">
              <input
                aria-label="Название и город для поиска на карте"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLocation(null);
                  setLocations([]);
                  setSearched(false);
                  geocoding.current?.abort();
                  setSearching(false);
                }}
                maxLength={200}
                placeholder="Название, город, страна"
              />
              <button
                type="button"
                className="secondary"
                disabled={searching || query.trim().length < 3}
                onClick={() => void search()}
              >
                <Search size={16} />
                {searching ? 'Ищем…' : 'Найти'}
              </button>
            </div>
            {searchError && (
              <p className="error" role="alert">
                {searchError}
              </p>
            )}
            {searched && !locations.length && (
              <p className="muted">
                Ничего не найдено. Уточните город или укажите координаты вручную в карточке.
              </p>
            )}
            <div className="import-candidates">
              {locations.map((l) => (
                <button
                  type="button"
                  className={`candidate ${location?.id === l.id ? 'selected' : ''}`}
                  key={l.id}
                  onClick={() => setLocation(l)}
                >
                  {location?.id === l.id ? <Check size={16} /> : <MapPin size={16} />}
                  <span>
                    {l.label}
                    <small>
                      {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {location && (
              <p className="success">
                Выбрана точка: {location.label}. Проверьте координаты в карточке.
              </p>
            )}
            <p className="muted">Поиск: © OpenStreetMap contributors / Nominatim.</p>
          </fieldset>
          <label className="check-line">
            <input
              type="checkbox"
              checked={keepText}
              onChange={(e) => setKeepText(e.target.checked)}
            />
            Добавить распознанный текст в личные заметки
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              disabled={!image}
              checked={keepImage}
              onChange={(e) => setKeepImage(e.target.checked)}
            />
            Сохранить скриншот в приватной карточке — у меня есть право его использовать
          </label>
          <p className="muted">
            Без этой отметки изображение останется только на вашем устройстве и исчезнет при
            закрытии формы.
          </p>
          <footer className="form-actions">
            <button className="text-button" type="button" onClick={onCancel}>
              Ввести вручную
            </button>
            <button
              className="primary"
              type="button"
              disabled={priceIndex >= 0 && !currency && !selectedPrice?.currency}
              onClick={apply}
            >
              Проверить карточку <Check size={16} />
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
