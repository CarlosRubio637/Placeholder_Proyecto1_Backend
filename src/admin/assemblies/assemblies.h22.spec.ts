// class-transformer (@Type) necesita la metadata de decoradores; en la app la
// carga Nest al arrancar.
import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import type { NotificationsService } from '../../notifications/services/index.js';
import type { PrismaService } from '../../prisma/services/index.js';
import { AssembliesController } from './assemblies.controller.js';
import { AssembliesCronService } from './assemblies.cron.js';
import { AssembliesService } from './assemblies.service.js';
import {
  ASSEMBLY_MESSAGES as M,
  CreateAssemblyDto,
} from './dto/create-assembly.dto.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ENDS_AT = new Date('2026-11-10T20:00:00Z');

type AssemblyInput = { [K in keyof CreateAssemblyDto]: CreateAssemblyDto[K] };

function validDto(): AssemblyInput {
  return {
    title: 'Asamblea ordinaria',
    description: 'Presupuesto 2027',
    startsAt: iso(2 * HOUR),
    endsAt: iso(2 * HOUR + 2 * DAY),
    topics: [
      {
        question: '¿Aprobar el presupuesto?',
        options: ['A favor', 'En contra'],
      },
      { question: '¿Pintar la fachada?', options: ['Sí', 'No', 'Abstención'] },
    ],
  };
}

const row = {
  id: 'as-1',
  title: 'Asamblea ordinaria',
  description: 'Presupuesto 2027',
  status: 'PROGRAMADA',
  startsAt: new Date(),
  endsAt: new Date(),
  createdById: 'admin-1',
  topics: [],
};

function setupService() {
  const tx = {
    assembly: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue(row),
    },
    assemblyTopic: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    assembly: {
      create: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new AssembliesService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

type Row = { id: string };

function setupCron() {
  const due: { open: Row[]; close: Row[] } = {
    open: [{ id: 'as-1' }],
    close: [],
  };
  const tx = {
    assembly: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        title: 'Asamblea ordinaria',
        endsAt: ENDS_AT,
        _count: { topics: 2 },
      }),
    },
    unit: { findMany: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
    assemblyEligibleUnit: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      count: vi.fn().mockResolvedValue(2),
    },
    assemblyTopic: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 't1', options: [{ id: 'o1' }, { id: 'o2' }] },
        ]),
    },
    voteParticipation: { count: vi.fn().mockResolvedValue(1) },
    ballot: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ optionId: 'o1', _count: { _all: 1 } }]),
    },
    topicResult: { create: vi.fn().mockResolvedValue({ id: 'r1' }) },
  };
  const prisma = {
    assembly: {
      findMany: vi.fn((args: { where: { status: string } }) =>
        Promise.resolve(
          args.where.status === 'PROGRAMADA' ? due.open : due.close,
        ),
      ),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 6 }) };
  const cron = new AssembliesCronService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { cron, prisma, tx, notifications, due };
}

/** Respuesta 400 con { field, message } como la del ValidationPipe global. */
async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  const body = (error as BadRequestException).getResponse() as {
    field: string;
    message: string[];
  };
  return { field: body.field, message: body.message[0] };
}

function collect(
  errors: ValidationError[],
  parent = '',
): { path: string; messages: string[] }[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ path, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...collect(error.children ?? [], path)];
  });
}

async function checkDto(change: object) {
  const dto = plainToInstance(CreateAssemblyDto, { ...validDto(), ...change });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const found = collect(errors);
  return {
    fields: found.map((item) => item.path),
    messages: [...new Set(found.flatMap((item) => item.messages))],
  };
}

