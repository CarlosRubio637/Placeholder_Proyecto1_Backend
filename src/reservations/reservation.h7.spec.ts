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
import { ReservationsController } from './controllers/index.js';
import { CreateReservationDto, RESERVATION_MESSAGES } from './dto/index.js';
import { ReservationRepository } from './repositories/index.js';
import { ReservationsService } from './services/index.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const RESIDENT = { id: 'user-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;
const AREA_ID = '3f0c9a52-6a1b-4d4e-9d1f-0a2b3c4d5e6f';

const AREA = {
  id: AREA_ID,
  name: 'Piscina',
  capacity: 10,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
  isActive: true,
} as CommonArea;

const body = (
  overrides: Partial<CreateReservationDto> = {},
): CreateReservationDto => ({
  areaId: AREA_ID,
  date: '2026-11-23',
  startTime: '10:00',
  attendees: 4,
  acceptRules: true,
  ...overrides,
});

// El mismo ValidationPipe global de app.setup.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('slotKey duplicado', {
    code: 'P2002',
    clientVersion: 'test',
  });

/** Servicio con el repositorio real; la transacción usa un cliente simulado. */
function setup(options: { area?: CommonArea | null; active?: number } = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    commonArea: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options.area === undefined ? AREA : options.area),
    },
    areaBlock: { findFirst: vi.fn().mockResolvedValue(null) },
    reservation: {
      count: vi.fn(({ where }: { where: { code?: unknown } }) =>
        Promise.resolve(where.code ? 0 : (options.active ?? 0)),
      ),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }) =>
        Promise.resolve({
          id: 'res-1',
          status: 'CONFIRMADA',
          createdAt: NOW,
          ...data,
        }),
      ),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    reservation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'res-ganadora' }),
    },
  };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new ReservationsService(
    new ReservationRepository(prisma as unknown as PrismaService),
    notifications as unknown as NotificationsService,
  );
  return { tx, prisma, notifications, service };
}

