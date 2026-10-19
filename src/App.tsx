import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe2,
  Search,
  Plus,
  Heart,
  MapPin,
  Layers,
  Compass,
  Check,
  Settings,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  ArrowLeft,
  ChevronRight,
  Download,
  LogOut,
  LockKeyhole,
  RefreshCw,
  Trash2,
  Pencil,
  ImagePlus,
  List,
  Pause,
  Play,
  Map as MapIcon,
  WifiOff,
  MoveUp,
  MoveDown,
} from 'lucide-react';
import {
  blankPlace,
  categories,
  category,
  demoCollections,
  demoPlaces,
  emptyFilters,
  filterPlaces,
  priceText,
  safeUrl,
} from './domain';
import type { Collection, Filters, Place, Photo } from './domain';
import {
  claimWorkspace,
  configured,
  db,
  deletePlace,
  downloadJson,
  exportWorkspace,
  loadCollections,
  loadPlaces,
  removePhoto,
  savePlace,
  supabase,
  uploadPhoto,
} from './api';
import World from './World';
import Modal from './Modal';
import Editor from './Editor';
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : 'Не удалось выполнить действие. Повторите попытку.';
function readFilters(): Filters {
  try {
    const v = JSON.parse(localStorage.getItem('atlas-filters') ?? '{}');
    const f = { ...emptyFilters };
    for (const k of Object.keys(f) as (keyof Filters)[]) {
      if (
        Array.isArray(f[k])
          ? Array.isArray(v[k]) && v[k].every((x: unknown) => typeof x === 'string')
          : typeof v[k] === typeof f[k]
      )
        Object.assign(f, { [k]: v[k] });
    }
    return f;
  } catch {
    return { ...emptyFilters };
  }
}
export default function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null),
    [checking, setChecking] = useState(true),
    [demo, setDemo] = useState(false);
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error) setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s) queryClient.clear();
      setSession(s);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);
  if (checking) return <div className="full-loading">Открываем наш атлас…</div>;
  if (!session && !demo) return <Welcome onDemo={() => setDemo(true)} />;
  return (
    <Atlas
      key={demo ? 'demo' : session!.user.id}
      session={session}
      demo={demo}
      onExit={() => {
        setDemo(false);
        setSession(null);
      }}
    />
  );
}
function Welcome({ onDemo }: { onDemo: () => void }) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false),
    [method, setMethod] = useState<'magic' | 'password'>('magic');
  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (method === 'magic') {
        const { error } = await db().auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: location.origin },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await db().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="welcome">
      <div className="welcome-world">
        <World places={[]} selected={null} onSelect={() => {}} mode="3d" rotate />
      </div>
      <a className="brand welcome-brand" href="/">
        <Globe2 />
        <span>
          наш атлас<small>ВЕСЬ МИР. НАША ИСТОРИЯ.</small>
        </span>
      </a>
      <section className="welcome-copy">
        <span className="eyebrow">ДЛЯ ВАС ДВОИХ</span>
        <h1>
          Мир большой.
          <br />
          <em>Мечты — общие.</em>
        </h1>
        <p>
          Места, которые зовут. Воспоминания, которые остаются.
          <br />
          Всё на одной планете — в вашем личном атласе.
        </p>
        <div className="login-panel">
          {configured ? (
            <>
              <h2>Вернуться в наш мир</h2>
              <p className="muted">Вход только для двух приглашённых владельцев.</p>
              <div className="segmented">
                <button
                  className={method === 'magic' ? 'active' : ''}
                  onClick={() => setMethod('magic')}
                >
                  Ссылка на почту
                </button>
                <button
                  className={method === 'password' ? 'active' : ''}
                  onClick={() => setMethod('password')}
                >
                  Пароль
                </button>
              </div>
              <form onSubmit={login}>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                {method === 'password' && (
                  <label>
                    Пароль
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? 'Подождите…' : method === 'magic' ? 'Получить ссылку для входа' : 'Войти'}
                  <ArrowUpRight size={17} />
                </button>
              </form>
              {sent && (
                <p role="status" className="success">
                  Если адрес приглашён, письмо придёт на почту. Откройте ссылку на этом устройстве.
                </p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Ваш атлас начинается здесь</h2>
              <p>
                Чтобы сохранять и синхронизировать места, подключите бесплатный Supabase-проект.
                Точные шаги — в README репозитория.
              </p>
              <code>
                VITE_SUPABASE_URL
                <br />
                VITE_SUPABASE_ANON_KEY
              </code>
              <p className="muted">Данные не сохраняются, пока база не подключена.</p>
            </>
          )}
          <button onClick={onDemo} className="text-button demo-link">
            Посмотреть демонстрационный атлас <ChevronRight size={16} />
          </button>
        </div>
        <span className="privacy">
          <LockKeyhole size={14} />
          Только вы двое. Никаких публичных профилей.
        </span>
      </section>
      <div className="welcome-note">ЗЕМЛЯ, КОТОРУЮ ХОЧЕТСЯ ИССЛЕДОВАТЬ</div>
      <Credits />
    </main>
  );
}
function Atlas({
  session,
  demo,
  onExit,
}: {
  session: Session | null;
  demo: boolean;
  onExit: () => void;
}) {
  const qc = useQueryClient();
  const workspace = useQuery({
    queryKey: ['workspace', session?.user.id],
    queryFn: claimWorkspace,
    enabled: !demo,
    retry: false,
  });
  const w = workspace.data;
  const placesQuery = useQuery({
    queryKey: ['places', w],
    queryFn: () => loadPlaces(w!),
    enabled: !!w && !demo,
    refetchInterval: 60000,
  });
  const collectionsQuery = useQuery({
    queryKey: ['collections', w],
    queryFn: () => loadCollections(w!),
    enabled: !!w && !demo,
    refetchInterval: 60000,
  });
  const places = demo ? demoPlaces : (placesQuery.data ?? []),
    collections = demo ? demoCollections : (collectionsQuery.data ?? []);
  const [filters, setFilters] = useState<Filters>(readFilters),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [view, setView] = useAtlasView(),
    [mode, setMode] = useState<'3d' | '2d'>('3d'),
    [rotate, setRotate] = useState(() => localStorage.getItem('atlas-rotate') !== 'false'),
    [filterOpen, setFilterOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [editor, setEditor] = useState<Place | null>(null),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [live, setLive] = useState('Подключаем синхронизацию…');
  const selected = places.find((p) => p.id === selectedId) ?? null;
  const visible = useMemo(() => filterPlaces(places, filters), [places, filters]);
  useEffect(() => {
    localStorage.setItem('atlas-filters', JSON.stringify(filters));
  }, [filters]);
  useEffect(() => {
    localStorage.setItem('atlas-rotate', String(rotate));
  }, [rotate]);
  useEffect(() => {
    const f = () => setOnline(navigator.onLine);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => {
      window.removeEventListener('online', f);
      window.removeEventListener('offline', f);
    };
  }, []);
  useEffect(() => {
    if (!w || demo) return;
    const channel = db().channel(`atlas-${w}`);
    for (const table of [
      'places',
      'collections',
      'photos',
      'visits',
      'collection_places',
      'place_tags',
      'prices',
    ])
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `workspace_id=eq.${w}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['places', w] });
          void qc.invalidateQueries({ queryKey: ['collections', w] });
        },
      );
    channel.subscribe((status) =>
      setLive(status === 'SUBSCRIBED' ? 'Синхронизация подключена' : 'Обновление раз в минуту'),
    );
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void qc.invalidateQueries();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      void db().removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [w, demo, qc]);
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['places', w] }),
      qc.invalidateQueries({ queryKey: ['collections', w] }),
    ]);
  };
  const run = async (fn: () => Promise<void>) => {
    if (!online) {
      setNotice('Нет сети. Изменения не отправлены и не сохранены.');
      return;
    }
    if (demo) {
      setNotice('Это демопросмотр. Войдите в подключённый Supabase, чтобы сохранять изменения.');
      return;
    }
    setPending(true);
    setNotice('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice(message(e));
    } finally {
      await refresh();
      setPending(false);
    }
  };
  const save = async (p: Place, date?: string, screenshot?: File) => {
    if (demo) throw new Error('Для сохранения войдите в своё пространство.');
    if (!online) throw new Error('Нет сети — место не сохранено. Не закрывайте форму.');
    const id = await savePlace({ ...p, workspace_id: w! }, date);
    let photoWarning = '';
    if (screenshot) {
      try {
        await uploadPhoto(w!, id, screenshot, 'Скриншот, добавленный владельцем', 0);
      } catch (e) {
        photoWarning = `Место сохранено, но скриншот загрузить не удалось: ${message(e)}. Добавьте его повторно через «Добавить фотографии» в карточке.`;
      }
    }
    await refresh();
    setSelectedId(id);
    setEditor(null);
    setNotice(photoWarning || 'Место сохранено в базе.');
  };
  const newPlace = () => {
    setEditor({ ...blankPlace(), workspace_id: w ?? '' });
  };
  const nav = (kind: string) => {
    setSelectedId(null);
    if (kind === 'collections') {
      setView('collections');
      return;
    }
    setView(kind === 'list' ? 'list' : 'map');
    setFilters((f) => ({
      ...f,
      status: kind === 'dream' ? 'want_to_go' : kind === 'visited' ? 'visited' : '',
      favorite: kind === 'favorite',
    }));
  };
  const active = filters.favorite
    ? 'favorite'
    : filters.status === 'want_to_go'
      ? 'dream'
      : filters.status === 'visited'
        ? 'visited'
        : view === 'collections'
          ? 'collections'
          : view === 'list'
            ? 'list'
            : 'map';
  const countFilters =
    filters.countries.length +
    filters.cities.length +
    filters.regions.length +
    filters.categories.length +
    filters.collections.length +
    filters.tags.length +
    filters.seasons.length +
    (filters.maxBudget !== '' ? 1 : 0);
  const logout = async () => {
    if (!demo) {
      const { error } = await db().auth.signOut();
      if (error) {
        setNotice(message(error));
        return;
      }
    }
    qc.clear();
    onExit();
  };
  if (!demo && (workspace.isPending || workspace.isError))
    return (
      <div className="access-screen">
        <Globe2 size={44} />
        <h1>
          {workspace.isPending ? 'Открываем ваше пространство…' : 'Не удалось открыть пространство'}
        </h1>
        <p>
          {workspace.isError ? message(workspace.error) : 'Проверяем приглашение и права доступа.'}
        </p>
        {workspace.isError && (
          <p className="muted">
            Владелец проекта должен выполнить миграцию и добавить ваш подтверждённый email в
            allowed_members. Посторонние адреса доступа не получают.
          </p>
        )}
        <button className="secondary" onClick={() => void workspace.refetch()}>
          Повторить
        </button>
        <button className="text-button" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            nav('map');
          }}
        >
          <Globe2 />
          <span>
            наш атлас<small>МЕСТА, КОТОРЫЕ НАС ЖДУТ</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="tiny-orbit">✧</span>
          <div>
            Наш маленький мир
            <small>
              {demo ? 'Демонстрационное пространство' : 'Приватное пространство на двоих'}
            </small>
          </div>
          <LockKeyhole size={13} />
        </div>
        <nav aria-label="Основная навигация">
          {[
            ['map', 'Карта мира', Globe2],
            ['list', 'Все места', List],
            ['collections', 'Коллекции', Layers],
            ['dream', 'Мечтаем', Compass],
            ['visited', 'Уже были', Check],
            ['favorite', 'Избранное', Heart],
          ].map(([id, label, Icon]) => {
            const I = Icon as typeof Globe2;
            return (
              <button
                key={id as string}
                className={active === id ? 'nav-item active' : 'nav-item'}
                onClick={() => nav(id as string)}
              >
                <I size={19} />
                <span>{label as string}</span>
                {id === 'list' && <small>{places.length}</small>}
                {id === 'favorite' && <small>{places.filter((p) => p.favorite).length}</small>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-collections">
          <div className="section-label">
            НАШИ КОЛЛЕКЦИИ
            <button aria-label="Управлять коллекциями" onClick={() => setView('collections')}>
              <Plus size={14} />
            </button>
          </div>
          {collections.slice(0, 6).map((c, i) => (
            <button
              key={c.id}
              className={`collection-link ${filters.collections.includes(c.id) ? 'chosen' : ''}`}
              onClick={() => {
                setView('map');
                setFilters((f) => ({
                  ...f,
                  collections: f.collections.includes(c.id) ? [] : [c.id],
                }));
              }}
            >
              <span className={`collection-color color-${i % 4}`} />
              <span>{c.name}</span>
              <small>{places.filter((p) => p.collection_ids.includes(c.id)).length}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="journey-note">
            <span>✦</span>
            <p>
              Лучшие путешествия
              <br />
              начинаются с мечты.
            </p>
          </div>
          <button className="nav-item" onClick={() => setSettings(true)}>
            <Settings size={18} />
            Настройки
          </button>
          <div className="profile">
            <span className="avatar">{demo ? 'Д' : session?.user.email?.[0].toUpperCase()}</span>
            <div>
              {demo ? 'Демопросмотр' : session?.user.email}
              <small>{demo ? 'Пример, без сохранения' : live}</small>
            </div>
            <button aria-label="Выйти" onClick={() => void logout()}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className={`main-workspace ${view === 'map' ? 'world-mode' : ''}`}>
        <header className="topbar">
          <div className="mobile-brand">
            <Globe2 size={23} />
            <span>наш атлас</span>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input
              aria-label="Поиск мест"
              placeholder="Куда отправимся в мечтах?"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            />
            {filters.query && (
              <button
                aria-label="Очистить поиск"
                onClick={() => setFilters((f) => ({ ...f, query: '' }))}
              >
                <X size={15} />
              </button>
            )}
            <kbd>⌕</kbd>
          </div>
          <div className="topbar-right">
            <span className="private-label">
              <LockKeyhole size={13} />
              {demo ? 'Демо' : 'Только для нас'}
            </span>
            <button
              className="primary add-button"
              aria-label="Добавить место"
              onClick={newPlace}
              disabled={pending}
            >
              <Plus size={19} />
              <span>Добавить место</span>
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            Демонстрационные места · данные вымышленных планов, без цен и сохранения
            <button onClick={() => void logout()}>
              Перейти ко входу <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            Нет сети. Просмотр загруженных данных; изменения недоступны.
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Скрыть сообщение">
              <X size={16} />
            </button>
          </div>
        )}
        {(placesQuery.isError || collectionsQuery.isError) && (
          <div className="error query-error" role="alert">
            {message(placesQuery.error ?? collectionsQuery.error)}{' '}
            <button onClick={() => void refresh()}>Повторить загрузку</button>
          </div>
        )}
        {view === 'collections' ? (
          <Collections
            collections={collections}
            places={places}
            disabled={pending || demo || !online}
            onFilter={(id) => {
              setView('list');
              setFilters({ ...emptyFilters, collections: [id] });
            }}
            onChange={(fn) => run(fn)}
            workspace={w ?? ''}
          />
        ) : (
          <>
            <div className="view-heading">
              <div>
                <span className="eyebrow">НАША ПЛАНЕТА ВОЗМОЖНОСТЕЙ</span>
                <h1>
                  {active === 'dream'
                    ? 'Однажды мы здесь побываем'
                    : active === 'visited'
                      ? 'Места, ставшие историей'
                      : active === 'favorite'
                        ? 'Самое близкое сердцу'
                        : view === 'list'
                          ? 'Каждое место — начало истории'
                          : 'Весь мир перед нами'}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {visible.length} {visible.length === 1 ? 'место' : 'мест'} на нашей карте{' '}
                  <span>·</span> бесконечно много впереди
                </p>
              </div>
              <button
                className={`filter-button ${countFilters ? 'has-filters' : ''}`}
                onClick={() => setFilterOpen(true)}
              >
                <SlidersHorizontal size={17} />
                Фильтры{countFilters > 0 && <b>{countFilters}</b>}
              </button>
            </div>
            {(countFilters > 0 || filters.status || filters.favorite) && (
              <div className="active-filter-row">
                <span>
                  {filters.status === 'visited'
                    ? 'Уже были'
                    : filters.status === 'want_to_go'
                      ? 'Мечтаем'
                      : filters.favorite
                        ? 'Избранное'
                        : 'Фильтры применены'}
                </span>
                {filters.collections.map((id) => (
                  <span key={id}>{collections.find((c) => c.id === id)?.name}</span>
                ))}
                <button onClick={() => setFilters({ ...emptyFilters })}>
                  Сбросить всё <X size={12} />
                </button>
              </div>
            )}
            {view === 'map' ? (
              <section className="world-section">
                <World
                  places={visible}
                  selected={selected}
                  onSelect={(p) => setSelectedId(p.id)}
                  mode={mode}
                  rotate={rotate}
                />
                <div className="world-caption">
                  <span className="orbit-symbol">✧</span>
                  <div>
                    Наша следующая история<small>Где-то здесь начинается новое «помнишь?»</small>
                  </div>
                </div>
                <div className="map-controls">
                  <div className="segmented">
                    <button className={mode === '3d' ? 'active' : ''} onClick={() => setMode('3d')}>
                      <Globe2 size={15} />
                      Глобус
                    </button>
                    <button className={mode === '2d' ? 'active' : ''} onClick={() => setMode('2d')}>
                      <MapIcon size={15} />
                      Карта
                    </button>
                  </div>
                  {mode === '3d' && (
                    <button
                      className="round-button"
                      aria-label={rotate ? 'Остановить автовращение' : 'Включить автовращение'}
                      onClick={() => setRotate(!rotate)}
                    >
                      {rotate ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                  )}
                  <button
                    className="round-button"
                    aria-label="Показать список мест"
                    onClick={() => setView('list')}
                  >
                    <List size={17} />
                  </button>
                </div>
                <div className="world-hint">Вращайте · приближайте · открывайте новое</div>
                <Credits />
              </section>
            ) : null}
            {placesQuery.isPending && !demo ? (
              <div className="cards-loading" role="status">
                Загружаем ваши места…
              </div>
            ) : (
              <section className={`places-section ${view === 'list' ? 'all-places' : ''}`}>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">МАЛЕНЬКИЕ МЕЧТЫ. БОЛЬШИЕ ПУТЕШЕСТВИЯ.</span>
                    <h2>
                      {filters.query
                        ? 'Найденные места'
                        : view === 'list'
                          ? 'Наши места'
                          : 'Сохранено с любовью'}{' '}
                      <span>{visible.length}</span>
                    </h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView(view === 'list' ? 'map' : 'list')}
                  >
                    {view === 'list' ? 'На глобус' : 'Все места'}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                {!visible.length ? (
                  <div className="empty-state">
                    <Compass size={35} />
                    <h3>{places.length ? 'Пока ничего не нашлось' : 'Ваша история ещё впереди'}</h3>
                    <p>
                      {places.length
                        ? 'Попробуйте изменить поиск или сбросить фильтры.'
                        : 'Добавьте первое место — и оно появится на вашей планете.'}
                    </p>
                    <button
                      className="secondary"
                      onClick={places.length ? () => setFilters({ ...emptyFilters }) : newPlace}
                    >
                      {places.length ? 'Сбросить фильтры' : 'Добавить первое место'}
                    </button>
                  </div>
                ) : (
                  <div className="place-grid">
                    {(view === 'map' ? visible.slice(0, 6) : visible).map((p) => (
                      <PlaceCard
                        key={p.id}
                        place={p}
                        onClick={() => setSelectedId(p.id)}
                        onFavorite={() =>
                          void run(async () => {
                            await savePlace({ ...p, favorite: !p.favorite });
                          })
                        }
                        disabled={pending || demo || !online}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {[
          ['map', 'Карта', Globe2],
          ['collections', 'Коллекции', Layers],
          ['dream', 'Мечтаем', Compass],
          ['visited', 'Были', Check],
          ['settings', 'Ещё', Settings],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Globe2;
          return (
            <button
              key={id as string}
              className={active === id ? 'active' : ''}
              onClick={() => (id === 'settings' ? setSettings(true) : nav(id as string))}
            >
              <I size={21} />
              <span>{label as string}</span>
            </button>
          );
        })}
      </nav>
      {selected && (
        <Detail
          key={selected.id}
          place={selected}
          collections={collections}
          disabled={pending || demo || !online}
          demo={demo}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditor(selected);
            setSelectedId(null);
          }}
          onFavorite={() =>
            run(async () => {
              await savePlace({ ...selected, favorite: !selected.favorite });
            })
          }
          onVisit={(date) =>
            run(async () => {
              await savePlace({ ...selected, status: 'visited' }, date);
            })
          }
          onDelete={() =>
            run(async () => {
              await deletePlace(selected);
              setSelectedId(null);
            })
          }
          onUpload={(files, attr) =>
            run(async () => {
              for (const [i, file] of files.entries())
                await uploadPhoto(w!, selected.id, file, attr, selected.photos.length + i);
            })
          }
          onPhotoDelete={(photo) => run(() => removePhoto(photo))}
          onPhotoOrder={(photo, dir) =>
            run(async () => {
              const index = selected.photos.findIndex((p) => p.id === photo.id);
              const other = selected.photos[index + dir];
              if (!other) return;
              const ordered = [...selected.photos];
              [ordered[index], ordered[index + dir]] = [ordered[index + dir], ordered[index]];
              const { error } = await db().rpc('reorder_photos', {
                p_place: selected.id,
                p_ids: ordered.map((p) => p.id),
              });
              if (error) throw error;
            })
          }
        />
      )}
      {editor && (
        <Editor
          initial={editor}
          places={places}
          collections={collections}
          onClose={() => setEditor(null)}
          onSave={save}
          canSave={!demo}
        />
      )}
      {filterOpen && (
        <FilterDialog
          filters={filters}
          setFilters={setFilters}
          places={places}
          collections={collections}
          count={visible.length}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {settings && (
        <Modal title="Наше пространство" onClose={() => setSettings(false)}>
          <div className="settings-content">
            <div className="settings-privacy">
              <LockKeyhole />
              <h3>Личный мир для двоих</h3>
              <p>
                Доступ проверяется в базе данных. Фотографии хранятся в приватном bucket. Внешние
                AI-сервисы не используются.
              </p>
            </div>
            <p className="muted">
              {demo
                ? 'Демонстрационный режим. Сохранение отключено.'
                : `${session?.user.email} · ${live}`}
            </p>
            <button
              className="secondary full"
              disabled={demo || pending || !online}
              onClick={() =>
                void run(async () => {
                  downloadJson(
                    await exportWorkspace(w!),
                    `nash-atlas-${new Date().toISOString().slice(0, 10)}.json`,
                  );
                })
              }
            >
              <Download size={17} />
              Экспорт всех записей в JSON
            </button>
            <p className="muted">
              JSON включает пути и источники фото, но не сами файлы. Скачайте оригиналы отдельно из
              карточек или Storage.
            </p>
            <button
              className="secondary full"
              disabled={demo || pending || !online}
              onClick={() => void run(refresh)}
            >
              <RefreshCw size={17} />
              Обновить данные
            </button>
            <h3>На домашнем экране iPhone</h3>
            <p>
              Откройте опубликованный HTTPS-сайт в Safari → «Поделиться» → «На экран “Домой”» →
              «Добавить». После запуска войдите в аккаунт.
            </p>
            <h3>Сеть и приватность</h3>
            <p>
              Для изменения данных нужен интернет. Оболочка кэшируется, личные API-ответы и фото —
              нет. Карта OSM получает координаты просматриваемых тайлов; 3D-глобус и его текстура
              загружаются с вашего сайта.
            </p>
            <h3>Бесплатное использование</h3>
            <p>
              Приложение не использует платные API. Лимиты Supabase и хостинга действуют отдельно;
              проект может приостанавливаться при неактивности. Не включайте автоматические платные
              обновления.
            </p>
            <button className="secondary full" onClick={() => void logout()}>
              <LogOut size={17} />
              Выйти
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PlaceCard({
  place: p,
  onClick,
  onFavorite,
  disabled,
}: {
  place: Place;
  onClick: () => void;
  onFavorite: () => void;
  disabled: boolean;
}) {
  return (
    <article className={`place-card category-${p.primary_category}`}>
      <button className="place-open" onClick={onClick}>
        <div className="card-image">
          {p.photos[0]?.url ? (
            <img src={p.photos[0].url} alt={p.name} loading="lazy" />
          ) : (
            <div className="landscape">
              <span>{category(p.primary_category)[2]}</span>
            </div>
          )}
          <span className="category-badge">
            {category(p.primary_category)[2]} {category(p.primary_category)[1]}
          </span>
          {p.status === 'visited' && (
            <span className="visited-badge">
              <Check size={11} />
              Уже были
            </span>
          )}
        </div>
        <div className="card-content">
          <span className="card-country">
            {p.country} <span>·</span> {p.city || 'На нашей карте'}
          </span>
          <h3>{p.name}</h3>
          <div className="card-footer">
            <span>{p.tags.length ? `#${p.tags[0]}` : 'Однажды, вместе'}</span>
            <ArrowUpRight size={16} />
          </div>
        </div>
      </button>
      <button
        className={`favorite-button ${p.favorite ? 'is-favorite' : ''}`}
        aria-label={`${p.favorite ? 'Убрать из' : 'Добавить в'} избранное: ${p.name}`}
        disabled={disabled}
        onClick={onFavorite}
      >
        <Heart size={16} fill={p.favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
function Detail({
  place: p,
  collections,
  disabled,
  demo,
  onClose,
  onEdit,
  onFavorite,
  onVisit,
  onDelete,
  onUpload,
  onPhotoDelete,
  onPhotoOrder,
}: {
  place: Place;
  collections: Collection[];
  disabled: boolean;
  demo: boolean;
  onClose: () => void;
  onEdit: () => void;
  onFavorite: () => Promise<void>;
  onVisit: (date: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onUpload: (files: File[], attr: string) => Promise<void>;
  onPhotoDelete: (p: Photo) => Promise<void>;
  onPhotoOrder: (p: Photo, dir: number) => Promise<void>;
}) {
  const [photo, setPhoto] = useState(0),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [attr, setAttr] = useState('Собственное фото');
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const elements = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled)',
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  const index = Math.min(photo, Math.max(0, p.photos.length - 1));
  return (
    <div
      className="detail-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={panel}
        tabIndex={-1}
        className="detail-panel"
        role="dialog"
        aria-label={p.name}
        aria-modal="true"
      >
        <div className="detail-cover">
          {p.photos[index]?.url ? (
            <img src={p.photos[index].url} alt={p.name} />
          ) : (
            <div className={`landscape category-${p.primary_category}`}>
              <span>{category(p.primary_category)[2]}</span>
            </div>
          )}
          <button
            className="round-button detail-back"
            onClick={onClose}
            aria-label="Закрыть карточку"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="round-button detail-heart"
            disabled={disabled}
            onClick={() => void onFavorite()}
            aria-label="Переключить избранное"
          >
            <Heart size={18} fill={p.favorite ? 'currentColor' : 'none'} />
          </button>
          <span className="detail-category">
            {category(p.primary_category)[2]} {category(p.primary_category)[1]}
          </span>
        </div>
        <div className="detail-body">
          <span className="eyebrow">
            {p.country} · {p.city || 'НАША ПЛАНЕТА'}
          </span>
          <h2>{p.name}</h2>
          <div className="detail-location">
            <MapPin size={14} />
            {p.address || p.region || `${p.lat.toFixed(4)}°, ${p.lng.toFixed(4)}°`}
          </div>
          <span className="status-pill">
            {p.status === 'visited' ? <Check size={13} /> : <Compass size={13} />}{' '}
            {p.status === 'visited' ? 'Уже были' : 'В наших мечтах'}
          </span>
          {p.description && <p className="detail-description">{p.description}</p>}
          {p.photos.length > 0 && (
            <>
              <div className="photo-strip">
                {p.photos.map((f, i) => (
                  <button
                    key={f.id}
                    className={i === index ? 'selected' : ''}
                    onClick={() => setPhoto(i)}
                    aria-label={`Фото ${i + 1}`}
                  >
                    <img src={f.url} alt={`Фото ${p.name}, ${i + 1}`} />
                  </button>
                ))}
              </div>
              <div className="photo-actions">
                <span>{p.photos[index].attribution || 'Источник не указан'}</span>
                <a
                  href={p.photos[index].url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Открыть оригинал фото"
                >
                  <Download size={15} />
                </a>
                <button
                  disabled={disabled || index === 0}
                  onClick={() => void onPhotoOrder(p.photos[index], -1)}
                  aria-label="Переместить фото раньше"
                >
                  <MoveUp size={14} />
                </button>
                <button
                  disabled={disabled || index === p.photos.length - 1}
                  onClick={() => void onPhotoOrder(p.photos[index], 1)}
                  aria-label="Переместить фото позже"
                >
                  <MoveDown size={14} />
                </button>
                <button
                  disabled={disabled}
                  aria-label="Удалить фото"
                  onClick={() => {
                    if (confirm('Удалить эту фотографию?')) void onPhotoDelete(p.photos[index]);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="muted">Первое фото — обложка.</p>
            </>
          )}
          <div className="detail-section">
            <span className="eyebrow">КОЛЛЕКЦИИ И ТЕГИ</span>
            <div className="chips">
              {collections
                .filter((c) => p.collection_ids.includes(c.id))
                .map((c) => (
                  <span className="tag collection-tag" key={c.id}>
                    <Layers size={12} />
                    {c.name}
                  </span>
                ))}
              {p.tags.map((t) => (
                <span className="tag" key={t}>
                  #{t}
                </span>
              ))}
              {!p.tags.length && !p.collection_ids.length && (
                <span className="muted">Пока не добавлены</span>
              )}
            </div>
          </div>
          <div className="detail-section">
            <span className="eyebrow">ОРИЕНТИРОВОЧНАЯ ЦЕНА</span>
            <h3>{priceText(p.price)}</h3>
            {p.price && (
              <>
                <p className="muted">
                  {p.price.checked_at
                    ? `Проверено ${p.price.checked_at}`
                    : 'Дата проверки не указана'}{' '}
                  · актуальность не гарантируется
                </p>
                {safeUrl(p.price.source_url) && (
                  <a
                    className="external-link"
                    href={p.price.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Источник цены <ArrowUpRight size={13} />
                  </a>
                )}
              </>
            )}
          </div>
          {p.notes && (
            <div className="personal-note">
              <span className="eyebrow">ЗАМЕТКА ДЛЯ НАС</span>
              <p>{p.notes}</p>
            </div>
          )}
          {p.season && <p>Лучший сезон: {p.season}</p>}
          <div className="link-row">
            {[
              [p.website_url, 'Сайт'],
              [p.booking_url, 'Бронирование / билеты'],
              [
                `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=15/${p.lat}/${p.lng}`,
                'На карте',
              ],
            ]
              .filter(([url]) => safeUrl(url))
              .map(([url, label]) => (
                <a className="secondary" key={label} href={url} target="_blank" rel="noreferrer">
                  {label}
                  <ArrowUpRight size={14} />
                </a>
              ))}
          </div>
          <div className="detail-section">
            <span className="eyebrow">НАШИ ВОСПОМИНАНИЯ</span>
            {p.visits.map((v) => (
              <p key={v.id}>
                ✓ {v.visited_on} {v.notes}
              </p>
            ))}
            <div className="visit-controls">
              <label>
                Дата посещения
                <input
                  aria-label="Дата посещения"
                  type="date"
                  value={date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={disabled || !date}
                onClick={() => void onVisit(date)}
              >
                <Check size={15} />
                Мы здесь были
              </button>
            </div>
          </div>
          <div className="detail-section">
            <label>
              Источник новых фото
              <input value={attr} onChange={(e) => setAttr(e.target.value)} maxLength={300} />
            </label>
            <label className={`upload-button secondary ${disabled ? 'disabled' : ''}`}>
              <ImagePlus size={16} />
              Добавить фотографии
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={disabled}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void onUpload(files, attr);
                  e.target.value = '';
                }}
              />
            </label>
            <p className="muted">
              JPEG, PNG, WebP · до 10 МБ каждый. Только свои фото или фото с разрешением. HEIC
              предварительно экспортируйте в JPEG.
            </p>
          </div>
          <div className="detail-actions">
            <button className="primary" disabled={disabled} onClick={onEdit}>
              <Pencil size={15} />
              Редактировать
            </button>
            <button
              className="danger-button"
              disabled={disabled}
              onClick={() => {
                if (
                  confirm(
                    `Удалить «${p.name}», фотографии и историю посещений? Это действие нельзя отменить.`,
                  )
                )
                  void onDelete();
              }}
              aria-label="Удалить место"
            >
              <Trash2 size={17} />
            </button>
          </div>
          <p className="muted audit">
            {demo
              ? 'Демонстрационная запись'
              : `Создано: ${new Date(p.created_at).toLocaleDateString('ru')} · Изменено: ${new Date(p.updated_at).toLocaleString('ru')} · Автор: ${p.created_by}`}
          </p>
        </div>
      </aside>
    </div>
  );
}
function FilterDialog({
  filters: f,
  setFilters,
  places,
  collections,
  count,
  onClose,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  places: Place[];
  collections: Collection[];
  count: number;
  onClose: () => void;
}) {
  const multi = (
    key: 'countries' | 'cities' | 'regions' | 'categories' | 'collections' | 'tags' | 'seasons',
    options: { id: string; name: string }[],
  ) => (
    <fieldset>
      <legend>
        {
          {
            countries: 'Страны',
            cities: 'Города',
            regions: 'Регионы',
            categories: 'Категории',
            collections: 'Коллекции',
            tags: 'Теги',
            seasons: 'Сезон',
          }[key]
        }
      </legend>
      <div className="chips">
        {options.map((o) => (
          <label className="check-chip" key={o.id}>
            <input
              type="checkbox"
              checked={f[key].includes(o.id)}
              onChange={(e) =>
                setFilters({
                  ...f,
                  [key]: e.target.checked ? [...f[key], o.id] : f[key].filter((v) => v !== o.id),
                })
              }
            />
            {o.name}
          </label>
        ))}
        {!options.length && <span className="muted">Появятся после добавления мест</span>}
      </div>
    </fieldset>
  );
  const unique = (k: 'country' | 'city' | 'region' | 'season') =>
    [...new Set(places.map((p) => p[k]).filter(Boolean))].sort().map((s) => ({ id: s, name: s }));
  return (
    <Modal title="Найдём то самое место" onClose={onClose}>
      <div className="filter-content">
        <p className="muted">
          Между группами — «И», внутри каждой группы — «ИЛИ». Все виды карты и списки используют
          одни фильтры.
        </p>
        {multi('countries', unique('country'))}
        {multi('regions', unique('region'))}
        {multi('cities', unique('city'))}
        {multi(
          'categories',
          categories.map((c) => ({ id: c[0], name: `${c[2]} ${c[1]}` })),
        )}
        {multi('collections', collections)}
        {multi(
          'tags',
          [...new Set(places.flatMap((p) => p.tags))].sort().map((t) => ({ id: t, name: `#${t}` })),
        )}
        {multi('seasons', unique('season'))}
        <label>
          Статус
          <select value={f.status} onChange={(e) => setFilters({ ...f, status: e.target.value })}>
            <option value="">Любой</option>
            <option value="want_to_go">Мечтаем</option>
            <option value="visited">Уже были</option>
          </select>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={f.favorite}
            onChange={(e) => setFilters({ ...f, favorite: e.target.checked })}
          />
          Только избранное
        </label>
        <div className="form-grid">
          <label>
            Максимальный бюджет
            <input
              type="number"
              min={0}
              value={f.maxBudget}
              onChange={(e) => setFilters({ ...f, maxBudget: e.target.value })}
            />
          </label>
          <label>
            Валюта бюджета
            <select
              value={f.currency}
              onChange={(e) => setFilters({ ...f, currency: e.target.value })}
            >
              {Intl.supportedValuesOf('currency').map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">Сравниваются только цены в выбранной валюте; конвертации нет.</p>
        <footer className="form-actions">
          <button className="text-button" onClick={() => setFilters({ ...emptyFilters })}>
            Сбросить всё
          </button>
          <button className="primary" onClick={onClose}>
            Показать {count} мест
          </button>
        </footer>
      </div>
    </Modal>
  );
}
function Collections({
  collections,
  places,
  disabled,
  onFilter,
  onChange,
  workspace,
}: {
  collections: Collection[];
  places: Place[];
  disabled: boolean;
  onFilter: (id: string) => void;
  onChange: (f: () => Promise<void>) => Promise<void>;
  workspace: string;
}) {
  const [name, setName] = useState('');
  const update = async (c: Collection, values: object) => {
    const { error } = await db().from('collections').update(values).eq('id', c.id);
    if (error) throw error;
  };
  return (
    <section className="collections-page">
      <span className="eyebrow">СОБИРАЕМ НЕ ВЕЩИ, А ВПЕЧАТЛЕНИЯ</span>
      <h1>
        Наши коллекции<span className="heading-dot">.</span>
      </h1>
      <p className="muted">Одно место может быть частью нескольких историй.</p>
      <form
        className="collection-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void onChange(async () => {
            const { error } = await db()
              .from('collections')
              .insert({
                workspace_id: workspace,
                name: name.trim(),
                sort_order: collections.length
                  ? Math.max(...collections.map((c) => c.sort_order)) + 1
                  : 0,
              });
            if (error) throw error;
            setName('');
          });
        }}
      >
        <input
          aria-label="Название новой коллекции"
          placeholder="Новая коллекция…"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary" disabled={disabled || !name.trim()}>
          <Plus size={17} />
          Создать
        </button>
      </form>
      <div className="collection-grid">
        {collections.map((c, i) => (
          <article className={`collection-tile color-${i % 4}`} key={c.id}>
            <button className="collection-tile-open" onClick={() => onFilter(c.id)}>
              <Layers size={28} />
              <h2>{c.name}</h2>
              <p>
                {places.filter((p) => p.collection_ids.includes(c.id)).length} мест{' '}
                <ArrowUpRight size={15} />
              </p>
            </button>
            <div className="collection-actions">
              <button
                disabled={disabled}
                onClick={() => {
                  const n = prompt('Новое название коллекции', c.name);
                  if (n?.trim()) void onChange(() => update(c, { name: n.trim().slice(0, 100) }));
                }}
                aria-label={`Переименовать ${c.name}`}
              >
                <Pencil size={15} />
              </button>
              <button
                disabled={disabled || i === 0}
                aria-label={`Переместить выше ${c.name}`}
                onClick={() =>
                  void onChange(async () => {
                    const ordered = [...collections];
                    [ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]];
                    const { error } = await db().rpc('reorder_collections', {
                      p_workspace: workspace,
                      p_ids: ordered.map((c) => c.id),
                    });
                    if (error) throw error;
                  })
                }
              >
                <MoveUp size={15} />
              </button>
              <button
                disabled={disabled || i === collections.length - 1}
                aria-label={`Переместить ниже ${c.name}`}
                onClick={() =>
                  void onChange(async () => {
                    const ordered = [...collections];
                    [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
                    const { error } = await db().rpc('reorder_collections', {
                      p_workspace: workspace,
                      p_ids: ordered.map((c) => c.id),
                    });
                    if (error) throw error;
                  })
                }
              >
                <MoveDown size={15} />
              </button>
              <button
                disabled={disabled}
                aria-label={`Удалить коллекцию ${c.name}`}
                onClick={() => {
                  if (confirm(`Удалить коллекцию «${c.name}»? Места останутся.`))
                    void onChange(async () => {
                      const { error } = await db().from('collections').delete().eq('id', c.id);
                      if (error) throw error;
                    });
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!collections.length && (
        <div className="empty-state">
          <Layers />
          <h3>У каждой мечты может быть своя коллекция</h3>
          <p>Создайте первую подборку выше.</p>
        </div>
      )}
    </section>
  );
}
function Credits() {
  return (
    <div className="credits">
      Земля: NASA / Blue Marble · контуры: Natural Earth ·{' '}
      <a href="/ATTRIBUTION.txt" target="_blank" rel="noreferrer">
        Источники
      </a>
    </div>
  );
}

function useAtlasView() {
  const parse = (): 'map' | 'list' | 'collections' =>
    location.pathname === '/collections'
      ? 'collections'
      : location.pathname === '/places'
        ? 'list'
        : 'map';
  const [view, set] = useState(parse);
  useEffect(() => {
    const back = () => set(parse());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const navigate = (v: 'map' | 'list' | 'collections') => {
    const path = v === 'map' ? '/' : v === 'list' ? '/places' : '/collections';
    if (location.pathname !== path) history.pushState({}, '', path);
    set(v);
  };
  return [view, navigate] as const;
}
