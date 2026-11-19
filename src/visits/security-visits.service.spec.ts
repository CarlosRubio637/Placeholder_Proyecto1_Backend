import { ConflictException, NotFoundException } from '@nestjs/common';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import {
  DocumentType,
  VisitOrigin,
  VisitStatus,
  type User,
} from '@PrismaClient';
import type { CreateVisitRequestDto } from './dto/index.js';
import { ENTRY_MESSAGES } from './visits.constants.js';
import { SecurityVisitsService } from './security-visits.service.js';

// Martes 17 de noviembre de 2026, 10:07 en El Salvador.
const NOW = new Date('2026-11-17T16:07:00Z');
const TODAY = new Date('2026-11-17T00:00:00.000Z');
const GUARD = { id: 'guard-1' } as User;

type RequestBody = {
  [K in keyof CreateVisitRequestDto]: CreateVisitRequestDto[K];
};
const REQUEST: RequestBody = {
  visitorName: 'Rosa Martínez',
  documentType: DocumentType.DUI,
  documentNumber: '01234567-8',
  reason: 'Visita familiar',
  unitId: 'unit-1',
};

const row = (change: object = {}) => ({
  id: 'visit-1',
  code: 'K7M2QX',
  origin: VisitOrigin.PREAUTORIZADA,
  visitorName: 'Rosa Martínez',
  documentType: DocumentType.DUI,
  documentNumber: '01234567-8',
  reason: 'Visita familiar',
  visitDate: TODAY,
  status: VisitStatus.AUTORIZADA,
  validFrom: new Date('2026-11-17T12:00:00Z'),
  validUntil: new Date('2026-11-18T04:00:00Z'),
  rejectReason: null,
  createdAt: new Date('2026-11-17T16:00:00Z'),
  unit: { code: 'A-101' },
  ...change,
});

function setup() {
  const tx = {
    visit: {
      findUnique: vi.fn().mockResolvedValue(row()),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          row({ ...data, code: null, createdAt: NOW, unit: { code: 'A-101' } }),
        ),
      ),
    },
    unit: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'unit-1',
        code: 'A-101',
        _count: { residents: 2 },
      }),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new SecurityVisitsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, tx, notifications };
}

async function conflictOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error as ConflictException).getResponse() as {
    message: string;
    status?: string;
  };
}

describe('SecurityVisitsService.search (H16)', () => {
  it('busca solo visitas de hoy por código o documento exactos', async () => {
    const { service, prisma } = setup();
    prisma.visit.findMany.mockResolvedValue([row()]);

    const { data } = await service.search('K7M2QX', NOW);

    expect(prisma.visit.findMany.mock.calls[0][0].where).toEqual({
      visitDate: TODAY,
      OR: [{ code: 'K7M2QX' }, { documentNumber: 'K7M2QX' }],
    });
    expect(data).toEqual([
      {
        id: 'visit-1',
        code: 'K7M2QX',
        origin: 'PREAUTORIZADA',
        visitorName: 'Rosa Martínez',
        documentType: 'DUI',
        documentNumber: '01234567-8',
        unitCode: 'A-101',
        reason: 'Visita familiar',
        visitDate: '2026-11-17',
        status: 'AUTORIZADA',
        validFrom: row().validFrom,
        validUntil: row().validUntil,
      },
    ]);
  });

  it('"hoy" es el día del condominio, no el del servidor en UTC', async () => {
    const { service, prisma } = setup();
    // 23:30 del 17 en El Salvador ya es 18 en UTC.
    await service.search('K7M2QX', new Date('2026-11-18T05:30:00Z'));
    expect(prisma.visit.findMany.mock.calls[0][0].where.visitDate).toEqual(
      TODAY,
    );
  });
});

