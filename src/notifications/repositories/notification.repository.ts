import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { NotificationValidationError } from '@Notifications/errors';
import {
  RecipientType,
  type NotificationRecipient,
} from '../notifications.types.js';
import { Role, type Prisma, type SourceModule } from '@PrismaClient';

/** Datos ya validados y normalizados por NotificationsService. */
export interface CreateNotificationsData {
  /** `ids` sin repetidos. */
  recipient: NotificationRecipient;
  title: string;
  message: string;
  sourceModule: SourceModule;
  referenceType: string | null;
  referenceId: string | null;
}

type Tx = Prisma.TransactionClient;

/** Solo residentes con la cuenta activa reciben avisos por unidad, torre o a todos. */
const ACTIVE_RESIDENT = {
  role: Role.RESIDENTE,
  isActive: true,
} satisfies Prisma.UserWhereInput;

/**
 * Único punto del sistema que escribe en la tabla `notifications` (H30).
 *
 * Todo ocurre en una transacción: comprobar que los ids existen, resolver los
 * destinatarios y crear las notificaciones. Si un id no existe se lanza
 * NotificationValidationError antes de crear nada.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Devuelve la cantidad de notificaciones creadas. */
  createForRecipient(data: CreateNotificationsData): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const userIds = await this.resolveUserIds(tx, data.recipient);
      if (userIds.length === 0) {
        return 0;
      }

      const { count } = await tx.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          title: data.title,
          message: data.message,
          sourceModule: data.sourceModule,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
        })),
      });
      return count;
    });
  }

  /** Ids de usuario destinatarios, sin repetidos. */
  private async resolveUserIds(
    tx: Tx,
    { type, ids }: NotificationRecipient,
  ): Promise<string[]> {
    switch (type) {
      case RecipientType.USUARIO: {
        const users = await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, isActive: true },
        });
        this.assertAllExist(ids, users, 'usuarios');
        // Se indicaron a mano: se respeta el rol, pero una cuenta desactivada
        // no recibe avisos (igual que en los demás tipos).
        return users.filter((u) => u.isActive).map((u) => u.id);
      }

      case RecipientType.UNIDAD: {
        const units = await tx.unit.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        this.assertAllExist(ids, units, 'unidades');
        return this.findResidentIds(tx, { unitId: { in: ids } });
      }

      case RecipientType.TORRES: {
        const towers = await tx.tower.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });
        this.assertAllExist(ids, towers, 'torres');
        return this.findResidentIds(tx, { unit: { towerId: { in: ids } } });
      }

      case RecipientType.TODOS:
        return this.findResidentIds(tx, {});
    }
  }

  private async findResidentIds(
    tx: Tx,
    where: Prisma.UserWhereInput,
  ): Promise<string[]> {
    const users = await tx.user.findMany({
      where: { ...where, ...ACTIVE_RESIDENT },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private assertAllExist(
    ids: string[],
    found: { id: string }[],
    label: string,
  ): void {
    const foundIds = new Set(found.map((f) => f.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotificationValidationError(
        'recipient.ids',
        `No existen ${label} con estos ids: ${missing.join(', ')}.`,
      );
    }
  }
}
