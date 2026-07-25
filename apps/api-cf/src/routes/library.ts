import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const library = new Hono<{ Bindings: Bindings; Variables: Variables }>();

library.use('*', authMiddleware);

const syncSchema = z.object({
  signatures: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        base64Png: z.string(),
        updatedAt: z.string().datetime(),
      })
    )
    .default([]),
  textSnippets: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        text: z.string(),
        fontSize: z.number(),
        updatedAt: z.string().datetime(),
      })
    )
    .default([]),
  deletedSignatureIds: z.array(z.string()).default([]),
  deletedSnippetIds: z.array(z.string()).default([]),
});

async function getLibrary(db: Db, userId: string) {
  const [signatures, textSnippets] = await Promise.all([
    db
      .select()
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.userId, userId)),
    db
      .select()
      .from(schema.cloudTextSnippets)
      .where(eq(schema.cloudTextSnippets.userId, userId)),
  ]);
  return { signatures, textSnippets };
}

library.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  return c.json(await getLibrary(db, c.get('userId')));
});

library.get('/exists', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  const [sig] = await db
    .select({ id: schema.cloudSignatures.id })
    .from(schema.cloudSignatures)
    .where(eq(schema.cloudSignatures.userId, userId))
    .limit(1);

  if (sig) return c.json({ exists: true });

  const [snip] = await db
    .select({ id: schema.cloudTextSnippets.id })
    .from(schema.cloudTextSnippets)
    .where(eq(schema.cloudTextSnippets.userId, userId))
    .limit(1);

  return c.json({ exists: !!snip });
});

library.put('/sync', zValidator('json', syncSchema), async (c) => {
  const dto = c.req.valid('json');
  const userId = c.get('userId');
  const db = drizzle(c.env.DB, { schema });

  // Deletions
  const deletes: Promise<unknown>[] = [];
  if (dto.deletedSignatureIds.length > 0) {
    deletes.push(
      db.delete(schema.cloudSignatures).where(
        and(
          inArray(schema.cloudSignatures.id, dto.deletedSignatureIds),
          eq(schema.cloudSignatures.userId, userId)
        )
      )
    );
  }
  if (dto.deletedSnippetIds.length > 0) {
    deletes.push(
      db.delete(schema.cloudTextSnippets).where(
        and(
          inArray(schema.cloudTextSnippets.id, dto.deletedSnippetIds),
          eq(schema.cloudTextSnippets.userId, userId)
        )
      )
    );
  }
  await Promise.all(deletes);

  // Upsert signatures — last-write-wins via updatedAt
  for (const sig of dto.signatures) {
    const clientUpdatedAt = new Date(sig.updatedAt);
    const [existing] = await db
      .select({ updatedAt: schema.cloudSignatures.updatedAt })
      .from(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.id, sig.id))
      .limit(1);

    if (!existing || clientUpdatedAt > (existing.updatedAt ?? new Date(0))) {
      await db
        .insert(schema.cloudSignatures)
        .values({ id: sig.id, userId, label: sig.label, base64Png: sig.base64Png, updatedAt: clientUpdatedAt })
        .onConflictDoUpdate({
          target: schema.cloudSignatures.id,
          set: { label: sig.label, base64Png: sig.base64Png, updatedAt: clientUpdatedAt },
        });
    }
  }

  // Upsert text snippets — last-write-wins via updatedAt
  for (const sn of dto.textSnippets) {
    const clientUpdatedAt = new Date(sn.updatedAt);
    const [existing] = await db
      .select({ updatedAt: schema.cloudTextSnippets.updatedAt })
      .from(schema.cloudTextSnippets)
      .where(eq(schema.cloudTextSnippets.id, sn.id))
      .limit(1);

    if (!existing || clientUpdatedAt > (existing.updatedAt ?? new Date(0))) {
      await db
        .insert(schema.cloudTextSnippets)
        .values({ id: sn.id, userId, label: sn.label, text: sn.text, fontSize: sn.fontSize, updatedAt: clientUpdatedAt })
        .onConflictDoUpdate({
          target: schema.cloudTextSnippets.id,
          set: { label: sn.label, text: sn.text, fontSize: sn.fontSize, updatedAt: clientUpdatedAt },
        });
    }
  }

  return c.json(await getLibrary(db, userId));
});

library.delete('/', async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const userId = c.get('userId');

  await Promise.all([
    db
      .delete(schema.cloudSignatures)
      .where(eq(schema.cloudSignatures.userId, userId)),
    db
      .delete(schema.cloudTextSnippets)
      .where(eq(schema.cloudTextSnippets.userId, userId)),
  ]);

  return c.json({ ok: true });
});

export default library;