function requestAs(
  role: Role,
  handler: 'create' | 'update' | 'remove',
): ExecutionContext {
  return {
    getHandler: () => AssembliesController.prototype[handler],
    getClass: () => AssembliesController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H22. Convocatoria de asambleas con temas a votar', () => {
  it('AC5: crea la asamblea en Programada', async () => {
    const { service, prisma } = setupService();

    const result = await service.create(validDto(), 'admin-1');

    expect(prisma.assembly.create.mock.calls[0][0].data).toMatchObject({
      title: 'Asamblea ordinaria',
      createdById: 'admin-1',
    });
    expect(result).toMatchObject({ status: 'PROGRAMADA', eligibleUnits: null });
  });

  it('AC5: la tarea abre al inicio las Programadas (Programada a Abierta)', async () => {
    const { cron, prisma, tx } = setupCron();

    await cron.handleAssembliesLifecycle();

    const findArgs = prisma.assembly.findMany.mock.calls[0][0] as {
      where: { status: string; startsAt: { lte: Date } };
    };
    expect(findArgs.where.status).toBe('PROGRAMADA');
    expect(findArgs.where.startsAt.lte).toBeInstanceOf(Date);
    const claim = tx.assembly.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'as-1', status: 'PROGRAMADA' });
    expect(claim.data.status).toBe('ABIERTA');
  });

  it('AC5: la tarea cierra al cierre las Abiertas (Abierta a Cerrada)', async () => {
    const { cron, prisma, tx, due } = setupCron();
    due.open = [];
    due.close = [{ id: 'as-9' }];

    await cron.handleAssembliesLifecycle();

    const findArgs = prisma.assembly.findMany.mock.calls[1][0] as {
      where: { status: string; endsAt: { lte: Date } };
    };
    expect(findArgs.where.status).toBe('ABIERTA');
    expect(findArgs.where.endsAt.lte).toBeInstanceOf(Date);
    const claim = tx.assembly.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'as-9', status: 'ABIERTA' });
    expect(claim.data.status).toBe('CERRADA');
  });

  it('AC6: al abrir guarda como habilitadas las unidades con algún residente activo', async () => {
    const { cron, tx } = setupCron();

    await cron.handleAssembliesLifecycle();

    expect(tx.unit.findMany.mock.calls[0][0].where).toEqual({
      residents: { some: { isActive: true } },
    });
    expect(tx.assemblyEligibleUnit.createMany).toHaveBeenCalledWith({
      data: [
        { assemblyId: 'as-1', unitId: 'u1' },
        { assemblyId: 'as-1', unitId: 'u2' },
      ],
    });
  });

  it('AC6: al abrir avisa a todos los residentes con "Asamblea abierta: <título>", módulo VOTACIONES', async () => {
    const { cron, notifications } = setupCron();

    await cron.handleAssembliesLifecycle();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send.mock.calls[0][0]).toMatchObject({
      recipient: { type: 'TODOS', ids: [] },
      title: 'Asamblea abierta: Asamblea ordinaria',
      sourceModule: 'VOTACIONES',
      reference: { type: 'assembly', id: 'as-1' },
    });
  });

  it.each<[string, Partial<AssemblyInput>, string, string]>([
    [
      'un inicio a menos de 1 hora',
      { startsAt: iso(30 * 60 * 1000), endsAt: iso(DAY) },
      'startsAt',
      'El inicio debe ser al menos 1 hora después de ahora.',
    ],
    [
      'un inicio en el pasado',
      { startsAt: iso(-HOUR), endsAt: iso(DAY) },
      'startsAt',
      'El inicio debe ser al menos 1 hora después de ahora.',
    ],
    [
      'un cierre a menos de 1 hora del inicio',
      { startsAt: iso(2 * HOUR), endsAt: iso(2 * HOUR + 30 * 60 * 1000) },
      'endsAt',
      'El cierre debe estar entre 1 hora y 14 días después del inicio.',
    ],
    [
      'un cierre a más de 14 días del inicio',
      { startsAt: iso(2 * HOUR), endsAt: iso(2 * HOUR + 14 * DAY + HOUR) },
      'endsAt',
      'El cierre debe estar entre 1 hora y 14 días después del inicio.',
    ],
  ])('AC7: 400 con %s', async (_caso, change, field, message) => {
    const { service, prisma } = setupService();

    const body = await badRequestOf(
      service.create({ ...validDto(), ...change }, 'admin-1'),
    );

    expect(body).toEqual({ field, message });
    expect(prisma.assembly.create).not.toHaveBeenCalled();
  });

  it('AC7: 400 con opciones repetidas en un tema', async () => {
    const { service } = setupService();
    const dto = validDto();
    dto.topics[1].options = ['Sí', ' sí ', 'No'];

    const body = await badRequestOf(service.create(dto, 'admin-1'));

    expect(body).toEqual({ field: 'topics.1.options', message: M.options });
  });

  it.each<[string, object, string, string]>([
    ['sin temas', { topics: [] }, 'topics', M.topics],
    [
      'un tema con 1 opción',
      {
        topics: [
          { question: '¿Aprobar el presupuesto?', options: ['A favor'] },
        ],
      },
      'topics.0.options',
      M.options,
    ],
    [
      'un tema con 7 opciones',
      {
        topics: [
          {
            question: '¿Aprobar el presupuesto?',
            options: ['1', '2', '3', '4', '5', '6', '7'],
          },
        ],
      },
      'topics.0.options',
      M.options,
    ],
  ])('AC7: 400 %s', async (_caso, change, field, message) => {
    const { fields, messages } = await checkDto(change);

    expect(fields).toContain(field);
    expect(messages).toEqual([message]);
  });

  it.each(['ABIERTA', 'CERRADA'])(
    'AC8: 409 al editar una asamblea %s, sin tocar nada',
    async (status) => {
      const { service, prisma, tx } = setupService();
      prisma.assembly.findUnique.mockResolvedValue({ status });

      const error = await service
        .update('as-1', validDto())
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(
        'La asamblea ya inició; no se puede modificar.',
      );
      expect(tx.assembly.updateMany).not.toHaveBeenCalled();
    },
  );

  it('AC8: 409 al eliminar una asamblea que ya inició; solo se borra si está Programada', async () => {
    const { service, prisma } = setupService();
    prisma.assembly.deleteMany.mockResolvedValue({ count: 0 });
    prisma.assembly.findUnique.mockResolvedValue({ id: 'as-1' });

    await expect(service.remove('as-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.assembly.deleteMany).toHaveBeenCalledWith({
      where: { id: 'as-1', status: 'PROGRAMADA' },
    });
  });

  it('AC9: si otra corrida ya la abrió, no guarda unidades ni repite el aviso', async () => {
    const { cron, tx, notifications } = setupCron();
    tx.assembly.updateMany.mockResolvedValue({ count: 0 });

    await cron.handleAssembliesLifecycle();

    expect(tx.assemblyEligibleUnit.createMany).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('AC9: dos corridas en el mismo minuto: la segunda no hace nada mientras la primera sigue', async () => {
    const { cron, prisma } = setupCron();
    let release!: () => void;
    prisma.assembly.findMany.mockImplementationOnce(
      () => new Promise<Row[]>((resolve) => (release = () => resolve([]))),
    );

    const first = cron.handleAssembliesLifecycle();
    await cron.handleAssembliesLifecycle();
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(2);
  });

  describe('AC10: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<[Role, 'create' | 'update' | 'remove']>([
      ['RESIDENTE', 'create'],
      ['RESIDENTE', 'update'],
      ['RESIDENTE', 'remove'],
      ['SEGURIDAD', 'create'],
      ['SEGURIDAD', 'update'],
      ['SEGURIDAD', 'remove'],
    ])('AC10: %s recibe 403 en %s', (role, handler) => {
      expect(() => guard.canActivate(requestAs(role, handler))).toThrow(
        ForbiddenException,
      );
    });

    it('AC10: el Administrador sí convoca asambleas', () => {
      expect(guard.canActivate(requestAs('ADMINISTRADOR', 'create'))).toBe(
        true,
      );
    });
  });
});
