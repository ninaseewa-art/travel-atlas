/** Run only against an ephemeral LOCAL Supabase instance. Never against production. */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const statusFile = process.env.ATLAS_LOCAL_STATUS_FILE;
if (!statusFile) {
  console.error('Set ATLAS_LOCAL_STATUS_FILE to a private JSON output of supabase status -o json.');
  process.exit(2);
}
const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
const url = status.API_URL ?? status.api_url;
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
  throw new Error('Refusing to seed a non-local Supabase instance');
const anon = status.ANON_KEY ?? status.anon_key;
const admin = createClient(url, status.SERVICE_ROLE_KEY ?? status.service_role_key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ok = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const suffix = randomUUID().slice(0, 8),
  password = `Test-${randomUUID()}!`;
const users = [];
let workspace;
try {
  for (const name of ['one', 'two', 'outsider'])
    users.push(
      ok(
        await admin.auth.admin.createUser({
          email: `atlas-${name}-${suffix}@example.com`,
          password,
          email_confirm: true,
        }),
      ).user,
    );
  workspace = ok(
    await admin
      .from('workspaces')
      .insert({ name: `Test workspace ${suffix}` })
      .select('id')
      .single(),
  ).id;
  ok(
    await admin
      .from('allowed_members')
      .insert(users.slice(0, 2).map((u) => ({ workspace_id: workspace, email: u.email }))),
  );
  ok(
    await admin
      .from('collections')
      .insert(
        ['Замки', 'Романтические места'].map((name, i) => ({
          workspace_id: workspace,
          name,
          sort_order: i,
        })),
      ),
  );
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anon,
    ATLAS_TEST_URL: url,
    ATLAS_TEST_ANON_KEY: anon,
    ATLAS_TEST_OWNER1_EMAIL: users[0].email,
    ATLAS_TEST_OWNER1_PASSWORD: password,
    ATLAS_TEST_OWNER2_EMAIL: users[1].email,
    ATLAS_TEST_OWNER2_PASSWORD: password,
    ATLAS_TEST_OUTSIDER_EMAIL: users[2].email,
    ATLAS_TEST_OUTSIDER_PASSWORD: password,
  };
  for (const args of [
    ['scripts/integration.mjs'],
    ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.live.config.ts'],
  ]) {
    const child = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
    if (child.status !== 0) throw new Error(`Validation failed with exit ${child.status}`);
  }
} finally {
  if (workspace) {
    const { data: files } = await admin
      .from('photos')
      .select('storage_path')
      .eq('workspace_id', workspace);
    if (files?.length)
      await admin.storage.from('atlas-photos').remove(files.map((p) => p.storage_path));
    await admin.from('workspaces').delete().eq('id', workspace);
  }
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
}
