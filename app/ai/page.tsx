'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AiProviderSheet, type AiProvider } from '@/components/ai-provider-sheet';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { PlugIcon, PlusIcon, SparklesIcon } from 'lucide-react';

type Conversation = {
  id: string;
  title: string;
  providerName: string | null;
  updatedAt: string | null;
  preview: string | null;
};

export default function AiPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const [cRes, pRes] = await Promise.all([
      fetch('/api/ai/conversations'),
      fetch('/api/ai/providers'),
    ]);
    setConversations(await cRes.json());
    setProviders(await pRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function newChat() {
    const enabled = providers.filter((p) => p.enabled);
    const r = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: enabled[0]?.id ?? null }),
    });
    const { id } = await r.json();
    router.push(`/ai/${id}`);
  }

  const enabledCount = providers.filter((p) => p.enabled).length;

  return (
    <DashboardShell title="AI">
      <div className="px-4 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {enabledCount === 0
              ? 'Keine API angedockt'
              : `${enabledCount} API${enabledCount === 1 ? '' : 's'} · ${conversations.length} Chats`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground hover:text-foreground"
              onClick={() => setSheetOpen(true)}
              aria-label="APIs verwalten"
            >
              <PlugIcon className="size-4" />
            </Button>
            <Button
              size="icon"
              onClick={newChat}
              className="size-10 rounded-full"
              aria-label="Neuer Chat"
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-5" />
            </div>
            <p className="max-w-[260px] text-sm text-muted-foreground">
              {enabledCount === 0
                ? 'Dock zuerst eine AI-API an — danach kannst du hier chatten.'
                : 'Noch keine Chats. Starte ein Fenster und frag los.'}
            </p>
            {enabledCount === 0 ? (
              <Button className="mt-2 h-10" onClick={() => setSheetOpen(true)}>
                API andocken
              </Button>
            ) : (
              <Button className="mt-2 h-10" onClick={newChat}>
                Neuer Chat
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(`/ai/${c.id}`)}
                className="flex w-full flex-col gap-0.5 py-4 text-left transition-opacity hover:opacity-80"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold tracking-tight">{c.title}</p>
                  <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatWhen(c.updatedAt)}
                  </span>
                </div>
                <p className="truncate font-mono text-[11px] tracking-wide text-muted-foreground">
                  {c.providerName ? `${c.providerName} · ` : ''}
                  {c.preview?.replace(/\s+/g, ' ') || 'Leerer Chat'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <AiProviderSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChanged={load}
      />
    </DashboardShell>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
