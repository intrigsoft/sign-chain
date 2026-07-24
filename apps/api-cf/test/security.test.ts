import { describe, it, expect, vi } from 'vitest';

// magic-link send emails via Resend; stub it so the rate-limit tests stay offline.
vi.mock('../src/lib/mail', () => ({
  sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

import { api, json } from './helpers';

describe('CORS', () => {
  it('echoes an allowed origin', async () => {
    const res = await api('/api/health', {
      headers: { Origin: 'https://app.test' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.test');
  });

  it('does not allow an unlisted origin', async () => {
    const res = await api('/api/health', {
      headers: { Origin: 'https://evil.test' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('handles a preflight for an allowed origin', async () => {
    const res = await api('/api/relay', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.test',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.test');
  });
});

describe('security headers', () => {
  it('sets hardening headers on responses', async () => {
    const res = await api('/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    // secureHeaders also removes the framework fingerprint
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('magic-link rate limiting', () => {
  it('blocks the 6th send to the same email within the window (429)', async () => {
    const email = `rl-${crypto.randomUUID()}@test.dev`;
    for (let i = 0; i < 5; i++) {
      const res = await json('/api/auth/magic-link', 'POST', { email });
      expect(res.status).toBe(200);
    }
    const blocked = await json('/api/auth/magic-link', 'POST', { email });
    expect(blocked.status).toBe(429);
  });

  it('blocks verify brute-forcing per client IP (429 after 10 attempts)', async () => {
    const ip = `probe-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      const res = await json(
        '/api/auth/magic-link/verify',
        'POST',
        { code: 'wrong' },
        { 'cf-connecting-ip': ip }
      );
      expect(res.status).toBe(400); // invalid code, but not yet limited
    }
    const blocked = await json(
      '/api/auth/magic-link/verify',
      'POST',
      { code: 'wrong' },
      { 'cf-connecting-ip': ip }
    );
    expect(blocked.status).toBe(429);
  });

  it('rate limits are keyed independently per email', async () => {
    const a = `a-${crypto.randomUUID()}@test.dev`;
    const b = `b-${crypto.randomUUID()}@test.dev`;
    for (let i = 0; i < 5; i++) await json('/api/auth/magic-link', 'POST', { email: a });
    // a is now exhausted, but b is untouched
    expect((await json('/api/auth/magic-link', 'POST', { email: a })).status).toBe(429);
    expect((await json('/api/auth/magic-link', 'POST', { email: b })).status).toBe(200);
  });
});
