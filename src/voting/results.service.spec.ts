import { NotFoundException } from '@nestjs/common';
import { ResultsService } from './results.service.js';
import type { PrismaService } from '@Prisma/services';

const CLOSED_AT = new Date('2026-11-18T16:10:00Z');

/** Tema con 3 opciones; `result` es el TopicResult guardado al cierre (o null). */
const topic = (change: object = {}) => ({
  id: 't1',
  question: '¿Aprobar el presupuesto?',
  options: [
    { id: 'o1', text: 'A favor' },
    { id: 'o2', text: 'En contra' },
    { id: 'o3', text: 'Abstención' },
  ],
  result: null,
  _count: { voteParticipations: 3 },
  ...change,
});

const assembly = (status: string, topics: object[] = [topic()]) => ({
  id: 'as-1',
  title: 'Asamblea ordinaria',
  status,
  closedAt: status === 'CERRADA' ? CLOSED_AT : null,
  _count: { eligibleUnits: 5 },
  topics,
});

/** Lo que guardó el cron al cerrar (topic_results). */
const storedResult = {
  eligibleUnits: 4,
  votedUnits: 3,
  totalVotes: 3,
  optionCounts: [
    { optionId: 'o1', votes: 2 },
    { optionId: 'o2', votes: 1 },
    { optionId: 'o3', votes: 0 },
  ],
  winnerOptionId: 'o1',
};

function setup() {
  const prisma = {
    assembly: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    assemblyTopic: { findUnique: vi.fn() },
    voteParticipation: { count: vi.fn(), findMany: vi.fn() },
    // Si alguien vuelve a contar los votos en vivo, este mock lo delata.
    ballot: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ optionId: 'o2', _count: { _all: 99 } }]),
    },
  };
  const service = new ResultsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('ResultsService.getResult (H24)', () => {
  it('404 si la asamblea no existe', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(null);

    const error = await service.getResult('x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe('La asamblea no existe.');
  });

  it('Abierta: solo participación; totalVotes, votes y pct en null para cualquier rol', async () => {
    const { service, prisma } = setup();
    // Aunque el tema ya tuviera un resultado guardado, no se debe mostrar.
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('ABIERTA', [topic({ result: storedResult })]),
    );

    const result = await service.getResult('as-1');
    const [tema] = result.topics;

    expect(tema).toMatchObject({
      eligibleUnits: 5,
      votedUnits: 3,
      participationPct: 60,
      totalVotes: null,
      winnerOptionId: null,
      isTie: false,
    });
    for (const option of tema.options) {
      expect(option.votes).toBeNull();
      expect(option.pct).toBeNull();
    }
    // No se consultan los votos mientras está Abierta.
    expect(prisma.ballot.groupBy).not.toHaveBeenCalled();
    // Ni un número de votos en la respuesta.
    expect(JSON.stringify(result)).not.toMatch(/"votes":\d/);
  });

  it('Programada: sin conteos y sin unidades habilitadas todavía', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('PROGRAMADA', [topic({ _count: { voteParticipations: 0 } })]),
    );

    const { topics } = await service.getResult('as-1');

    expect(topics[0]).toMatchObject({
      eligibleUnits: 0,
      votedUnits: 0,
      participationPct: 0,
      totalVotes: null,
    });
    expect(topics[0].options.every((o) => o.votes === null)).toBe(true);
  });

  it('Cerrada: los conteos son los guardados en topic_results, no un recálculo', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('CERRADA', [topic({ result: storedResult })]),
    );

    const result = await service.getResult('as-1');

    expect(result.closedAt).toEqual(CLOSED_AT);
    expect(result.topics[0]).toEqual({
      id: 't1',
      question: '¿Aprobar el presupuesto?',
      // Habilitadas al abrir (4), no las de ahora (5).
      eligibleUnits: 4,
      votedUnits: 3,
      participationPct: 75,
      totalVotes: 3,
      options: [
        { id: 'o1', text: 'A favor', votes: 2, pct: 66.7 },
        { id: 'o2', text: 'En contra', votes: 1, pct: 33.3 },
        { id: 'o3', text: 'Abstención', votes: 0, pct: 0 },
      ],
      winnerOptionId: 'o1',
      isTie: false,
    });
    expect(prisma.ballot.groupBy).not.toHaveBeenCalled();
  });

  it('Cerrada con empate: sin ganadora e isTie en true', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('CERRADA', [
        topic({
          result: {
            ...storedResult,
            totalVotes: 2,
            optionCounts: [
              { optionId: 'o1', votes: 1 },
              { optionId: 'o2', votes: 1 },
              { optionId: 'o3', votes: 0 },
            ],
            winnerOptionId: null,
          },
        }),
      ]),
    );

    const [tema] = (await service.getResult('as-1')).topics;

    expect(tema.winnerOptionId).toBeNull();
    expect(tema.isTie).toBe(true);
  });

  it('Cerrada sin votos: no es empate', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('CERRADA', [
        topic({
          _count: { voteParticipations: 0 },
          result: {
            ...storedResult,
            votedUnits: 0,
            totalVotes: 0,
            optionCounts: storedResult.optionCounts.map((c) => ({
              ...c,
              votes: 0,
            })),
            winnerOptionId: null,
          },
        }),
      ]),
    );

    const [tema] = (await service.getResult('as-1')).topics;

    expect(tema.totalVotes).toBe(0);
    expect(tema.isTie).toBe(false);
    expect(tema.options.every((o) => o.pct === 0)).toBe(true);
  });

  it('Cerrada antes de H24 (sin resultado guardado): calcula con los votos, sin guardarlo', async () => {
    const { service, prisma } = setup();
    prisma.assembly.findUnique.mockResolvedValue(assembly('CERRADA'));
    prisma.ballot.groupBy.mockResolvedValue([
      { optionId: 'o1', _count: { _all: 2 } },
      { optionId: 'o3', _count: { _all: 1 } },
    ]);

    const [tema] = (await service.getResult('as-1')).topics;

    expect(prisma.ballot.groupBy.mock.calls[0][0].where).toEqual({
      topicId: 't1',
    });
    expect(tema.totalVotes).toBe(3);
    expect(tema.options.map((o) => o.votes)).toEqual([2, 0, 1]);
    expect(tema.winnerOptionId).toBe('o1');
  });
});

