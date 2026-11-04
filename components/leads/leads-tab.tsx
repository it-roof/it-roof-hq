'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  ArrowLeftIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { ConfirmDelete } from '@/components/leads/confirm-delete';
import { ListPagination } from '@/components/leads/list-pagination';
import { SaveForm } from '@/components/save-form';
import { PAGE_SIZE, type PageSize } from '@/lib/leads/pagination';
import {
  OUTREACH_STATUSES,
  OUTREACH_STATUS_CLASS,
  OUTREACH_STATUS_DE,
  formatOutreachStatusAt,
  parseOutreachStatus,
  type OutreachStatus,
} from '@/lib/leads/outreach-status';
import {
  splitHeaderY,
  splitLeftPad,
  splitLeftPadEnd,
  splitRightPad,
} from '@/lib/page-layout';
import { cn } from '@/lib/utils';

type LeadContact = {
  id: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url?: string | null;
};

type Lead = {
  id: string;
  company_name: string;
  domain: string | null;
  street: string | null;
  city: string | null;
  country_code: string | null;
  phone: string | null;
  industry: string | null;
  status: string;
  outreach_status?: string | null;
  outreach_status_at?: string | null;
  created_at?: string | null;
  contacts: LeadContact[];
};

type SearchOption = { id: string; query: string; lead_count: number };

const STATUS_DE: Record<string, string> = {
  complete: 'Vollständig',
  raw: 'Roh',
  error_incomplete: 'Unvollständig',
  error_no_domain: 'Ohne Domain',
};

const STATUS_CLASS: Record<string, string> = {
  complete: 'text-success',
  raw: 'text-info',
  error_incomplete: 'text-warning',
  error_no_domain: 'text-danger',
};

const EMPTY_FORM = {
  company_name: '',
  domain: '',
  street: '',
  city: '',
  country_code: 'DE',
  phone: '',
  industry: '',
  status: 'raw',
};

