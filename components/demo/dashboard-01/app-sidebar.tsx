"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconCalendar,
  IconChecklist,
  IconMovie,
  IconCrosshair,
  IconFolder,
  IconInnerShadowTop,
  IconLayoutDashboard,
  IconMail,
  IconSpeakerphone,
  IconReport,
  IconSettings,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"

import { NavDocuments } from "@/components/demo/dashboard-01/nav-documents"
import { NavMain } from "@/components/demo/dashboard-01/nav-main"
import { NavSecondary } from "@/components/demo/dashboard-01/nav-secondary"
import { NavUser } from "@/components/demo/dashboard-01/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/demo/ui/sidebar"
import { getAreaForPath } from "@/lib/nav"

const data = {
  user: {
    name: "IT ROOF",
    email: "team@it-roof.de",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Heute",
      url: "/",
      icon: IconCalendar,
    },
    {
      title: "Aufgaben",
      url: "/aufgaben",
      icon: IconChecklist,
    },
    {
      title: "Studio",
      url: "/studio",
      icon: IconMovie,
    },
    {
      title: "AI",
      url: "/ai",
      icon: IconSparkles,
    },
  ],
  bestand: [
    {
      name: "Kunden",
      url: "/kunden",
      icon: IconUsers,
    },
    {
      name: "Projekte",
      url: "/projekte",
      icon: IconFolder,
    },
    {
      name: "Monatsberichte",
      url: "/monatsberichte",
      icon: IconReport,
    },
  ],
  akquise: [
    {
      name: "Dashboard",
      url: "/leads/dashboard",
      icon: IconLayoutDashboard,
    },
    {
      name: "Leads",
      url: "/leads",
      icon: IconCrosshair,
    },
    {
      name: "Kampagnen",
      url: "/leads/kampagnen",
      icon: IconSpeakerphone,
    },
  ],
  kanaele: [
    {
      name: "E-Mail",
      url: "/mail",
      icon: IconMail,
    },
    {
      name: "Konten",
      url: "/mail/konten",
      icon: IconSettings,
    },
  ],
  navSecondary: [
    {
      title: "E-Mail",
      url: "/mail",
      icon: IconMail,
    },
    {
      title: "Demo",
      url: "/demo",
      icon: IconLayoutDashboard,
    },
    {
      title: "Sicherheit",
      url: "/einstellungen/sicherheit",
      icon: IconSettings,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const area = getAreaForPath(pathname)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">IT ROOF</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {area.id === "workspace" && <NavMain items={data.navMain} />}
        {area.id === "crm-bestand" && (
          <NavDocuments label="CRM" items={data.bestand} />
        )}
        {area.id === "crm-akquise" && (
          <NavDocuments label="CRM Leads" items={data.akquise} />
        )}
        {area.id === "kanaele" && (
          <NavDocuments label="Inbox" items={data.kanaele} />
        )}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
