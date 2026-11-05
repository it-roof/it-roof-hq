import { getLeadsSql } from '@/lib/leads/db';

type LockedInsert = {
  leadId: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  email: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

function firstId(rows: unknown): string | null {
  if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== 'object') return null;
  const id = (rows[0] as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export async function insertContactWithEmailLock(values: LockedInsert): Promise<{ id: string } | null> {
  const sql = getLeadsSql();
  const results = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(hashtext(${values.email}))`,
    tx`INSERT INTO lead_contact (
         lead_id, salutation, first_name, last_name, position, email, phone, created_at, updated_at
       )
       SELECT
         ${values.leadId}::uuid,
         ${values.salutation},
         ${values.firstName},
         ${values.lastName},
         ${values.position},
         ${values.email},
         ${values.phone},
         ${values.createdAt}::timestamptz,
         ${values.updatedAt}::timestamptz
       WHERE NOT EXISTS (
         SELECT 1 FROM lead_contact WHERE lower(trim(email)) = ${values.email}
       )
       RETURNING id`,
  ]);
  const id = firstId(results[1]);
  return id ? { id } : null;
}

export async function fillContactEmailWithLock(
  contactId: string,
  email: string,
  updatedAt: string,
): Promise<'filled' | 'kept' | 'taken'> {
  const sql = getLeadsSql();
  const results = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(hashtext(${email}))`,
    tx`UPDATE lead_contact
       SET email = ${email}, updated_at = ${updatedAt}::timestamptz
       WHERE id = ${contactId}::uuid
         AND (email IS NULL OR trim(email) = '')
         AND NOT EXISTS (
           SELECT 1 FROM lead_contact other
           WHERE lower(trim(other.email)) = ${email}
             AND other.id <> ${contactId}::uuid
         )
       RETURNING id`,
  ]);
  if (firstId(results[1])) return 'filled';
  const taken = await sql`
    SELECT id FROM lead_contact
    WHERE lower(trim(email)) = ${email} AND id <> ${contactId}::uuid
    LIMIT 1
  `;
  return firstId(taken) ? 'taken' : 'kept';
}
