/** Live Supabase verification. Uses user accounts, never a service-role key. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const names = [
  'ATLAS_TEST_URL',
  'ATLAS_TEST_ANON_KEY',
  'ATLAS_TEST_OWNER1_EMAIL',
  'ATLAS_TEST_OWNER1_PASSWORD',
  'ATLAS_TEST_OWNER2_EMAIL',
  'ATLAS_TEST_OWNER2_PASSWORD',
  'ATLAS_TEST_OUTSIDER_EMAIL',
  'ATLAS_TEST_OUTSIDER_PASSWORD',
];
const missing = names.filter((n) => !process.env[n]);
if (missing.length) {
  console.error(
    `NOT RUN: provide ${missing.join(', ')} in a private environment. See README. No live test passed.`,
  );
  process.exit(2);
}
const client = () =>
  createClient(process.env.ATLAS_TEST_URL, process.env.ATLAS_TEST_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const a = client(),
  b = client(),
  c = client(),
  anon = client();
const ok = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const auth = async (db, n) =>
  ok(
    await db.auth.signInWithPassword({
      email: process.env[`ATLAS_TEST_${n}_EMAIL`],
      password: process.env[`ATLAS_TEST_${n}_PASSWORD`],
    }),
  );
let pid,
  workspace,
  collectionIds = [],
  path;
try {
  await auth(a, 'OWNER1');
  await auth(b, 'OWNER2');
  await auth(c, 'OUTSIDER');
  workspace = ok(await a.rpc('claim_workspace'));
  assert.equal(ok(await b.rpc('claim_workspace')), workspace);
  assert.ok((await c.rpc('claim_workspace')).error);
  for (const name of ['Integration A', 'Integration B'])
    collectionIds.push(
      ok(
        await a.from('collections').insert({ workspace_id: workspace, name }).select('id').single(),
      ).id,
    );
  const p = {
    workspace_id: workspace,
    name: `Integration ${randomUUID()}`,
    country: 'Италия',
    lat: 46.5,
    lng: 12.1,
    primary_category: 'hotels',
    status: 'want_to_go',
    tags: ['горы', 'вдвоём'],
    collection_ids: collectionIds,
    favorite: true,
    price: {
      amount_min: 100,
      currency: 'EUR',
      unit: 'night',
      checked_at: '2026-10-18',
      source_url: 'https://example.com',
    },
  };
  pid = ok(await a.rpc('save_place', { p }));
  let saved = ok(
    await b
      .from('places')
      .select('*,place_tags(tags(name)),collection_places(collection_id),prices(*)')
      .eq('id', pid)
      .single(),
  );
  assert.equal(saved.place_tags.length, 2);
  assert.equal(saved.collection_places.length, 2);
  assert.equal((Array.isArray(saved.prices) ? saved.prices[0] : saved.prices).unit, 'night');
  assert.equal(ok(await c.from('places').select('id').eq('id', pid)).length, 0);
  assert.equal(ok(await anon.from('places').select('id').eq('id', pid)).length, 0);
  assert.equal(
    ok(await c.from('places').update({ name: 'attack' }).eq('id', pid).select()).length,
    0,
  );
  const changed = {
    ...p,
    id: pid,
    updated_at: saved.updated_at,
    status: 'visited',
    visited_on: '2026-10-01',
  };
  ok(await b.rpc('save_place', { p: changed }));
  assert.ok((await a.rpc('save_place', { p: changed })).error, 'stale writes must fail');
  saved = ok(await a.from('places').select('*').eq('id', pid).single());
  assert.equal(saved.status, 'visited');
  path = `${workspace}/${pid}/${randomUUID()}.png`;
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
    'base64',
  );
  ok(await a.storage.from('atlas-photos').upload(path, image, { contentType: 'image/png' }));
  ok(
    await a.from('photos').insert({
      workspace_id: workspace,
      place_id: pid,
      storage_path: path,
      attribution: 'Integration test pixel',
    }),
  );
  assert.ok(ok(await b.storage.from('atlas-photos').createSignedUrl(path, 60)).signedUrl);
  assert.ok((await c.storage.from('atlas-photos').download(path)).error);
  assert.ok((await anon.storage.from('atlas-photos').download(path)).error);
  assert.ok(
    (
      await c.storage
        .from('atlas-photos')
        .upload(`${workspace}/${pid}/attack.png`, image, { contentType: 'image/png' })
    ).error,
  );
  const outsiderFiles = await c.storage.from('atlas-photos').list(`${workspace}/${pid}`);
  assert.ok(outsiderFiles.error || outsiderFiles.data.length === 0);
  ok(await a.from('collections').delete().eq('id', collectionIds[0]));
  assert.equal(ok(await b.from('places').select('id').eq('id', pid)).length, 1);
  ok(await b.from('places').delete().eq('id', pid));
  assert.equal(ok(await a.from('places').select('id').eq('id', pid)).length, 0);
  console.log(
    'PASS: real Supabase Auth, two owners, third-user and anonymous RLS, transactional relations, conflict protection, private Storage, delete.',
  );
} finally {
  if (pid) await a.from('places').delete().eq('id', pid);
  if (path) await a.storage.from('atlas-photos').remove([path]);
  for (const id of collectionIds) await a.from('collections').delete().eq('id', id);
  for (const db of [a, b, c]) await db.auth.signOut();
}
