import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { api, db, json, seedUser, authHeader } from './helpers';
import * as schema from '../src/db/schema';
import { verifyToken } from '../src/lib/jwt';

// Magic-link sending goes out over the network (Resend). Mock the module so
// tests never make a real HTTP call, and so we can assert what was sent.
vi.mock('../src/lib/mail', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
}));
import { sendMagicLinkEmail } from '../src/lib/mail';

beforeEach(() => {
  vi.mocked(sendMagicLinkEmail).mockClear();
});

describe('POST /api/auth/magic-link', () => {
  it('stores a code and emails it', async () => {
    const email = `ml-${crypto.randomUUID()}@test.dev`;
    const res = await json('/api/auth/magic-link', 'POST', { email });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Magic link sent' });

    const [link] = await db()
      .select()
      .from(schema.magicLinks)
      .where(eq(schema.magicLinks.email, email));
    expect(link).toBeTruthy();
    expect(link.code).toMatch(/^\d{6}$/);
    expect(link.used).toBe(false);

    // emailed the same code that was persisted
    expect(sendMagicLinkEmail).toHaveBeenCalledOnce();
    const [toArg, codeArg] = vi.mocked(sendMagicLinkEmail).mock.calls[0];
    expect(toArg).toBe(email);
    expect(codeArg).toBe(link.code);
  });

  it('rejects an invalid email with 400 and sends nothing', async () => {
    const res = await json('/api/auth/magic-link', 'POST', { email: 'nope' });
    expect(res.status).toBe(400);
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/magic-link/verify', () => {
  async function insertLink(overrides: Partial<typeof schema.magicLinks.$inferInsert>) {
    const [link] = await db()
      .insert(schema.magicLinks)
      .values({
        email: `verify-${crypto.randomUUID()}@test.dev`,
        code: crypto.randomUUID().slice(0, 8),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        ...overrides,
      })
      .returning();
    return link;
  }

  it('returns a valid JWT, creates the user, and consumes the code', async () => {
    const link = await insertLink({});
    const res = await json('/api/auth/magic-link/verify', 'POST', { code: link.code });
    expect(res.status).toBe(200);

    const { token } = await res.json<{ token: string }>();
    const payload = await verifyToken(token, env.JWT_SECRET);
    expect(payload.email).toBe(link.email);
    expect(payload.trust).toBe('email');
    expect(payload.sub).toBeTruthy();

    // user created
    const [user] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, link.email));
    expect(user.id).toBe(payload.sub);

    // code marked used
    const [used] = await db()
      .select()
      .from(schema.magicLinks)
      .where(eq(schema.magicLinks.id, link.id));
    expect(used.used).toBe(true);
  });

  it('reuses the existing user for a known email (no duplicate)', async () => {
    const existing = await seedUser();
    const link = await insertLink({ email: existing.email });

    const res = await json('/api/auth/magic-link/verify', 'POST', { code: link.code });
    expect(res.status).toBe(200);
    const { token } = await res.json<{ token: string }>();
    const payload = await verifyToken(token, env.JWT_SECRET);
    expect(payload.sub).toBe(existing.id);

    const rows = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, existing.email));
    expect(rows).toHaveLength(1);
  });

  it('rejects an unknown code', async () => {
    const res = await json('/api/auth/magic-link/verify', 'POST', { code: 'does-not-exist' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'Invalid or expired code' });
  });

  it('rejects an expired code', async () => {
    const link = await insertLink({ expiresAt: new Date(Date.now() - 1000) });
    const res = await json('/api/auth/magic-link/verify', 'POST', { code: link.code });
    expect(res.status).toBe(400);
  });

  it('rejects an already-used code', async () => {
    const link = await insertLink({ used: true });
    const res = await json('/api/auth/magic-link/verify', 'POST', { code: link.code });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('401 without a bearer token', async () => {
    const res = await api('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 for a malformed Authorization header', async () => {
    const res = await api('/api/auth/me', { headers: { Authorization: 'Basic abc' } });
    expect(res.status).toBe(401);
  });

  it('401 for a token signed with the wrong secret', async () => {
    // authHeader signs with the real secret; tamper by appending garbage
    const good = await authHeader(crypto.randomUUID());
    const res = await api('/api/auth/me', {
      headers: { Authorization: good.Authorization + 'tampered' },
    });
    expect(res.status).toBe(401);
  });

  it('returns the profile for a valid token', async () => {
    const user = await seedUser({ email: 'me@test.dev', name: 'Me', anchorCount: 2 });
    const res = await api('/api/auth/me', { headers: await authHeader(user.id) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: user.id,
      email: 'me@test.dev',
      name: 'Me',
      authProvider: 'email',
      anchorCount: 2,
    });
  });

  it('401 when the token is valid but the user no longer exists', async () => {
    const res = await api('/api/auth/me', { headers: await authHeader(crypto.randomUUID()) });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a fresh token for the authenticated user', async () => {
    const user = await seedUser({ email: 'refresh@test.dev' });
    const res = await api('/api/auth/refresh', {
      method: 'POST',
      headers: await authHeader(user.id),
    });
    expect(res.status).toBe(200);
    const { token } = await res.json<{ token: string }>();
    const payload = await verifyToken(token, env.JWT_SECRET);
    expect(payload.sub).toBe(user.id);
  });

  it('401 without auth', async () => {
    const res = await api('/api/auth/refresh', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('OAuth entry points', () => {
  it('GET /api/auth/google redirects to Google with the client id', async () => {
    const res = await api('/api/auth/google');
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('client_id=google-client-id');
  });

  it('GET /api/auth/microsoft redirects to Microsoft', async () => {
    const res = await api('/api/auth/microsoft');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('login.microsoftonline.com');
  });

  it('google callback without a code returns 400', async () => {
    const res = await api('/api/auth/google/callback');
    expect(res.status).toBe(400);
  });

  it('microsoft callback without a code returns 400', async () => {
    const res = await api('/api/auth/microsoft/callback');
    expect(res.status).toBe(400);
  });
});
