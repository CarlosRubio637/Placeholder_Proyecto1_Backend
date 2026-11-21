import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import {
  DocumentType,
  Prisma,
  Role,
  VisitOrigin,
  VisitStatus,
  type User,
} from '@PrismaClient';
import type { CreateVisitDto } from './dto/index.js';
import { VISIT_MESSAGES } from './visits.constants.js';
import { VisitsService } from './visits.service.js';

// Domingo 8 de noviembre de 2026, 10:07 en El Salvador.
const NOW = new Date('2026-11-08T16:07:00Z');

const RESIDENT = {
  id: 'user-1',
  role: Role.RESIDENTE,
  unitId: 'unit-1',
} as User;

// Tipo plano (no la clase): el cuerpo se copia con spread en cada caso.
type VisitBody = { [K in keyof CreateVisitDto]: CreateVisitDto[K] };

const DTO: VisitBody = {
  visitorName: 'Ana María López',
  documentType: DocumentType.DUI,
  documentNumber: '01234567-8',
  visitDate: '2026-11-10',
  expectedTime: '15:30',
  reason: 'Visita familiar',
};

function savedVisit(data: Record<string, unknown>) {
  return {
    id: 'visit-1',
    ...data,
    unit: { code: 'A-101' },
  };
}

function setup() {
  const visit = {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(savedVisit(data)),
    ),
  };
  const user = {
    findMany: vi.fn().mockResolvedValue([{ id: 'guard-1' }, { id: 'guard-2' }]),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new VisitsService(
    { visit, user } as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, visit, user, notifications };
}

async function expectBadRequest(
  promise: Promise<unknown>,
  field: string,
  message: string,
) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    field,
    message: [message],
  });
}

describe('reglas de fecha y hora de la visita', () => {
  it.each([
    ['2026-11-07', 'ayer'],
    ['2026-12-09', 'hoy + 31 días'],
  ])('rechaza la fecha %s (%s)', async (visitDate) => {
    const { service } = setup();
    await expectBadRequest(
      service.create(RESIDENT, { ...DTO, visitDate }, NOW),
      'visitDate',
      'La fecha debe estar entre hoy y 08/12/2026.',
    );
  });

  it('acepta hoy y hoy + 30 días', async () => {
    const { service } = setup();
    await expect(
      service.create(RESIDENT, { ...DTO, visitDate: '2026-12-08' }, NOW),
    ).resolves.toBeDefined();
    await expect(
      service.create(
        RESIDENT,
        { ...DTO, visitDate: '2026-11-08', expectedTime: '10:15' },
        NOW,
      ),
    ).resolves.toBeDefined();
  });

  it.each(['05:45', '22:15'])(
    'rechaza la hora %s, fuera del horario',
    async (expectedTime) => {
      const { service } = setup();
      await expectBadRequest(
        service.create(RESIDENT, { ...DTO, expectedTime }, NOW),
        'expectedTime',
        VISIT_MESSAGES.hours,
      );
    },
  );

  it('acepta las 06:00 y las 22:00', async () => {
    const { service } = setup();
    for (const expectedTime of ['06:00', '22:00']) {
      await expect(
        service.create(RESIDENT, { ...DTO, expectedTime }, NOW),
      ).resolves.toBeDefined();
    }
  });

  it('rechaza una hora fuera de los pasos de 15 minutos', async () => {
    const { service } = setup();
    await expectBadRequest(
      service.create(RESIDENT, { ...DTO, expectedTime: '15:20' }, NOW),
      'expectedTime',
      VISIT_MESSAGES.timeStep,
    );
  });

  it('si la visita es hoy, rechaza una hora ya pasada', async () => {
    const { service } = setup();
    await expectBadRequest(
      service.create(
        RESIDENT,
        { ...DTO, visitDate: '2026-11-08', expectedTime: '10:00' },
        NOW,
      ),
      'expectedTime',
      VISIT_MESSAGES.timePassed,
    );
  });
});

