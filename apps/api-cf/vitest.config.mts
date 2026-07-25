import { defineConfig } from 'vitest/config';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, 'drizzle/migrations')
  );

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: '2025-01-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: {
            // Migrations are applied in the setup file (see apply-migrations.ts)
            TEST_MIGRATIONS: migrations,

            // Secrets / vars — test values only, never real credentials
            JWT_SECRET: 'test-jwt-secret',
            ANCHOR_QUOTA: '3',
            MAIL_FROM: 'noreply@test.dev',
            APP_DEEP_LINK: 'signchain://auth/callback',
            CORS_ALLOWED_ORIGINS: 'https://app.test,tauri://localhost',
            RESEND_API_KEY: 'test-resend-key',
            RPC_URL: 'http://rpc.test',
            SIGNCHAIN_CONTRACT_ADDRESS:
              '0x0000000000000000000000000000000000001234',
            CHAIN: 'polygon-amoy',
            // well-known Hardhat test account #1 key — public, not a secret
            RELAYER_PRIVATE_KEY:
              '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
            GOOGLE_CLIENT_ID: 'google-client-id',
            GOOGLE_CLIENT_SECRET: 'google-client-secret',
            GOOGLE_CALLBACK_URL:
              'http://localhost:8787/api/auth/google/callback',
            MICROSOFT_CLIENT_ID: 'ms-client-id',
            MICROSOFT_CLIENT_SECRET: 'ms-client-secret',
            MICROSOFT_CALLBACK_URL:
              'http://localhost:8787/api/auth/microsoft/callback',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
