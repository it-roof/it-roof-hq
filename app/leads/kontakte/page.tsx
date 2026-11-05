'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { ContactsTab } from '@/components/leads/contacts-tab';

export default function LeadsKontaktePage() {
  return (
    <DashboardShell title="Kontakte">
      <div className="px-4 lg:px-6">
        <p className="mb-4 text-sm text-muted-foreground">lead_contact · CRUD</p>
        <ContactsTab />
      </div>
    </DashboardShell>
  );
}
