import { DashboardShell } from '@/components/demo/dashboard-shell';
import { BotApiDocs } from '@/components/bot/bot-api-docs';

export default function BotApiDocsPage() {
  return (
    <DashboardShell title="Grokbot API">
      <BotApiDocs />
    </DashboardShell>
  );
}
