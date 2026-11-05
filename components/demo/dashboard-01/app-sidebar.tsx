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
  IconCpu,
  IconLayoutDashboard,
  IconBook,
  IconMail,
  IconSpeakerphone,
  IconReport,
  IconSettings,
  IconShieldLock,
  IconSparkles,
  IconUsers,
} from "@tabler/icons-react"

import { NavDocuments } from "@/components/demo/dashboard-01/nav-documents"
import { NavMail } from "@/components/demo/dashboard-01/nav-mail"
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
    {
      name: "Grokbot API",
      url: "/einstellungen/bot-api",
      icon: IconBook,
    },
    {
      name: "Sicherheit",
      url: "/einstellungen/sicherheit",
      icon: IconShieldLock,
    },
  ],
  navSecondary: [
    {
      title: "E-Mail",
      url: "/mail",
      icon: IconMail,
    },
    {
      title: "Grokbot API",
      url: "/einstellungen/bot-api",
      icon: IconBook,
    },
    {
      title: "Demo",
      url: "/demo",
      icon: IconLayoutDashboard,
    },
    {
      title: "Sicherheit",
      url: "/einstellungen/sicherheit",
      icon: IconShieldLock,
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
                <IconCpu className="size-5!" />
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
        {area.id === "kanaele" &&
          (pathname === "/mail" || pathname.startsWith("/mail/") ? (
            pathname.startsWith("/mail/konten") ? (
              <NavDocuments label="Inbox" items={data.kanaele} />
            ) : (
              <NavMail />
            )
          ) : (
            <NavDocuments label="Inbox" items={data.kanaele} />
          ))}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
