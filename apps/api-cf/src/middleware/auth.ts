import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../lib/jwt';
import type { Bindings, Variables } from '../types';

export const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: Variables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ message: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub);
    await next();
  } catch {
    return c.json({ message: 'Unauthorized' }, 401);
  }
});
