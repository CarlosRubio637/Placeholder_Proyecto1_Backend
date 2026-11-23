// Los handlers del controlador se pasan sin llamarlos: RolesGuard lee su
// metadata @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method, typescript/no-misused-spread */
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { validationExceptionFactory } from '@Common/validation';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Prisma, type CommonArea, type Role, type User } from '@PrismaClient';
import { AdminAreasController } from './controllers/index.js';
import {
  AREA_MESSAGES,
  CreateAreaDto,
  type CreateBlockDto,
} from './dto/index.js';
import { AreaRepository } from './repositories/index.js';
import { AreasService } from './services/index.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const ADMIN = { id: 'admin-1', role: 'ADMINISTRADOR', unitId: null } as User;

const AREA = {
  id: 'area-1',
  name: 'Piscina',
  nameKey: 'piscina',
  capacity: 10,
  rules: null,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
  isActive: true,
} as CommonArea;

/** Reservas Confirmada futuras del área: una a las 08:00 y otra a las 09:00. */
const FUTURE = [
  { id: 'res-8', startTime: '08:00', endTime: '09:00' },
  { id: 'res-9', startTime: '09:00', endTime: '10:00' },
];
const DETAILS: Record<string, object> = {
  'res-8': {
    id: 'res-8',
    code: 'RS-20261120-0001',
    userId: 'user-1',
    date: new Date('2026-11-25T00:00:00Z'),
  },
  'res-9': {
    id: 'res-9',
    code: 'RS-20261120-0002',
    userId: 'user-2',
    date: new Date('2026-11-25T00:00:00Z'),
  },
};

const validArea = {
  name: 'Sala de juegos',
  capacity: 20,
  openTime: '09:00',
  closeTime: '19:00',
  slotMinutes: 120,
};

// El mismo ValidationPipe global de app.setup.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});
const parseArea = (body: object) =>
  pipe.transform(body, { type: 'body', metatype: CreateAreaDto });

/** Servicio con el repositorio real; la transacción usa un cliente simulado. */
function setup(
  future: { id: string; startTime: string; endTime: string }[] = FUTURE,
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    commonArea: {
      findUnique: vi.fn().mockResolvedValue(AREA),
      update: vi.fn(({ data }) => Promise.resolve({ ...AREA, ...data })),
    },
    areaBlock: {
      create: vi.fn(({ data }) => Promise.resolve({ id: 'block-1', ...data })),
    },
    reservation: {
      findMany: vi.fn(({ where }: { where: { id?: { in: string[] } } }) =>
        Promise.resolve(
          where.id ? where.id.in.map((id) => DETAILS[id]) : future,
        ),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: future.length }),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    commonArea: {
      create: vi.fn(({ data }) => Promise.resolve({ id: 'area-2', ...data })),
    },
    areaBlock: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    reservation: { updateMany: vi.fn() },
  };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new AreasService(
    new AreaRepository(prisma as unknown as PrismaService),
    notifications as unknown as NotificationsService,
  );
  return { tx, prisma, notifications, service };
}

async function failure(promise: Promise<unknown>) {
  return promise.catch((e: unknown) => e);
}

const block = (overrides: Partial<CreateBlockDto> = {}): CreateBlockDto => ({
  startDate: '2026-11-25',
  endDate: '2026-11-25',
  reason: 'Mantenimiento de la bomba',
  ...overrides,
});

