import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Role, VisitStatus, type User } from '@PrismaClient';
import { ResidentVisitsService } from './resident-visits.service.js';

// Jueves 19 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-19T16:00:00Z');
const TODAY = new Date('2026-11-19T00:00:00.000Z');
const MIN = 60 * 1000;
const RESIDENT = {
  id: 'res-1',
  role: Role.RESIDENTE,
  unitId: 'unit-1',
} as User;

const row = (change: object = {}) => ({
  id: 'visit-1',
  visitorName: 'Rosa Martínez',
  documentType: 'DUI',
  documentNumber: '01234567-8',
  visitDate: TODAY,
  expectedTime: '15:30',
  entryAt: null,
  reason: 'Visita familiar',
  code: 'K7M2QX',
  status: VisitStatus.AUTORIZADA,
  origin: 'PREAUTORIZADA',
  rejectReason: null,
  createdAt: new Date(NOW.getTime() - 5 * MIN),
  createdBy: { role: Role.RESIDENTE, profile: { fullName: 'Ana López' } },
  ...change,
});

function setup() {
  const prisma = {
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        visitorName: 'Pedro Gómez',
        unit: { code: 'A-101' },
      }),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ fullName: 'Ana López' }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'guard-1' }, { id: 'guard-2' }]),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new ResidentVisitsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications };
}

