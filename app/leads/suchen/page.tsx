'use client';

import { DashboardShell } from '@/components/demo/dashboard-shell';
import { SearchQueriesTab } from '@/components/leads/search-queries-tab';

export default function LeadsSuchenPage() {
  return (
    <DashboardShell title="Suchen">
      <div className="px-4 lg:px-6">
        <p className="mb-4 text-sm text-muted-foreground">search_query · CRUD</p>
        <SearchQueriesTab />
      </div>
    </DashboardShell>
  );
}
