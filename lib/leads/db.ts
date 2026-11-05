import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type LeadsDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: LeadsDb | null = null;

export function getLeadsDb(): LeadsDb {
  if (_db) return _db;
  const url = process.env.LEADS_DATABASE_URL;
  if (!url) throw new Error('LEADS_DATABASE_URL is not set');
  _db = drizzle(neon(url), { schema });
  return _db;
}

export function getLeadsSql() {
  return getLeadsDb().$client;
}
