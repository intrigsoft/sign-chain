import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { getAnchorFromTx, zeroHash } from '../lib/blockchain';
import type { Bindings, Variables } from '../types';

const verify = new Hono<{ Bindings: Bindings; Variables: Variables }>();

verify.get('/:txHash', async (c) => {
  const txHash = c.req.param('txHash');
  const db = drizzle(c.env.DB, { schema });

  const entry = await getAnchorFromTx(
    c.env.RPC_URL,
    c.env.SIGNCHAIN_CONTRACT_ADDRESS,
    txHash
  );

  const chain = [entry];

  // Walk chain backwards
  let current = entry;
  while (current.previousTxHash !== zeroHash) {
    current = await getAnchorFromTx(
      c.env.RPC_URL,
      c.env.SIGNCHAIN_CONTRACT_ADDRESS,
      current.previousTxHash
    );
    chain.push(current);
  }

  const [anchor] = await db
    .select({ encryptedPayload: schema.anchors.encryptedPayload })
    .from(schema.anchors)
    .where(eq(schema.anchors.txHash, txHash))
    .limit(1);

  return c.json({ ...entry, chain, encryptedPayload: anchor?.encryptedPayload });
});

export default verify;
