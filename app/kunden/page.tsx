'use client';

import { useEffect, useState } from 'react';
import { ChartAreaInteractive } from '@/components/demo/dashboard-01/chart-area-interactive';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { Skeleton } from '@/components/demo/ui/skeleton';
import { KundenSectionCards } from '@/components/kunden/kunden-section-cards';
import { KundenDataTable } from '@/components/kunden/kunden-data-table';
import type { KundenCompany } from '@/components/kunden/types';

export default function KundenPage() {
  const [companies, setCompanies] = useState<KundenCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data: KundenCompany[]) => {
        if (!cancelled) {
          setCompanies(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompanies([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardShell title="Kunden">
      {loading ? (
        <>
          <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <div className="px-4 lg:px-6">
            <Skeleton className="h-[250px] w-full rounded-xl" />
          </div>
          <div className="px-4 lg:px-6">
            <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
            <Skeleton className="mt-4 h-72 w-full rounded-lg" />
          </div>
        </>
      ) : (
        <>
          <KundenSectionCards companies={companies} />
          <div className="px-4 lg:px-6">
            <ChartAreaInteractive />
          </div>
          <KundenDataTable companies={companies} />
        </>
      )}
    </DashboardShell>
  );
}