function requestAs(
  role: Role,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => AdminAreasController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H9. Administración de áreas comunes, horarios y bloqueos', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([0, 501, 2.5])(
    'AC6: rechaza un aforo de %s con 400 en capacity',
    async (capacity) => {
      const error = await failure(parseArea({ ...validArea, capacity }));

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field: 'capacity',
        message: [AREA_MESSAGES.capacity],
      });
    },
  );

  it('AC6: acepta los aforos límite 1 y 500', async () => {
    await expect(
      parseArea({ ...validArea, capacity: 1 }),
    ).resolves.toBeDefined();
    await expect(
      parseArea({ ...validArea, capacity: 500 }),
    ).resolves.toBeDefined();
  });

  it.each([
    [
      'un cierre igual a la apertura',
      { openTime: '09:00', closeTime: '09:00' },
      'La hora de cierre debe ser posterior a la de apertura.',
    ],
    [
      'un cierre anterior a la apertura',
      { openTime: '20:00', closeTime: '08:00' },
      'La hora de cierre debe ser posterior a la de apertura.',
    ],
    [
      'un horario que no es múltiplo de la franja',
      { openTime: '08:00', closeTime: '09:30', slotMinutes: 60 },
      'El horario debe dividirse en franjas completas de 60 minutos.',
    ],
  ])('AC6: rechaza %s con 400 en closeTime', async (_, schedule, message) => {
    const { prisma, service } = setup();

    const error = await failure(
      service.create(ADMIN, { ...validArea, ...schedule }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'closeTime',
      message: [message],
    });
    expect(prisma.commonArea.create).not.toHaveBeenCalled();
  });

  it('AC6: crea un área válida, habilitada por defecto', async () => {
    const { prisma, service } = setup();

    await service.create(ADMIN, validArea);

    expect(prisma.commonArea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Sala de juegos',
        nameKey: 'sala de juegos',
        isActive: true,
        updatedById: 'admin-1',
      }),
    });
  });

  it('AC7: el nombre se compara sin mayúsculas ni tildes', async () => {
    const { prisma, service } = setup();

    await service.create(ADMIN, { ...validArea, name: 'PÍSCINA' });

    expect(prisma.commonArea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ nameKey: 'piscina' }),
    });
  });

  it('AC7: 409 "Ya existe un área con ese nombre." si el nombre se repite', async () => {
    const { prisma, service } = setup();
    prisma.commonArea.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('nameKey duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const error = await failure(
      service.create(ADMIN, { ...validArea, name: 'Piscina' }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe('Ya existe un área con ese nombre.');
  });

  it.each([
    [
      'con inicio pasado',
      block({ startDate: '2026-11-21', endDate: '2026-11-25' }),
      'startDate',
    ],
    [
      'con fin anterior al inicio',
      block({ startDate: '2026-11-25', endDate: '2026-11-24' }),
      'endDate',
    ],
    [
      'de 91 días',
      block({ startDate: '2026-11-23', endDate: '2027-02-21' }),
      'endDate',
    ],
  ])('AC7: rechaza un bloqueo %s con 400', async (_, dto, field) => {
    const { tx, service } = setup();

    const error = await failure(service.createBlock(ADMIN, 'area-1', dto, NOW));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field,
    });
    expect(tx.areaBlock.create).not.toHaveBeenCalled();
  });

  it('AC7: acepta un bloqueo de 90 días que empieza hoy', async () => {
    const { service } = setup([]);

    await expect(
      service.createBlock(
        ADMIN,
        'area-1',
        block({ startDate: '2026-11-22', endDate: '2027-02-19' }),
        NOW,
      ),
    ).resolves.toMatchObject({ cancelledReservations: 0 });
  });

  it('AC8: sin confirmación, un cambio que afecta reservas responde 409 RESERVAS_AFECTADAS con la cantidad', async () => {
    const { tx, service } = setup();

    const error = await failure(
      service.update(
        ADMIN,
        'area-1',
        { openTime: '09:00', closeTime: '19:00' },
        NOW,
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'RESERVAS_AFECTADAS',
      affectedCount: 1,
    });
    expect(tx.commonArea.update).not.toHaveBeenCalled();
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('AC8: al cambiar el horario cancela solo las reservas futuras que ya no coinciden, en una transacción y con motivo y autor', async () => {
    const { tx, prisma, service } = setup();

    const result = await service.update(
      ADMIN,
      'area-1',
      { openTime: '09:00', closeTime: '19:00', confirmCancellations: true },
      NOW,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['res-8'] } },
      data: {
        status: 'CANCELADA_ADMIN',
        slotKey: null,
        cancelledAt: NOW,
        cancelledById: 'admin-1',
        cancelReason: 'cambió el horario del área',
      },
    });
    expect(result.cancelledReservations).toBe(1);
  });

  it('AC8: solo considera reservas Confirmada futuras; las pasadas no se modifican', async () => {
    const { tx, service } = setup();

    await service.update(
      ADMIN,
      'area-1',
      { isActive: false, confirmCancellations: true },
      NOW,
    );

    const [args] = tx.reservation.findMany.mock.calls[0] as [{ where: object }];
    expect(args.where).toMatchObject({
      areaId: 'area-1',
      status: 'CONFIRMADA',
      OR: [
        { date: { gt: expect.any(Date) } },
        { date: expect.any(Date), startTime: { gt: '12:00' } },
      ],
    });
  });

  it('AC8: al deshabilitar el área cancela todas sus reservas Confirmada futuras', async () => {
    const { tx, service } = setup();

    const result = await service.update(
      ADMIN,
      'area-1',
      { isActive: false, confirmCancellations: true },
      NOW,
    );

    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['res-8', 'res-9'] } } }),
    );
    expect(result.cancelledReservations).toBe(2);
  });

  it('AC8: cambiar solo el nombre o el aforo no cancela reservas', async () => {
    const { tx, service } = setup();

    const result = await service.update(ADMIN, 'area-1', { capacity: 15 }, NOW);

    expect(result.cancelledReservations).toBe(0);
    expect(tx.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('AC8: al bloquear cancela las reservas Confirmada dentro del rango con el motivo del bloqueo', async () => {
    const { tx, service } = setup();

    const result = await service.createBlock(
      ADMIN,
      'area-1',
      block({ confirmCancellations: true }),
      NOW,
    );

    const [args] = tx.reservation.findMany.mock.calls[0] as [
      { where: { date: object } },
    ];
    expect(args.where.date).toEqual({
      gte: new Date('2026-11-25T00:00:00Z'),
      lte: new Date('2026-11-25T00:00:00Z'),
    });
    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELADA_ADMIN',
          cancelReason: 'Mantenimiento de la bomba',
          cancelledById: 'admin-1',
        }),
      }),
    );
    expect(result.cancelledReservations).toBe(2);
  });

  it('AC9: avisa a cada residente afectado con "Reserva cancelada por la administración" y el motivo', async () => {
    const { notifications, service } = setup();

    await service.createBlock(
      ADMIN,
      'area-1',
      block({ confirmCancellations: true }),
      NOW,
    );

    expect(notifications.send).toHaveBeenCalledTimes(2);
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['user-1'] },
      title: 'Reserva cancelada por la administración',
      message:
        'Tu reserva RS-20261120-0001 de Piscina el 25/11/2026 fue cancelada: Mantenimiento de la bomba.',
      sourceModule: 'RESERVAS',
      reference: { type: 'reservation', id: 'res-8' },
    });
  });

  it('AC9: si un aviso falla, los demás se envían y la cancelación queda', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { notifications, service } = setup();
    notifications.send.mockRejectedValueOnce(new Error('sin conexión'));

    const result = await service.createBlock(
      ADMIN,
      'area-1',
      block({ confirmCancellations: true }),
      NOW,
    );

    expect(notifications.send).toHaveBeenCalledTimes(2);
    expect(result.cancelledReservations).toBe(2);
  });

  it('AC10: no existe un endpoint para borrar áreas; se deshabilitan', () => {
    const methods = Object.getOwnPropertyNames(AdminAreasController.prototype);

    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('remove');
    expect(methods).toContain('update');
  });

  it('AC10: eliminar un bloqueo solo borra el bloqueo y no restaura reservas', async () => {
    const { prisma, service } = setup();

    await service.deleteBlock('area-1', 'block-1');

    expect(prisma.areaBlock.deleteMany).toHaveBeenCalledWith({
      where: { id: 'block-1', areaId: 'area-1' },
    });
    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('AC10: 404 al eliminar un bloqueo que no existe', async () => {
    const { prisma, service } = setup();
    prisma.areaBlock.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteBlock('area-1', 'block-x'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('AC11: permisos de la administración de áreas', () => {
    const guard = new RolesGuard(new Reflector());
    const handlers = [
      AdminAreasController.prototype.list,
      AdminAreasController.prototype.create,
      AdminAreasController.prototype.update,
      AdminAreasController.prototype.createBlock,
      AdminAreasController.prototype.deleteBlock,
    ];

    it.each<Role>(['RESIDENTE', 'SEGURIDAD'])(
      'AC11: %s recibe 403 en todos los endpoints',
      (role) => {
        for (const handler of handlers) {
          expect(() => guard.canActivate(requestAs(role, handler))).toThrow(
            ForbiddenException,
          );
        }
      },
    );

    it('AC11: el Administrador sí administra áreas y bloqueos', () => {
      for (const handler of handlers) {
        expect(guard.canActivate(requestAs('ADMINISTRADOR', handler))).toBe(
          true,
        );
      }
    });
  });
});
