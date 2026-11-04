import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type AppDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: AppDb | null = null;

export function getDb(): AppDb {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _db = drizzle(neon(url), { schema });
  return _db;
}

function bind(real: object, value: unknown) {
  return typeof value === 'function' ? value.bind(real) : value;
}

/** Lazy: `neon()` darf nicht beim Import laufen (Vercel Preview ohne DATABASE_URL). */
export const db: AppDb = new Proxy({} as AppDb, {
  get(_target, prop) {
    if (prop === 'then') return undefined;
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    return bind(real, real[prop]);
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getDb());
  },
  has(_target, prop) {
    return prop in (getDb() as object);
  },
  ownKeys() {
    return Reflect.ownKeys(getDb() as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const desc = Object.getOwnPropertyDescriptor(getDb(), prop);
    if (desc) desc.configurable = true;
    return desc;
  },
});
