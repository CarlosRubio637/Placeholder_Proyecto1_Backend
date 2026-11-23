// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles. Los DTO de prueba son objetos planos, no instancias.
/* oxlint-disable typescript/unbound-method */
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  ValidationPipe,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { validationExceptionFactory } from '@Common/validation';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Prisma, type Role, type User } from '@PrismaClient';
import { CreateVisitDto } from './dto/index.js';
import { VISIT_CODE_ALPHABET, VISIT_MESSAGES } from './visits.constants.js';
import { VisitsController } from './visits.controller.js';
import { VisitsCronService } from './visits.cron.js';
import { VisitsService } from './visits.service.js';

// Domingo 22 de noviembre de 2026, 10:07 en El Salvador.
const NOW = new Date('2026-11-22T16:07:00Z');
const TODAY = '2026-11-22';
const RESIDENT = {
  id: 'user-1',
  role: 'RESIDENTE',
  unitId: 'unit-1',
} as User;

const body = (overrides: Partial<CreateVisitDto> = {}): CreateVisitDto => ({
  visitorName: 'María López',
  documentType: 'DUI',
  documentNumber: '01234567-8',
  visitDate: '2026-11-23',
  expectedTime: '10:00',
  reason: 'Visita familiar',
  ...overrides,
});

/** Servicio real sobre un Prisma simulado; la visita creada repite los datos. */
function setup() {
  const prisma = {
    visit: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'visit-1',
          ...data,
          unit: { code: 'A-101' },
        }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'guard-1' }, { id: 'guard-2' }]),
    },
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new VisitsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { prisma, notifications, service };
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});

/** El 400 del ValidationPipe global con el campo que falló. */
async function validationField(raw: object): Promise<string | undefined> {
  const error = await pipe
    .transform(raw, { type: 'body', metatype: CreateVisitDto })
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return ((error as BadRequestException).getResponse() as { field?: string })
    .field;
}

