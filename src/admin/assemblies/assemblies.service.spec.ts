import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AssembliesService } from './assemblies.service.js';
import type { CreateAssemblyDto } from './dto/create-assembly.dto.js';
import type { PrismaService } from '../../prisma/services/index.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** Copia plana del DTO (no una instancia de clase) para armar variantes con spread. */
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
  topics: [
    {
      id: 't1',
      question: '¿Aprobar el presupuesto?',
      options: [
        { id: 'o1', text: 'A favor' },
        { id: 'o2', text: 'En contra' },
      ],
    },
  ],
};

function setup() {
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
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new AssembliesService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

/**
 * Respuesta 400 con { field, message }. `message` es una lista, igual que la
 * del ValidationPipe global; se devuelve su único mensaje.
 */
async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  const body = (error as BadRequestException).getResponse() as {
    statusCode: number;
    error: string;
    field: string;
    message: string[];
  };
  expect(body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  expect(body.message).toHaveLength(1);
  return { field: body.field, message: body.message[0] };
}

describe('AssembliesService.create (H22)', () => {
  it('crea la asamblea con temas y opciones numerados en orden', async () => {
    const { service, prisma } = setup();

    const result = await service.create(validDto(), 'admin-1');

    const data = prisma.assembly.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: 'Asamblea ordinaria',
      createdById: 'admin-1',
    });
    expect(data.startsAt).toBeInstanceOf(Date);
    expect(data.topics.create).toEqual([
      {
        order: 1,
        question: '¿Aprobar el presupuesto?',
        options: {
          create: [
            { order: 1, text: 'A favor' },
            { order: 2, text: 'En contra' },
          ],
        },
      },
      {
        order: 2,
        question: '¿Pintar la fachada?',
        options: {
          create: [
            { order: 1, text: 'Sí' },
            { order: 2, text: 'No' },
            { order: 3, text: 'Abstención' },
          ],
        },
      },
    ]);
    // Programada: las unidades habilitadas todavía no se fijan.
    expect(result).toMatchObject({
      id: 'as-1',
      status: 'PROGRAMADA',
      eligibleUnits: null,
    });
    expect(result).not.toHaveProperty('createdById');
  });

  it('una descripción vacía se guarda como null', async () => {
    const { service, prisma } = setup();
    await service.create({ ...validDto(), description: '' }, 'admin-1');
    expect(prisma.assembly.create.mock.calls[0][0].data.description).toBeNull();
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
      'un cierre igual al inicio',
      { startsAt: iso(2 * HOUR), endsAt: iso(2 * HOUR) },
      'endsAt',
      'El cierre debe estar entre 1 hora y 14 días después del inicio.',
    ],
    [
      'un cierre a más de 14 días del inicio',
      { startsAt: iso(2 * HOUR), endsAt: iso(2 * HOUR + 14 * DAY + HOUR) },
      'endsAt',
      'El cierre debe estar entre 1 hora y 14 días después del inicio.',
    ],
  ])('rechaza %s con 400 y el campo', async (_caso, change, field, message) => {
    const { service, prisma } = setup();
    const body = await badRequestOf(
      service.create({ ...validDto(), ...change }, 'admin-1'),
    );
    expect(body).toMatchObject({ field, message });
    expect(prisma.assembly.create).not.toHaveBeenCalled();
  });

  it('acepta exactamente 14 días de duración', async () => {
    const { service } = setup();
    const start = 2 * HOUR;
    await expect(
      service.create(
        { ...validDto(), startsAt: iso(start), endsAt: iso(start + 14 * DAY) },
        'admin-1',
      ),
    ).resolves.toBeTruthy();
  });

  it('rechaza opciones repetidas en un tema sin importar mayúsculas ni espacios', async () => {
    const { service } = setup();
    const dto = validDto();
    dto.topics[1].options = ['Sí', ' sí ', 'No'];
    const body = await badRequestOf(service.create(dto, 'admin-1'));
    expect(body).toMatchObject({
      field: 'topics.1.options',
      message: 'Cada tema necesita entre 2 y 6 opciones distintas.',
    });
  });

  it('la misma opción en temas distintos sí se permite', async () => {
    const { service } = setup();
    const dto = validDto();
    dto.topics[1].options = ['A favor', 'En contra'];
    await expect(service.create(dto, 'admin-1')).resolves.toBeTruthy();
  });
});

