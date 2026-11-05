'use client';

import { IconBuilding, IconMail, IconMapPin, IconUsers } from '@tabler/icons-react';
import { Badge } from '@/components/demo/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/demo/ui/card';
import type { KundenCompany } from '@/components/kunden/types';

export function KundenSectionCards({ companies }: { companies: KundenCompany[] }) {
  const firmCount = companies.length;
  const contactCount = companies.reduce((n, c) => n + c.contacts.length, 0);
  const withEmail = companies.reduce(
    (n, c) => n + c.contacts.filter((ct) => !!ct.email).length,
    0,
  );
  const cities = new Set(
    companies.map((c) => c.city?.trim()).filter((c): c is string => !!c),
  ).size;

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Firmen</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {firmCount.toLocaleString('de-DE')}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconBuilding />
              Bestand
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aktive Kunden im CRM <IconBuilding className="size-4" />
          </div>
          <div className="text-muted-foreground">Firmenstammdaten Bestand</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Kontakte</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {contactCount.toLocaleString('de-DE')}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUsers />
              Personen
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Ansprechpartner gesamt <IconUsers className="size-4" />
          </div>
          <div className="text-muted-foreground">Über alle Bestandskunden</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Mit E-Mail</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {withEmail.toLocaleString('de-DE')}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMail />
              Erreichbar
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Kontakte mit Mailadresse <IconMail className="size-4" />
          </div>
          <div className="text-muted-foreground">Für schnelle Erreichbarkeit</div>
        </CardFooter>
      </Card>

      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Standorte</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {cities.toLocaleString('de-DE')}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMapPin />
              Städte
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Unterschiedliche Städte <IconMapPin className="size-4" />
          </div>
          <div className="text-muted-foreground">Geografische Verteilung</div>
        </CardFooter>
      </Card>
    </div>
  );
}
