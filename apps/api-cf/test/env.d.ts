/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Bindings } from '../src/types';

// `env` from "cloudflare:test" is typed as Cloudflare.Env; augment it with our
// worker bindings plus the migrations bag injected via vitest.config.mts.
declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
