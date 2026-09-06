import { latency, localDatabase } from '../data/database';
import { uid } from '../core/security';
import type { AppNotification, ID, NotificationType } from '../core/types';

/** Notification repository — extensible: any feature can push typed notifications. */
export const notificationRepository = {
  async list(userId: ID): Promise<AppNotification[]> {
    await latency(160);
    const db = await localDatabase.read();
    return db.notifications
      .filter((n) => n.userId === userId || n.userId === '*')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async unreadCount(userId: ID): Promise<number> {
    const db = await localDatabase.read();
    return db.notifications.filter(
      (n) => !n.read && (n.userId === userId || n.userId === '*'),
    ).length;
  },

  async markAllRead(userId: ID): Promise<void> {
    await latency(140);
    await localDatabase.mutate((db) => {
      for (const n of db.notifications) {
        if (n.userId === userId || n.userId === '*') n.read = true;
      }
    });
  },

  async markRead(id: ID): Promise<void> {
    await localDatabase.mutate((db) => {
      const n = db.notifications.find((x) => x.id === id);
      if (n) n.read = true;
    });
  },

  async push(input: {
    userId: ID | '*';
    title: string;
    body: string;
    type?: NotificationType;
    orderId?: string;
  }): Promise<AppNotification> {
    const notification: AppNotification = {
      id: uid(),
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type ?? 'system',
      orderId: input.orderId,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await localDatabase.mutate((db) => {
      db.notifications.unshift(notification);
    });
    return notification;
  },

  async remove(id: ID): Promise<void> {
    await localDatabase.mutate((db) => {
      db.notifications = db.notifications.filter((n) => n.id !== id);
    });
  },
};