describe('SecurityVisitsService.listRequests (H16)', () => {
  it('lista solo las solicitudes sin autorización de hoy, la más reciente primero', async () => {
    const { service, prisma } = setup();
    await service.listRequests(NOW);
    expect(prisma.visit.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        origin: VisitOrigin.SIN_AUTORIZACION_PREVIA,
        visitDate: TODAY,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('expiresAt es createdAt + 15 minutos solo mientras está pendiente', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-11-17T16:00:00Z');
    prisma.visit.findMany.mockResolvedValue([
      row({ status: VisitStatus.PENDIENTE_AUTORIZACION, createdAt }),
      row({
        status: VisitStatus.RECHAZADA,
        rejectReason: 'No lo conozco',
        createdAt,
      }),
    ]);

    const { data } = await service.listRequests(NOW);

    expect(data[0].expiresAt).toEqual(new Date('2026-11-17T16:15:00Z'));
    expect(data[1]).toMatchObject({
      expiresAt: null,
      rejectReason: 'No lo conozco',
    });
  });
});

describe('SecurityVisitsService.createRequest (H16)', () => {
  it('crea la solicitud Pendiente para hoy, válida hasta las 22:00', async () => {
    const { service, prisma } = setup();

    const result = await service.createRequest(GUARD, REQUEST, NOW);

    expect(prisma.visit.create.mock.calls[0][0].data).toMatchObject({
      origin: VisitOrigin.SIN_AUTORIZACION_PREVIA,
      status: VisitStatus.PENDIENTE_AUTORIZACION,
      unitId: 'unit-1',
      createdById: 'guard-1',
      visitDate: TODAY,
      validFrom: new Date('2026-11-17T12:00:00Z'),
      validUntil: new Date('2026-11-18T04:00:00Z'),
    });
    expect(prisma.visit.create.mock.calls[0][0].data).not.toHaveProperty(
      'code',
    );
    expect(result).toEqual({
      id: 'visit-1',
      status: 'PENDIENTE_AUTORIZACION',
      unitCode: 'A-101',
      expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
    });
  });

  it('avisa a los residentes de la unidad con el texto de H16', async () => {
    const { service, notifications } = setup();
    await service.createRequest(GUARD, REQUEST, NOW);

    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'UNIDAD', ids: ['unit-1'] },
      title: 'Visitante en portería',
      message:
        'Rosa Martínez (DUI 01234567-8) quiere visitar tu unidad. Motivo: Visita familiar. Responde en 15 minutos.',
      sourceModule: 'VISITAS',
      reference: { type: 'visit', id: 'visit-1' },
    });
  });

  it('si el aviso falla, la solicitud igual queda creada', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(
      service.createRequest(GUARD, REQUEST, NOW),
    ).resolves.toMatchObject({ status: 'PENDIENTE_AUTORIZACION' });
  });

  it('guarda el pasaporte en mayúsculas', async () => {
    const { service, prisma } = setup();
    await service.createRequest(
      GUARD,
      {
        ...REQUEST,
        documentType: DocumentType.PASAPORTE,
        documentNumber: 'a1234567',
      },
      NOW,
    );
    expect(prisma.visit.create.mock.calls[0][0].data.documentNumber).toBe(
      'A1234567',
    );
  });

  it('404 si la unidad no existe', async () => {
    const { service, prisma } = setup();
    prisma.unit.findUnique.mockResolvedValue(null);
    await expect(
      service.createRequest(GUARD, REQUEST, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si la unidad no tiene residentes activos', async () => {
    const { service, prisma } = setup();
    prisma.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      code: 'C-101',
      _count: { residents: 0 },
    });
    const body = await conflictOf(service.createRequest(GUARD, REQUEST, NOW));
    expect(body.message).toBe('La unidad no tiene residentes registrados.');
    expect(prisma.visit.create).not.toHaveBeenCalled();
  });

  it('409 si el visitante ya está dentro', async () => {
    const { service, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValue({ id: 'otra' });

    const body = await conflictOf(service.createRequest(GUARD, REQUEST, NOW));

    expect(body.message).toBe(ENTRY_MESSAGES.alreadyInside);
    expect(prisma.visit.findFirst.mock.calls[0][0].where).toEqual({
      status: VisitStatus.DENTRO,
      documentType: 'DUI',
      documentNumber: '01234567-8',
    });
  });

  it.each([
    ['05:59', '2026-11-17T11:59:00Z'],
    ['22:00', '2026-11-18T04:00:00Z'],
    ['23:30', '2026-11-18T05:30:00Z'],
  ])('409 fuera del horario de visitas (%s)', async (_hora, instant) => {
    const { service, prisma } = setup();
    const body = await conflictOf(
      service.createRequest(GUARD, REQUEST, new Date(instant)),
    );
    expect(body.message).toBe('Fuera del horario de visitas.');
    expect(prisma.unit.findUnique).not.toHaveBeenCalled();
  });

  it('a las 06:00 ya se puede enviar', async () => {
    const { service } = setup();
    await expect(
      service.createRequest(GUARD, REQUEST, new Date('2026-11-17T12:00:00Z')),
    ).resolves.toBeTruthy();
  });
});

