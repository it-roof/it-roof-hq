"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  IconArchive,
  IconBook,
  IconChevronRight,
  IconFileText,
  IconInbox,
  IconMail,
  IconSend,
  IconSettings,
  IconShieldLock,
  IconTrash,
  type Icon,
} from "@tabler/icons-react"

import { useMailNav } from "@/components/mail/mail-nav-context"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/demo/ui/sidebar"
import { cn } from "@/lib/utils"

const ROLE_ICON: Record<string, Icon> = {
  inbox: IconInbox,
  drafts: IconFileText,
  sent: IconSend,
  archive: IconArchive,
  junk: IconMail,
  trash: IconTrash,
}

const OPEN_KEY = "it-roof-mail-nav-open"

function readOpenMap(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(OPEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function NavMail() {
  const mailNav = useMailNav()
  const mailboxes = mailNav?.mailboxes ?? []
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpenMap(readOpenMap())
  }, [])

  useEffect(() => {
    if (mailboxes.length === 0) return
    setOpenMap((prev) => {
      let changed = false
      const next = { ...prev }
      for (const box of mailboxes) {
        if (next[box.id] === undefined) {
          next[box.id] = true
          changed = true
        }
      }
      if (changed) {
        try {
          window.localStorage.setItem(OPEN_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
      }
      return changed ? next : prev
    })
  }, [mailboxes])

  function toggleOpen(id: string) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>E-Mails</SidebarGroupLabel>
        <SidebarMenu>
          {mailboxes.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton disabled className="text-muted-foreground">
                <IconMail />
                <span>Kein Konto</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            mailboxes.map((box) => {
              const mailboxActive = mailNav?.activeMailboxId === box.id
              const open = openMap[box.id] ?? true
              return (
                <SidebarMenuItem key={box.id}>
                  <div className="flex w-full items-center gap-0.5">
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={open ? "Zuklappen" : "Aufklappen"}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => toggleOpen(box.id)}
                    >
                      <IconChevronRight
                        className={cn(
                          "size-4 transition-transform duration-100",
                          open && "rotate-90",
                        )}
                      />
                    </button>
                    <SidebarMenuButton
                      tooltip={box.email}
                      isActive={mailboxActive && !mailNav?.activeFolderId}
                      className="flex-1"
                      onClick={() => mailNav?.onSelectMailbox(box.id)}
                    >
                      <IconMail />
                      <span>{box.label}</span>
                    </SidebarMenuButton>
                  </div>
                  {box.unread > 0 ? (
                    <SidebarMenuBadge>{box.unread}</SidebarMenuBadge>
                  ) : null}
                  {open && box.folders.length > 0 ? (
                    <SidebarMenuSub>
                      {box.folders.map((folder) => {
                        const Icon = ROLE_ICON[folder.role] ?? IconMail
                        const active =
                          mailNav?.activeMailboxId === box.id &&
                          mailNav?.activeFolderId === folder.id
                        return (
                          <SidebarMenuSubItem key={folder.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={active}
                              size="sm"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  mailNav?.onSelectFolder(box.id, folder)
                                }
                              >
                                <Icon />
                                <span>{folder.name}</span>
                                {folder.unread > 0 ? (
                                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                                    {folder.unread}
                                  </span>
                                ) : null}
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              )
            })
          )}
        </SidebarMenu>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarGroupLabel>Einstellungen</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Konten">
              <Link href="/mail/konten">
                <IconSettings />
                <span>Konten</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Grokbot API">
              <Link href="/einstellungen/bot-api">
                <IconBook />
                <span>Grokbot API</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Sicherheit">
              <Link href="/einstellungen/sicherheit">
                <IconShieldLock />
                <span>Sicherheit</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}
