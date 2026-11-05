import { ChartAreaInteractive } from "@/components/demo/dashboard-01/chart-area-interactive"
import { DataTable } from "@/components/demo/dashboard-01/data-table"
import { SectionCards } from "@/components/demo/dashboard-01/section-cards"
import { DashboardShell } from "@/components/demo/dashboard-shell"

import data from "./data.json"

export default function Page() {
  return (
    <DashboardShell title="Documents">
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
      <DataTable data={data} />
    </DashboardShell>
  )
}
