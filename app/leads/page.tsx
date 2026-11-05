'use client';

import { Suspense } from 'react';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { LeadsTab } from '@/components/leads/leads-tab';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeadsPage() {
  return (
    <DashboardShell title="Leads" fullHeight>
      <Suspense fallback={<Skeleton className="m-6 h-64 w-full rounded-lg" />}>
        <LeadsTab />
      </Suspense>
    </DashboardShell>
  );
}
