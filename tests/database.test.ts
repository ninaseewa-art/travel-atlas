import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const pg = new PGlite();
const w = '10000000-0000-4000-8000-000000000001',
  w2 = '10000000-0000-4000-8000-000000000002';
const u1 = '20000000-0000-4000-8000-000000000001',
  u2 = '20000000-0000-4000-8000-000000000002',
  u3 = '20000000-0000-4000-8000-000000000003';
let pid: string;
let updated: string;
async function asUser(id: string) {
  await pg.exec('reset role');
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec('set role authenticated');
}
async function scalar<T>(sql: string, params: unknown[] = []) {
  const r = await pg.query<Record<string, T>>(sql, params);
  return Object.values(r.rows[0])[0];
}
const payload = (extra: object = {}) => ({
  workspace_id: w,
  name: 'Замок',
  country: 'Германия',
  lat: 47.55,
  lng: 10.75,
  primary_category: 'castles',
  status: 'want_to_go',
  favorite: false,
  tags: ['Горы', ' вдвоём '],
  collection_ids: [],
  price: null,
  ...extra,
});
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
 create publication supabase_realtime;`);
  for (const file of [
    '001_atlas.sql',
    '002_ordering.sql',
    '003_validation.sql',
    '004_gpt_actions.sql',
  ])
    await pg.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await pg.query(
    'insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now()),($5,$6,now())',
    [u1, 'one@example.com', u2, 'two@example.com', u3, 'outsider@example.com'],
  );
  await pg.query('insert into public.workspaces(id) values($1),($2)', [w, w2]);
  await pg.query('insert into public.allowed_members(workspace_id,email) values($1,$2),($1,$3)', [
    w,
    'one@example.com',
    'two@example.com',
  ]);
});
afterAll(async () => {
  await pg.close();
});
describe.sequential('PostgreSQL: настоящие миграции и RLS в PGlite', () => {
  it('проверяет серверное приглашение и лимит двоих', async () => {
    await asUser(u1);
    expect(await scalar('select public.claim_workspace()')).toBe(w);
    await asUser(u2);
    expect(await scalar('select public.claim_workspace()')).toBe(w);
    await asUser(u3);
    await expect(pg.query('select public.claim_workspace()')).rejects.toThrow('not invited');
    await pg.exec('reset role');
    await expect(
      pg.query('insert into public.allowed_members values($1,$2)', [w, 'third@example.com']),
    ).rejects.toThrow('Only two');
  });
  it('создаёт место с нормализованными тегами транзакционно', async () => {
    await asUser(u1);
    pid = await scalar<string>('select public.save_place($1::jsonb)', [JSON.stringify(payload())]);
    expect(await scalar('select count(*)::int from places')).toBe(1);
    expect(await scalar('select count(*)::int from place_tags')).toBe(2);
    expect(await scalar('select created_by from places where id=$1', [pid])).toBe(u1);
    updated = await scalar('select updated_at::text from places where id=$1', [pid]);
  });
  it('второй участник читает и редактирует; авторство сохраняется', async () => {
    await asUser(u2);
    expect(await scalar('select name from places where id=$1', [pid])).toBe('Замок');
    await pg.query('select public.save_place($1::jsonb)', [
      JSON.stringify(payload({ id: pid, updated_at: updated, name: 'Замок вдвоём' })),
    ]);
    expect(await scalar('select created_by from places where id=$1', [pid])).toBe(u1);
  });
  it('отклоняет устаревшее изменение', async () => {
    await asUser(u1);
    await expect(
      pg.query('select public.save_place($1::jsonb)', [
        JSON.stringify(payload({ id: pid, updated_at: updated })),
      ]),
    ).rejects.toThrow('CONFLICT');
  });
  it('третий не читает, не меняет и не вступает в пространство', async () => {
    await asUser(u3);
    expect(await scalar('select count(*)::int from places')).toBe(0);
    expect(await scalar('select count(*)::int from memberships')).toBe(0);
    await expect(
      pg.query('insert into memberships(workspace_id,user_id) values($1,$2)', [w, u3]),
    ).rejects.toThrow();
    await expect(
      pg.query('select public.save_place($1::jsonb)', [JSON.stringify(payload())]),
    ).rejects.toThrow('Access denied');
    const r = await pg.query('delete from places where id=$1 returning id', [pid]);
    expect(r.rows).toHaveLength(0);
  });
  it('запрещает связи с коллекцией другого пространства и откатывает всё', async () => {
    await pg.exec('reset role');
    const cid = await scalar<string>(
      'insert into collections(workspace_id,name) values($1,$2) returning id',
      [w2, 'Чужая'],
    );
    await asUser(u1);
    await expect(
      pg.query('select public.save_place($1::jsonb)', [
        JSON.stringify(payload({ name: 'Не должно сохраниться', collection_ids: [cid] })),
      ]),
    ).rejects.toThrow();
    expect(await scalar('select count(*)::int from places')).toBe(1);
  });
  it('хранит две коллекции, несколько тегов, цену и посещение', async () => {
    await asUser(u1);
    const ids: string[] = [];
    for (const name of ['Замки', 'Романтика'])
      ids.push(
        await scalar('insert into collections(workspace_id,name) values($1,$2) returning id', [
          w,
          name,
        ]),
      );
    updated = await scalar('select updated_at::text from places where id=$1', [pid]);
    await pg.query('select public.save_place($1::jsonb)', [
      JSON.stringify(
        payload({
          id: pid,
          updated_at: updated,
          collection_ids: ids,
          status: 'visited',
          visited_on: '2026-10-01',
          price: {
            amount_min: 15,
            currency: 'EUR',
            unit: 'ticket',
            source_url: 'https://example.com',
            checked_at: '2026-10-01',
          },
        }),
      ),
    ]);
    expect(await scalar('select count(*)::int from collection_places')).toBe(2);
    expect(await scalar('select count(*)::int from prices')).toBe(1);
    expect(await scalar('select count(*)::int from visits')).toBe(1);
    await pg.query('delete from collections where id=$1', [ids[0]]);
    expect(await scalar('select count(*)::int from places')).toBe(1);
    expect(await scalar('select count(*)::int from collection_places')).toBe(1);
  });
  it('RLS Storage: участник видит файлы, посторонний не видит и не загружает', async () => {
    const path = `${w}/${pid}/photo.jpg`;
    await asUser(u1);
    await pg.query("insert into storage.objects(bucket_id,name) values('atlas-photos',$1)", [path]);
    await asUser(u2);
    expect(await scalar('select count(*)::int from storage.objects')).toBe(1);
    await asUser(u3);
    expect(await scalar('select count(*)::int from storage.objects')).toBe(0);
    await expect(
      pg.query("insert into storage.objects(bucket_id,name) values('atlas-photos',$1)", [path]),
    ).rejects.toThrow();
  });
  it('ограничивает координаты и цены даже через прямой API', async () => {
    await asUser(u1);
    await expect(
      pg.query('select public.save_place($1::jsonb)', [JSON.stringify(payload({ lat: 91 }))]),
    ).rejects.toThrow();
    await expect(
      pg.query('select public.save_place($1::jsonb)', [
        JSON.stringify(payload({ price: { amount_min: -1, currency: 'EUR', unit: 'night' } })),
      ]),
    ).rejects.toThrow();
  });
  it('запрещает неизвестную валюту и поддельный путь фото', async () => {
    await asUser(u1);
    await expect(
      pg.query('select public.save_place($1::jsonb)', [
        JSON.stringify(payload({ price: { amount_min: 10, currency: 'ZZZ', unit: 'ticket' } })),
      ]),
    ).rejects.toThrow();
    await expect(
      pg.query('insert into photos(workspace_id,place_id,storage_path) values($1,$2,$3)', [
        w,
        pid,
        `${w2}/${pid}/fake.jpg`,
      ]),
    ).rejects.toThrow();
  });
  it('третий не читает ни одну приватную таблицу и не может изменить разрешённые email', async () => {
    await asUser(u3);
    for (const table of [
      'workspaces',
      'memberships',
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
    ])
      expect(await scalar(`select count(*)::int from ${table}`)).toBe(0);
    await expect(pg.query('select * from allowed_members')).rejects.toThrow();
    await expect(
      pg.query('insert into allowed_members values($1,$2)', [w, 'outsider@example.com']),
    ).rejects.toThrow();
  });
  it('удаляет место с каскадными связями', async () => {
    await asUser(u2);
    await pg.query('delete from places where id=$1', [pid]);
    for (const t of ['places', 'place_tags', 'collection_places', 'prices', 'visits'])
      expect(await scalar(`select count(*)::int from ${t}`)).toBe(0);
  });
});

describe.sequential('ChatGPT capability: реальные SQL и границы доступа', () => {
  it('изолирует атлас, сохраняет/читает/обновляет, защищает повторы и отзыв ключа', async () => {
    await asUser(u3);
    await expect(pg.query('select create_gpt_connection($1)', [w])).rejects.toThrow(
      'ACCESS_DENIED',
    );
    await asUser(u1);
    const token = await scalar<string>('select create_gpt_connection($1)', [w]);
    expect(token).toMatch(/^atlas_[a-f0-9]{64}$/);
    await pg.exec('reset role');
    expect(
      await scalar<string>('select token_hash from gpt_connections where workspace_id=$1', [w]),
    ).not.toBe(token);
    await pg.query("select set_config('request.jwt.claim.sub','',false)");
    await pg.exec('set role anon');
    await expect(pg.query('select * from gpt_connections')).rejects.toThrow();
    await expect(
      pg.query('select gpt_atlas($1,$2,$3)', ['atlas_' + '0'.repeat(64), 'list', {}]),
    ).rejects.toThrow('INVALID_TOKEN');
    const call = <T>(action: string, body: object = {}) =>
      scalar<T>('select gpt_atlas($1,$2,$3)', [token, action, body]);
    const body = {
      request_id: 'request-00000001',
      place: payload({
        workspace_id: w2,
        tags: ['замок', 'романтика'],
        notes: 'Личное пожелание',
        description: 'О месте\nЗамок\nАтмосфера\nОщущение сказки',
      }),
    };
    const saved = await call<{ id: string; updated_at: string; saved: boolean }>('save', body);
    expect(saved.saved).toBe(true);
    expect(await call('save', body)).toEqual(saved);
    await expect(call('save', { ...body, place: payload({ name: 'Другое' }) })).rejects.toThrow(
      'REQUEST_CONFLICT',
    );
    const list = await call<{
      places: { id: string; notes: string; collection_ids: string[]; tags: string[] }[];
    }>('list');
    expect(list.places).toHaveLength(1);
    expect(list.places[0].notes).toBe('Личное пожелание');
    expect(await scalar('select auth.uid()')).toBe(null);
    const col = await call<{ id: string }>('create_collection', {
      name: 'Сказочные замки',
      request_id: 'collection-000001',
    });
    await call('save', {
      request_id: 'request-00000002',
      place: {
        id: saved.id,
        updated_at: saved.updated_at,
        favorite: true,
        collection_ids: [col.id],
      },
    });
    const changed = await call<{
      places: { notes: string; tags: string[]; favorite: boolean; updated_at: string }[];
    }>('get', { id: saved.id });
    expect(changed.places[0].favorite).toBe(true);
    expect(changed.places[0].notes).toBe('Личное пожелание');
    expect(changed.places[0].tags).toContain('замок');
    await expect(
      call('save', {
        request_id: 'request-00000003',
        place: { id: saved.id, updated_at: '2000-01-01T00:00:00Z', favorite: false },
      }),
    ).rejects.toThrow('STALE_WRITE');
    await pg.exec('reset role');
    await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [u3]);
    const foreign = await scalar<string>(
      "insert into places(workspace_id,name,country,lat,lng,primary_category,created_by) values($1,'Чужое','Италия',45,10,'castles',$2) returning id",
      [w2, u3],
    );
    await pg.exec('set role anon');
    expect((await call<{ places: unknown[] }>('get', { id: foreign })).places).toHaveLength(0);
    await expect(
      call('save', {
        request_id: 'request-00000004',
        place: { id: foreign, updated_at: changed.places[0].updated_at, name: 'Взлом' },
      }),
    ).rejects.toThrow('NOT_FOUND');
    await expect(call('delete', { id: saved.id })).rejects.toThrow('INVALID_ACTION');
    await asUser(u1);
    await pg.query('select revoke_gpt_connection($1)', [w]);
    await pg.exec('reset role; set role anon');
    await expect(call('list')).rejects.toThrow('INVALID_TOKEN');
    await asUser(u1);
    const replacement = await scalar<string>('select create_gpt_connection($1)', [w]);
    expect(replacement).not.toBe(token);
    await pg.exec('reset role');
    await pg.query(
      'update gpt_connections set rate_count=60,rate_window=now() where workspace_id=$1',
      [w],
    );
    await pg.exec('set role anon');
    await expect(scalar('select gpt_atlas($1,$2,$3)', [replacement, 'list', {}])).rejects.toThrow(
      'RATE_LIMIT',
    );
    await pg.exec('reset role');
    await pg.query('update gpt_connections set rate_count=0 where workspace_id=$1', [w]);
    await pg.query('delete from memberships where workspace_id=$1 and user_id=$2', [w, u1]);
    await pg.exec('set role anon');
    await expect(scalar('select gpt_atlas($1,$2,$3)', [replacement, 'list', {}])).rejects.toThrow(
      'INVALID_TOKEN',
    );
    await pg.exec('reset role');
    await pg.query('insert into memberships(workspace_id,user_id) values($1,$2)', [w, u1]);
    await pg.query(
      "update gpt_connections set expires_at=now()-interval '1 second' where workspace_id=$1",
      [w],
    );
    await pg.exec('set role anon');
    await expect(scalar('select gpt_atlas($1,$2,$3)', [replacement, 'list', {}])).rejects.toThrow(
      'INVALID_TOKEN',
    );
  });
});
