/**
 * Presentational in-memory notification store: the bell's unread count and the
 * notification panel's list. No storage, no `chrome` — the host pushes into it.
 *
 * // INTERFACE FOR INTEGRATION
 * type NotificationKind = "reminder" | "alert" | "approval" | "integration" | "error";
 * interface AppNotification { id: string; kind: NotificationKind; title: string;
 *   detail?: string; at: number; read: boolean }
 * type NotificationInput = Omit<AppNotification, "id" | "at" | "read">;
 * interface UseNotificationsResult { items: AppNotification[]; unread: number;
 *   push(n: NotificationInput): void; markRead(id: string): void;
 *   markAllRead(): void; clear(): void }
 * function useNotifications(): UseNotificationsResult;
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useRef, useState } from "react";

export type NotificationKind = "reminder" | "alert" | "approval" | "integration" | "error";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  at: number;
  read: boolean;
}

export type NotificationInput = Omit<AppNotification, "id" | "at" | "read">;

export interface UseNotificationsResult {
  items: AppNotification[];
  unread: number;
  push: (n: NotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

/** Bounded list: newest first, older entries drop off past the cap. */
export const MAX_NOTIFICATIONS = 50;

export function useNotifications(): UseNotificationsResult {
  const [items, setItems] = useState<AppNotification[]>([]);
  const seq = useRef(0);

  const push = useCallback((input: NotificationInput) => {
    seq.current += 1;
    const item: AppNotification = {
      ...input,
      id: `notif_${Date.now().toString(36)}_${seq.current}`,
      at: Date.now(),
      read: false,
    };
    setItems((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => (item.read ? item : { ...item, read: true })));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const unread = items.filter((item) => !item.read).length;

  return { items, unread, push, markRead, markAllRead, clear };
}
