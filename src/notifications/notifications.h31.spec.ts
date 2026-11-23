// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles.
/* oxlint-disable typescript/unbound-method */
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { PrismaService } from '@Prisma/services';
import type { Notification, Role, User } from '@PrismaClient';
import { NotificationsController } from './controllers/index.js';
import { NotificationInboxRepository } from './repositories/index.js';
import {
  NOTIFICATION_NOT_FOUND,
  NotificationInboxService,
} from './services/index.js';

const FIRST_READ = new Date('2026-11-20T15:00:00Z');
const USER = { id: 'user-1', role: 'RESIDENTE' } as User;

const notification = (id: string, readAt: Date | null = null) =>
  ({
    id,
    userId: 'user-1',
    title: 'Tienes un paquete en portería',
    message: 'Llegó un paquete.',
    sourceModule: 'PAQUETERIA',
    referenceType: 'package',
    referenceId: 'package-1',
    readAt,
    createdAt: new Date('2026-11-21T15:00:00Z'),
  }) as Notification;

/** Servicio y repositorio reales sobre un Prisma simulado. */
function setup() {
  const prisma = {
    notification: {
      findMany: vi.fn().mockResolvedValue([notification('n-1')]),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      findFirst: vi.fn().mockResolvedValue({ id: 'n-1', readAt: FIRST_READ }),
    },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const service = new NotificationInboxService(
    new NotificationInboxRepository(prisma as unknown as PrismaService),
  );
  return { prisma, service };
}

type Handler = keyof NotificationsController;

function requestAs(role: Role, handler: Handler): ExecutionContext {
  return {
    getHandler: () => NotificationsController.prototype[handler],
    getClass: () => NotificationsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H31. Bandeja centralizada de notificaciones', () => {
  it('AC5: la bandeja filtra siempre por el usuario del token', async () => {
    const { prisma, service } = setup();

    await service.list('user-1', {
      page: 2,
      pageSize: 20,
      sourceModule: 'PAQUETERIA',
      unread: true,
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', sourceModule: 'PAQUETERIA', readAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', sourceModule: 'PAQUETERIA', readAt: null },
    });
  });

  it('AC5: marcar una notificación de otro usuario responde 404 sin revelar que existe', async () => {
    const { prisma, service } = setup();
    prisma.notification.findFirst.mockResolvedValue(null);

    const error = await service
      .markRead('user-1', 'n-ajena')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(NOTIFICATION_NOT_FOUND);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-ajena', userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('AC6: marcar como leída solo escribe readAt si era nulo y devuelve la primera lectura', async () => {
    const { prisma, service } = setup();

    const result = await service.markRead('user-1', 'n-1');

    const [{ where }] = prisma.notification.updateMany.mock.calls[0] as [
      { where: object },
    ];
    expect(where).toEqual({ id: 'n-1', userId: 'user-1', readAt: null });
    expect(result).toEqual({ id: 'n-1', readAt: FIRST_READ });
  });

  it('AC6: "Marcar todas" solo cambia las No leídas del usuario y devuelve cuántas', async () => {
    const { prisma, service } = setup();

    expect(await service.markAllRead('user-1')).toEqual({ updated: 3 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('AC7: el contador cuenta las notificaciones del usuario con readAt nulo', async () => {
    const { prisma, service } = setup();
    prisma.notification.count.mockResolvedValue(7);

    expect(await service.countUnread('user-1')).toEqual({ count: 7 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
  });

  it.each(['RESIDENTE', 'ADMINISTRADOR', 'SEGURIDAD'] as const)(
    'AC8: %s usa la bandeja, el contador y el marcado',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      for (const handler of [
        'list',
        'countUnread',
        'markRead',
        'markAllRead',
      ] as const) {
        expect(guard.canActivate(requestAs(role, handler))).toBe(true);
      }
    },
  );

  it('AC8: el controlador pasa el id del usuario del token, nunca uno del cliente', async () => {
    const inbox = {
      list: vi.fn().mockResolvedValue({ data: [] }),
      countUnread: vi.fn().mockResolvedValue({ count: 0 }),
      markRead: vi.fn().mockResolvedValue({}),
      markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
    };
    const controller = new NotificationsController(
      inbox as unknown as NotificationInboxService,
    );
    const query = { page: 1, pageSize: 20 };

    await controller.list(USER, query);
    await controller.countUnread(USER);
    await controller.markRead(USER, 'n-1');
    await controller.markAllRead(USER);

    expect(inbox.list).toHaveBeenCalledWith('user-1', query);
    expect(inbox.countUnread).toHaveBeenCalledWith('user-1');
    expect(inbox.markRead).toHaveBeenCalledWith('user-1', 'n-1');
    expect(inbox.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
