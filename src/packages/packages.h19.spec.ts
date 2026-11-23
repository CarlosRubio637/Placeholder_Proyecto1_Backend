import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import type { Role, User } from '@PrismaClient';
import { CreatePackageDto } from './dto/index.js';
import { PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';
import { packageCode } from './packages.utils.js';

const NOW = new Date('2026-11-21T16:42:00Z'); // 10:42 en El Salvador
const GUARD = { id: 'guard-1', role: 'SEGURIDAD', unitId: null } as User;
const UNIT_UUID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

const createdRow = {
  id: 'pkg-1',
  code: 'PQ-20261121-0003',
  courier: 'DHL',
  trackingNumber: 'DHL-123456',
  notes: 'Caja mediana',
  status: 'PENDIENTE_ENTREGA',
  receivedAt: NOW,
  unit: { id: 'unit-a101', code: 'A-101' },
};

function setup() {
  const tx = {
    packageCounter: {
      upsert: vi.fn().mockResolvedValue({ day: '20261121', last: 3 }),
    },
    package: { create: vi.fn().mockResolvedValue(createdRow) },
  };
  const prisma = {
    unit: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve<{ id: string } | null>({ id: where.id }),
      ),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'res-1' }, { id: 'res-2' }]),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new PackagesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, tx, notifications };
}

async function check(plain: object) {
  const dto = plainToInstance(CreatePackageDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    fields: errors.map((error) => error.property),
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => PackagesController.prototype.create,
    getClass: () => PackagesController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H19. Registro de llegada de paquetes', () => {
  const dto = {
    unitId: 'unit-a101',
    courier: 'DHL',
    trackingNumber: 'DHL-123456',
    notes: 'Caja mediana',
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC4: crea el paquete Pendiente con código PQ-AAAAMMDD-NNNN, la hora del servidor y el agente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { service, tx } = setup();

    const result = await service.create(GUARD, dto);

    expect(tx.packageCounter.upsert.mock.calls[0][0]).toMatchObject({
      where: { day: '20261121' },
      update: { last: { increment: 1 } },
    });
    expect(tx.package.create.mock.calls[0][0].data).toEqual({
      code: 'PQ-20261121-0003',
      unitId: 'unit-a101',
      courier: 'DHL',
      trackingNumber: 'DHL-123456',
      notes: 'Caja mediana',
      receivedAt: NOW,
      receivedById: 'guard-1',
    });
    expect(result).toMatchObject({
      code: 'PQ-20261121-0003',
      status: 'PENDIENTE_ENTREGA',
      unit: { code: 'A-101' },
    });
  });

  it('AC4: el código usa el contador del día con 4 dígitos', () => {
    expect(packageCode('20261121', 7)).toBe('PQ-20261121-0007');
    expect(packageCode('20261121', 1234)).toBe('PQ-20261121-1234');
  });

  it('AC4: guía y observaciones vacías se guardan como null', async () => {
    const { service, tx } = setup();

    await service.create(GUARD, { unitId: 'unit-a101', courier: 'Amazon' });

    expect(tx.package.create.mock.calls[0][0].data).toMatchObject({
      trackingNumber: null,
      notes: null,
    });
  });

  it('AC5: identifica la unidad por su unitId; A-101 y B-101 no se confunden', async () => {
    const { service, prisma, tx } = setup();

    await service.create(GUARD, { ...dto, unitId: 'unit-a101' });
    await service.create(GUARD, { ...dto, unitId: 'unit-b101' });

    expect(
      prisma.unit.findUnique.mock.calls.map(([args]) => args.where),
    ).toEqual([{ id: 'unit-a101' }, { id: 'unit-b101' }]);
    expect(
      tx.package.create.mock.calls.map(([args]) => args.data.unitId),
    ).toEqual(['unit-a101', 'unit-b101']);
  });

  it('AC6: 404 "La unidad no existe." sin crear nada', async () => {
    const { service, prisma, tx } = setup();
    prisma.unit.findUnique.mockResolvedValue(null);

    const error = await service.create(GUARD, dto).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('La unidad no existe.');
    expect(tx.package.create).not.toHaveBeenCalled();
  });

  it('AC6: 409 "La unidad no tiene residentes registrados." sin crear nada', async () => {
    const { service, prisma, tx } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    const error = await service.create(GUARD, dto).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'La unidad no tiene residentes registrados.',
    );
    expect(tx.package.create).not.toHaveBeenCalled();
  });

  it.each<[string, object, string, string]>([
    [
      'sin unidad',
      { unitId: undefined },
      'unitId',
      'Selecciona la unidad destino.',
    ],
    [
      'sin empresa',
      { courier: undefined },
      'courier',
      'Ingresa la empresa de mensajería (2 a 40 caracteres).',
    ],
    [
      'empresa de 41 caracteres',
      { courier: 'x'.repeat(41) },
      'courier',
      'Ingresa la empresa de mensajería (2 a 40 caracteres).',
    ],
    [
      'guía con caracteres no permitidos',
      { trackingNumber: 'ab#1' },
      'trackingNumber',
      'La guía solo admite letras, números y guiones (4 a 40).',
    ],
    [
      'guía de 3 caracteres',
      { trackingNumber: 'AB1' },
      'trackingNumber',
      'La guía solo admite letras, números y guiones (4 a 40).',
    ],
    [
      'observaciones de 201 caracteres',
      { notes: 'x'.repeat(201) },
      'notes',
      'Las observaciones no pueden superar los 200 caracteres.',
    ],
  ])('AC6: 400 %s', async (_caso, change, field, message) => {
    const { fields, messages } = await check({
      unitId: UNIT_UUID,
      courier: 'DHL',
      ...change,
    });

    expect(fields).toEqual([field]);
    expect(messages).toContain(message);
  });

  it('AC7: avisa a los residentes activos de la unidad con el título, la empresa, la guía y el código', async () => {
    const { service, prisma, notifications } = setup();

    await service.create(GUARD, dto);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      unitId: 'unit-a101',
      role: 'RESIDENTE',
      isActive: true,
    });
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['res-1', 'res-2'] },
      title: 'Tienes un paquete en portería',
      message:
        'Llegó un paquete de DHL, guía DHL-123456 el 21/11/2026 a las 10:42. Código: PQ-20261121-0003.',
      sourceModule: 'PAQUETERIA',
      reference: { type: 'package', id: 'pkg-1' },
    });
  });

  it('AC7: si el aviso falla, el paquete queda registrado igual', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));

    await expect(service.create(GUARD, dto)).resolves.toMatchObject({
      id: 'pkg-1',
    });
  });

  describe('AC8: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['RESIDENTE', 'ADMINISTRADOR'])(
      'AC8: %s recibe 403 al registrar un paquete',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC8: el Personal de seguridad sí registra paquetes', () => {
      expect(guard.canActivate(requestAs('SEGURIDAD'))).toBe(true);
    });
  });
});
