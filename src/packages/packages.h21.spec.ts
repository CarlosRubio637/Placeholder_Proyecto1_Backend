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
import { DeliverPackageDto, DELIVERY_MESSAGES } from './dto/index.js';
import { PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';

const NOW = new Date('2026-11-21T16:42:00Z'); // 10:42 en El Salvador
const AGENT = { id: 'guard-1', role: 'SEGURIDAD', unitId: null } as User;

const dto = {
  pickedUpByName: 'Ana López',
  pickedUpByDocType: 'DUI',
  pickedUpByDocNumber: '01234567-8',
} as DeliverPackageDto;

const deliveredRow = {
  id: 'pkg-1',
  code: 'PQ-20261121-0003',
  status: 'ENTREGADO',
  deliveredAt: NOW,
  pickedUpByName: 'Ana López',
  unitId: 'unit-a101',
  unit: { code: 'A-101' },
};

function setup() {
  const prisma = {
    package: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi
        .fn()
        .mockResolvedValue({ deliveredAt: NOW, pickedUpByName: 'Ana López' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(deliveredRow),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'res-1' }, { id: 'res-2' }]),
    },
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 2 }) };
  const service = new PackagesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications };
}

async function check(plain: object) {
  const body = plainToInstance(DeliverPackageDto, plain);
  const errors = await validate(body, {
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
    getHandler: () => PackagesController.prototype.deliver,
    getClass: () => PackagesController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H21. Entrega de paquetes en portería', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC4: pasa el paquete a Entregado con la hora del servidor, el agente y los datos de quien recogió', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { service, prisma } = setup();

    const result = await service.deliver(AGENT, 'pkg-1', dto);

    expect(prisma.package.updateMany).toHaveBeenCalledWith({
      where: { id: 'pkg-1', status: 'PENDIENTE_ENTREGA' },
      data: {
        status: 'ENTREGADO',
        deliveredAt: NOW,
        deliveredById: 'guard-1',
        pickedUpByName: 'Ana López',
        pickedUpByDocType: 'DUI',
        pickedUpByDocNumber: '01234567-8',
      },
    });
    expect(result).toEqual({
      id: 'pkg-1',
      code: 'PQ-20261121-0003',
      status: 'ENTREGADO',
      deliveredAt: NOW,
      pickedUpByName: 'Ana López',
    });
  });

  it('AC4: el pasaporte se guarda en mayúsculas', async () => {
    const { service, prisma } = setup();

    await service.deliver(AGENT, 'pkg-1', {
      ...dto,
      pickedUpByDocType: 'PASAPORTE',
      pickedUpByDocNumber: 'ab123456',
    } as DeliverPackageDto);

    expect(prisma.package.updateMany.mock.calls[0][0].data).toMatchObject({
      pickedUpByDocType: 'PASAPORTE',
      pickedUpByDocNumber: 'AB123456',
    });
  });

  it('AC5: acepta DUI y pasaporte válidos', async () => {
    expect((await check(dto)).fields).toEqual([]);
    expect(
      (
        await check({
          pickedUpByName: 'Carlos Pérez',
          pickedUpByDocType: 'PASAPORTE',
          pickedUpByDocNumber: 'AB123456',
        })
      ).fields,
    ).toEqual([]);
  });

  it.each<[string, object, string, string]>([
    [
      'sin nombre',
      { pickedUpByName: undefined },
      'pickedUpByName',
      DELIVERY_MESSAGES.name,
    ],
    [
      'nombre de 2 letras',
      { pickedUpByName: 'Al' },
      'pickedUpByName',
      DELIVERY_MESSAGES.name,
    ],
    [
      'sin tipo de documento',
      { pickedUpByDocType: undefined },
      'pickedUpByDocType',
      DELIVERY_MESSAGES.documentType,
    ],
    [
      'sin número de documento',
      { pickedUpByDocNumber: undefined },
      'pickedUpByDocNumber',
      DELIVERY_MESSAGES.dui,
    ],
    [
      'DUI con formato inválido',
      { pickedUpByDocNumber: '1234' },
      'pickedUpByDocNumber',
      DELIVERY_MESSAGES.dui,
    ],
    [
      'pasaporte de 3 caracteres',
      { pickedUpByDocType: 'PASAPORTE', pickedUpByDocNumber: 'AB1' },
      'pickedUpByDocNumber',
      DELIVERY_MESSAGES.passport,
    ],
  ])('AC5: 400 %s', async (_caso, change, field, message) => {
    const { fields, messages } = await check({ ...dto, ...change });

    expect(fields).toEqual([field]);
    expect(messages).toContain(message);
  });

  it('AC6: 409 "Este paquete ya fue entregado el <fecha> a <nombre>." si ya estaba Entregado', async () => {
    const { service, prisma } = setup();
    prisma.package.updateMany.mockResolvedValue({ count: 0 });

    const error = await service
      .deliver(AGENT, 'pkg-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(
      'Este paquete ya fue entregado el 21/11/2026 a Ana López.',
    );
    expect(prisma.package.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('AC6: si dos agentes entregan a la vez, solo se aplica la primera', async () => {
    const { service, prisma, notifications } = setup();
    prisma.package.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const otherAgent = { id: 'guard-2', role: 'SEGURIDAD' } as User;

    const [first, second] = await Promise.allSettled([
      service.deliver(AGENT, 'pkg-1', dto),
      service.deliver(otherAgent, 'pkg-1', {
        ...dto,
        pickedUpByName: 'Pedro Martínez',
      } as DeliverPackageDto),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    for (const [args] of prisma.package.updateMany.mock.calls as [
      { where: unknown },
    ][]) {
      expect(args.where).toEqual({ id: 'pkg-1', status: 'PENDIENTE_ENTREGA' });
    }
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('AC6: 404 si el paquete no existe', async () => {
    const { service, prisma } = setup();
    prisma.package.updateMany.mockResolvedValue({ count: 0 });
    prisma.package.findUnique.mockResolvedValue(null);

    const error = await service
      .deliver(AGENT, 'x', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(DELIVERY_MESSAGES.notFound);
  });

  it('AC7: avisa "Paquete entregado" a los residentes de la unidad con quién recogió, la fecha y la hora', async () => {
    const { service, prisma, notifications } = setup();

    await service.deliver(AGENT, 'pkg-1', dto);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      unitId: 'unit-a101',
      role: 'RESIDENTE',
      isActive: true,
    });
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['res-1', 'res-2'] },
      title: 'Paquete entregado',
      message:
        'El paquete PQ-20261121-0003 se entregó a Ana López el 21/11/2026 a las 10:42. Si no fuiste tú ni alguien de tu confianza, avisa a portería.',
      sourceModule: 'PAQUETERIA',
      reference: { type: 'package', id: 'pkg-1' },
    });
  });

  it('AC7: si el aviso falla, la entrega queda registrada igual', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));

    await expect(service.deliver(AGENT, 'pkg-1', dto)).resolves.toMatchObject({
      id: 'pkg-1',
      status: 'ENTREGADO',
    });
  });

  describe('AC8: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['RESIDENTE', 'ADMINISTRADOR'])(
      'AC8: %s recibe 403 al registrar una entrega',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC8: el Personal de seguridad sí registra entregas', () => {
      expect(guard.canActivate(requestAs('SEGURIDAD'))).toBe(true);
    });
  });
});
