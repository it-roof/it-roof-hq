import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { SecuritySettings } from '@/components/security-settings';
import { DashboardShell } from '@/components/demo/dashboard-shell';

export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [user] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return (
    <DashboardShell title="Sicherheit">
      <div className="mx-auto w-full max-w-xl px-4 md:max-w-5xl lg:px-6">
        <SecuritySettings totpEnabled={Boolean(user?.totpEnabled)} />
      </div>
    </DashboardShell>
  );
}
