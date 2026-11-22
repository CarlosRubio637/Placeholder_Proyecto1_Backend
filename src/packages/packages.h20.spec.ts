import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import type { Role, User } from '@PrismaClient';
import { daysWaiting, docLast4 } from './days-waiting.js';
import { MyPackagesQueryDto } from './dto/index.js';
import { MyPackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';

const NOW = new Date('2026-11-21T16:00:00Z'); // 10:00 en El Salvador
const RESIDENT_1 = {
  id: 'res-1',
  role: 'RESIDENTE',
  unitId: 'unit-a101',
} as User;
const RESIDENT_2 = {
  id: 'res-2',
  role: 'RESIDENTE',
  unitId: 'unit-a101',
} as User;
const UNIT_UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const pendingRow = {
  id: 'pkg-2',
  code: 'PQ-20261119-0001',
  courier: 'DHL',
  trackingNumber: 'DHL-123456',
  notes: 'Caja mediana',
  status: 'PENDIENTE_ENTREGA',
  receivedAt: new Date('2026-11-19T15:00:00Z'),
  deliveredAt: null,
  pickedUpByName: null,
  pickedUpByDocNumber: null,
};

const deliveredRow = {
  id: 'pkg-1',
  code: 'PQ-20261110-0004',
  courier: 'FedEx',
  trackingNumber: null,
  notes: null,
  status: 'ENTREGADO',
  receivedAt: new Date('2026-11-10T15:00:00Z'),
  deliveredAt: new Date('2026-11-11T20:00:00Z'),
  pickedUpByName: 'Ana López',
  pickedUpByDocNumber: '01234567-8',
};

function setup() {
  const prisma = {
    package: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([pendingRow]),
    },
  };
  const service = new PackagesService(
    prisma as unknown as PrismaService,
    { send: vi.fn() } as unknown as NotificationsService,
  );
  return { service, prisma };
}

async function check(plain: object) {
  const dto = plainToInstance(MyPackagesQueryDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => MyPackagesController.prototype.listMine,
    getClass: () => MyPackagesController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H20. Mis paquetes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1: devuelve los datos de cada paquete y los días en portería por días de calendario', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { service } = setup();

    const result = await service.listMine(RESIDENT_1, {
      status: 'PENDIENTE_ENTREGA',
    });

    expect(result.data[0]).toEqual({
      id: 'pkg-2',
      code: 'PQ-20261119-0001',
      courier: 'DHL',
      trackingNumber: 'DHL-123456',
      notes: 'Caja mediana',
      receivedAt: pendingRow.receivedAt,
      daysWaiting: 2,
      deliveredAt: null,
      pickedUpByName: null,
      pickedUpByDocLast4: null,
    });
    expect(daysWaiting(new Date('2026-11-21T04:59:00Z'), NOW)).toBe(1);
    expect(daysWaiting(NOW, NOW)).toBe(0);
  });

  it('AC2: la más reciente primero, 10 por página y la cantidad de pendientes', async () => {
    const { service, prisma } = setup();
    prisma.package.count
      .mockResolvedValueOnce(3) // pendientes de la unidad
      .mockResolvedValueOnce(12); // total de la pestaña

    const result = await service.listMine(RESIDENT_1, {
      status: 'ENTREGADO',
      page: 2,
    });

    expect(prisma.package.count.mock.calls[0][0]).toEqual({
      where: { unitId: 'unit-a101', status: 'PENDIENTE_ENTREGA' },
    });
    expect(prisma.package.findMany.mock.calls[0][0]).toMatchObject({
      where: { unitId: 'unit-a101', status: 'ENTREGADO' },
      orderBy: [{ receivedAt: 'desc' }, { code: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(result).toMatchObject({
      pendingCount: 3,
      total: 12,
      page: 2,
      pageSize: 10,
    });
  });

  it('AC4: cualquier residente de la unidad ve los paquetes de su unidad', async () => {
    const { service, prisma } = setup();

    await service.listMine(RESIDENT_1, { status: 'PENDIENTE_ENTREGA' });
    await service.listMine(RESIDENT_2, { status: 'PENDIENTE_ENTREGA' });

    const wheres = prisma.package.findMany.mock.calls.map(
      ([args]) => (args as { where: unknown }).where,
    );
    expect(wheres).toEqual([
      { unitId: 'unit-a101', status: 'PENDIENTE_ENTREGA' },
      { unitId: 'unit-a101', status: 'PENDIENTE_ENTREGA' },
    ]);
  });

  it('AC5: de quien recogió solo devuelve los últimos 4 caracteres del documento', async () => {
    const { service, prisma } = setup();
    prisma.package.findMany.mockResolvedValue([deliveredRow]);

    const result = await service.listMine(RESIDENT_1, { status: 'ENTREGADO' });

    expect(result.data[0]).toMatchObject({
      pickedUpByName: 'Ana López',
      pickedUpByDocLast4: '67-8',
    });
    expect(result.data[0]).not.toHaveProperty('pickedUpByDocNumber');
    expect(JSON.stringify(result)).not.toContain('01234567-8');
  });

  it('AC5: docLast4 recorta pasaportes y devuelve null sin documento', () => {
    expect(docLast4('C1112223')).toBe('2223');
    expect(docLast4(null)).toBeNull();
  });

  it('AC6: 400 si la consulta trae unitId; la unidad sale del token', async () => {
    expect(
      await check({ status: 'PENDIENTE_ENTREGA', unitId: UNIT_UUID }),
    ).toEqual(['unitId']);
    expect(await check({ status: 'ENTREGADO' })).toEqual([]);
    expect(await check({})).toEqual(['status']);
  });

  it('AC6: un usuario sin unidad recibe 403 y no se consulta nada', async () => {
    const { service, prisma } = setup();

    await expect(
      service.listMine({ ...RESIDENT_1, unitId: null } as User, {
        status: 'PENDIENTE_ENTREGA',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.package.findMany).not.toHaveBeenCalled();
  });

  describe('AC7: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
      'AC7: %s recibe 403 en Mis paquetes',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC7: el Residente sí consulta sus paquetes', () => {
      expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
    });
  });
});