describe('ResultsService.getParticipation (H24)', () => {
  it('404 si el tema no existe', async () => {
    const { service, prisma } = setup();
    prisma.assemblyTopic.findUnique.mockResolvedValue(null);

    await expect(
      service.getParticipation('x', { page: 1, pageSize: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('devuelve unidad y hora, ordenado por unidad, sin la opción elegida', async () => {
    const { service, prisma } = setup();
    const votedAt = new Date('2026-11-18T16:01:00Z');
    prisma.assemblyTopic.findUnique.mockResolvedValue({ id: 't1' });
    prisma.voteParticipation.count.mockResolvedValue(51);
    prisma.voteParticipation.findMany.mockResolvedValue([
      { votedAt, unit: { code: 'A-101' } },
    ]);

    const result = await service.getParticipation('t1', {
      page: 2,
      pageSize: 50,
    });

    expect(result).toEqual({
      data: [{ unitCode: 'A-101', votedAt }],
      total: 51,
      page: 2,
      pageSize: 50,
    });
    const args = prisma.voteParticipation.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ unit: { code: 'asc' } }]);
    expect(args.skip).toBe(50);
    expect(args.take).toBe(50);
    // Solo se leen la hora y la unidad: nunca quién votó ni qué opción.
    expect(args.select).toEqual({
      votedAt: true,
      unit: { select: { code: true } },
    });
  });
});

describe('ResultsService.findClosed (H24)', () => {
  it('solo Cerradas, la más reciente primero, 10 por página', async () => {
    const { service, prisma } = setup();
    prisma.assembly.count.mockResolvedValue(1);
    prisma.assembly.findMany.mockResolvedValue([
      { id: 'as-1', title: 'Uno', closedAt: CLOSED_AT, _count: { topics: 2 } },
    ]);

    const result = await service.findClosed({ page: 1, pageSize: 10 });

    expect(result).toEqual({
      data: [{ id: 'as-1', title: 'Uno', closedAt: CLOSED_AT, topicCount: 2 }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    const args = prisma.assembly.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: 'CERRADA' });
    expect(args.orderBy).toEqual([{ closedAt: 'desc' }, { id: 'desc' }]);
  });
});
