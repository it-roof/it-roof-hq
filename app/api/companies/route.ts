import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { company, companyContact, contact } from '@/lib/schema';
import { eq, or, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

export async function GET() {
  if (!(await requireSession())) return unauthorized();
  const rows = await db
    .select({
      id: company.id,
      name: company.name,
      city: company.city,
      contacts: sql<{ id: string; first_name: string; last_name: string; email: string | null; phone: string | null }[]>`
        COALESCE(
          json_agg(
            json_build_object(
              'id', ${contact.id},
              'first_name', ${contact.firstName},
              'last_name', ${contact.lastName},
              'email', ${contact.email},
              'phone', ${contact.phone}
            ) ORDER BY ${contact.lastName}
          ) FILTER (WHERE ${contact.id} IS NOT NULL),
          '[]'
        )
      `,
    })
    .from(company)
    .leftJoin(companyContact, eq(companyContact.companyId, company.id))
    .leftJoin(contact, eq(contact.id, companyContact.contactId))
    .where(or(eq(company.status, 'active'), eq(company.status, 'Aktiv')))
    .groupBy(company.id)
    .orderBy(company.name);

  return NextResponse.json(rows);
}