async function failure(promise: Promise<unknown>) {
  return promise.catch((e: unknown) => e);
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReservationsController.prototype.create,
    getClass: () => ReservationsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H7. Reserva de un área común', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AC4: crea la reserva Confirmada en una franja completa del horario', async () => {
    const { tx, service } = setup();

    const result = await service.create(RESIDENT, body(), NOW);

    expect(tx.reservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'RS-20261122-0001',
        areaId: AREA_ID,
        unitId: 'unit-1',
        userId: 'user-1',
        startTime: '10:00',
        endTime: '11:00',
        attendees: 4,
        slotKey: `${AREA_ID}|2026-11-23|10:00`,
      }),
    });
    expect(result).toMatchObject({
      code: 'RS-20261122-0001',
      status: 'CONFIRMADA',
      area: { id: AREA_ID, name: 'Piscina' },
      date: '2026-11-23',
      startTime: '10:00',
      endTime: '11:00',
    });
  });

  it('AC4: acepta hasta 30 días adelante y rechaza el día 31 con 400', async () => {
    const { service } = setup();

    await expect(
      service.create(RESIDENT, body({ date: '2026-12-22' }), NOW),
    ).resolves.toBeDefined();
    const error = await failure(
      service.create(RESIDENT, body({ date: '2026-12-23' }), NOW),
    );
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('AC4: 409 si la fecha está dentro de un bloqueo del área', async () => {
    const { tx, service } = setup();
    tx.areaBlock.findFirst.mockResolvedValue({ id: 'block-1' });

    const error = await failure(service.create(RESIDENT, body(), NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(RESERVATION_MESSAGES.blocked);
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });

  it('AC4: 409 si ya hay otra reserva Confirmada en esa franja', async () => {
    const { tx, service } = setup();
    tx.reservation.findUnique.mockResolvedValue({ id: 'res-otra' });

    const error = await failure(service.create(RESIDENT, body(), NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(RESERVATION_MESSAGES.slotTaken);
  });

  it('AC5: si dos residentes confirman la misma franja a la vez, solo uno obtiene la reserva', async () => {
    const { prisma, service } = setup();
    // La primera transacción guarda; la segunda choca con el índice único de slotKey.
    const real = prisma.$transaction.getMockImplementation()!;
    prisma.$transaction
      .mockImplementationOnce(real)
      .mockImplementationOnce(() => Promise.reject(uniqueViolation()));
    const other = { ...RESIDENT, id: 'user-2', unitId: 'unit-2' } as User;

    const [first, second] = await Promise.allSettled([
      service.create(RESIDENT, body(), NOW),
      service.create(other, body(), NOW),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    const reason = (second as PromiseRejectedResult).reason as Error;
    expect(reason).toBeInstanceOf(ConflictException);
    expect(reason.message).toBe(
      'Esta franja ya fue reservada por otra unidad.',
    );
  });

  it.each([
    ['una fecha pasada', body({ date: '2026-11-21' }), 'date'],
    [
      'una hora de hoy que ya pasó',
      body({ date: '2026-11-22', startTime: '11:00' }),
      'startTime',
    ],
  ])(
    'AC6: rechaza %s con 400 "No puedes reservar una fecha u hora pasada."',
    async (_, dto, field) => {
      const { service } = setup();

      const error = await failure(service.create(RESIDENT, dto, NOW));

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field,
        message: [RESERVATION_MESSAGES.past],
      });
    },
  );

  it.each(['07:00', '08:30', '20:00'])(
    'AC6: rechaza la franja %s fuera del horario con 400',
    async (startTime) => {
      const { service } = setup();

      const error = await failure(
        service.create(RESIDENT, body({ startTime }), NOW),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field: 'startTime',
      });
    },
  );

  it.each([0, 11])(
    'AC6: rechaza %i personas con 400 "El área admite máximo 10 personas."',
    async (attendees) => {
      const { service } = setup();

      const error = await failure(
        service.create(RESIDENT, body({ attendees }), NOW),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field: 'attendees',
        message: ['El área admite máximo 10 personas.'],
      });
    },
  );

  it('AC6: acepta de 1 al aforo exacto', async () => {
    const { service } = setup();

    await expect(
      service.create(RESIDENT, body({ attendees: 1 }), NOW),
    ).resolves.toBeDefined();
    await expect(
      service.create(RESIDENT, body({ attendees: 10 }), NOW),
    ).resolves.toBeDefined();
  });

  it('AC6: 409 si el área está deshabilitada', async () => {
    const { service } = setup({ area: { ...AREA, isActive: false } });

    const error = await failure(service.create(RESIDENT, body(), NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(RESERVATION_MESSAGES.disabled);
  });

  it('AC6: 404 si el área no existe', async () => {
    const { service } = setup({ area: null });

    await expect(service.create(RESIDENT, body(), NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('AC6: el cuerpo exige personas enteras y la aceptación de las reglas (400)', async () => {
    const parse = (dto: object) =>
      pipe.transform(dto, { type: 'body', metatype: CreateReservationDto });

    for (const [dto, field] of [
      [{ ...body(), attendees: 2.5 }, 'attendees'],
      [{ ...body(), acceptRules: false }, 'acceptRules'],
    ] as const) {
      const error = await failure(parse(dto));
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        field,
      });
    }
  });

  it('AC7: 409 "Tu unidad ya tiene 2 reservas activas." con 2 reservas Confirmada futuras', async () => {
    const { tx, service } = setup({ active: 2 });

    const error = await failure(service.create(RESIDENT, body(), NOW));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Tu unidad ya tiene 2 reservas activas.',
    );
    expect(tx.reservation.create).not.toHaveBeenCalled();
  });

  it('AC7: con 1 reserva activa todavía puede reservar; el límite se revisa dentro de la transacción', async () => {
    const { tx, prisma, service } = setup({ active: 1 });

    await service.create(RESIDENT, body(), NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.reservation.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        unitId: 'unit-1',
        status: 'CONFIRMADA',
      }),
    });
  });

  describe('AC8: permisos y unidad de la reserva', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
      'AC8: %s recibe 403 al reservar',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC8: el Residente sí reserva', () => {
      expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
    });

    it('AC8: el cuerpo no acepta un unitId (400); la unidad sale del usuario autenticado', async () => {
      const error = await failure(
        pipe.transform(
          { ...body(), unitId: 'unit-2' },
          { type: 'body', metatype: CreateReservationDto },
        ),
      );
      expect(error).toBeInstanceOf(BadRequestException);

      const { tx, service } = setup();
      await service.create(RESIDENT, body(), NOW);
      expect(tx.reservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ unitId: 'unit-1', userId: 'user-1' }),
      });
    });
  });

  it('AC9: al confirmar avisa al residente con "Reserva confirmada" y los datos de la reserva', async () => {
    const { notifications, service } = setup();

    await service.create(RESIDENT, body(), NOW);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['user-1'] },
      title: 'Reserva confirmada',
      message:
        'Tu reserva RS-20261122-0001 de Piscina el 23/11/2026 de 10:00 a 11:00 está confirmada.',
      sourceModule: 'RESERVAS',
      reference: { type: 'reservation', id: 'res-1' },
    });
  });

  it('AC9: si el aviso falla, la reserva queda confirmada igual', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { notifications, service } = setup();
    notifications.send.mockRejectedValue(new Error('sin conexión'));

    await expect(service.create(RESIDENT, body(), NOW)).resolves.toMatchObject({
      status: 'CONFIRMADA',
    });
  });
});
