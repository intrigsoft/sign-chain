import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, Variables } from './types';
import auth from './routes/auth';
import relay from './routes/relay';
import verify from './routes/verify';
import library from './routes/library';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', cors());

app.route('/api/auth', auth);
app.route('/api/relay', relay);
app.route('/api/verify', verify);
app.route('/api/library', library);

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
