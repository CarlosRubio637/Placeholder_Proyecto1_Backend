import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Notification, Prisma, SourceModule } from '@PrismaClient';

export interface InboxFilters {
  sourceModule?: SourceModule;
  /** true = solo No leídas. */
  unread?: boolean;
  /** Registros a saltar (paginación). */
  skip: number;
  take: number;
}

/**
 * Lectura y marcado de la bandeja (H31).
 *
 * Toda consulta lleva `userId`: un usuario nunca ve ni marca notificaciones de
 * otro. No crea notificaciones; eso solo lo hace NotificationRepository (H30).
 */
@Injectable()
export class NotificationInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Página de notificaciones del usuario, de la más reciente a la más antigua. */
  async findPage(
    userId: string,
    { sourceModule, unread, skip, take }: InboxFilters,
  ): Promise<{ items: Notification[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(sourceModule && { sourceModule }),
      ...(unread && { readAt: null }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        // `id` desempata las creadas en el mismo instante (un mismo envío),
        // para que la paginación no repita ni salte filas.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /**
   * Marca como leída una notificación del usuario. Solo escribe `readAt` si
   * todavía era nulo, así la fecha de la primera lectura no cambia.
   *
   * @returns `{ id, readAt }` o null si no existe o es de otro usuario.
   */
  async markRead(
    userId: string,
    id: string,
  ): Promise<{ id: string; readAt: Date | null } | null> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
  }

  /** Marca todas las No leídas del usuario. Devuelve cuántas cambió. */
  async markAllRead(userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
