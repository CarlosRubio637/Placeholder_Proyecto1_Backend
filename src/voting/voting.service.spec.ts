import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { VOTING_MESSAGES, VotingService } from './voting.service.js';
import type { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';

const resident = { id: 'user-1', unitId: 'unit-1' } as User;
const VOTED_AT = new Date('2026-11-08T15:00:00Z');

const openTopic = (change: object = {}) => ({
  id: 'topic-1',
  options: [{ id: 'opt-1' }, { id: 'opt-2' }],
  assembly: {
    id: 'as-1',
    status: 'ABIERTA',
    eligibleUnits: [{ unitId: 'unit-1' }],
  },
  ...change,
});

function setup() {
  const tx = {
    voteParticipation: {
      create: vi.fn().mockResolvedValue({
        topicId: 'topic-1',
        votedAt: VOTED_AT,
      }),
    },
    ballot: { create: vi.fn().mockResolvedValue({ id: 'ballot-1' }) },
  };
  const prisma = {
    assembly: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    assemblyTopic: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(openTopic()),
    },
    voteParticipation: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new VotingService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

const uniqueViolation = () =>
  Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('VotingService.vote (H23)', () => {
  const dto = { optionId: 'opt-2' };

  it('registra participación y voto en una sola transacción', async () => {
    const { service, prisma, tx } = setup();

    const result = await service.vote(resident, 'topic-1', dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.voteParticipation.create.mock.calls[0][0].data).toEqual({
      topicId: 'topic-1',
      unitId: 'unit-1',
      userId: 'user-1',
    });
    expect(result).toEqual({ topicId: 'topic-1', votedAt: VOTED_AT });
  });

  it('voto secreto: el Ballot solo guarda tema y opción', async () => {
    const { service, tx } = setup();
    await service.vote(resident, 'topic-1', dto);
    expect(tx.ballot.create).toHaveBeenCalledWith({
      data: { topicId: 'topic-1', optionId: 'opt-2' },
    });
  });

  it('la respuesta no revela la opción elegida', async () => {
    const { service } = setup();
    const result = await service.vote(resident, 'topic-1', dto);
    expect(result).not.toHaveProperty('optionId');
    expect(JSON.stringify(result)).not.toContain('opt-2');
  });

  it('inserta primero la participación, que es la que frena el doble voto', async () => {
    const { service, tx } = setup();
    await service.vote(resident, 'topic-1', dto);
    expect(
      tx.voteParticipation.create.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.ballot.create.mock.invocationCallOrder[0]);
  });

  it('409 si la unidad ya votó, sin guardar un segundo voto', async () => {
    const { service, tx } = setup();
    tx.voteParticipation.create.mockRejectedValue(uniqueViolation());

    const error = await service
      .vote(resident, 'topic-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe('Tu unidad ya votó este tema.');
    expect(tx.ballot.create).not.toHaveBeenCalled();
  });

  it('otros errores de base no se disfrazan de "ya votó"', async () => {
    const { service, tx } = setup();
    tx.ballot.create.mockRejectedValue(new Error('conexión perdida'));

    await expect(service.vote(resident, 'topic-1', dto)).rejects.toThrow(
      'conexión perdida',
    );
  });

  it('404 si el tema no existe', async () => {
    const { service, prisma, tx } = setup();
    prisma.assemblyTopic.findUnique.mockResolvedValue(null);

    await expect(service.vote(resident, 'x', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.voteParticipation.create).not.toHaveBeenCalled();
  });

  it('400 con el campo si la opción no pertenece al tema', async () => {
    const { service, tx } = setup();

    const error = await service
      .vote(resident, 'topic-1', { optionId: 'de-otro-tema' })
      .catch((e: { getResponse: () => unknown }) => e.getResponse());

    expect(error).toMatchObject({
      statusCode: 400,
      field: 'optionId',
      message: ['La opción no pertenece a este tema.'],
    });
    expect(tx.voteParticipation.create).not.toHaveBeenCalled();
  });

  it.each(['PROGRAMADA', 'CERRADA'])(
    '409 si la asamblea está %s',
    async (status) => {
      const { service, prisma, tx } = setup();
      prisma.assemblyTopic.findUnique.mockResolvedValue(
        openTopic({
          assembly: { ...openTopic().assembly, status },
        }),
      );

      const error = await service
        .vote(resident, 'topic-1', dto)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe('La votación no está abierta.');
      expect(tx.voteParticipation.create).not.toHaveBeenCalled();
    },
  );

  it('403 si la unidad no está habilitada', async () => {
    const { service, prisma, tx } = setup();
    prisma.assemblyTopic.findUnique.mockResolvedValue(
      openTopic({ assembly: { ...openTopic().assembly, eligibleUnits: [] } }),
    );

    const error = await service
      .vote(resident, 'topic-1', dto)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as Error).message).toBe(
      'Tu unidad no está habilitada para esta asamblea.',
    );
    expect(tx.voteParticipation.create).not.toHaveBeenCalled();
  });

  it('solo pregunta por la habilitación de la unidad del residente', async () => {
    const { service, prisma } = setup();
    await service.vote(resident, 'topic-1', dto);
    const args = prisma.assemblyTopic.findUnique.mock.calls[0][0];
    expect(args.include.assembly.select.eligibleUnits.where).toEqual({
      unitId: 'unit-1',
    });
  });

  it('403 si la cuenta no tiene unidad, sin consultar nada', async () => {
    const { service, prisma } = setup();
    await expect(
      service.vote({ ...resident, unitId: null }, 'topic-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.assemblyTopic.findUnique).not.toHaveBeenCalled();
  });
});

describe('VotingService.findActive (H23)', () => {
  it('lista solo las Abiertas donde la unidad está habilitada, cierre más cercano primero', async () => {
    const { service, prisma } = setup();

    await expect(service.findActive(resident)).resolves.toEqual({ data: [] });

    expect(prisma.assembly.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        status: 'ABIERTA',
        eligibleUnits: { some: { unitId: 'unit-1' } },
      },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    });
    expect(prisma.voteParticipation.groupBy).not.toHaveBeenCalled();
  });

  it('cuenta por asamblea los temas que votó esa unidad', async () => {
    const { service, prisma } = setup();
    const endsAt = new Date('2026-11-10T20:00:00Z');
    prisma.assembly.findMany.mockResolvedValue([
      { id: 'as-1', title: 'Uno', endsAt, _count: { topics: 3 } },
      { id: 'as-2', title: 'Dos', endsAt, _count: { topics: 1 } },
    ]);
    prisma.assemblyTopic.findMany.mockResolvedValue([
      { id: 't1', assemblyId: 'as-1' },
      { id: 't2', assemblyId: 'as-1' },
      { id: 't3', assemblyId: 'as-1' },
      { id: 't4', assemblyId: 'as-2' },
    ]);
    prisma.voteParticipation.groupBy.mockResolvedValue([
      { topicId: 't1' },
      { topicId: 't3' },
    ]);

    const { data } = await service.findActive(resident);

    expect(data).toEqual([
      { id: 'as-1', title: 'Uno', endsAt, topicCount: 3, votedTopics: 2 },
      { id: 'as-2', title: 'Dos', endsAt, topicCount: 1, votedTopics: 0 },
    ]);
    expect(prisma.voteParticipation.groupBy.mock.calls[0][0].where.unitId).toBe(
      'unit-1',
    );
  });

  it('403 si la cuenta no tiene unidad', async () => {
    const { service } = setup();
    await expect(
      service.findActive({ ...resident, unitId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('VotingService.findOne (H23)', () => {
  const assembly = (voteParticipations: object[]) => ({
    id: 'as-1',
    title: 'Asamblea',
    description: null,
    status: 'ABIERTA',
    endsAt: new Date('2026-11-10T20:00:00Z'),
    createdById: 'admin-1',
    topics: [
      {
        id: 't1',
        question: '¿Aprobar?',
        order: 1,
        options: [{ id: 'o1', text: 'Sí', order: 1, topicId: 't1' }],
        voteParticipations,
      },
    ],
  });

  it('404 sin revelar si existe cuando la unidad no está habilitada', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findFirst.mockResolvedValue(null);

    const error = await service
      .findOne(resident, 'as-1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(VOTING_MESSAGES.assemblyNotFound);
    expect(prisma.assembly.findFirst.mock.calls[0][0].where).toEqual({
      id: 'as-1',
      eligibleUnits: { some: { unitId: 'unit-1' } },
    });
  });

  it('solo trae participaciones de su unidad y nunca los votos', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findFirst.mockResolvedValue(assembly([]));

    await service.findOne(resident, 'as-1');

    const topics = prisma.assembly.findFirst.mock.calls[0][0].include.topics;
    expect(topics.include.voteParticipations).toEqual({
      where: { unitId: 'unit-1' },
      select: { votedAt: true, userId: true },
    });
    expect(topics.include).not.toHaveProperty('ballots');
  });

  it('myUnitVote es null si la unidad no ha votado', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findFirst.mockResolvedValue(assembly([]));

    const result = await service.findOne(resident, 'as-1');

    expect(result.topics[0].myUnitVote).toBeNull();
    expect(result.topics[0].options).toEqual([{ id: 'o1', text: 'Sí' }]);
    expect(result).not.toHaveProperty('createdById');
  });

  it.each([
    ['el mismo residente', 'user-1', true],
    ['otro residente de la unidad', 'user-2', false],
  ])('si votó %s, byMe es %s', async (_caso, userId, byMe) => {
    const { service, prisma } = setup();
    prisma.assembly.findFirst.mockResolvedValue(
      assembly([{ votedAt: VOTED_AT, userId }]),
    );

    const result = await service.findOne(resident, 'as-1');

    // Exacto: ni la opción ni quién votó salen en la respuesta.
    expect(result.topics[0].myUnitVote).toEqual({ votedAt: VOTED_AT, byMe });
  });
});
