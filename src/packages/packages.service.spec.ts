import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PackagesService } from './packages.service.js';
import type { NotificationsService } from '../notifications/services/index.js';
import type { PrismaService } from '../prisma/services/index.js';
import type { User } from '../generated/prisma/client.js';

const guard = { id: 'guard-1', role: 'SEGURIDAD', unitId: null } as User;
const resident = { id: 'res-1', role: 'RESIDENTE', unitId: 'unit-1' } as User;

const createdRow = {
  id: 'pkg-1',
  code: 'PQ-20261107-0003',
  courier: 'DHL',
  trackingNumber: '4581-2203',
  notes: 'Caja mediana',
  status: 'PENDIENTE_ENTREGA',
  receivedAt: new Date('2026-11-07T16:42:00Z'), // 10:42 en El Salvador
  unit: { id: 'unit-1', code: 'A-101' },
};

function setup() {
  const tx = {
    packageCounter: {
      upsert: vi.fn().mockResolvedValue({ day: 'x', last: 3 }),
    },
    package: { create: vi.fn().mockResolvedValue(createdRow) },
  };
  const prisma = {
    unit: { findUnique: vi.fn().mockResolvedValue({ id: 'unit-1' }) },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'res-1' }, { id: 'res-2' }]),
    },
    package: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new PackagesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, tx, notifications };
}

describe('PackagesService.create (H19)', () => {
  const dto = {
    unitId: 'unit-1',
    courier: 'DHL',
    trackingNumber: '4581-2203',
    notes: 'Caja mediana',
  };

  it('registra el paquete con el código del contador del día y quién lo recibió', async () => {
    const { service, tx } = setup();

    const result = await service.create(guard, dto);

    const counterCall = tx.packageCounter.upsert.mock.calls[0][0];
    expect(counterCall.where.day).toMatch(/^\d{8}$/);
    expect(counterCall.update).toEqual({ last: { increment: 1 } });
    const data = tx.package.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      code: `PQ-${counterCall.where.day}-0003`,
      unitId: 'unit-1',
      courier: 'DHL',
      receivedById: 'guard-1',
    });
    expect(result).toMatchObject({
      code: 'PQ-20261107-0003',
      unit: { code: 'A-101' },
    });
  });

  it('guarda null cuando no hay guía ni observaciones', async () => {
    const { service, tx } = setup();
    await service.create(guard, { unitId: 'unit-1', courier: 'Amazon' });
    expect(tx.package.create.mock.calls[0][0].data).toMatchObject({
      trackingNumber: null,
      notes: null,
    });
  });

  it('avisa a los residentes activos de la unidad con el texto del paquete', async () => {
    const { service, prisma, notifications } = setup();
    await service.create(guard, dto);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      unitId: 'unit-1',
      role: 'RESIDENTE',
      isActive: true,
    });
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['res-1', 'res-2'] },
      title: 'Tienes un paquete en portería',
      message:
        'Llegó un paquete de DHL, guía 4581-2203 el 07/11/2026 a las 10:42. Código: PQ-20261107-0003.',
      sourceModule: 'PAQUETERIA',
      reference: { type: 'package', id: 'pkg-1' },
    });
  });

  it('el aviso no menciona la guía si el paquete no tiene', async () => {
    const { service, tx, notifications } = setup();
    tx.package.create.mockResolvedValue({
      ...createdRow,
      trackingNumber: null,
    });
    await service.create(guard, dto);
    expect(notifications.send.mock.calls[0][0].message).toBe(
      'Llegó un paquete de DHL el 07/11/2026 a las 10:42. Código: PQ-20261107-0003.',
    );
  });

  it('si el aviso falla, el paquete queda registrado igual', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(service.create(guard, dto)).resolves.toMatchObject({
      id: 'pkg-1',
    });
  });

  it('404 si la unidad no existe, sin crear nada', async () => {
    const { service, prisma, tx } = setup();
    prisma.unit.findUnique.mockResolvedValue(null);
    await expect(service.create(guard, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.package.create).not.toHaveBeenCalled();
  });

  it('409 si la unidad no tiene residentes, sin crear nada', async () => {
    const { service, prisma, tx } = setup();
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.create(guard, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.package.create).not.toHaveBeenCalled();
  });
});