describe('SecurityVisitsService.registerEntry (H16)', () => {
  it('pasa a Dentro con la hora del servidor y el agente', async () => {
    const { service, tx } = setup();

    const result = await service.registerEntry(GUARD, 'visit-1', NOW);

    expect(tx.visit.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', status: VisitStatus.AUTORIZADA },
      data: { status: VisitStatus.DENTRO, entryAt: NOW, entryById: 'guard-1' },
    });
    expect(result).toEqual({ id: 'visit-1', status: 'DENTRO', entryAt: NOW });
  });

  it('toma un candado por documento dentro de la transacción', async () => {
    const { service, tx } = setup();
    await service.registerEntry(GUARD, 'visit-1', NOW);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual(['DUI:01234567-8']);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.visit.findFirst.mock.invocationCallOrder[0],
    );
  });

  it('404 si la visita no existe', async () => {
    const { service, tx } = setup();
    tx.visit.findUnique.mockResolvedValue(null);
    await expect(service.registerEntry(GUARD, 'x', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['PENDIENTE_AUTORIZACION', 'Pendiente de autorización'],
    ['RECHAZADA', 'Rechazada'],
    ['CANCELADA', 'Cancelada'],
    ['VENCIDA', 'Vencida'],
    ['DENTRO', 'Dentro'],
    ['FINALIZADA', 'Finalizada'],
  ])('409 con el estado actual si está %s', async (status, label) => {
    const { service, tx } = setup();
    tx.visit.findUnique.mockResolvedValue(row({ status }));

    const body = await conflictOf(service.registerEntry(GUARD, 'visit-1', NOW));

    expect(body).toMatchObject({
      message: `No se puede registrar la entrada: la visita está ${label}.`,
      status,
    });
    expect(tx.visit.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['antes de las 06:00', '2026-11-17T11:59:00Z'],
    ['después de las 22:00', '2026-11-18T04:01:00Z'],
    ['otro día', '2026-11-19T16:00:00Z'],
  ])('409 si se presenta %s', async (_caso, instant) => {
    const { service, tx } = setup();
    const body = await conflictOf(
      service.registerEntry(GUARD, 'visit-1', new Date(instant)),
    );
    expect(body.message).toBe('La autorización no es válida en este horario.');
    expect(tx.visit.updateMany).not.toHaveBeenCalled();
  });

  it('409 si el mismo visitante tiene otra visita Dentro', async () => {
    const { service, tx } = setup();
    tx.visit.findFirst.mockResolvedValue({ id: 'otra' });

    const body = await conflictOf(service.registerEntry(GUARD, 'visit-1', NOW));

    expect(body.message).toBe(
      'Este visitante ya está dentro. Registra su salida primero.',
    );
    expect(tx.visit.updateMany).not.toHaveBeenCalled();
  });

  it('si otra petición la registró justo antes, 409 con el estado nuevo', async () => {
    const { service, tx } = setup();
    tx.visit.updateMany.mockResolvedValue({ count: 0 });
    tx.visit.findUniqueOrThrow.mockResolvedValue({ status: 'DENTRO' });

    const body = await conflictOf(service.registerEntry(GUARD, 'visit-1', NOW));

    expect(body.status).toBe('DENTRO');
  });
});
