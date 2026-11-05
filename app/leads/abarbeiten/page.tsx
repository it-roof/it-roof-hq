'use client';

import { Suspense } from 'react';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { WorkInbox } from '@/components/leads/work-inbox';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeadsAbarbeitenPage() {
  return (
    <DashboardShell title="Abarbeiten" fullHeight>
      <Suspense fallback={<Skeleton className="m-6 h-64 w-full rounded-lg" />}>
        <WorkInbox />
      </Suspense>
    </DashboardShell>
  );
}
