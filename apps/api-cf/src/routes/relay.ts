import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { anchorDocument, getRelayerBalance } from '../lib/blockchain';
import type { Bindings, Variables } from '../types';

const relay = new Hono<{ Bindings: Bindings; Variables: Variables }>();

relay.post(
  '/',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      compositeHash: z.string(),
      previousTxHash: z.string(),
      encryptedPayload: z.string(),
    })
  ),
  async (c) => {
    const dto = c.req.valid('json');
    const userId = c.get('userId');
    const db = drizzle(c.env.DB, { schema });

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) return c.json({ message: 'User not found' }, 400);

    const quota = parseInt(c.env.ANCHOR_QUOTA ?? '50', 10);
    if (user.anchorCount >= quota) {
      return c.json({ message: `Anchor quota exceeded (${quota})` }, 400);
    }

    const balance = await getRelayerBalance(
      c.env.RPC_URL,
      c.env.RELAYER_PRIVATE_KEY
    );
    if (balance === 0n) {
      return c.json({ message: 'Relayer wallet has no funds' }, 503);
    }

    const { txHash, blockNumber } = await anchorDocument(
      c.env.RPC_URL,
      c.env.RELAYER_PRIVATE_KEY,
      c.env.SIGNCHAIN_CONTRACT_ADDRESS,
      dto.compositeHash,
      dto.previousTxHash,
      c.env.CHAIN
    );

    await db.insert(schema.anchors).values({
      txHash,
      compositeHash: dto.compositeHash,
      encryptedPayload: dto.encryptedPayload,
      userId,
    });

    await db
      .update(schema.users)
      .set({ anchorCount: sql`${schema.users.anchorCount} + 1` })
      .where(eq(schema.users.id, userId));

    return c.json({ txHash, blockNumber });
  }
);

export default relay;
