'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { ConfirmDelete } from '@/components/leads/confirm-delete';
import { ListPagination } from '@/components/leads/list-pagination';
import { SaveForm } from '@/components/save-form';
import { PAGE_SIZE, type PageSize } from '@/lib/leads/pagination';

type Contact = {
  id: string;
  leadId: string;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl?: string | null;
};

const EMPTY = {
  lead_id: '',
  salutation: '',
  first_name: '',
  last_name: '',
  position: '',
  email: '',
  phone: '',
};

export function ContactsTab() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageSize>(PAGE_SIZE);
  const [paging, setPaging] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
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
    const r = await fetch(`/api/lead-contacts?${params}`);
    const data = await r.json();
    setRows(data.contacts ?? []);
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
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: Contact) {
    setEditingId(c.id);
    setForm({
      lead_id: c.leadId,
      salutation: c.salutation ?? '',
      first_name: c.firstName ?? '',
      last_name: c.lastName ?? '',
      position: c.position ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
    });
    setOpen(true);
  }

  async function save() {
    if (!form.lead_id.trim()) return;
    setSaving(true);
    await fetch(editingId ? `/api/lead-contacts/${editingId}` : '/api/lead-contacts', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/lead-contacts/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, E-Mail, Position…" className="h-10 flex-1" />
        <Button size="icon" className="size-10 rounded-full" onClick={openCreate}><PlusIcon className="size-4" /></Button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Keine Kontakte.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {rows.map((c) => {
            const name = [c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ') || 'Kontakt';
            return (
              <div key={c.id} className="flex items-center gap-2 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-[11px] font-mono text-muted-foreground truncate">
                    {[c.position, c.email].filter(Boolean).join(' · ') || c.leadId.slice(0, 8)}
                    {c.linkedinUrl ? (
                      <>
                        {' · '}
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-info hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          LinkedIn
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(c)}>
                  <PencilIcon className="size-3.5" />
                </Button>
                <ConfirmDelete label={`„${name}" löschen?`} onConfirm={() => remove(c.id)} />
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
              <DrawerTitle>{editingId ? 'Kontakt bearbeiten' : 'Kontakt anlegen'}</DrawerTitle>
            </DrawerHeader>
            <SaveForm onSave={save} className="flex flex-col gap-4">
              <Field label="Lead-ID">
                <Input value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} className="h-10 font-mono text-xs" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Anrede">
                  <Input value={form.salutation} onChange={(e) => setForm({ ...form, salutation: e.target.value })} className="h-10" />
                </Field>
                <Field label="Vorname">
                  <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="h-10" />
                </Field>
                <Field label="Nachname">
                  <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="h-10" />
                </Field>
              </div>
              <Field label="Position">
                <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="h-10" />
              </Field>
              <Field label="E-Mail">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10" />
              </Field>
              <Field label="Telefon">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-10" />
              </Field>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => setOpen(false)}>Abbrechen</Button>
                <Button type="submit" variant="success-solid" className="flex-1 h-11" disabled={saving || !form.lead_id.trim()}>
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
