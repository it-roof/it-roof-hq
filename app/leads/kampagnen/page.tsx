'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { CampaignsTab } from '@/components/leads/campaigns-tab';

export default function LeadsKampagnenPage() {
  return (
    <DashboardShell title="Kampagnen" fullHeight>
      <CampaignsTab />
    </DashboardShell>
  );
}
