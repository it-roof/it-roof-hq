'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { MailApp } from '@/components/mail/mail-app';

export default function MailPage() {
  return (
    <DashboardShell title="E-Mail" fullHeight>
      <MailApp />
    </DashboardShell>
  );
}

