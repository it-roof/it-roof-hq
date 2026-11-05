import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mailboxFolder, mailboxMessage } from '@/lib/schema';
import { getMailboxCredentials, type MailboxCredentials } from '@/lib/mail/mailbox';
import { folderRole, withImap } from '@/lib/mail/imap';

export async function setMessageFlags(opts: {
  messageId: string;
  userId: string;
  seen?: boolean;
  flagged?: boolean;
}) {
  const msg = await loadOwnedMessage(opts.messageId, opts.userId);
  if (!msg) return null;
  const creds = await getMailboxCredentials(msg.mailboxId, opts.userId);
  if (!creds) return null;

  if (msg.uid != null) {
    try {
      await withImap(creds, async client => {
        const lock = await client.getMailboxLock(msg.imapPath);
        try {
          if (opts.seen === true) await client.messageFlagsAdd(msg.uid!, ['\\Seen'], { uid: true });
          if (opts.seen === false) await client.messageFlagsRemove(msg.uid!, ['\\Seen'], { uid: true });
          if (opts.flagged === true) await client.messageFlagsAdd(msg.uid!, ['\\Flagged'], { uid: true });
          if (opts.flagged === false) await client.messageFlagsRemove(msg.uid!, ['\\Flagged'], { uid: true });
        } finally {
          lock.release();
        }
      });
    } catch {
      // Flag in HQ trotzdem setzen, IMAP folgt beim nächsten Sync
    }
  }

  const patch: { seen?: boolean; flagged?: boolean; updatedAt: Date } = { updatedAt: new Date() };
  if (opts.seen != null) patch.seen = opts.seen;
  if (opts.flagged != null) patch.flagged = opts.flagged;
  await db.update(mailboxMessage).set(patch).where(eq(mailboxMessage.id, msg.id));
  return true;
}

/**
 * Löschen: in den Papierkorb verschieben (IMAP + lokal).
 * Erst aus dem Papierkorb = endgültig löschen.
 */
