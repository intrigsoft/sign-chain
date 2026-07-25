import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { api, db, json, seedUser, authHeader } from './helpers';
import * as schema from '../src/db/schema';

const iso = (s: string) => new Date(s).toISOString();

function sig(id: string, label: string, updatedAt: string, png = 'AAAA') {
  return { id, label, base64Png: png, updatedAt: iso(updatedAt) };
}
function snip(id: string, label: string, text: string, updatedAt: string) {
  return { id, label, text, fontSize: 14, updatedAt: iso(updatedAt) };
}

describe('library authorization', () => {
  it.each([
    ['GET', '/api/library'],
    ['GET', '/api/library/exists'],
    ['PUT', '/api/library/sync'],
    ['DELETE', '/api/library'],
  ])('%s %s requires auth', async (method, path) => {
    const res = await api(path, { method });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/library', () => {
  it('returns empty collections for a fresh user', async () => {
    const user = await seedUser();
    const res = await api('/api/library', { headers: await authHeader(user.id) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signatures: [], textSnippets: [] });
  });
});

describe('PUT /api/library/sync', () => {
  it('inserts signatures and snippets and echoes the library', async () => {
    const user = await seedUser();
    const res = await json(
      '/api/library/sync',
      'PUT',
      {
        signatures: [sig('s1', 'Initials', '2023-01-01')],
        textSnippets: [snip('t1', 'Name', 'John Doe', '2023-01-01')],
      },
      await authHeader(user.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ signatures: unknown[]; textSnippets: unknown[] }>();
    expect(body.signatures).toHaveLength(1);
    expect(body.textSnippets).toHaveLength(1);

    const rows = await db()
      .select()
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.userId, user.id));
    expect(rows[0].label).toBe('Initials');
  });

  it('is last-write-wins: an older client update does not overwrite', async () => {
    const user = await seedUser();
    const auth = await authHeader(user.id);

    await json('/api/library/sync', 'PUT', { signatures: [sig('s1', 'NEW', '2023-06-01')] }, auth);
    // older timestamp, different label -> must be ignored
    await json('/api/library/sync', 'PUT', { signatures: [sig('s1', 'OLD', '2022-01-01')] }, auth);

    const [row] = await db()
      .select()
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.id, 's1'));
    expect(row.label).toBe('NEW');
  });

  it('is last-write-wins: a newer client update overwrites', async () => {
    const user = await seedUser();
    const auth = await authHeader(user.id);

    await json('/api/library/sync', 'PUT', { signatures: [sig('s2', 'OLD', '2023-01-01')] }, auth);
    await json('/api/library/sync', 'PUT', { signatures: [sig('s2', 'NEWER', '2024-01-01')] }, auth);

    const [row] = await db()
      .select()
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.id, 's2'));
    expect(row.label).toBe('NEWER');
  });

  it('applies deletions scoped to the calling user', async () => {
    const user = await seedUser();
    const auth = await authHeader(user.id);
    await json('/api/library/sync', 'PUT', {
      signatures: [sig('d1', 'a', '2023-01-01'), sig('d2', 'b', '2023-01-01')],
      textSnippets: [snip('dt1', 'x', 'y', '2023-01-01')],
    }, auth);

    const res = await json('/api/library/sync', 'PUT', {
      deletedSignatureIds: ['d1'],
      deletedSnippetIds: ['dt1'],
    }, auth);

    const body = await res.json<{ signatures: { id: string }[]; textSnippets: unknown[] }>();
    expect(body.signatures.map((s) => s.id)).toEqual(['d2']);
    expect(body.textSnippets).toHaveLength(0);
  });

  it('will not let one user delete another user\'s rows', async () => {
    const owner = await seedUser();
    const attacker = await seedUser();
    await json('/api/library/sync', 'PUT', { signatures: [sig('owned', 'mine', '2023-01-01')] }, await authHeader(owner.id));

    // attacker tries to delete owner's signature id
    await json('/api/library/sync', 'PUT', { deletedSignatureIds: ['owned'] }, await authHeader(attacker.id));

    const [row] = await db()
      .select()
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.id, 'owned'));
    expect(row).toBeTruthy();
    expect(row.userId).toBe(owner.id);
  });

  it('rejects a malformed payload (400)', async () => {
    const user = await seedUser();
    const res = await json(
      '/api/library/sync',
      'PUT',
      { signatures: [{ id: 's', label: 'x', base64Png: 'y', updatedAt: 'not-a-date' }] },
      await authHeader(user.id)
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/library/exists', () => {
  it('false when empty, true after a signature exists', async () => {
    const user = await seedUser();
    const auth = await authHeader(user.id);

    let res = await api('/api/library/exists', { headers: auth });
    expect(await res.json()).toEqual({ exists: false });

    await json('/api/library/sync', 'PUT', { signatures: [sig('e1', 'l', '2023-01-01')] }, auth);

    res = await api('/api/library/exists', { headers: auth });
    expect(await res.json()).toEqual({ exists: true });
  });

  it('true when only a text snippet exists', async () => {
    const user = await seedUser();
    const auth = await authHeader(user.id);
    await json('/api/library/sync', 'PUT', { textSnippets: [snip('e2', 'l', 't', '2023-01-01')] }, auth);
    const res = await api('/api/library/exists', { headers: auth });
    expect(await res.json()).toEqual({ exists: true });
  });
});

describe('DELETE /api/library', () => {
  it('clears the calling user\'s library only', async () => {
    const user = await seedUser();
    const other = await seedUser();
    await json('/api/library/sync', 'PUT', { signatures: [sig('mine', 'l', '2023-01-01')] }, await authHeader(user.id));
    await json('/api/library/sync', 'PUT', { signatures: [sig('theirs', 'l', '2023-01-01')] }, await authHeader(other.id));

    const res = await api('/api/library', { method: 'DELETE', headers: await authHeader(user.id) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const mine = await db().select().from(schema.cloudSignatures).where(eq(schema.cloudSignatures.userId, user.id));
    const theirs = await db().select().from(schema.cloudSignatures).where(eq(schema.cloudSignatures.userId, other.id));
    expect(mine).toHaveLength(0);
    expect(theirs).toHaveLength(1);
  });
});