describe('ResidentVisitsService.list (H15)', () => {
  it('Activas: pendientes primero y autorizadas de hoy en adelante, de la unidad', async () => {
    const { service, prisma } = setup();
    await service.list(
      RESIDENT,
      { tab: 'activas', page: 1, pageSize: 10 },
      NOW,
    );

    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      unitId: 'unit-1',
      OR: [
        { status: 'PENDIENTE_AUTORIZACION' },
        { status: 'AUTORIZADA', visitDate: { gte: TODAY } },
      ],
    });
    expect(args.orderBy[0]).toEqual({ status: 'desc' });
  });

  it('Historial: los estados finales, el más reciente primero', async () => {
    const { service, prisma } = setup();
    await service.list(
      RESIDENT,
      { tab: 'historial', page: 2, pageSize: 10 },
      NOW,
    );

    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      unitId: 'unit-1',
      status: {
        in: ['RECHAZADA', 'DENTRO', 'FINALIZADA', 'CANCELADA', 'VENCIDA'],
      },
    });
    expect(args.orderBy).toEqual([
      { visitDate: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(args).toMatchObject({ skip: 10, take: 10 });
  });

  it('devuelve las columnas, quién la creó y el vencimiento de las pendientes', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date(NOW.getTime() - 5 * MIN);
    prisma.visit.findMany.mockResolvedValue([
      row({
        status: 'PENDIENTE_AUTORIZACION',
        origin: 'SIN_AUTORIZACION_PREVIA',
        code: null,
        expectedTime: null,
        createdAt,
        createdBy: { role: Role.SEGURIDAD, profile: null },
      }),
      row(),
    ]);
    prisma.visit.count.mockResolvedValue(2);

    const result = await service.list(
      RESIDENT,
      { tab: 'activas', page: 1, pageSize: 10 },
      NOW,
    );

    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 10 });
    expect(result.data[0]).toMatchObject({
      createdBy: 'Seguridad',
      expiresAt: new Date(createdAt.getTime() + 15 * MIN),
      visitDate: '2026-11-19',
    });
    expect(result.data[1]).toMatchObject({
      createdBy: 'Ana López',
      expiresAt: null,
    });
    expect(result.data[1]).not.toHaveProperty('createdAt');
  });

  it('403 si la cuenta no tiene unidad', async () => {
    const { service } = setup();
    await expect(
      service.list(
        { ...RESIDENT, unitId: null },
        { tab: 'activas', page: 1, pageSize: 10 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ResidentVisitsService.cancel (H15)', () => {
  it('cancela solo si es de la unidad y está Autorizada, con fecha y autor', async () => {
    const { service, prisma } = setup();

    const result = await service.cancel(RESIDENT, 'visit-1', NOW);

    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', unitId: 'unit-1', status: 'AUTORIZADA' },
      data: { status: 'CANCELADA', cancelledAt: NOW, cancelledById: 'res-1' },
    });
    expect(result).toEqual({
      id: 'visit-1',
      status: 'CANCELADA',
      cancelledAt: NOW,
    });
  });

  it('404 si es de otra unidad o no existe', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.cancel(RESIDENT, 'x', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409 si no está Autorizada (por ejemplo, ya está Dentro)', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    prisma.visit.findFirst.mockResolvedValue({ status: 'DENTRO' });
    await expect(service.cancel(RESIDENT, 'visit-1', NOW)).rejects.toThrow(
      'Solo se pueden cancelar visitas Autorizadas.',
    );
  });
});

describe('ResidentVisitsService.respond (H15)', () => {
  it('aprobar: condicionado por Pendiente y los 15 minutos', async () => {
    const { service, prisma } = setup();

    const result = await service.respond(
      RESIDENT,
      'visit-1',
      { decision: 'APROBAR' },
      NOW,
    );

    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'visit-1',
        unitId: 'unit-1',
        status: 'PENDIENTE_AUTORIZACION',
        createdAt: { gt: new Date(NOW.getTime() - 15 * MIN) },
      },
      data: {
        status: 'AUTORIZADA',
        respondedById: 'res-1',
        respondedAt: NOW,
        rejectReason: null,
      },
    });
    expect(result).toEqual({
      id: 'visit-1',
      status: 'AUTORIZADA',
      respondedAt: NOW,
    });
  });

  it('aprobar avisa a todo seguridad con el texto de H15', async () => {
    const { service, notifications } = setup();
    await service.respond(RESIDENT, 'visit-1', { decision: 'APROBAR' }, NOW);
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['guard-1', 'guard-2'] },
      title: 'Solicitud aprobada: A-101',
      message:
        'Ana López aprobó el ingreso de Pedro Gómez. Ya puedes registrar su entrada.',
      sourceModule: 'VISITAS',
      reference: { type: 'visit', id: 'visit-1' },
    });
  });

  it('rechazar guarda el motivo y lo incluye en el aviso', async () => {
    const { service, prisma, notifications } = setup();
    const result = await service.respond(
      RESIDENT,
      'visit-1',
      { decision: 'RECHAZAR', reason: 'No lo conozco' },
      NOW,
    );
    expect(prisma.visit.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'RECHAZADA',
      rejectReason: 'No lo conozco',
    });
    expect(result.status).toBe('RECHAZADA');
    expect(notifications.send.mock.calls[0][0]).toMatchObject({
      title: 'Solicitud rechazada: A-101',
      message:
        'Ana López rechazó el ingreso de Pedro Gómez. Motivo: No lo conozco.',
    });
  });

  it('rechazar sin motivo lo dice en el aviso', async () => {
    const { service, notifications } = setup();
    await service.respond(RESIDENT, 'visit-1', { decision: 'RECHAZAR' }, NOW);
    expect(notifications.send.mock.calls[0][0].message).toBe(
      'Ana López rechazó el ingreso de Pedro Gómez. Motivo: Sin motivo indicado.',
    );
  });

  it('si el aviso falla, la respuesta igual queda', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(
      service.respond(RESIDENT, 'visit-1', { decision: 'APROBAR' }, NOW),
    ).resolves.toMatchObject({ status: 'AUTORIZADA' });
  });

  it.each<[string, object | null, unknown, string?]>([
    ['es de otra unidad', null, NotFoundException],
    [
      'otro residente ya respondió',
      {
        status: 'AUTORIZADA',
        respondedById: 'res-2',
        createdAt: NOW,
        rejectReason: null,
      },
      ConflictException,
      'Otro residente ya respondió esta solicitud.',
    ],
    [
      'pasaron los 15 minutos (antes de la tarea)',
      {
        status: 'PENDIENTE_AUTORIZACION',
        respondedById: null,
        createdAt: new Date(NOW.getTime() - 16 * MIN),
        rejectReason: null,
      },
      ConflictException,
      'La solicitud venció: pasaron más de 15 minutos sin respuesta.',
    ],
    [
      'la tarea ya la venció',
      {
        status: 'RECHAZADA',
        respondedById: null,
        createdAt: new Date(NOW.getTime() - 20 * MIN),
        rejectReason: 'Sin respuesta del residente',
      },
      ConflictException,
      'La solicitud venció: pasaron más de 15 minutos sin respuesta.',
    ],
    [
      'no era una solicitud (visita preautorizada)',
      {
        status: 'AUTORIZADA',
        respondedById: null,
        createdAt: NOW,
        rejectReason: null,
      },
      ConflictException,
      'La solicitud ya no está pendiente de autorización.',
    ],
  ])('si %s', async (_caso, visit, httpError, message) => {
    const { service, prisma, notifications } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    prisma.visit.findFirst.mockResolvedValue(visit);

    const error = await service
      .respond(RESIDENT, 'visit-1', { decision: 'APROBAR' }, NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(httpError);
    if (message) expect((error as Error).message).toBe(message);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});