describe('PackagesService.list (H19)', () => {
  it('sin filtros: página 1 de 20, la más reciente primero', async () => {
    const { service, prisma } = setup();
    prisma.package.count.mockResolvedValue(1);
    prisma.package.findMany.mockResolvedValue([createdRow]);

    const result = await service.list({});

    const args = prisma.package.findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      where: {},
      orderBy: [{ receivedAt: 'desc' }, { code: 'desc' }],
      skip: 0,
      take: 20,
    });
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(result.data[0]).toMatchObject({
      id: 'pkg-1',
      unit: { code: 'A-101' },
    });
  });

  it('combina estado, unidad, torre y búsqueda sin distinguir mayúsculas', async () => {
    const { service, prisma } = setup();
    prisma.package.count.mockResolvedValue(0);
    prisma.package.findMany.mockResolvedValue([]);

    await service.list({
      status: 'ENTREGADO',
      unitId: 'unit-1',
      towerId: 'tower-a',
      search: 'pq-2026',
      page: 3,
      pageSize: 5,
    });

    const { where, skip, take } = prisma.package.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      status: 'ENTREGADO',
      unitId: 'unit-1',
      unit: { towerId: 'tower-a' },
    });
    expect(where.OR).toEqual([
      { code: { contains: 'pq-2026', mode: 'insensitive' } },
      { trackingNumber: { contains: 'pq-2026', mode: 'insensitive' } },
      { unit: { code: { contains: 'pq-2026', mode: 'insensitive' } } },
    ]);
    expect([skip, take]).toEqual([10, 5]);
    expect(prisma.package.count.mock.calls[0][0].where).toEqual(where);
  });
});

describe('PackagesService.listMine (H20)', () => {
  const myRow = {
    id: 'pkg-9',
    code: 'PQ-20261101-0001',
    courier: 'FedEx',
    trackingNumber: null,
    notes: null,
    status: 'ENTREGADO',
    receivedAt: new Date('2026-11-01T15:00:00Z'),
    deliveredAt: new Date('2026-11-02T20:00:00Z'),
    pickedUpByName: 'Ana Gómez',
    pickedUpByDocNumber: '04567890-1',
  };

  it('usa la unidad del token, cuenta los pendientes y oculta el documento completo', async () => {
    const { service, prisma } = setup();
    prisma.package.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.package.findMany.mockResolvedValue([myRow]);

    const result = await service.listMine(resident, { status: 'ENTREGADO' });

    expect(prisma.package.count.mock.calls[0][0].where).toEqual({
      unitId: 'unit-1',
      status: 'PENDIENTE_ENTREGA',
    });
    expect(prisma.package.findMany.mock.calls[0][0]).toMatchObject({
      where: { unitId: 'unit-1', status: 'ENTREGADO' },
      skip: 0,
      take: 10,
    });
    expect(result).toMatchObject({
      pendingCount: 2,
      total: 1,
      page: 1,
      pageSize: 10,
    });
    expect(result.data[0]).toMatchObject({
      pickedUpByName: 'Ana Gómez',
      pickedUpByDocLast4: '90-1',
    });
    expect(result.data[0]).not.toHaveProperty('pickedUpByDocNumber');
    expect(result.data[0].daysWaiting).toBeGreaterThanOrEqual(0);
  });

  it('403 si el usuario no tiene unidad', async () => {
    const { service } = setup();
    await expect(
      service.listMine({ ...resident, unitId: null } as User, {
        status: 'PENDIENTE_ENTREGA',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
