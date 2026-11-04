import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const BUILD_PLACEHOLDER = 'postgresql://127.0.0.1/build';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  // Vercel Preview: DATABASE_URL fehlt oft beim `next build` / collect page data.
  // neon() braucht eine URL schon beim Import — Placeholder nur in der Build-Phase.
  if (process.env.NEXT_PHASE === 'phase-production-build') return BUILD_PLACEHOLDER;
  throw new Error('DATABASE_URL is not set');
}

export const db = drizzle(neon(databaseUrl()), { schema });
