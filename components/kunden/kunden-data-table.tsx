'use client';

import * as React from 'react';
import {
  IconChevronDown,
  IconCircleCheckFilled,
  IconLoader,
  IconMail,
  IconPhone,
  IconSearch,
} from '@tabler/icons-react';
import { Badge } from '@/components/demo/ui/badge';
import { Button } from '@/components/demo/ui/button';
import { Input } from '@/components/demo/ui/input';
import { Label } from '@/components/demo/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/demo/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/demo/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/demo/ui/tabs';
import type { KundenCompany } from '@/components/kunden/types';

type View = 'all' | 'with-contact' | 'with-email' | 'with-phone';

export function KundenDataTable({ companies }: { companies: KundenCompany[] }) {
  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState<View>('all');
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.city?.toLowerCase().includes(q) ?? false) ||
        c.contacts.some((ct) =>
          `${ct.first_name} ${ct.last_name} ${ct.email ?? ''} ${ct.phone ?? ''}`
            .toLowerCase()
            .includes(q),
        );

      if (!matchesSearch) return false;
      if (view === 'with-contact') return c.contacts.length > 0;
      if (view === 'with-email') return c.contacts.some((ct) => !!ct.email);
      if (view === 'with-phone') return c.contacts.some((ct) => !!ct.phone);
      return true;
    });
  }, [companies, search, view]);

  const counts = React.useMemo(
    () => ({
      all: companies.length,
      withContact: companies.filter((c) => c.contacts.length > 0).length,
      withEmail: companies.filter((c) => c.contacts.some((ct) => !!ct.email)).length,
      withPhone: companies.filter((c) => c.contacts.some((ct) => !!ct.phone)).length,
    }),
    [companies],
  );

  return (
    <Tabs
      value={view}
      onValueChange={(v) => setView(v as View)}
      className="flex w-full flex-col justify-start gap-6"
    >
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Label htmlFor="kunden-search" className="sr-only">
            Suchen
          </Label>
          <div className="relative w-full max-w-sm">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="kunden-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma oder Kontakt suchen…"
              className="h-8 pl-8"
            />
          </div>

          <Label htmlFor="kunden-view" className="sr-only">
            Ansicht
          </Label>
          <Select value={view} onValueChange={(v) => setView(v as View)}>
            <SelectTrigger
              className="flex w-fit @4xl/main:hidden"
              size="sm"
              id="kunden-view"
            >
              <SelectValue placeholder="Ansicht" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="with-contact">Mit Kontakt</SelectItem>
              <SelectItem value="with-email">Mit E-Mail</SelectItem>
              <SelectItem value="with-phone">Mit Telefon</SelectItem>
            </SelectContent>
          </Select>

          <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
            <TabsTrigger value="all">
              Alle <Badge variant="secondary">{counts.all}</Badge>
            </TabsTrigger>
            <TabsTrigger value="with-contact">
              Mit Kontakt <Badge variant="secondary">{counts.withContact}</Badge>
            </TabsTrigger>
            <TabsTrigger value="with-email">
              Mit E-Mail <Badge variant="secondary">{counts.withEmail}</Badge>
            </TabsTrigger>
            <TabsTrigger value="with-phone">
              Mit Telefon <Badge variant="secondary">{counts.withPhone}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      {(['all', 'with-contact', 'with-email', 'with-phone'] as View[]).map((tab) => (
        <TabsContent
          key={tab}
          value={tab}
          className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
        >
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Firma</TableHead>
                  <TableHead>Stadt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Kontakte</TableHead>
                  <TableHead>Primärkontakt</TableHead>
                  <TableHead className="w-28 text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Keine Firmen gefunden.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((company) => {
                    const open = !!expanded[company.id];
                    const primary = company.contacts[0];
                    const hasContact = company.contacts.length > 0;

                    return (
                      <React.Fragment key={company.id}>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              disabled={!hasContact}
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [company.id]: !prev[company.id],
                                }))
                              }
                              aria-label={open ? 'Zuklappen' : 'Aufklappen'}
                            >
                              <IconChevronDown
                                className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                              />
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{company.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {company.city || '—'}
                          </TableCell>
                          <TableCell>
                            {hasContact ? (
                              <Badge variant="outline" className="gap-1 px-1.5 text-muted-foreground">
                                <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
                                Bereit
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 px-1.5 text-muted-foreground">
                                <IconLoader />
                                Ohne Kontakt
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {company.contacts.length}
                          </TableCell>
                          <TableCell>
                            {primary ? (
                              <div className="min-w-0">
                                <div className="truncate font-medium">
                                  {primary.first_name} {primary.last_name}
                                </div>
                                {primary.email && (
                                  <div className="truncate text-xs text-muted-foreground">
                                    {primary.email}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              {primary?.phone && (
                                <Button variant="outline" size="icon" className="size-7" asChild>
                                  <a href={`tel:${primary.phone}`}>
                                    <IconPhone className="size-3.5" />
                                  </a>
                                </Button>
                              )}
                              {primary?.email && (
                                <Button size="icon" className="size-7" asChild>
                                  <a href={`mailto:${primary.email}`}>
                                    <IconMail className="size-3.5" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {open &&
                          company.contacts.map((ct) => (
                            <TableRow key={ct.id} className="bg-muted/20">
                              <TableCell />
                              <TableCell colSpan={2} className="pl-10 text-sm">
                                {ct.first_name} {ct.last_name}
                              </TableCell>
                              <TableCell colSpan={2} className="text-sm text-muted-foreground">
                                {ct.email || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {ct.phone || '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="inline-flex items-center justify-end gap-1">
                                  {ct.phone && (
                                    <Button variant="outline" size="icon" className="size-7" asChild>
                                      <a href={`tel:${ct.phone}`}>
                                        <IconPhone className="size-3.5" />
                                      </a>
                                    </Button>
                                  )}
                                  {ct.email && (
                                    <Button size="icon" className="size-7" asChild>
                                      <a href={`mailto:${ct.email}`}>
                                        <IconMail className="size-3.5" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
            <span>
              {filtered.length} von {companies.length} Firmen
            </span>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
