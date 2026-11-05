'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { CampaignLeadsTab } from '@/components/leads/campaign-leads-tab';

export default function LeadsZuordnungenPage() {
  return (
    <DashboardShell title="Zuordnungen">
      <div className="px-4 lg:px-6">
        <CampaignLeadsTab />
      </div>
    </DashboardShell>
  );
}
