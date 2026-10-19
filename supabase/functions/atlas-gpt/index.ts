// No SDK, OpenAI API key, service-role key or external package required.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (r: Request) => Promise<Response>): void;
};
export function createHandler(config: { url: string; key: string }, fetcher: typeof fetch = fetch) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  return async (request: Request): Promise<Response> => {
    const token = request.headers.get('authorization')?.match(/^Bearer (atlas_[a-f0-9]{64})$/)?.[1];
    if (!token) return json({ error: 'INVALID_TOKEN' }, 401);
    if (!config.url || !config.key) return json({ error: 'SERVER_NOT_CONFIGURED' }, 503);
    const url = new URL(request.url);
    const path = url.pathname.split('/atlas-gpt')[1] ?? '';
    let action: string,
      payload: Record<string, unknown> = {};
    if (request.method === 'GET' && path === '/places') {
      action = 'list';
      payload = {
        q: (url.searchParams.get('q') ?? '').slice(0, 200),
        offset: Number(url.searchParams.get('offset') ?? 0),
      };
      if (!Number.isInteger(payload.offset) || Number(payload.offset) < 0)
        return json({ error: 'INVALID_INPUT' }, 400);
    } else if (request.method === 'GET' && /^\/places\/[a-f0-9-]{36}$/.test(path)) {
      action = 'get';
      payload = { id: path.split('/')[2] };
    } else if (request.method === 'GET' && path === '/collections') action = 'collections';
    else if (request.method === 'POST' && (path === '/places' || path === '/collections')) {
      if (!request.headers.get('content-type')?.includes('application/json'))
        return json({ error: 'JSON_REQUIRED' }, 415);
      // Read a bounded stream; Content-Length is optional and cannot be trusted.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'INVALID_INPUT' }, 400);
      let length = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 65536) {
          await reader.cancel();
          return json({ error: 'BODY_TOO_LARGE' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        payload = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: 'INVALID_INPUT' }, 400);
      }
      if (!payload || Array.isArray(payload) || typeof payload !== 'object')
        return json({ error: 'INVALID_INPUT' }, 400);
      action = path === '/places' ? 'save' : 'create_collection';
    } else return json({ error: 'NOT_FOUND' }, 404);
    try {
      const response = await fetcher(`${config.url}/rest/v1/rpc/gpt_atlas`, {
        method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token, p_action: action, p_payload: payload }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) {
        const code = String(result.message ?? '');
        const errors: Record<string, number> = {
          INVALID_TOKEN: 401,
          RATE_LIMIT: 429,
          NOT_FOUND: 404,
          STALE_WRITE: 409,
          REQUEST_CONFLICT: 409,
          INVALID_INPUT: 400,
          INVALID_REQUEST_ID: 400,
        };
        for (const [error, status] of Object.entries(errors))
          if (code === error) return json({ error }, status);
        // Never return raw database errors, SQL, upstream request bodies or credentials.
        return json(
          { error: result.code === 'PGRST202' ? 'MIGRATION_REQUIRED' : 'INVALID_INPUT' },
          result.code === 'PGRST202' ? 503 : 400,
        );
      }
      return json(action === 'collections' ? { collections: result } : result);
    } catch {
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}
if (typeof Deno !== 'undefined')
  Deno.serve(
    createHandler({
      url: Deno.env.get('SUPABASE_URL') ?? '',
      key: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    }),
  );