describe('preautorización de visitantes', () => {
  it('crea la visita Autorizada con la unidad del residente y su vigencia', async () => {
    const { service, visit } = setup();

    const result = await service.create(RESIDENT, DTO, NOW);

    const { data } = visit.create.mock.calls[0][0];
    expect(data).toMatchObject({
      origin: VisitOrigin.PREAUTORIZADA,
      status: VisitStatus.AUTORIZADA,
      unitId: 'unit-1',
      createdById: 'user-1',
      visitorName: 'Ana María López',
      documentNumber: '01234567-8',
      searchKey: 'ana maria lopez 01234567-8',
      visitDate: new Date('2026-11-10T00:00:00.000Z'),
      expectedTime: '15:30',
      validFrom: new Date('2026-11-10T12:00:00.000Z'),
      validUntil: new Date('2026-11-11T04:00:00.000Z'),
    });
    expect(data.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(result).toEqual({
      id: 'visit-1',
      code: data.code,
      status: VisitStatus.AUTORIZADA,
      visitorName: 'Ana María López',
      visitDate: '2026-11-10',
      expectedTime: '15:30',
      validFrom: '2026-11-10T12:00:00.000Z',
      validUntil: '2026-11-11T04:00:00.000Z',
    });
  });

  it('guarda el pasaporte en mayúsculas y busca el duplicado con él', async () => {
    const { service, visit } = setup();
    await service.create(
      RESIDENT,
      {
        ...DTO,
        documentType: DocumentType.PASAPORTE,
        documentNumber: 'ab12345',
      },
      NOW,
    );
    expect(visit.findFirst).toHaveBeenCalledWith({
      where: {
        unitId: 'unit-1',
        documentType: DocumentType.PASAPORTE,
        documentNumber: 'AB12345',
        visitDate: new Date('2026-11-10T00:00:00.000Z'),
        status: VisitStatus.AUTORIZADA,
      },
      select: { id: true },
    });
  });

  it('responde 409 si el documento ya tiene una autorización ese día', async () => {
    const { service, visit, notifications } = setup();
    visit.findFirst.mockResolvedValue({ id: 'visit-0' });

    const error = await service
      .create(RESIDENT, DTO, NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(VISIT_MESSAGES.duplicate);
    expect(visit.create).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('reintenta con otro código si choca con uno existente', async () => {
    const { service, visit } = setup();
    const collision = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['code'] },
    });
    visit.create.mockRejectedValueOnce(collision);

    await expect(service.create(RESIDENT, DTO, NOW)).resolves.toBeDefined();
    expect(visit.create).toHaveBeenCalledTimes(2);
  });

  it('responde 403 si la cuenta no tiene unidad', async () => {
    const { service } = setup();
    await expect(
      service.create({ ...RESIDENT, unitId: null }, DTO, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('avisa a todo el Personal de seguridad activo', async () => {
    const { service, user, notifications, visit } = setup();

    await service.create(RESIDENT, DTO, NOW);

    const code = String(visit.create.mock.calls[0][0].data.code);
    expect(user.findMany).toHaveBeenCalledWith({
      where: { role: Role.SEGURIDAD, isActive: true },
      select: { id: true },
    });
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['guard-1', 'guard-2'] },
      title: 'Visita autorizada: A-101',
      message:
        'Ana María López (DUI 01234567-8) visitará A-101 el 10/11/2026, ' +
        `hora estimada 15:30. Motivo: Visita familiar. Código: ${code}.`,
      sourceModule: 'VISITAS',
      reference: { type: 'visit', id: 'visit-1' },
    });
  });

  it('si el aviso falla, la autorización igual queda creada', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(service.create(RESIDENT, DTO, NOW)).resolves.toMatchObject({
      status: VisitStatus.AUTORIZADA,
    });
  });

  it('sin Personal de seguridad activo no envía aviso', async () => {
    const { service, user, notifications } = setup();
    user.findMany.mockResolvedValue([]);
    await service.create(RESIDENT, DTO, NOW);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});
