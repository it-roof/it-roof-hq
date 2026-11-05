'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { LeadsDashboard } from '@/components/leads/leads-dashboard';

export default function LeadsDashboardPage() {
  return (
    <DashboardShell title="Dashboard">
      <div className="px-4 lg:px-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Überblick über Pipeline & Qualität
        </p>
        <LeadsDashboard />
      </div>
    </DashboardShell>
  );
}