describe('AssembliesService.findAll (H22)', () => {
  it('pagina, ordena por inicio y devuelve la cantidad de temas', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findMany.mockResolvedValue([
      { ...row, _count: { topics: 3 } },
    ]);
    prisma.assembly.count.mockResolvedValue(11);

    const result = await service.findAll({
      page: 2,
      pageSize: 10,
      status: 'PROGRAMADA',
    });

    expect(prisma.assembly.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PROGRAMADA' },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(result).toMatchObject({ total: 11, page: 2, pageSize: 10 });
    expect(result.data[0]).toMatchObject({
      id: 'as-1',
      topicCount: 3,
      votedUnits: 0,
    });
  });
});

describe('AssembliesService.findOne (H22)', () => {
  it('404 si no existe', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('eligibleUnits es null mientras está Programada y el conteo después de abrir', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue({
      ...row,
      _count: { eligibleUnits: 6 },
    });
    expect((await service.findOne('as-1')).eligibleUnits).toBeNull();

    prisma.assembly.findUnique.mockResolvedValue({
      ...row,
      status: 'ABIERTA',
      _count: { eligibleUnits: 6 },
    });
    expect((await service.findOne('as-1')).eligibleUnits).toBe(6);
  });
});

describe('AssembliesService.update (H22)', () => {
  it('reemplaza datos, temas y opciones condicionado por el estado Programada', async () => {
    const { service, prisma, tx } = setup();
    prisma.assembly.findUnique.mockResolvedValue({ status: 'PROGRAMADA' });

    await service.update('as-1', validDto());

    expect(tx.assembly.updateMany.mock.calls[0][0].where).toEqual({
      id: 'as-1',
      status: 'PROGRAMADA',
    });
    expect(tx.assemblyTopic.deleteMany).toHaveBeenCalledWith({
      where: { assemblyId: 'as-1' },
    });
    expect(tx.assembly.update.mock.calls[0][0].data.topics.create).toHaveLength(
      2,
    );
  });

  it('404 si no existe', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(null);
    await expect(service.update('x', validDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['ABIERTA', 'CERRADA'])(
    '409 si está %s, sin tocar nada',
    async (status) => {
      const { service, prisma, tx } = setup();
      prisma.assembly.findUnique.mockResolvedValue({ status });
      await expect(service.update('as-1', validDto())).rejects.toThrow(
        'La asamblea ya inició; no se puede modificar.',
      );
      expect(tx.assembly.updateMany).not.toHaveBeenCalled();
    },
  );

  it('409 si la tarea la abrió justo antes de guardar (carrera), sin borrar temas', async () => {
    const { service, prisma, tx } = setup();
    prisma.assembly.findUnique.mockResolvedValue({ status: 'PROGRAMADA' });
    tx.assembly.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.update('as-1', validDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.assemblyTopic.deleteMany).not.toHaveBeenCalled();
  });

  it('valida fechas y opciones también al editar', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue({ status: 'PROGRAMADA' });
    const body = await badRequestOf(
      service.update('as-1', { ...validDto(), startsAt: iso(-HOUR) }),
    );
    expect(body.field).toBe('startsAt');
  });
});

describe('AssembliesService.remove (H22)', () => {
  it('borra solo si está Programada', async () => {
    const { service, prisma } = setup();
    prisma.assembly.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove('as-1')).resolves.toBeUndefined();
    expect(prisma.assembly.deleteMany).toHaveBeenCalledWith({
      where: { id: 'as-1', status: 'PROGRAMADA' },
    });
  });

  it('404 si no existe', async () => {
    const { service, prisma } = setup();
    prisma.assembly.deleteMany.mockResolvedValue({ count: 0 });
    prisma.assembly.findUnique.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si existe pero ya inició', async () => {
    const { service, prisma } = setup();
    prisma.assembly.deleteMany.mockResolvedValue({ count: 0 });
    prisma.assembly.findUnique.mockResolvedValue({ id: 'as-1' });
    await expect(service.remove('as-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