/** El 400 que el servicio arma a mano con el campo que falló. */
async function serviceField(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return ((error as BadRequestException).getResponse() as { field: string })
    .field;
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => VisitsController.prototype.create,
    getClass: () => VisitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H14. Preautorización de visitantes', () => {
  it('AC4: crea la visita Autorizada con la unidad y el autor del residente', async () => {
    const { prisma, service } = setup();

    const created = await service.create(RESIDENT, body(), NOW);

    const { data } = prisma.visit.create.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'AUTORIZADA',
      origin: 'PREAUTORIZADA',
      unitId: 'unit-1',
      createdById: 'user-1',
      visitorName: 'María López',
    });
    expect(created).toMatchObject({ id: 'visit-1', status: 'AUTORIZADA' });
  });

  it('AC4: el código tiene 6 caracteres en mayúsculas del alfabeto sin ambiguos', async () => {
    const { service } = setup();

    for (let i = 0; i < 20; i++) {
      const { code } = await service.create(RESIDENT, body(), NOW);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(
        code.split('').every((char) => VISIT_CODE_ALPHABET.includes(char)),
      ).toBe(true);
    }
    expect(VISIT_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('AC4: si el código choca con otro, reintenta con un código nuevo', async () => {
    const { prisma, service } = setup();
    const collision = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['code'] },
    });
    const create = prisma.visit.create.getMockImplementation()!;
    prisma.visit.create
      .mockImplementationOnce(() => Promise.reject(collision))
      .mockImplementation(create);

    const created = await service.create(RESIDENT, body(), NOW);

    expect(prisma.visit.create).toHaveBeenCalledTimes(2);
    expect(created.code).toHaveLength(6);
  });

  it('AC5: el código vale solo el día de la visita, de 06:00 a 22:00 en El Salvador', async () => {
    const { service } = setup();

    const created = await service.create(RESIDENT, body(), NOW);

    expect(created.validFrom).toBe('2026-11-23T12:00:00.000Z');
    expect(created.validUntil).toBe('2026-11-24T04:00:00.000Z');
  });

  it('AC5: la tarea pasa a Vencida las Autorizadas cuya vigencia terminó y corre cada 15 minutos', async () => {
    const { prisma } = setup();
    const cron = new VisitsCronService(prisma as unknown as PrismaService);

    expect(await cron.expireAuthorizations(NOW)).toBe(2);
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: { status: 'AUTORIZADA', validUntil: { lte: NOW } },
      data: { status: 'VENCIDA' },
    });
    const schedule = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      VisitsCronService.prototype.expireAuthorizations,
    ) as { cronTime: string; timeZone: string };
    expect(schedule).toMatchObject({
      cronTime: '0 */15 * * * *',
      timeZone: 'America/El_Salvador',
    });
  });

  it('AC6: rechaza una fecha pasada o a más de 30 días con 400 en visitDate', async () => {
    const { service } = setup();

    expect(
      await serviceField(
        service.create(RESIDENT, body({ visitDate: '2026-11-21' }), NOW),
      ),
    ).toBe('visitDate');
    expect(
      await serviceField(
        service.create(RESIDENT, body({ visitDate: '2026-12-23' }), NOW),
      ),
    ).toBe('visitDate');
    // Hoy + 30 días sí se acepta.
    await expect(
      service.create(RESIDENT, body({ visitDate: '2026-12-22' }), NOW),
    ).resolves.toBeDefined();
  });

  it('AC6: rechaza una hora fuera de 06:00 a 22:00 o ya pasada para hoy con 400 en expectedTime', async () => {
    const { service } = setup();

    for (const expectedTime of ['05:45', '22:15']) {
      expect(
        await serviceField(
          service.create(RESIDENT, body({ expectedTime }), NOW),
        ),
      ).toBe('expectedTime');
    }
    const error = await service
      .create(RESIDENT, body({ visitDate: TODAY, expectedTime: '10:00' }), NOW)
      .catch((e: unknown) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'expectedTime',
      message: [VISIT_MESSAGES.timePassed],
    });
  });

  it('AC6: rechaza un documento con formato distinto al de su tipo con 400 en documentNumber', async () => {
    expect(
      await validationField(
        body({ documentType: 'DUI', documentNumber: '012345678' }),
      ),
    ).toBe('documentNumber');
    expect(
      await validationField(
        body({ documentType: 'PASAPORTE', documentNumber: 'AB-12' }),
      ),
    ).toBe('documentNumber');
  });

  it.each([
    'visitorName',
    'documentType',
    'documentNumber',
    'visitDate',
    'expectedTime',
    'reason',
  ] as const)(
    'AC6: rechaza la visita sin %s con 400 en ese campo',
    async (field) => {
      const raw: Record<string, unknown> = Object.fromEntries(
        Object.entries(body()),
      );
      delete raw[field];
      expect(await validationField(raw)).toBe(field);
    },
  );

  it('AC7: 409 si el mismo documento ya tiene una autorización para la unidad y la fecha', async () => {
    const { prisma, service } = setup();
    prisma.visit.findFirst.mockResolvedValue({ id: 'visit-0' });

    const error = await service
      .create(RESIDENT, body(), NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(VISIT_MESSAGES.duplicate);
    expect(prisma.visit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unitId: 'unit-1',
          documentNumber: '01234567-8',
          status: 'AUTORIZADA',
        }),
      }),
    );
    expect(prisma.visit.create).not.toHaveBeenCalled();
  });

  it('AC8: avisa a todo el Personal de seguridad activo con el título y el mensaje de la tarjeta', async () => {
    const { prisma, notifications, service } = setup();

    const created = await service.create(RESIDENT, body(), NOW);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'SEGURIDAD', isActive: true },
      select: { id: true },
    });
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['guard-1', 'guard-2'] },
      title: 'Visita autorizada: A-101',
      message:
        `María López (DUI 01234567-8) visitará A-101 el 23/11/2026, ` +
        `hora estimada 10:00. Motivo: Visita familiar. Código: ${created.code}.`,
      sourceModule: 'VISITAS',
      reference: { type: 'visit', id: 'visit-1' },
    });
  });

  it('AC8: si el aviso falla, la autorización igual queda creada', async () => {
    const { notifications, service } = setup();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    notifications.send.mockRejectedValue(new Error('falla del aviso'));

    await expect(service.create(RESIDENT, body(), NOW)).resolves.toMatchObject({
      status: 'AUTORIZADA',
    });
  });

  it.each(['ADMINISTRADOR', 'SEGURIDAD'] as const)(
    'AC9: %s recibe 403 al crear una autorización',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('AC9: el Residente sí crea autorizaciones', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
  });
});
