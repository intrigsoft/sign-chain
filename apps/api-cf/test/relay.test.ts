import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { api, db, json, seedUser, authHeader } from './helpers';
import * as schema from '../src/db/schema';

// The relay route talks to Polygon via viem. Mock the blockchain module so no
// RPC calls happen; we drive the on-chain outcomes explicitly.
vi.mock('../src/lib/blockchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/blockchain')>();
  return { ...actual, getRelayerBalance: vi.fn(), anchorDocument: vi.fn() };
});
import { getRelayerBalance, anchorDocument } from '../src/lib/blockchain';

const body = {
  compositeHash: '0xhash',
  previousTxHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  encryptedPayload: 'ENCRYPTED',
};

beforeEach(() => {
  vi.mocked(getRelayerBalance).mockReset();
  vi.mocked(anchorDocument).mockReset();
  // sensible defaults: funded relayer, successful anchor
  vi.mocked(getRelayerBalance).mockResolvedValue(1_000_000_000n);
  vi.mocked(anchorDocument).mockResolvedValue({ txHash: '0xtx', blockNumber: 42 });
});

describe('POST /api/relay', () => {
  it('401 without auth', async () => {
    const res = await json('/api/relay', 'POST', body);
    expect(res.status).toBe(401);
    expect(anchorDocument).not.toHaveBeenCalled();
  });

  it('400 on a malformed body', async () => {
    const user = await seedUser();
    const res = await json('/api/relay', 'POST', { compositeHash: '0x' }, await authHeader(user.id));
    expect(res.status).toBe(400);
    expect(anchorDocument).not.toHaveBeenCalled();
  });

  it('400 when the authenticated user does not exist', async () => {
    const res = await json('/api/relay', 'POST', body, await authHeader(crypto.randomUUID()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: 'User not found' });
  });

  it('400 when the anchor quota is exhausted', async () => {
    // ANCHOR_QUOTA is 3 in the test env
    const user = await seedUser({ anchorCount: 3 });
    const res = await json('/api/relay', 'POST', body, await authHeader(user.id));
    expect(res.status).toBe(400);
    expect((await res.json<{ message: string }>()).message).toContain('quota');
    expect(anchorDocument).not.toHaveBeenCalled();
  });

  it('503 when the relayer wallet has no funds', async () => {
    vi.mocked(getRelayerBalance).mockResolvedValue(0n);
    const user = await seedUser();
    const res = await json('/api/relay', 'POST', body, await authHeader(user.id));
    expect(res.status).toBe(503);
    expect(anchorDocument).not.toHaveBeenCalled();
  });

  it('anchors, records the anchor, and increments the count on success', async () => {
    vi.mocked(anchorDocument).mockResolvedValue({ txHash: '0xdeadbeef', blockNumber: 99 });
    const user = await seedUser({ anchorCount: 1 });

    const res = await json('/api/relay', 'POST', body, await authHeader(user.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ txHash: '0xdeadbeef', blockNumber: 99 });

    // called with the contract address + hashes from the request
    expect(anchorDocument).toHaveBeenCalledOnce();
    const args = vi.mocked(anchorDocument).mock.calls[0];
    expect(args[2]).toBe('0x0000000000000000000000000000000000001234'); // contract
    expect(args[3]).toBe(body.compositeHash);
    expect(args[4]).toBe(body.previousTxHash);

    // anchor persisted
    const [anchor] = await db()
      .select()
      .from(schema.anchors)
      .where(eq(schema.anchors.txHash, '0xdeadbeef'));
    expect(anchor).toMatchObject({
      compositeHash: body.compositeHash,
      encryptedPayload: body.encryptedPayload,
      userId: user.id,
    });

    // quota counter bumped
    const [after] = await db().select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(after.anchorCount).toBe(2);
  });
});
