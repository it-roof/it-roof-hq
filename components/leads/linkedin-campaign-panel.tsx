'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LINKEDIN_STATUSES,
  LINKEDIN_STATUS_DE,
  type LinkedInStatus,
} from '@/lib/leads/linkedin-status';
import { cn } from '@/lib/utils';

type CampaignContactRow = {
  id: string;
  status: LinkedInStatus;
  status_at: string | null;
  next_step: string | null;
  first_name: string | null;
  last_name: string | null;
  linkedin_url: string | null;
  company_name: string;
};

function contactName(row: CampaignContactRow) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Kontakt';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function LinkedInCampaignPanel({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<CampaignContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | LinkedInStatus>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/campaign-contacts?campaign_id=${encodeURIComponent(campaignId)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setRows(data.contacts ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoading(false);
      });
    return () => ctrl.abort();
  }, [campaignId, tick]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  async function setStatus(id: string, status: LinkedInStatus) {
    setSavingId(id);
    await fetch(`/api/campaign-contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, status_at: new Date().toISOString() } : r)),
    );
    setSavingId(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 py-3">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1.5 text-[11px] font-mono font-medium tracking-wide transition-all',
            statusFilter === 'all'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          Alle · {rows.length}
        </button>
        {LINKEDIN_STATUSES.map((s) => {
          const n = rows.filter((r) => r.status === s).length;
          if (n === 0 && statusFilter !== s) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-mono font-medium tracking-wide transition-all',
                statusFilter === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {LINKEDIN_STATUS_DE[s]} · {n}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Keine Kontakte in diesem Status.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((row) => (
              <li key={row.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.company_name}</p>
                    <p className="truncate font-mono text-[12px] text-muted-foreground">
                      {contactName(row)}
                    </p>
                  </div>
                  <Select
                    value={row.status}
                    onValueChange={(v) => {
                      if (!v) return;
                      void setStatus(row.id, v as LinkedInStatus);
                    }}
                    disabled={savingId === row.id}
                  >
                    <SelectTrigger className="h-8 w-[10.5rem] shrink-0 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINKEDIN_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LINKEDIN_STATUS_DE[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                  {row.linkedin_url ? (
                    <a
                      href={row.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-info hover:underline"
                    >
                      LinkedIn
                    </a>
                  ) : (
                    <span>kein Link</span>
                  )}
                  <span>{formatDate(row.status_at)}</span>
                </div>
                {row.next_step && (
                  <p className="text-[12px] text-muted-foreground">{row.next_step}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loading && (
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setLoading(true);
                setTick((n) => n + 1);
              }}
            >
              Aktualisieren
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