export function LeadsTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<{
    returned: number;
    total: number;
    complete: number;
    all_total?: number;
    page: number;
    pages: number;
    limit: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [outreachFilter, setOutreachFilter] = useState<'all' | OutreachStatus>('all');
  const [city, setCity] = useState('all');
  const [cities, setCities] = useState<{ city: string; n: number }[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [outreachSaving, setOutreachSaving] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailCheckDetail, setEmailCheckDetail] = useState<string | null>(null);
  const [searchQueryId, setSearchQueryId] = useState(
    () => searchParams.get('search_query_id') ?? 'all',
  );
  const [searches, setSearches] = useState<SearchOption[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const fromUrl = searchParams.get('search_query_id') ?? 'all';
    setSearchQueryId((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  function setSearchQueryFilter(id: string) {
    setSearchQueryId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === 'all') params.delete('search_query_id');
    else params.set('search_query_id', id);
    const qs = params.toString();
    router.replace(qs ? `/leads?${qs}` : '/leads', { scroll: false });
  }

  async function load(signal?: AbortSignal) {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (debounced) params.set('q', debounced);
    if (status !== 'all') params.set('status', status);
    if (outreachFilter !== 'all') params.set('outreach_status', outreachFilter);
    if (city !== 'all') params.set('city', city);
    if (searchQueryId !== 'all') params.set('search_query_id', searchQueryId);
    const r = await fetch(`/api/leads?${params}`, { signal });
    const data = await r.json();
    setLeads(data.leads ?? []);
    setMeta(data.meta ?? null);
    if (data.meta?.cities) setCities(data.meta.cities);
    if (data.meta?.searches) setSearches(data.meta.searches);
    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
  }, [debounced, status, outreachFilter, city, searchQueryId]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal).catch((e) => {
      if (e.name !== 'AbortError') setLoading(false);
    });
    return () => ctrl.abort();
  }, [debounced, status, outreachFilter, city, searchQueryId, page, limit]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEmailCheckDetail(null);
      return;
    }
    setEmailCheckDetail(null);
    const fromList = leads.find((l) => l.id === selectedId) ?? null;
    if (fromList) setDetail(fromList);

    const ctrl = new AbortController();
    setDetailLoading(true);
    fetch(`/api/leads/${selectedId}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then((row: Lead) => {
        setDetail(row);
        setDetailLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setDetailLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedId, leads]);

  const activeSearchLabel =
    searchQueryId === 'all'
      ? 'Alle Suchen'
      : (searches.find((s) => s.id === searchQueryId)?.query ?? 'Suche');

  const showMobileDetail = Boolean(selectedId);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(l: Lead) {
    setEditingId(l.id);
    setForm({
      company_name: l.company_name,
      domain: l.domain ?? '',
      street: l.street ?? '',
      city: l.city ?? '',
      country_code: l.country_code ?? 'DE',
      phone: l.phone ?? '',
      industry: l.industry ?? '',
      status: l.status,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.company_name.trim()) return;
    setSaving(true);
    await fetch(editingId ? `/api/leads/${editingId}` : '/api/leads', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    await load();
  }

  async function setOutreachStatus(id: string, next: OutreachStatus) {
    setOutreachSaving(true);
    const r = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreach_status: next }),
    });
    setOutreachSaving(false);
    if (!r.ok) return;
    const data = await r.json().catch(() => null);
    const at =
      (data?.lead?.outreachStatusAt as string | undefined) ??
      (data?.lead?.outreach_status_at as string | undefined) ??
      new Date().toISOString();
    setDetail((prev) =>
      prev && prev.id === id
        ? { ...prev, outreach_status: next, outreach_status_at: at }
        : prev,
    );
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, outreach_status: next, outreach_status_at: at } : l,
      ),
    );
  }

  async function runEmailCheck(id: string) {
    setEmailChecking(true);
    setEmailCheckDetail(null);
    const r = await fetch(`/api/leads/${id}/email-check`, { method: 'POST' });
    const data = await r.json().catch(() => null);
    setEmailChecking(false);
    if (!r.ok) {
      setEmailCheckDetail(
        typeof data?.error === 'string' ? data.error : 'Prüfung fehlgeschlagen',
      );
      return;
    }
    const next = parseOutreachStatus(data?.lead?.outreach_status ?? data?.check?.status, 'open');
    const at =
      (data?.lead?.outreach_status_at as string | undefined) ?? new Date().toISOString();
    const detail =
      typeof data?.check?.detail === 'string' ? data.check.detail : null;
    setEmailCheckDetail(detail);
    setDetail((prev) =>
      prev && prev.id === id
        ? { ...prev, outreach_status: next, outreach_status_at: at }
        : prev,
    );
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, outreach_status: next, outreach_status_at: at } : l,
      ),
    );
  }

  function outreachOf(l: Pick<Lead, 'outreach_status'>): OutreachStatus {
    return parseOutreachStatus(l.outreach_status, 'open');
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          splitLeftPad,
          splitLeftPadEnd,
          showMobileDetail ? 'hidden lg:flex' : 'flex',
        )}
      >
        <header className={cn('flex shrink-0 items-start justify-between gap-3', splitHeaderY)}>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
            <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
              {meta
                ? `${meta.total} Treffer${typeof meta.all_total === 'number' ? ` · ${meta.all_total} gesamt` : ''} · ${meta.complete} vollständig`
                : 'Firmen & Kontakte'}
            </p>
          </div>
          <Button size="icon" className="size-10 shrink-0 rounded-full" onClick={openCreate}>
            <PlusIcon className="size-4" />
          </Button>
        </header>

        <div className="mb-3 flex shrink-0 flex-wrap gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, Branche, Kontakt…"
            className="h-10 min-w-[160px] flex-1"
          />

          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={searchOpen}
                className="h-10 w-[200px] shrink-0 justify-between font-normal"
              >
                <span className="truncate">{activeSearchLabel}</span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command className="h-auto max-h-80">
                <CommandInput placeholder="Suche filtern…" />
                <CommandList className="max-h-64">
                  <CommandEmpty className="flex py-4">Keine Suche gefunden.</CommandEmpty>
                  <CommandGroup heading="Suchen">
                    <CommandItem
                      value="Alle Suchen"
                      data-checked={searchQueryId === 'all' || undefined}
                      onSelect={() => {
                        setSearchQueryFilter('all');
                        setSearchOpen(false);
                      }}
                    >
                      Alle Suchen
                    </CommandItem>
                    {searches.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={s.query}
                        keywords={[s.query]}
                        data-checked={searchQueryId === s.id || undefined}
                        onSelect={() => {
                          setSearchQueryFilter(s.id);
                          setSearchOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{s.query}</span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          {s.lead_count}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={cityOpen} onOpenChange={setCityOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={cityOpen}
                className="h-10 w-[180px] shrink-0 justify-between font-normal"
              >
                <span className="truncate">
                  {city === 'all' ? 'Alle Städte' : city}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0" align="start">
              <Command className="h-auto max-h-80">
                <CommandInput placeholder="Stadt suchen…" />
                <CommandList className="max-h-64">
                  <CommandEmpty className="flex py-4">Keine Stadt gefunden.</CommandEmpty>
                  <CommandGroup heading="Städte">
                    <CommandItem
                      value="Alle Städte"
                      data-checked={city === 'all' || undefined}
                      onSelect={() => {
                        setCity('all');
                        setCityOpen(false);
                      }}
                    >
                      Alle Städte
                    </CommandItem>
                    {cities.map((c) => (
                      <CommandItem
                        key={c.city}
                        value={c.city}
                        keywords={[c.city]}
                        data-checked={city === c.city || undefined}
                        onSelect={() => {
                          setCity(c.city);
                          setCityOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{c.city}</span>
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{c.n}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
          {(['all', 'complete', 'raw', 'error_incomplete', 'error_no_domain'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-mono font-medium tracking-wide transition-all',
                status === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'all' ? 'Alle' : STATUS_DE[s]}
            </button>
          ))}
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
          {(['all', ...OUTREACH_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setOutreachFilter(s)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[11px] font-mono font-medium tracking-wide transition-all',
                outreachFilter === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'all' ? 'Outreach: alle' : OUTREACH_STATUS_DE[s]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : leads.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Keine Leads gefunden.</p>
          ) : (
            <Table className="[&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] tracking-wide">Firma</TableHead>
                  <TableHead className="font-mono text-[11px] tracking-wide">Stadt</TableHead>
                  <TableHead className="hidden font-mono text-[11px] tracking-wide md:table-cell">Branche</TableHead>
                  <TableHead className="hidden font-mono text-[11px] tracking-wide lg:table-cell">Domain</TableHead>
                  <TableHead className="font-mono text-[11px] tracking-wide">Status</TableHead>
                  <TableHead className="font-mono text-[11px] tracking-wide">Outreach</TableHead>
                  <TableHead className="font-mono text-[11px] tracking-wide text-right">Kontakte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow
                    key={l.id}
                    className={cn(
                      'cursor-pointer',
                      selectedId === l.id && 'bg-muted/50',
                    )}
                    onClick={() => setSelectedId(l.id)}
                  >
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate font-medium">{l.company_name}</span>
                      {l.street && (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {l.street}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">
                      {[l.city, l.country_code].filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="hidden max-w-[160px] truncate font-mono text-[12px] text-muted-foreground md:table-cell">
                      {l.industry || '—'}
                    </TableCell>
                    <TableCell className="hidden max-w-[160px] lg:table-cell" onClick={(e) => e.stopPropagation()}>
                      {l.domain ? (
                        <a
                          href={l.domain.startsWith('http') ? l.domain : `https://${l.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-mono text-[12px] text-info hover:underline"
                        >
                          {l.domain}
                        </a>
                      ) : (
                        <span className="font-mono text-[12px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={cn('font-mono text-[11px]', STATUS_CLASS[l.status] ?? '')}>
                        {STATUS_DE[l.status] ?? l.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const o = outreachOf(l);
                        return (
                          <span className={cn('font-mono text-[11px]', OUTREACH_STATUS_CLASS[o])}>
                            {o === 'open' ? '—' : OUTREACH_STATUS_DE[o]}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.contacts.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground">
                          {l.contacts.length > 1 ? (
                            <UsersIcon className="size-3.5 text-info" />
                          ) : (
                            <UserIcon className="size-3.5 text-info" />
                          )}
                          {l.contacts.length}
                        </span>
                      ) : (
                        <span className="inline-flex size-8 items-center justify-center text-muted-foreground/30">
                          <UserIcon className="size-4" />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {meta && (
            <ListPagination
              page={meta.page}
              pages={meta.pages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          )}
        </div>
      </section>

      <aside
        className={cn(
          'min-h-0 w-full shrink-0 flex-col border-border/60 lg:flex lg:border-l',
          'lg:w-[24rem] xl:w-[28rem]',
          splitRightPad,
          showMobileDetail ? 'flex flex-1' : 'hidden',
        )}
      >
        {selectedId && detail ? (
          <>
            <header className={cn('flex shrink-0 items-start gap-2 border-b border-border/60', splitHeaderY)}>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 lg:hidden"
                onClick={() => setSelectedId(null)}
                aria-label="Zurück"
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold tracking-tight md:text-xl">
                  {detail.company_name}
                </h2>
                <p className={cn('mt-1 font-mono text-xs tracking-wide', STATUS_CLASS[detail.status] ?? 'text-muted-foreground')}>
                  {STATUS_DE[detail.status] ?? detail.status}
                  {outreachOf(detail) !== 'open' && (
                    <span className={cn('ml-2', OUTREACH_STATUS_CLASS[outreachOf(detail)])}>
                      · {OUTREACH_STATUS_DE[outreachOf(detail)]}
                      {formatOutreachStatusAt(detail.outreach_status_at) && (
                        <span className="text-muted-foreground">
                          {' '}
                          · {formatOutreachStatusAt(detail.outreach_status_at)}
                        </span>
                      )}
                    </span>
                  )}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={() => openEdit(detail)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <ConfirmDelete
                label={`„${detail.company_name}" und zugehörige Kontakte löschen?`}
                onConfirm={() => remove(detail.id)}
              />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              {detailLoading && !detail.company_name ? (
                <div className="flex flex-col gap-2 py-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  <dl className="divide-y divide-border/60">
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-3">
                      <dt className="font-mono text-[11px] tracking-wide text-muted-foreground">
                        Outreach
                      </dt>
                      <dd className="min-w-0 flex flex-col gap-1.5">
                        <div className="flex gap-2">
                          <Select
                            value={outreachOf(detail)}
                            onValueChange={(v) => {
                              if (!v) return;
                              void setOutreachStatus(detail.id, v as OutreachStatus);
                            }}
                            disabled={outreachSaving || emailChecking}
                          >
                            <SelectTrigger className="h-9 min-w-0 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {OUTREACH_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {OUTREACH_STATUS_DE[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 shrink-0 gap-1.5 px-2.5"
                            disabled={emailChecking || outreachSaving}
                            onClick={() => void runEmailCheck(detail.id)}
                          >
                            <ShieldCheckIcon className="size-3.5" />
                            {emailChecking ? '…' : 'Prüfen'}
                          </Button>
                        </div>
                        {formatOutreachStatusAt(detail.outreach_status_at) ? (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            gesetzt {formatOutreachStatusAt(detail.outreach_status_at)}
                          </p>
                        ) : outreachOf(detail) === 'open' ? (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            noch nicht geprüft
                          </p>
                        ) : null}
                        {emailCheckDetail && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {emailCheckDetail}
                          </p>
                        )}
                      </dd>
                    </div>
                    <DetailRow label="Domain">
                      {detail.domain ? (
                        <a
                          href={detail.domain.startsWith('http') ? detail.domain : `https://${detail.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-info hover:underline"
                        >
                          {detail.domain}
                        </a>
                      ) : null}
                    </DetailRow>
                    <DetailRow label="Branche">{detail.industry}</DetailRow>
                    <DetailRow label="Straße">{detail.street}</DetailRow>
                    <DetailRow label="Stadt">
                      {[detail.city, detail.country_code].filter(Boolean).join(', ') || null}
                    </DetailRow>
                    <DetailRow label="Telefon">
                      {detail.phone ? (
                        <a href={`tel:${detail.phone}`} className="hover:underline">
                          {detail.phone}
                        </a>
                      ) : null}
                    </DetailRow>
                    <DetailRow label="Angelegt">
                      {detail.created_at
                        ? new Date(detail.created_at).toLocaleString('de-DE', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : null}
                    </DetailRow>
                  </dl>

                  <div className="mt-6">
                    <p className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground">
                      Kontakte ({detail.contacts?.length ?? 0})
                    </p>
                    {!detail.contacts?.length ? (
                      <p className="text-sm text-muted-foreground">Keine Kontakte.</p>
                    ) : (
                      <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                        {detail.contacts.map((c) => (
                          <li key={c.id} className="px-3 py-3">
                            <ContactPopoverItem contact={c} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="hidden flex-1 flex-col justify-center lg:flex">
            <p className="text-sm text-muted-foreground">
              Wähle einen Lead aus der Liste, um Details zu sehen.
            </p>
          </div>
        )}
      </aside>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-xl px-5 pb-8">
            <DrawerHeader className="px-0 pt-4 pb-5">
              <DrawerTitle>{editingId ? 'Lead bearbeiten' : 'Lead anlegen'}</DrawerTitle>
            </DrawerHeader>
            <SaveForm onSave={save} className="flex flex-col gap-4">
              <Field label="Firma">
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="h-10" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stadt">
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-10" />
                </Field>
                <Field label="Branche">
                  <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="h-10" />
                </Field>
              </div>
              <Field label="Domain">
                <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="h-10" />
              </Field>
              <Field label="Straße">
                <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className="h-10" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" />
                </Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_DE).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="h-11 flex-1" onClick={() => setOpen(false)}>Abbrechen</Button>
                <Button type="submit" variant="success-solid" className="h-11 flex-1" disabled={saving || !form.company_name.trim()}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </Button>
              </div>
            </SaveForm>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  const empty = children == null || children === '';
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-3">
      <dt className="font-mono text-[11px] tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-[12px]">
        {empty ? <span className="text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

function contactName(c: LeadContact) {
  return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(' ') || 'Kontakt';
}

function ContactPopoverItem({ contact: c }: { contact: LeadContact }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{contactName(c)}</p>
      {c.position && (
        <p className="font-mono text-[11px] text-muted-foreground">{c.position}</p>
      )}
      {c.email && (
        <a
          href={`mailto:${c.email}`}
          className="font-mono text-[11px] text-info hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {c.email}
        </a>
      )}
      {c.linkedin_url && (
        <a
          href={c.linkedin_url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[11px] text-info hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          LinkedIn
        </a>
      )}
      {c.phone && (
        <a
          href={`tel:${c.phone}`}
          className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {c.phone}
        </a>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
