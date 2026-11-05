'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { ConfirmDelete } from '@/components/leads/confirm-delete';
import { ListPagination } from '@/components/leads/list-pagination';
import { SaveForm } from '@/components/save-form';
import { PAGE_SIZE, type PageSize } from '@/lib/leads/pagination';

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
};

const STATUS_DE: Record<string, string> = {
  complete: 'Vollständig',
  raw: 'Roh',
  error_incomplete: 'Unvollständig',
  error_no_domain: 'Ohne Domain',
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(PAGE_SIZE);
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page),
    });
    if (debounced) params.set('q', debounced);
    const r = await fetch(`/api/leads?${params}`);
    const data = await r.json();
    setLeads(data.leads ?? []);
    if (data.meta) {
      setPaging({
        page: data.meta.page ?? 1,
        pages: data.meta.pages ?? 1,
        total: data.meta.total ?? 0,
        limit: data.meta.limit ?? PAGE_SIZE,
      });
    }
    setLoading(false);
  }

  useEffect(() => { setPage(1); }, [debounced]);
  useEffect(() => { load(); }, [debounced, page, limit]);

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
    await load();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Firma, Stadt, Branche…"
          className="h-10 flex-1"
        />
        <Button size="icon" className="size-10 rounded-full" onClick={openCreate}>
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : leads.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Keine Leads.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {leads.map((l) => {
            const meta = [l.city, l.industry, l.domain].filter(Boolean).join(' · ');
            return (
              <div key={l.id} className="flex items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.company_name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {meta || STATUS_DE[l.status] || l.status}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(l)}>
                  <PencilIcon className="size-3.5" />
                </Button>
                <ConfirmDelete label={`„${l.company_name}" löschen?`} onConfirm={() => remove(l.id)} />
              </div>
            );
          })}
        </div>
      )}

      <ListPagination
        page={paging.page}
        pages={paging.pages}
        total={paging.total}
        limit={paging.limit}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />

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
                  <Select value={form.status} onValueChange={(v) => { if (v) setForm({ ...form, status: v }); }}>
                    <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_DE).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
