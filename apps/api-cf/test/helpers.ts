import { env } from 'cloudflare:test';
import { drizzle } from 'drizzle-orm/d1';
import app from '../src/index';
import * as schema from '../src/db/schema';
import { signToken } from '../src/lib/jwt';

/** Drizzle client bound to the test D1 database, for seeding and assertions. */
export function db() {
  return drizzle(env.DB, { schema });
}

/** Dispatch a request through the real Hono app with the test bindings. */
export function api(path: string, init?: RequestInit) {
  return app.request(path, init, env);
}

/** JSON POST/PUT helper. */
export function json(
  path: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return api(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

let userSeq = 0;

/** Insert a user and return the row. Email is unique per call unless overridden. */
export async function seedUser(
  overrides: Partial<typeof schema.users.$inferInsert> = {}
) {
  const [user] = await db()
    .insert(schema.users)
    .values({
      email: `user${userSeq++}@test.dev`,
      authProvider: 'email',
      ...overrides,
    })
    .returning();
  return user;
}

/** Authorization header carrying a valid JWT for the given user id. */
export async function authHeader(
  userId: string,
  email = 'user@test.dev'
): Promise<Record<string, string>> {
  const token = await signToken(
    { sub: userId, email, name: null, trust: 'email' },
    env.JWT_SECRET
  );
  return { Authorization: `Bearer ${token}` };
}
