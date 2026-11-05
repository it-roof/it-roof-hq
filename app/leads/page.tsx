'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { LeadsTab } from '@/components/leads/leads-tab';

export default function LeadsPage() {
  return (
    <DashboardShell title="Leads">
      <div className="px-4 lg:px-6">
        <LeadsTab />
      </div>
    </DashboardShell>
  );
}
