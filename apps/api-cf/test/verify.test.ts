import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, db, seedUser } from './helpers';
import * as schema from '../src/db/schema';
import type { AnchorEntry } from '../src/lib/blockchain';

// Keep the real zeroHash constant, mock only the RPC read.
vi.mock('../src/lib/blockchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/blockchain')>();
  return { ...actual, getAnchorFromTx: vi.fn() };
});
import { getAnchorFromTx, zeroHash } from '../src/lib/blockchain';

function entry(txHash: string, previousTxHash: string): AnchorEntry {
  return {
    txHash,
    previousTxHash,
    compositeHash: `composite-${txHash}`,
    signer: '0x000000000000000000000000000000000000aaaa',
    timestamp: 1_700_000_000,
  };
}

beforeEach(() => {
  vi.mocked(getAnchorFromTx).mockReset();
});

describe('GET /api/verify/:txHash', () => {
  it('returns a single-entry chain and the stored encrypted payload', async () => {
    vi.mocked(getAnchorFromTx).mockResolvedValue(entry('0xtx1', zeroHash));

    const user = await seedUser();
    await db().insert(schema.anchors).values({
      txHash: '0xtx1',
      compositeHash: 'composite-0xtx1',
      encryptedPayload: 'PAYLOAD-1',
      userId: user.id,
    });

    const res = await api('/api/verify/0xtx1');
    expect(res.status).toBe(200);
    const data = await res.json<{ chain: unknown[]; encryptedPayload?: string; txHash: string }>();
    expect(data.txHash).toBe('0xtx1');
    expect(data.chain).toHaveLength(1);
    expect(data.encryptedPayload).toBe('PAYLOAD-1');
  });

  it('walks the chain backwards to the genesis anchor', async () => {
    const chainMap: Record<string, AnchorEntry> = {
      '0xtx2': entry('0xtx2', '0xtx1'),
      '0xtx1': entry('0xtx1', zeroHash),
    };
    vi.mocked(getAnchorFromTx).mockImplementation(async (_rpc, _contract, txHash) => {
      const found = chainMap[txHash];
      if (!found) throw new Error(`unexpected txHash ${txHash}`);
      return found;
    });

    const res = await api('/api/verify/0xtx2');
    expect(res.status).toBe(200);
    const data = await res.json<{ chain: { txHash: string }[] }>();
    expect(data.chain.map((c) => c.txHash)).toEqual(['0xtx2', '0xtx1']);
    expect(getAnchorFromTx).toHaveBeenCalledTimes(2);
  });

  it('omits encryptedPayload when there is no matching anchor row', async () => {
    vi.mocked(getAnchorFromTx).mockResolvedValue(entry('0xorphan', zeroHash));
    const res = await api('/api/verify/0xorphan');
    expect(res.status).toBe(200);
    const data = await res.json<{ encryptedPayload?: string }>();
    expect(data.encryptedPayload).toBeUndefined();
  });
});
