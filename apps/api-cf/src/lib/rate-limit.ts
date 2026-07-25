import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Fixed-window rate limiter backed by the `rate_limits` table.
 * Returns `true` when the caller is OVER the limit and should be rejected.
 *
 * Each allowed call increments the window counter. The first call in a new
 * window (or after it expires) resets the counter to 1.
 */
export async function isRateLimited(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, key))
    .limit(1);

  const windowStart = row?.windowStart?.getTime() ?? 0;
  const expired = !row || now - windowStart > windowMs;

  if (expired) {
    await db
      .insert(schema.rateLimits)
      .values({ key, count: 1, windowStart: new Date(now) })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: { count: 1, windowStart: new Date(now) },
      });
    return false;
  }

  if (row.count >= limit) {
    return true;
  }

  await db
    .update(schema.rateLimits)
    .set({ count: row.count + 1 })
    .where(eq(schema.rateLimits.key, key));
  return false;
}
