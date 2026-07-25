import { describe, it, expect, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { api, db } from './helpers';
import * as schema from '../src/db/schema';

// The OAuth callbacks call the provider's token + userinfo endpoints via the
// global fetch. Stub it so we can exercise the full exchange offline.
function mockFetch(routes: Array<{ match: RegExp; status: number; body: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : (input as Request).url ?? String(input);
      const route = routes.find((r) => r.match.test(url));
      if (!route) throw new Error(`unexpected fetch: ${url}`);
      const body =
        typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
      return new Response(body, {
        status: route.status,
        headers: { 'content-type': 'application/json' },
      });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Google OAuth callback', () => {
  it('exchanges the code, creates the user, and redirects with a token', async () => {
    mockFetch([
      { match: /oauth2\.googleapis\.com\/token/, status: 200, body: { access_token: 'access-123' } },
      {
        match: /googleapis\.com\/oauth2\/v2\/userinfo/,
        status: 200,
        body: { id: 'google-uid', email: 'oauth@test.dev', name: 'OAuth User' },
      },
    ]);

    const res = await api('/api/auth/google/callback?code=auth-code');
    expect(res.status).toBe(302);

    const location = res.headers.get('location')!;
    expect(location).toContain('signchain://auth/callback');
    expect(location).toContain('token=');

    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'oauth@test.dev'));
    expect(user.authProvider).toBe('google');
    expect(user.providerId).toBe('google-uid');
  });

  it('redirects with an error flag when the token exchange fails', async () => {
    mockFetch([{ match: /token/, status: 400, body: 'access_denied' }]);

    const res = await api('/api/auth/google/callback?code=bad-code');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=oauth_failed');
  });

  it('redirects with an error flag when the provider returns no email', async () => {
    mockFetch([
      { match: /token/, status: 200, body: { access_token: 'access-123' } },
      { match: /userinfo/, status: 200, body: { id: 'google-uid', name: 'No Email' } },
    ]);

    const res = await api('/api/auth/google/callback?code=auth-code');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=oauth_failed');
  });

  it('400s when no code is present (no provider call)', async () => {
    const res = await api('/api/auth/google/callback');
    expect(res.status).toBe(400);
  });
});