export async function deleteMessage(opts: { messageId: string; userId: string }) {
  const msg = await loadOwnedMessage(opts.messageId, opts.userId);
  if (!msg) return null;
  const creds = await getMailboxCredentials(msg.mailboxId, opts.userId);
  if (!creds) return null;

  let trash = await findTrashFolder(msg.mailboxId);
  const alreadyInTrash = Boolean(
    trash && (msg.folderId === trash.id || msg.imapPath === trash.imapPath),
  );

  // Endgültig nur aus dem Papierkorb
  if (trash && alreadyInTrash) {
    if (msg.uid != null) {
      try {
        await withImap(creds, async client => {
          const lock = await client.getMailboxLock(msg.imapPath);
          try {
            await client.messageDelete(msg.uid!, { uid: true });
          } finally {
            lock.release();
          }
        });
      } catch {
        // Auf dem Server ggf. schon weg — lokal trotzdem entfernen
      }
    }
    await db.delete(mailboxMessage).where(eq(mailboxMessage.id, msg.id));
    return { ok: true as const, permanent: true };
  }

  // Papierkorb ggf. live vom Server nachziehen (erster Sync unvollständig)
  if (!trash) {
    trash = await discoverTrashFolder(creds);
  }
  if (!trash) {
    throw new Error('Kein Papierkorb-Ordner gefunden — zuerst Sync ausführen');
  }

  // In Papierkorb verschieben
  let newUid: number | null = null;
  if (msg.uid != null) {
    try {
      await withImap(creds, async client => {
        const lock = await client.getMailboxLock(msg.imapPath);
        try {
          const moved = await client.messageMove(msg.uid!, trash!.imapPath, { uid: true });
          // imapflow liefert false bei Fehler, ohne zu werfen
          if (!moved) throw new Error('IMAP MOVE fehlgeschlagen');
          newUid = uidFromMap(moved.uidMap, msg.uid!);
        } finally {
          lock.release();
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verschieben fehlgeschlagen';
      throw new Error(`Papierkorb: ${message}`);
    }
  }

  // UID zuerst nullen (Unique auf folder+uid), dann in Trash legen
  await db
    .update(mailboxMessage)
    .set({ uid: null, updatedAt: new Date() })
    .where(eq(mailboxMessage.id, msg.id));

  try {
    await db
      .update(mailboxMessage)
      .set({
        folderId: trash.id,
        uid: newUid,
        updatedAt: new Date(),
      })
      .where(eq(mailboxMessage.id, msg.id));
  } catch {
    // UID-Kollision im Papierkorb — ohne UID belassen, Sync räumt auf
    await db
      .update(mailboxMessage)
      .set({
        folderId: trash.id,
        uid: null,
        updatedAt: new Date(),
      })
      .where(eq(mailboxMessage.id, msg.id));
  }

  return { ok: true as const, permanent: false };
}

/**
 * Nachricht in einen anderen Ordner desselben Postfachs verschieben (IMAP + lokal).
 */
export async function moveMessage(opts: {
  messageId: string;
  userId: string;
  targetFolderId: string;
}) {
  const msg = await loadOwnedMessage(opts.messageId, opts.userId);
  if (!msg) return null;

  const [target] = await db
    .select()
    .from(mailboxFolder)
    .where(eq(mailboxFolder.id, opts.targetFolderId))
    .limit(1);
  if (!target || target.mailboxId !== msg.mailboxId) {
    throw new Error('Zielordner ungültig oder anderes Postfach');
  }
  if (target.id === msg.folderId) {
    return { ok: true as const, folder_id: target.id, unchanged: true };
  }

  const creds = await getMailboxCredentials(msg.mailboxId, opts.userId);
  if (!creds) return null;

  let newUid: number | null = null;
  if (msg.uid != null) {
    await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(msg.imapPath);
      try {
        const moved = await client.messageMove(msg.uid!, target.imapPath, { uid: true });
        if (!moved) throw new Error('IMAP MOVE fehlgeschlagen');
        newUid = uidFromMap(moved.uidMap, msg.uid!);
      } finally {
        lock.release();
      }
    });
  }

  await db
    .update(mailboxMessage)
    .set({ uid: null, updatedAt: new Date() })
    .where(eq(mailboxMessage.id, msg.id));

  try {
    await db
      .update(mailboxMessage)
      .set({
        folderId: target.id,
        uid: newUid,
        updatedAt: new Date(),
      })
      .where(eq(mailboxMessage.id, msg.id));
  } catch {
    await db
      .update(mailboxMessage)
      .set({
        folderId: target.id,
        uid: null,
        updatedAt: new Date(),
      })
      .where(eq(mailboxMessage.id, msg.id));
  }

  return {
    ok: true as const,
    folder_id: target.id,
    folder_role: target.role,
    unchanged: false,
  };
}

/** Convenience: in Ordner mit Role archivieren (archive) oder Papierkorb. */
export async function moveMessageByRole(opts: {
  messageId: string;
  userId: string;
  role: 'archive' | 'trash' | 'inbox' | 'junk';
}) {
  const msg = await loadOwnedMessage(opts.messageId, opts.userId);
  if (!msg) return null;

  if (opts.role === 'trash') {
    return deleteMessage({ messageId: opts.messageId, userId: opts.userId });
  }

  const folders = await db
    .select()
    .from(mailboxFolder)
    .where(eq(mailboxFolder.mailboxId, msg.mailboxId));
  const target = folders.find((f) => f.role === opts.role);
  if (!target) {
    throw new Error(`Kein Ordner mit Rolle „${opts.role}“ gefunden — zuerst Sync`);
  }
  return moveMessage({
    messageId: opts.messageId,
    userId: opts.userId,
    targetFolderId: target.id,
  });
}

function uidFromMap(uidMap: Map<number, number> | undefined, sourceUid: number): number | null {
  if (!uidMap || uidMap.size === 0) return null;
  const direct = uidMap.get(sourceUid);
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  // Fallback: einzige Zuordnung
  if (uidMap.size === 1) {
    const only = uidMap.values().next().value;
    if (only != null && Number.isFinite(Number(only))) return Number(only);
  }
  return null;
}

function looksLikeTrash(imapPath: string, name: string) {
  const hay = `${imapPath} ${name}`.toLowerCase();
  return /papierkorb|trash|deleted items|gelöschte|deleted/.test(hay);
}

async function findTrashFolder(mailboxId: string) {
  const folders = await db
    .select()
    .from(mailboxFolder)
    .where(eq(mailboxFolder.mailboxId, mailboxId));

  const byRole = folders.find(f => f.role === 'trash');
  if (byRole) return byRole;

  const byName = folders.find(f => looksLikeTrash(f.imapPath, f.name));
  if (!byName) return null;

  // Rolle nachziehen, damit UI „Papierkorb“ die Mails findet
  if (byName.role !== 'trash') {
    await db.update(mailboxFolder).set({ role: 'trash' }).where(eq(mailboxFolder.id, byName.id));
    return { ...byName, role: 'trash' };
  }
  return byName;
}

async function discoverTrashFolder(creds: MailboxCredentials) {
  return withImap(creds, async client => {
    const listed = await client.list();
    for (const box of listed) {
      if (box.flags.has('\\Noselect') || box.flags.has('\\NonExistent')) continue;
      const path = box.path;
      const name = box.name || path.split(/[./]/).pop() || path;
      const role = folderRole(path, box.specialUse, name);
      if (role !== 'trash' && !looksLikeTrash(path, name)) continue;

      const [existing] = await db
        .select()
        .from(mailboxFolder)
        .where(and(eq(mailboxFolder.mailboxId, creds.id), eq(mailboxFolder.imapPath, path)))
        .limit(1);

      if (existing) {
        if (existing.role !== 'trash' || existing.name !== name) {
          await db
            .update(mailboxFolder)
            .set({ name, role: 'trash' })
            .where(eq(mailboxFolder.id, existing.id));
          return { ...existing, name, role: 'trash' };
        }
        return existing;
      }

      const [created] = await db
        .insert(mailboxFolder)
        .values({
          mailboxId: creds.id,
          imapPath: path,
          name,
          role: 'trash',
        })
        .returning();
      return created ?? null;
    }
    return null;
  });
}

async function loadOwnedMessage(messageId: string, userId: string) {
  const [row] = await db
    .select({
      id: mailboxMessage.id,
      uid: mailboxMessage.uid,
      mailboxId: mailboxMessage.mailboxId,
      folderId: mailboxMessage.folderId,
      imapPath: mailboxFolder.imapPath,
    })
    .from(mailboxMessage)
    .innerJoin(mailboxFolder, eq(mailboxFolder.id, mailboxMessage.folderId))
    .where(eq(mailboxMessage.id, messageId))
    .limit(1);
  if (!row) return null;
  const creds = await getMailboxCredentials(row.mailboxId, userId);
  if (!creds) return null;
  return row;
}
