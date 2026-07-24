import { applyD1Migrations, env } from 'cloudflare:test';

// Build the D1 schema once before the suite runs. With isolated per-test
// storage, these tables persist into every test while row writes made inside
// a test are rolled back afterwards.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
