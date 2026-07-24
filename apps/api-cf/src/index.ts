import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Bindings, Variables } from './types';
import auth from './routes/auth';
import relay from './routes/relay';
import verify from './routes/verify';
import library from './routes/library';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', secureHeaders());

// Restrict browser cross-origin access to the configured allowlist. Non-browser
// clients (desktop Rust core, mobile verifier) send no Origin and are unaffected.
app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = (c.env.CORS_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (allowed.includes('*')) return origin || '*';
      return origin && allowed.includes(origin) ? origin : undefined;
    },
  })(c, next)
);

app.route('/api/auth', auth);
app.route('/api/relay', relay);
app.route('/api/verify', verify);
app.route('/api/library', library);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
