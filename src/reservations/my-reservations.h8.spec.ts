// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import type { Role, User } from '@PrismaClient';
import { ReservationsController } from './controllers/index.js';
import { RESERVATION_MESSAGES } from './dto/index.js';
import { ReservationRepository } from './repositories/index.js';
import { ReservationsService } from './services/index.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const AUTHOR = { id: 'user-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;
const NEIGHBOR = { id: 'user-2', role: 'RESIDENTE', unitId: 'unit-1' } as User;

/** Reserva de unit-1 hecha por user-1. Por defecto empieza el 24/11 a las 10:00 (46 h). */
const reservation = (overrides: object = {}) => ({
  id: 'res-1',
  code: 'RS-20261120-0001',
  areaId: 'area-1',
  unitId: 'unit-1',
  userId: 'user-1',
  date: new Date('2026-11-24T00:00:00Z'),
  startTime: '10:00',
  endTime: '11:00',
  attendees: 4,
  status: 'CONFIRMADA',
  slotKey: 'area-1|2026-11-24|10:00',
  cancelledAt: null,
  cancelledById: null,
  createdAt: NOW,
  area: { id: 'area-1', name: 'Piscina' },
  user: { email: 'autor@condominio.test', profile: { fullName: 'Ana Lopez' } },
  ...overrides,
});

/** Servicio con el repositorio real sobre un Prisma simulado. */
function setup(current: object | null = reservation()) {
  const prisma = {
    reservation: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve(
          reservation({
            status: 'CANCELADA',
            slotKey: null,
            cancelledAt: NOW,
            cancelledById: 'user-2',
          }),
        ),
      ),
      findMany: vi.fn().mockResolvedValue([reservation()]),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new ReservationsService(
    new ReservationRepository(prisma as unknown as PrismaService),
    notifications as unknown as NotificationsService,
  );
  return { prisma, notifications, service };
}

async function failure(promise: Promise<unknown>) {
  return promise.catch((e: unknown) => e);
}

function requestAs(
  role: Role,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ReservationsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H8. Mis reservas y cancelación', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC5: Mis reservas lista las de toda la unidad, no solo las del residente, con quién reservó', async () => {
    const { prisma, service } = setup();

    const page = await service.listMine(
      NEIGHBOR,
      { tab: 'proximas', page: 1, pageSize: 10 },
      NOW,
    );

    const [args] = prisma.reservation.findMany.mock.calls[0] as [
      { where: object },
    ];
    expect(args.where).toMatchObject({ unitId: 'unit-1' });
    expect(args.where).not.toHaveProperty('userId');
    expect(page.data[0]).toMatchObject({
      reservedBy: 'Ana Lopez',
      canCancel: true,
    });
  });

  it('AC5: otro residente de la misma unidad puede cancelar la reserva', async () => {
    const { prisma, service } = setup();

    const result = await service.cancelMine(NEIGHBOR, 'res-1', NOW);

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res-1', unitId: 'unit-1' } }),
    );
    expect(result.status).toBe('CANCELADA');
  });

  it('AC6: cancelar pasa la reserva a Cancelada, guarda fecha y autor y libera la franja', async () => {
    const { prisma, service } = setup();

    const result = await service.cancelMine(NEIGHBOR, 'res-1', NOW);

    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: 'CONFIRMADA' },
      data: {
        status: 'CANCELADA',
        slotKey: null,
        cancelledAt: NOW,
        cancelledById: 'user-2',
      },
    });
    expect(result).toEqual({
      id: 'res-1',
      status: 'CANCELADA',
      cancelledAt: NOW,
    });
  });

  it('AC7: 409 si faltan menos de 24 horas para el inicio', async () => {
    // Empieza el 23/11 a las 11:00: faltan 23 horas.
    const { prisma, service } = setup(
      reservation({
        date: new Date('2026-11-23T00:00:00Z'),
        startTime: '11:00',
      }),
    );

    const error = await failure(service.cancelMine(AUTHOR, 'res-1', NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Solo puedes cancelar con al menos 24 horas de anticipación.',
    );
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('AC7: con 24 horas exactas sí puede cancelar', async () => {
    const { service } = setup(
      reservation({
        date: new Date('2026-11-23T00:00:00Z'),
        startTime: '12:00',
      }),
    );

    await expect(
      service.cancelMine(AUTHOR, 'res-1', NOW),
    ).resolves.toMatchObject({
      status: 'CANCELADA',
    });
  });

  it.each(['CANCELADA', 'CANCELADA_ADMIN'])(
    'AC7: 409 si la reserva ya está %s',
    async (status) => {
      const { service } = setup(reservation({ status }));

      const error = await failure(service.cancelMine(AUTHOR, 'res-1', NOW));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(RESERVATION_MESSAGES.notActive);
    },
  );

  it('AC7: si dos residentes cancelan a la vez, la segunda recibe 409', async () => {
    const { prisma, service } = setup();
    prisma.reservation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [first, second] = await Promise.allSettled([
      service.cancelMine(AUTHOR, 'res-1', NOW),
      service.cancelMine(NEIGHBOR, 'res-1', NOW),
    ]);

    expect(first.status).toBe('fulfilled');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
  });

  it('AC8: 404 al cancelar una reserva de otra unidad', async () => {
    const { prisma, service } = setup(null);
    const outsider = {
      id: 'user-9',
      role: 'RESIDENTE',
      unitId: 'unit-9',
    } as User;

    const error = await failure(service.cancelMine(outsider, 'res-1', NOW));

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res-1', unitId: 'unit-9' } }),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(RESERVATION_MESSAGES.notFound);
  });

  describe('AC8: permisos de Mis reservas', () => {
    const guard = new RolesGuard(new Reflector());
    const handlers = [
      ReservationsController.prototype.listMine,
      ReservationsController.prototype.cancelMine,
    ];

    it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
      'AC8: %s recibe 403 al ver o cancelar',
      (role) => {
        for (const handler of handlers) {
          expect(() => guard.canActivate(requestAs(role, handler))).toThrow(
            ForbiddenException,
          );
        }
      },
    );

    it('AC8: el Residente sí usa los endpoints', () => {
      for (const handler of handlers) {
        expect(guard.canActivate(requestAs('RESIDENTE', handler))).toBe(true);
      }
    });
  });

  it('AC9: al cancelar avisa al residente que hizo la reserva, aunque cancele otro de la unidad', async () => {
    const { notifications, service } = setup();

    await service.cancelMine(NEIGHBOR, 'res-1', NOW);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['user-1'] },
      title: 'Reserva cancelada',
      message:
        'Tu reserva RS-20261120-0001 de Piscina el 24/11/2026 fue cancelada.',
      sourceModule: 'RESERVAS',
      reference: { type: 'reservation', id: 'res-1' },
    });
  });

  it('AC9: si el aviso falla, la reserva queda cancelada igual', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { notifications, service } = setup();
    notifications.send.mockRejectedValue(new Error('sin conexión'));

    await expect(
      service.cancelMine(AUTHOR, 'res-1', NOW),
    ).resolves.toMatchObject({
      status: 'CANCELADA',
    });
  });
});
