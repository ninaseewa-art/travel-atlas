/** Ephemeral users/workspace on LOCAL Supabase only. Never runs against a hosted project. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createHandler } from '../supabase/functions/atlas-gpt/index.ts';
const path = process.env.ATLAS_LOCAL_STATUS_FILE;
if (!path) throw new Error('Set ATLAS_LOCAL_STATUS_FILE to local supabase status JSON');
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
const url = config.API_URL;
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error('Local Supabase required');
const admin = createClient(url, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const member = createClient(url, config.ANON_KEY, { auth: { persistSession: false } });
const localEndpoint = process.env.ATLAS_GPT_LOCAL_ENDPOINT;
if (localEndpoint && !['127.0.0.1', 'localhost'].includes(new URL(localEndpoint).hostname))
  throw new Error('Local function endpoint required');
const handler = localEndpoint
  ? (request) =>
      fetch(new URL(new URL(request.url).pathname, localEndpoint).href, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: 'half',
      })
  : createHandler({ url, key: config.ANON_KEY });
const ok = ({ data, error }) => {
  if (error) throw error;
  return data;
};
let user, workspace;
try {
  const email = `atlas-gpt-${randomUUID()}@example.com`,
    password = randomUUID() + 'aA1!';
  user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
  workspace = ok(
    await admin.from('workspaces').insert({ name: 'Ephemeral GPT test' }).select('id').single(),
  ).id;
  ok(await admin.from('allowed_members').insert({ workspace_id: workspace, email }));
  ok(await member.auth.signInWithPassword({ email, password }));
  ok(await member.rpc('claim_workspace'));
  const token = ok(await member.rpc('create_gpt_connection', { w: workspace }));
  const call = async (path, body) =>
    handler(
      new Request('https://local/functions/v1/atlas-gpt' + path, {
        method: body ? 'POST' : 'GET',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  let r = await call('/places');
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).places, []);
  const body = {
    request_id: randomUUID(),
    place: {
      name: 'Замок для проверки GPT',
      country: 'Германия',
      lat: 47.5576,
      lng: 10.7498,
      primary_category: 'castles',
      description: 'О месте\nЗамок\nОсобенности\nАрхитектура\nАтмосфера\nМожет вдохновить',
      tags: ['романтика'],
      notes: 'Сохранить личное пожелание',
    },
  };
  r = await call('/places', body);
  assert.equal(r.status, 200);
  const saved = await r.json();
  assert.equal(saved.saved, true);
  r = await call('/places', body);
  assert.equal((await r.json()).id, saved.id);
  const collection = await (
    await call('/collections', { request_id: randomUUID(), name: 'Сказочные места' })
  ).json();
  r = await call('/places', {
    request_id: randomUUID(),
    place: {
      id: saved.id,
      updated_at: saved.updated_at,
      collection_ids: [collection.id],
      favorite: true,
    },
  });
  assert.equal(r.status, 200);
  const row = (await (await call('/places/' + saved.id)).json()).places[0];
  assert.equal(row.notes, body.place.notes);
  assert.equal(row.favorite, true);
  assert.deepEqual(row.tags, ['романтика']);
  r = await call('/places', {
    request_id: randomUUID(),
    place: { id: saved.id, updated_at: '2000-01-01T00:00:00Z', name: 'Stale' },
  });
  assert.equal(r.status, 409);
  assert.equal(
    ok(await member.from('places').select('id').eq('workspace_id', workspace)).length,
    1,
  );
  ok(await member.rpc('revoke_gpt_connection', { w: workspace }));
  r = await call('/places');
  assert.equal(r.status, 401);
  console.log(
    'PASS: real Auth + HTTP handler + PostgREST + PostgreSQL; create/read/update/collections/idempotency/conflict/revoke',
  );
} finally {
  if (workspace) {
    const ids = ok(await admin.from('places').select('id').eq('workspace_id', workspace)).map(
      (x) => x.id,
    );
    if (ids.length) ok(await admin.from('places').delete().in('id', ids));
    ok(await admin.from('gpt_connections').delete().eq('workspace_id', workspace));
    ok(await admin.from('collections').delete().eq('workspace_id', workspace));
    ok(await admin.from('tags').delete().eq('workspace_id', workspace));
    ok(await admin.from('allowed_members').delete().eq('workspace_id', workspace));
    ok(await admin.from('memberships').delete().eq('workspace_id', workspace));
    ok(await admin.from('workspaces').delete().eq('id', workspace));
  }
  if (user) ok(await admin.auth.admin.deleteUser(user.id));
}
