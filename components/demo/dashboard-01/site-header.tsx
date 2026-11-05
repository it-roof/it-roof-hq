"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { DemoThemeToggle } from "@/components/demo/demo-theme"
import { Separator } from "@/components/demo/ui/separator"
import { SidebarTrigger } from "@/components/demo/ui/sidebar"
import { getAreaForPath, OS_AREAS, type OsAreaId } from "@/lib/nav"
import { cn } from "@/lib/utils"

const HEADER_AREA_IDS: OsAreaId[] = [
  "workspace",
  "crm-bestand",
  "crm-akquise",
  "kanaele",
]

export function SiteHeader({ title = "Documents" }: { title?: string }) {
  const path = usePathname()
  const current = getAreaForPath(path)
  const areas = HEADER_AREA_IDS.map(
    (id) => OS_AREAS.find((a) => a.id === id)!,
  )

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-1 lg:gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <h1 className="truncate text-base font-medium">{title}</h1>
        </div>

        <nav
          aria-label="Bereiche"
          className="flex items-center gap-4 sm:gap-6"
        >
          {areas.map((a) => {
            const active = a.id === current.id
            return (
              <Link
                key={a.id}
                href={a.href}
                title={a.label}
                className={cn(
                  "text-sm transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {a.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <DemoThemeToggle />
        </div>
      </div>
    </header>
  )
}
