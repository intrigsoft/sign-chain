import { describe, it, expect } from 'vitest';
import { api, db, seedUser } from './helpers';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

describe('health & harness', () => {
  it('GET /api/health returns ok through the real worker', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('unknown routes 404', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
  });

  it('D1 is migrated and writable', async () => {
    const user = await seedUser({ email: 'health@test.dev' });
    const [found] = await db()
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id));
    expect(found.email).toBe('health@test.dev');
    expect(found.anchorCount).toBe(0);
    expect(found.authProvider).toBe('email');
  });
});
