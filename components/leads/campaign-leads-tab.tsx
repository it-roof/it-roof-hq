'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
} from 'lucide-react';
import { ListPagination } from '@/components/leads/list-pagination';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usesCampaignLead } from '@/lib/leads/mail-status';
import { campaignFlowLabel } from '@/lib/leads/campaign-steps';
import { appendListParams } from '@/lib/leads/filter-params';
import { PAGE_SIZE, type PageSize } from '@/lib/leads/pagination';
import { cn } from '@/lib/utils';

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  channel?: string;
  step_count: number;
  lead_count: number;
  active_count: number;
  done_count: number;
  flow_label: string;
};

type Lead = {
  id: string;
  company_name: string;
  city: string | null;
  industry: string | null;
  domain: string | null;
  status: string;
};

type Facet = { value: string; n: number };
type SearchTag = { id: string; name: string };
type SearchOption = { id: string; query: string; n: number; tags: SearchTag[] };

const STATUS_DE: Record<string, string> = {
  complete: 'Vollständig',
  raw: 'Roh',
  error_incomplete: 'Unvollständig',
  error_no_domain: 'Ohne Domain',
};

const STATUS_OPTIONS = ['all', 'complete', 'raw', 'error_incomplete', 'error_no_domain'] as const;
type LeadScope = 'new' | 'assigned';

