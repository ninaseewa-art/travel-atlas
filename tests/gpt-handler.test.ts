import { describe, it, expect, vi } from 'vitest';
import { createHandler } from '../supabase/functions/atlas-gpt/index';
const token = 'atlas_' + 'a'.repeat(64);
const request = (path = '/places', init: RequestInit = {}) =>
  new Request('https://example.supabase.co/functions/v1/atlas-gpt' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, ...init.headers },
  });
describe('GPT Actions HTTP boundary', () => {
  it('rejects unauthenticated calls without touching the database', async () => {
    const fetcher = vi.fn();
    const handler = createHandler({ url: 'https://example.supabase.co', key: 'public' }, fetcher);
    expect(
      (await handler(new Request('https://example.supabase.co/functions/v1/atlas-gpt/places')))
        .status,
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps routes, keeps tokens out of URLs and disables response caching', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: 'one', name: 'Замки' }]), { status: 200 }),
      );
    const response = await createHandler(
      { url: 'https://example.supabase.co', key: 'public' },
      fetcher,
    )(request('/collections'));
    expect(await response.json()).toEqual({ collections: [{ id: 'one', name: 'Замки' }] });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetcher.mock.calls[0][0]).not.toContain(token);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      p_token: token,
      p_action: 'collections',
    });
  });
  it('rejects huge or invalid bodies, unsupported methods and bad pagination', async () => {
    const fetcher = vi.fn();
    const handler = createHandler({ url: 'https://example.supabase.co', key: 'public' }, fetcher);
    expect(
      (
        await handler(
          request('/places', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'x'.repeat(65537),
          }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handler(
          request('/places', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'null',
          }),
        )
      ).status,
    ).toBe(400);
    expect((await handler(request('/places?offset=no'))).status).toBe(400);
    expect((await handler(request('/places', { method: 'DELETE' }))).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns actionable errors without leaking raw SQL or credentials', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'STALE_WRITE' }), { status: 400 }));
    const handler = createHandler({ url: 'https://example.supabase.co', key: 'public' }, fetcher);
    const stale = await handler(request());
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: 'STALE_WRITE' });
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ message: 'SQL secret ' + token }), { status: 500 }),
    );
    const response = await handler(request());
    expect(await response.text()).not.toContain(token);
  });
});
