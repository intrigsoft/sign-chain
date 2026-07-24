import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, gt } from 'drizzle-orm';
import * as schema from '../db/schema';
import { signToken } from '../lib/jwt';
import { sendMagicLinkEmail } from '../lib/mail';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Magic link ────────────────────────────────────────────────────

auth.post(
  '/magic-link',
  zValidator('json', z.object({ email: z.string().email() })),
  async (c) => {
    const { email } = c.req.valid('json');
    const db = drizzle(c.env.DB, { schema });

    const code = Math.floor(100_000 + Math.random() * 900_000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(schema.magicLinks).values({ email, code, expiresAt });
    await sendMagicLinkEmail(email, code, c.env.RESEND_API_KEY, c.env.MAIL_FROM);

    return c.json({ message: 'Magic link sent' });
  }
);

auth.post(
  '/magic-link/verify',
  zValidator('json', z.object({ code: z.string() })),
  async (c) => {
    const { code } = c.req.valid('json');
    const db = drizzle(c.env.DB, { schema });

    const [link] = await db
      .select()
      .from(schema.magicLinks)
      .where(
        and(
          eq(schema.magicLinks.code, code),
          eq(schema.magicLinks.used, false),
          gt(schema.magicLinks.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!link) {
      return c.json({ message: 'Invalid or expired code' }, 400);
    }

    await db
      .update(schema.magicLinks)
      .set({ used: true })
      .where(eq(schema.magicLinks.id, link.id));

    let [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, link.email))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(schema.users)
        .values({ email: link.email, authProvider: 'email' })
        .returning();
    }

    const token = await issueJwt(user, c.env.JWT_SECRET);
    return c.json({ token });
  }
);

// ── Google OAuth ──────────────────────────────────────────────────

auth.get('/google', (c) => {
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
  });
  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
});

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ message: 'No code provided' }, 400);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  const { access_token } = await tokenRes.json<{ access_token: string }>();

  const profileRes = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const profile = await profileRes.json<{
    id: string;
    email: string;
    name: string;
  }>();

  const db = drizzle(c.env.DB, { schema });
  const token = await handleOAuthCallback(
    db,
    { providerId: profile.id, email: profile.email, name: profile.name, provider: 'google' },
    c.env.JWT_SECRET
  );

  return c.redirect(`${c.env.APP_DEEP_LINK}?token=${token}`);
});

// ── Microsoft OAuth ───────────────────────────────────────────────

auth.get('/microsoft', (c) => {
  const params = new URLSearchParams({
    client_id: c.env.MICROSOFT_CLIENT_ID,
    redirect_uri: c.env.MICROSOFT_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile User.Read',
  });
  return c.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  );
});

auth.get('/microsoft/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ message: 'No code provided' }, 400);

  const tokenRes = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.MICROSOFT_CLIENT_ID,
        client_secret: c.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: c.env.MICROSOFT_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    }
  );

  const { access_token } = await tokenRes.json<{ access_token: string }>();

  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const profile = await profileRes.json<{
    id: string;
    mail: string;
    displayName: string;
  }>();

  const db = drizzle(c.env.DB, { schema });
  const token = await handleOAuthCallback(
    db,
    { providerId: profile.id, email: profile.mail, name: profile.displayName, provider: 'microsoft' },
    c.env.JWT_SECRET
  );

  return c.redirect(`${c.env.APP_DEEP_LINK}?token=${token}`);
});

// ── Protected ─────────────────────────────────────────────────────

auth.get('/me', authMiddleware, async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, c.get('userId')))
    .limit(1);

  if (!user) return c.json({ message: 'User not found' }, 401);

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider,
    anchorCount: user.anchorCount,
    createdAt: user.createdAt,
  });
});

auth.post('/refresh', authMiddleware, async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, c.get('userId')))
    .limit(1);

  if (!user) return c.json({ message: 'User not found' }, 401);

  const token = await issueJwt(user, c.env.JWT_SECRET);
  return c.json({ token });
});

// ── Helpers ───────────────────────────────────────────────────────

async function handleOAuthCallback(
  db: Db,
  profile: { providerId: string; email: string; name: string; provider: string },
  jwtSecret: string
): Promise<string> {
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, profile.email))
    .limit(1);

  if (user) {
    if (user.authProvider === 'email') {
      await db
        .update(schema.users)
        .set({
          authProvider: profile.provider,
          providerId: profile.providerId,
          name: user.name ?? profile.name,
        })
        .where(eq(schema.users.id, user.id));
      user = { ...user, authProvider: profile.provider, providerId: profile.providerId };
    }
  } else {
    [user] = await db
      .insert(schema.users)
      .values({
        email: profile.email,
        name: profile.name,
        authProvider: profile.provider,
        providerId: profile.providerId,
      })
      .returning();
  }

  return issueJwt(user, jwtSecret);
}

function issueJwt(
  user: { id: string; email: string; name: string | null; authProvider: string },
  secret: string
): Promise<string> {
  return signToken(
    { sub: user.id, email: user.email, name: user.name, trust: user.authProvider },
    secret
  );
}

export default auth;
