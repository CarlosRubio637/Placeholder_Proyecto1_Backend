import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationInboxRepository } from '@Notifications/repositories';
import {
  NotificationDto,
  type ListNotificationsQueryDto,
  type MarkAllReadDto,
  type NotificationPageDto,
  type NotificationReadDto,
  type UnreadCountDto,
} from '../dto/index.js';

export const NOTIFICATION_NOT_FOUND = 'La notificación no existe.';

/**
 * Bandeja centralizada de notificaciones (H31).
 *
 * Disponible para los tres roles. Cada método recibe el id del usuario del
 * token y solo trabaja con sus notificaciones.
 */
@Injectable()
export class NotificationInboxService {
  constructor(private readonly repository: NotificationInboxRepository) {}

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    const { page, pageSize } = query;
    const { items, total } = await this.repository.findPage(userId, {
      sourceModule: query.sourceModule,
      unread: query.unread,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      data: items.map((item) => NotificationDto.fromEntity(item)),
      total,
      page,
      pageSize,
    };
  }

  async countUnread(userId: string): Promise<UnreadCountDto> {
    return { count: await this.repository.countUnread(userId) };
  }

  /**
   * Marca una notificación como leída. Si ya lo estaba, devuelve la fecha
   * original. 404 si no existe o es de otro usuario (no se revela cuál).
   */
  async markRead(userId: string, id: string): Promise<NotificationReadDto> {
    const notification = await this.repository.markRead(userId, id);
    if (!notification?.readAt) {
      throw new NotFoundException(NOTIFICATION_NOT_FOUND);
    }
    return { id: notification.id, readAt: notification.readAt };
  }

  async markAllRead(userId: string): Promise<MarkAllReadDto> {
    return { updated: await this.repository.markAllRead(userId) };
  }
}