function multiLabel(selected: string[], empty: string) {
  if (selected.length === 0) return empty;
  if (selected.length === 1) return selected[0]!;
  return `${selected[0]} +${selected.length - 1}`;
}

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function CampaignLeadsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<{
    total: number;
    page: number;
    pages: number;
    limit: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSearches, setSelectedSearches] = useState<string[]>([]);
  const [cities, setCities] = useState<Facet[]>([]);
  const [industries, setIndustries] = useState<Facet[]>([]);
  const [searches, setSearches] = useState<SearchOption[]>([]);
  const [searchLabels, setSearchLabels] = useState<Record<string, string>>({});
  const [cityOpen, setCityOpen] = useState(false);
  const [industryOpen, setIndustryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDialogTag, setSearchDialogTag] = useState<'all' | 'none' | string>('all');
  const [searchDialogQ, setSearchDialogQ] = useState('');
  const [scope, setScope] = useState<LeadScope>('new');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(PAGE_SIZE);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [matchAvailable, setMatchAvailable] = useState(0);
  const [matchAssigned, setMatchAssigned] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const selectedCampaign = campaigns.find((c) => c.id === campaignId) ?? null;
  const hasFilter =
    selectedCities.length > 0
    || selectedIndustries.length > 0
    || selectedSearches.length > 0
    || status !== 'all'
    || !!debounced;

  const citiesKey = selectedCities.join('\0');
  const industriesKey = selectedIndustries.join('\0');
  const searchesKey = selectedSearches.join('\0');

  const cityOptions = useMemo(() => {
    const map = new Map(cities.map((c) => [c.value, c]));
    for (const value of selectedCities) {
      if (!map.has(value)) map.set(value, { value, n: 0 });
    }
    return [...map.values()];
  }, [cities, citiesKey]);

  const industryOptions = useMemo(() => {
    const map = new Map(industries.map((i) => [i.value, i]));
    for (const value of selectedIndustries) {
      if (!map.has(value)) map.set(value, { value, n: 0 });
    }
    return [...map.values()];
  }, [industries, industriesKey]);

  const searchOptions = useMemo(() => {
    const map = new Map(searches.map((s) => [s.id, s]));
    for (const id of selectedSearches) {
      if (!map.has(id)) {
        map.set(id, {
          id,
          query: searchLabels[id] ?? id.slice(0, 8),
          n: 0,
          tags: [],
        });
      }
    }
    return [...map.values()];
  }, [searches, searchesKey, searchLabels]);

  const searchGroups = useMemo(() => {
    const byTag = new Map<string, { id: string; name: string; items: SearchOption[] }>();
    const untagged: SearchOption[] = [];

    for (const s of searchOptions) {
      if (!s.tags.length) {
        untagged.push(s);
        continue;
      }
      for (const t of s.tags) {
        let group = byTag.get(t.id);
        if (!group) {
          group = { id: t.id, name: t.name, items: [] };
          byTag.set(t.id, group);
        }
        group.items.push(s);
      }
    }

    const tagged = [...byTag.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'de'),
    );
    return { tagged, untagged };
  }, [searchOptions]);

  const dialogSearchList = useMemo(() => {
    let list: SearchOption[];
    if (searchDialogTag === 'all') list = searchOptions;
    else if (searchDialogTag === 'none') list = searchGroups.untagged;
    else {
      list = searchGroups.tagged.find((g) => g.id === searchDialogTag)?.items ?? [];
    }
    const q = searchDialogQ.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.query.toLowerCase().includes(q)
          || s.tags.some((t) => t.name.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => a.query.localeCompare(b.query, 'de'));
  }, [searchOptions, searchGroups, searchDialogTag, searchDialogQ]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function loadCampaigns() {
      setCampaignsLoading(true);
      try {
        const [campsData, stepsData] = await Promise.all([
          fetch('/api/campaigns').then((r) => r.json()),
          fetch('/api/campaign-steps').then((r) => r.json()),
        ]);
        if (cancelled) return;

        const stepsByCampaign = new Map<string, string[]>();
        for (const s of stepsData.steps ?? []) {
          const list = stepsByCampaign.get(s.campaignId) ?? [];
          list.push(s.type);
          stepsByCampaign.set(s.campaignId, list);
        }
        setCampaigns(
          (campsData.campaigns ?? [])
            .filter((c: { channel?: string; name?: string }) => usesCampaignLead(c))
            .map((c: {
            id: string;
            name: string;
            description: string | null;
            channel?: string;
            step_count?: number;
            lead_count?: number;
            active_count?: number;
            done_count?: number;
          }) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            channel: c.channel,
            step_count: c.step_count ?? 0,
            lead_count: c.lead_count ?? 0,
            active_count: c.active_count ?? 0,
            done_count: c.done_count ?? 0,
            flow_label: campaignFlowLabel(stepsByCampaign.get(c.id) ?? []),
          })),
        );
      } finally {
        if (!cancelled) setCampaignsLoading(false);
      }
    }

    if (!campaignId) void loadCampaigns();
    return () => { cancelled = true; };
  }, [campaignId]);

  async function loadAssigned(id: string) {
    const res = await fetch(`/api/campaign-leads?campaign_id=${id}&ids_only=1`);
    const data = await res.json();
    setAssignedIds(new Set(data.lead_ids ?? []));
  }

  async function loadLeads(signal?: AbortSignal) {
    if (!campaignId) return;
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (debounced) params.set('q', debounced);
    if (status !== 'all') params.set('status', status);
    appendListParams(params, 'city', selectedCities);
    appendListParams(params, 'industry', selectedIndustries);
    appendListParams(params, 'search_query_id', selectedSearches);
    if (scope === 'new') {
      params.set('exclude_campaign_id', campaignId);
      params.set('exclude_email_blocked', '1');
    }
    if (scope === 'assigned') params.set('include_campaign_id', campaignId);

    const res = await fetch(`/api/leads?${params}`, { signal });
    const data = await res.json();
    setLeads(data.leads ?? []);
    setMeta(data.meta ? {
      total: data.meta.total ?? 0,
      page: data.meta.page ?? 1,
      pages: data.meta.pages ?? 1,
      limit: data.meta.limit ?? PAGE_SIZE,
    } : null);
    if (data.meta?.cities) {
      setCities(data.meta.cities.map((c: { city: string; n: number }) => ({
        value: c.city,
        n: c.n,
      })));
    }
    if (data.meta?.industries) {
      setIndustries(data.meta.industries.map((i: { industry: string; n: number }) => ({
        value: i.industry,
        n: i.n,
      })));
    }
    if (data.meta?.searches) {
      const nextSearches = data.meta.searches.map((s: {
        id: string;
        query: string;
        lead_count: number;
        tags?: SearchTag[];
      }) => ({
        id: s.id,
        query: s.query,
        n: s.lead_count,
        tags: s.tags ?? [],
      }));
      setSearches(nextSearches);
      setSearchLabels((prev) => {
        const next = { ...prev };
        for (const s of nextSearches) next[s.id] = s.query;
        return next;
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!campaignId) return;
    setSelected(new Set());
    setPage(1);
    setSearch('');
    setDebounced('');
    setSelectedCities([]);
    setSelectedIndustries([]);
    setSelectedSearches([]);
    setStatus('all');
    setScope('new');
    setFlash(null);
    loadAssigned(campaignId);
  }, [campaignId]);

  useEffect(() => {
    setPage(1);
  }, [debounced, citiesKey, industriesKey, searchesKey, scope, status]);

  useEffect(() => {
    if (!campaignId) return;
    const ctrl = new AbortController();
    loadLeads(ctrl.signal).catch((e) => {
      if (e.name !== 'AbortError') setLoading(false);
    });
    return () => ctrl.abort();
  }, [campaignId, debounced, citiesKey, industriesKey, searchesKey, page, limit, scope, status]);

  useEffect(() => {
    if (!campaignId || !hasFilter) {
      setMatchAvailable(0);
      setMatchAssigned(0);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ campaign_id: campaignId });
    appendListParams(params, 'city', selectedCities);
    appendListParams(params, 'industry', selectedIndustries);
    appendListParams(params, 'search_query_id', selectedSearches);
    if (status !== 'all') params.set('status', status);
    if (debounced) params.set('q', debounced);
    fetch(`/api/campaign-leads/bulk?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setMatchAvailable(data.available ?? 0);
          setMatchAssigned(data.already_assigned ?? 0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, citiesKey, industriesKey, searchesKey, debounced, hasFilter, assignedIds, status]);

  const visibleLeads = leads;

  const allPageSelected =
    visibleLeads.length > 0
    && visibleLeads.every((l) => selected.has(l.id));

  function toggleAllPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const l of visibleLeads) next.delete(l.id);
      } else {
        for (const l of visibleLeads) next.add(l.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignIds(ids: string[]) {
    const toAssign = ids.filter((id) => !assignedIds.has(id));
    if (!campaignId || toAssign.length === 0 || assigning) return;
    setAssigning(true);
    setFlash(null);
    const res = await fetch('/api/campaign-leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, lead_ids: toAssign }),
    });
    const data = await res.json();
    setAssigning(false);
    if (!res.ok) {
      setFlash(data.error ?? 'Zuordnung fehlgeschlagen');
      return;
    }
    setFlash(
      data.inserted === 0
        ? 'Keine neuen Zuordnungen.'
        : `${data.inserted} Lead${data.inserted !== 1 ? 's' : ''} zugeordnet`,
    );
    setSelected(new Set());
    await loadAssigned(campaignId);
    await loadLeads();
  }

  async function unassignIds(ids: string[]) {
    const toRemove = ids.filter((id) => assignedIds.has(id));
    if (!campaignId || toRemove.length === 0 || assigning) return;
    setAssigning(true);
    setFlash(null);
    const res = await fetch('/api/campaign-leads/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, lead_ids: toRemove }),
    });
    const data = await res.json();
    setAssigning(false);
    if (!res.ok) {
      setFlash(data.error ?? 'Aufheben fehlgeschlagen');
      return;
    }
    setFlash(
      data.removed === 0
        ? 'Keine Zuordnung entfernt.'
        : `${data.removed} Zuordnung${data.removed !== 1 ? 'en' : ''} aufgehoben`,
    );
    setSelected(new Set());
    await loadAssigned(campaignId);
    await loadLeads();
  }

  async function unassignMatching() {
    if (!campaignId || !hasFilter || assigning || matchAssigned === 0) return;
    setAssigning(true);
    setFlash(null);
    const res = await fetch('/api/campaign-leads/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaignId,
        cities: selectedCities.length ? selectedCities : undefined,
        industries: selectedIndustries.length ? selectedIndustries : undefined,
        search_query_ids: selectedSearches.length ? selectedSearches : undefined,
        status: status !== 'all' ? status : undefined,
        q: debounced || undefined,
      }),
    });
    const data = await res.json();
    setAssigning(false);
    if (!res.ok) {
      setFlash(data.error ?? 'Aufheben fehlgeschlagen');
      return;
    }
    setFlash(
      data.removed === 0
        ? 'Keine Zuordnung entfernt.'
        : `${data.removed} Zuordnung${data.removed !== 1 ? 'en' : ''} aufgehoben`,
    );
    setSelected(new Set());
    await loadAssigned(campaignId);
    await loadLeads();
  }

  async function assignMatching() {
    if (!campaignId || !hasFilter || assigning) return;
    setAssigning(true);
    setFlash(null);
    const res = await fetch('/api/campaign-leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaignId,
        cities: selectedCities.length ? selectedCities : undefined,
        industries: selectedIndustries.length ? selectedIndustries : undefined,
        search_query_ids: selectedSearches.length ? selectedSearches : undefined,
        status: status !== 'all' ? status : undefined,
        q: debounced || undefined,
      }),
    });
    const data = await res.json();
    setAssigning(false);
    if (!res.ok) {
      setFlash(data.error ?? 'Zuordnung fehlgeschlagen');
      return;
    }
    setFlash(
      data.inserted === 0
        ? 'Keine neuen Zuordnungen.'
        : `${data.inserted} Lead${data.inserted !== 1 ? 's' : ''} zugeordnet`,
    );
    setSelected(new Set());
    await loadAssigned(campaignId);
    await loadLeads();
  }

  /* —— Schritt 1: Kampagne —— */
  if (!campaignId) {
    return (
      <div>
        <PageHeader
          title="Zuordnungen"
          subtitle="Kampagne wählen"
        />

        {campaignsLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[5/3] w-full rounded-xl" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">
            Noch keine Kampagnen. Lege zuerst eine unter Kampagnen an.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCampaignId(c.id)}
                className="flex aspect-[5/3] flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-5 py-5 text-left transition-colors hover:border-border hover:bg-muted/40 md:px-6 md:py-6"
              >
                <div className="min-w-0 space-y-1.5">
                  <span className="line-clamp-2 text-lg font-semibold tracking-tight text-balance md:text-xl">
                    {c.name}
                  </span>
                  <span className="line-clamp-2 font-mono text-[12px] tracking-wide text-muted-foreground">
                    {c.flow_label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                  <span>
                    <span className="tabular-nums text-foreground">{c.lead_count}</span>
                    {' '}zugeordnet
                  </span>
                  <span>
                    <span className="tabular-nums text-foreground">{c.active_count}</span>
                    {' '}offen
                  </span>
                  <span>
                    <span className="tabular-nums text-foreground">{c.done_count}</span>
                    {' '}fertig
                  </span>
                  <span>
                    <span className="tabular-nums text-foreground">{c.step_count}</span>
                    {' '}Schritt{c.step_count !== 1 ? 'e' : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* —— Schritt 2: Leads —— */
  const allDialogVisibleSelected =
    dialogSearchList.length > 0
    && dialogSearchList.every((s) => selectedSearches.includes(s.id));
  const dialogSelectAllLabel =
    searchDialogTag === 'all'
      ? 'Alle sichtbaren'
      : searchDialogTag === 'none'
        ? 'Alle ohne Tags'
        : `Alle von „${searchGroups.tagged.find((g) => g.id === searchDialogTag)?.name ?? 'Tag'}“`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={selectedCampaign?.name ?? 'Kampagne'}
        subtitle={
          scope === 'new'
            ? 'Leads der Kampagne zuordnen'
            : `${assignedIds.size} zugeordnet`
        }
        onBack={() => setCampaignId(null)}
        actions={
          scope === 'assigned' ? (
            <>
              <Button
                variant="outline"
                className="h-10 gap-1.5"
                disabled={assigning || selected.size === 0}
                onClick={() => unassignIds([...selected])}
              >
                <MinusIcon className="size-3.5" />
                {selected.size > 0
                  ? `Aufheben (${selected.size})`
                  : 'Aufheben'}
              </Button>
              <Button
                variant="outline"
                className="h-10 gap-1.5"
                disabled={assigning || !hasFilter || matchAssigned === 0}
                onClick={unassignMatching}
              >
                <MinusIcon className="size-3.5" />
                {hasFilter && matchAssigned > 0
                  ? `Alle Treffer (${matchAssigned})`
                  : 'Alle Treffer'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="h-10 gap-1.5"
                disabled={assigning || !hasFilter || matchAvailable === 0}
                onClick={assignMatching}
              >
                <PlusIcon className="size-3.5" />
                {hasFilter && matchAvailable > 0
                  ? `Alle Treffer (${matchAvailable})`
                  : 'Alle Treffer'}
              </Button>
              <Button
                variant="success-solid"
                className="h-10 gap-1.5"
                disabled={assigning || selected.size === 0}
                onClick={() => assignIds([...selected])}
              >
                <PlusIcon className="size-3.5" />
                {selected.size > 0
                  ? `Zuordnen (${selected.size})`
                  : 'Zuordnen'}
              </Button>
            </>
          )
        }
      />

      <Tabs
        value={scope}
        onValueChange={(v) => {
          setScope(v as LeadScope);
          setSelected(new Set());
          setFlash(null);
        }}
      >
        <TabsList className="h-10 w-full max-w-md">
          <TabsTrigger value="new" className="flex-1 px-3 text-[13px]">
            Zuordnen
          </TabsTrigger>
          <TabsTrigger value="assigned" className="flex-1 gap-1.5 px-3 text-[13px]">
            Zugeordnet
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {assignedIds.size}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma suchen…"
              className="h-10 pl-9"
            />
          </div>

          <Popover open={cityOpen} onOpenChange={setCityOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className={cn(
                  'h-10 w-[200px] shrink-0 justify-between font-normal',
                  selectedCities.length > 0 && 'border-foreground/30',
                )}
              >
                <span className="truncate">
                  {multiLabel(
                    selectedCities,
                    `Stadt${cities.length ? ` (${cities.length})` : ''}`,
                  )}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command className="h-auto max-h-80">
                <CommandInput placeholder="Stadt suchen…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>Keine Stadt für diesen Filter.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="Auswahl leeren"
                      onSelect={() => setSelectedCities([])}
                    >
                      Auswahl leeren
                    </CommandItem>
                    {cityOptions.map((c) => {
                      const checked = selectedCities.includes(c.value);
                      return (
                        <CommandItem
                          key={c.value}
                          value={c.value}
                          data-checked={checked || undefined}
                          onSelect={() => setSelectedCities((prev) => toggleValue(prev, c.value))}
                        >
                          <CheckIcon
                            className={cn(
                              'size-3.5 shrink-0',
                              checked ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">{c.value}</span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {c.n}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className={cn(
                  'h-10 w-[220px] shrink-0 justify-between font-normal',
                  selectedIndustries.length > 0 && 'border-foreground/30',
                )}
              >
                <span className="truncate">
                  {multiLabel(
                    selectedIndustries,
                    `Branche${industries.length ? ` (${industries.length})` : ''}`,
                  )}
                </span>
                <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command className="h-auto max-h-80">
                <CommandInput placeholder="Branche suchen…" />
                <CommandList className="max-h-64">
                  <CommandEmpty>Keine Branche für diesen Filter.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="Auswahl leeren"
                      onSelect={() => setSelectedIndustries([])}
                    >
                      Auswahl leeren
                    </CommandItem>
                    {industryOptions.map((i) => {
                      const checked = selectedIndustries.includes(i.value);
                      return (
                        <CommandItem
                          key={i.value}
                          value={i.value}
                          data-checked={checked || undefined}
                          onSelect={() =>
                            setSelectedIndustries((prev) => toggleValue(prev, i.value))
                          }
                        >
                          <CheckIcon
                            className={cn(
                              'size-3.5 shrink-0',
                              checked ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">{i.value}</span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {i.n}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            className={cn(
              'h-10 w-[220px] shrink-0 justify-between font-normal',
              selectedSearches.length > 0 && 'border-foreground/30',
            )}
            onClick={() => {
              setSearchDialogQ('');
              setSearchDialogTag('all');
              setSearchOpen(true);
            }}
          >
            <span className="truncate">
              {selectedSearches.length === 0
                ? `Suche${searches.length ? ` (${searches.length})` : ''}`
                : selectedSearches.length === 1
                  ? (searchOptions.find((s) => s.id === selectedSearches[0])?.query ?? '1 Suche')
                  : `${searchOptions.find((s) => s.id === selectedSearches[0])?.query ?? 'Suche'} +${selectedSearches.length - 1}`}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>

          <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
            <DialogContent className="flex h-[min(80vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
              <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
                <DialogTitle>Suchen auswählen</DialogTitle>
                <DialogDescription>
                  {selectedSearches.length === 0
                    ? `${searchOptions.length} Suchen verfügbar`
                    : `${selectedSearches.length} ausgewählt`}
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-1">
                <aside className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2">
                  <button
                    type="button"
                    onClick={() => setSearchDialogTag('all')}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors',
                      searchDialogTag === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span>Alle</span>
                    <span className="tabular-nums opacity-70">{searchOptions.length}</span>
                  </button>
                  {searchGroups.untagged.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearchDialogTag('none')}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors',
                        searchDialogTag === 'none'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span className="truncate">Ohne Tags</span>
                      <span className="tabular-nums opacity-70">
                        {searchGroups.untagged.length}
                      </span>
                    </button>
                  )}
                  {searchGroups.tagged.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSearchDialogTag(group.id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium transition-colors',
                        searchDialogTag === group.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <span className="min-w-0 truncate">{group.name}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {group.items.length}
                      </span>
                    </button>
                  ))}
                </aside>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="shrink-0 space-y-2 border-b p-2">
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchDialogQ}
                        onChange={(e) => setSearchDialogQ(e.target.value)}
                        placeholder="In Suchen filtern…"
                        className="h-9 pl-8"
                        autoFocus
                      />
                    </div>
                    {dialogSearchList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const ids = dialogSearchList.map((s) => s.id);
                          setSelectedSearches((prev) => {
                            if (allDialogVisibleSelected) {
                              const drop = new Set(ids);
                              return prev.filter((id) => !drop.has(id));
                            }
                            const next = new Set(prev);
                            for (const id of ids) next.add(id);
                            return [...next];
                          });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                      >
                        <Checkbox
                          checked={allDialogVisibleSelected}
                          className="pointer-events-none"
                          tabIndex={-1}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {allDialogVisibleSelected
                            ? `${dialogSelectAllLabel} abwählen`
                            : `${dialogSelectAllLabel} auswählen`}
                        </span>
                        <span className="shrink-0 tabular-nums opacity-70">
                          {dialogSearchList.length}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-1">
                    {dialogSearchList.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Keine Suche für diesen Filter.
                      </p>
                    ) : (
                      <ul className="flex flex-col">
                        {dialogSearchList.map((s) => {
                          const checked = selectedSearches.includes(s.id);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSearches((prev) => toggleValue(prev, s.id))
                                }
                                className={cn(
                                  'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/70',
                                  checked && 'bg-muted/50',
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  className="mt-0.5 pointer-events-none"
                                  tabIndex={-1}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {s.query}
                                  </span>
                                  {s.tags.length > 0 && searchDialogTag === 'all' && (
                                    <span className="mt-0.5 flex flex-wrap gap-1">
                                      {s.tags.map((t) => (
                                        <span
                                          key={t.id}
                                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                                        >
                                          {t.name}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {s.n}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="shrink-0 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={selectedSearches.length === 0}
                  onClick={() => setSelectedSearches([])}
                >
                  Auswahl leeren
                </Button>
                <Button type="button" onClick={() => setSearchOpen(false)}>
                  Fertig
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
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

        {hasFilter && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedCities.map((c) => (
              <button
                key={`city-${c}`}
                type="button"
                onClick={() => setSelectedCities((prev) => prev.filter((v) => v !== c))}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-[11px] font-medium hover:bg-muted/80"
              >
                {c}
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
            {selectedIndustries.map((i) => (
              <button
                key={`ind-${i}`}
                type="button"
                onClick={() => setSelectedIndustries((prev) => prev.filter((v) => v !== i))}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-[11px] font-medium hover:bg-muted/80"
              >
                {i}
                <span className="text-muted-foreground">×</span>
              </button>
            ))}
            {selectedSearches.map((id) => {
              const label = searchOptions.find((s) => s.id === id)?.query
                ?? searches.find((s) => s.id === id)?.query
                ?? id.slice(0, 8);
              return (
                <button
                  key={`search-${id}`}
                  type="button"
                  onClick={() => setSelectedSearches((prev) => prev.filter((v) => v !== id))}
                  className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-md bg-muted px-2 text-[11px] font-medium hover:bg-muted/80"
                >
                  <span className="truncate">{label}</span>
                  <span className="text-muted-foreground">×</span>
                </button>
              );
            })}
            {debounced && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setDebounced('');
                }}
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-[11px] font-medium hover:bg-muted/80"
              >
                Suche: {debounced}
                <span className="text-muted-foreground">×</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedCities([]);
                setSelectedIndustries([]);
                setSelectedSearches([]);
                setSearch('');
                setDebounced('');
              }}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Zurücksetzen
            </button>
            {meta && (
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                {meta.total} Treffer
              </span>
            )}
          </div>
        )}
      </div>

      {flash && (
        <p className="text-[12px] text-muted-foreground">{flash}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : visibleLeads.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          {scope === 'new'
            ? 'Keine neuen Leads für diesen Filter.'
            : 'Keine zugeordneten Leads für diesen Filter.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={toggleAllPage}
                  aria-label="Seite auswählen"
                />
              </TableHead>
              <TableHead className="font-mono text-[11px] tracking-wide">Firma</TableHead>
              <TableHead className="font-mono text-[11px] tracking-wide">Stadt</TableHead>
              <TableHead className="hidden font-mono text-[11px] tracking-wide md:table-cell">
                Branche
              </TableHead>
              <TableHead className="font-mono text-[11px] tracking-wide">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLeads.map((l) => (
              <TableRow
                key={l.id}
                data-state={selected.has(l.id) ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selected.has(l.id)}
                    onCheckedChange={() => toggleOne(l.id)}
                    aria-label={`${l.company_name} auswählen`}
                  />
                </TableCell>
                <TableCell>
                  <span className="font-medium">{l.company_name}</span>
                  {l.domain && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {l.domain}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{l.city || '—'}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {l.industry || '—'}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {STATUS_DE[l.status] ?? l.status}
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
  );
}
