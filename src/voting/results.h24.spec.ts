import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import type { Role } from '@PrismaClient';
import { AssembliesCronService } from '../admin/assemblies/assemblies.cron.js';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';
import { pct } from './results.utils.js';

const CLOSED_AT = new Date('2026-11-18T16:10:00Z');

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

/** Lo que guardó la tarea al cerrar (topic_results). */
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

function setupResults() {
  const prisma = {
    assembly: { findUnique: vi.fn() },
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

function setupCierre() {
  const tx = {
    assembly: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    assemblyEligibleUnit: { count: vi.fn().mockResolvedValue(4) },
    assemblyTopic: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 't1', options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }] },
        ]),
    },
    voteParticipation: { count: vi.fn().mockResolvedValue(3) },
    ballot: {
      groupBy: vi.fn().mockResolvedValue([
        { optionId: 'o1', _count: { _all: 2 } },
        { optionId: 'o2', _count: { _all: 1 } },
      ]),
    },
    topicResult: { create: vi.fn().mockResolvedValue({ id: 'r1' }) },
  };
  const prisma = {
    assembly: {
      findMany: vi.fn((args: { where: { status: string } }) =>
        Promise.resolve(
          args.where.status === 'ABIERTA' ? [{ id: 'as-9' }] : [],
        ),
      ),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const cron = new AssembliesCronService(
    prisma as unknown as PrismaService,
    { send: vi.fn() } as unknown as NotificationsService,
  );
  return { cron, tx };
}

function requestAs(
  role: Role,
  handler: 'getResult' | 'getParticipation',
): ExecutionContext {
  return {
    getHandler: () => ResultsController.prototype[handler],
    getClass: () => ResultsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H24. Resultado auditable de la asamblea', () => {
  it('AC1: devuelve votos y porcentaje por opción, total, habilitadas, votantes, participación y ganadora', async () => {
    const { service, prisma } = setupResults();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('CERRADA', [topic({ result: storedResult })]),
    );

    const result = await service.getResult('as-1');

    expect(result.topics[0]).toEqual({
      id: 't1',
      question: '¿Aprobar el presupuesto?',
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
  });

  it('AC1: con empate no hay ganadora e isTie es true', async () => {
    const { service, prisma } = setupResults();
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

    const { topics } = await service.getResult('as-1');

    expect(topics[0]).toMatchObject({ winnerOptionId: null, isTie: true });
  });

  it('AC2: el registro de participación lista unidad y hora, por código, 50 por página, sin la opción', async () => {
    const { service, prisma } = setupResults();
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
    expect([args.skip, args.take]).toEqual([50, 50]);
    expect(args.select).toEqual({
      votedAt: true,
      unit: { select: { code: true } },
    });
  });

  it('AC4: al cerrar calcula y guarda el resultado de cada tema en la misma transacción', async () => {
    const { cron, tx } = setupCierre();

    await cron.handleAssembliesLifecycle();

    const data = tx.topicResult.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      topicId: 't1',
      eligibleUnits: 4,
      votedUnits: 3,
      totalVotes: 3,
      optionCounts: [
        { optionId: 'o1', votes: 2 },
        { optionId: 'o2', votes: 1 },
        { optionId: 'o3', votes: 0 },
      ],
      winnerOptionId: 'o1',
    });
    expect(data.computedAt).toEqual(
      tx.assembly.updateMany.mock.calls[0][0].data.closedAt,
    );
  });

  it('AC4: los porcentajes van con un decimal', () => {
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(7, 11)).toBe(63.6);
    expect(pct(0, 0)).toBe(0);
  });

  it('AC5: el resultado de una Cerrada sale de lo guardado al cierre, no de un recálculo', async () => {
    const { service, prisma } = setupResults();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('CERRADA', [topic({ result: storedResult })]),
    );

    const result = await service.getResult('as-1');

    expect(prisma.ballot.groupBy).not.toHaveBeenCalled();
    expect(result.topics[0].options[1].votes).toBe(1);
  });

  it('AC5: no hay endpoint para modificar el resultado (solo consultas GET)', () => {
    const handlers = Object.getOwnPropertyNames(
      ResultsController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(handlers.sort()).toEqual(['getParticipation', 'getResult']);
  });

  it('AC6: mientras está Abierta no devuelve conteos por opción, ni al Administrador', async () => {
    const { service, prisma } = setupResults();
    prisma.assembly.findUnique.mockResolvedValue(
      assembly('ABIERTA', [topic({ result: storedResult })]),
    );

    const result = await service.getResult('as-1');
    const [tema] = result.topics;

    expect(tema).toMatchObject({
      eligibleUnits: 5,
      votedUnits: 3,
      totalVotes: null,
      winnerOptionId: null,
    });
    expect(tema.options.every((o) => o.votes === null && o.pct === null)).toBe(
      true,
    );
    expect(prisma.ballot.groupBy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/"votes":\d/);
  });

  describe('AC7: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<'getResult' | 'getParticipation'>([
      'getResult',
      'getParticipation',
    ])('AC7: SEGURIDAD recibe 403 en %s', (handler) => {
      expect(() => guard.canActivate(requestAs('SEGURIDAD', handler))).toThrow(
        ForbiddenException,
      );
    });

    it.each<Role>(['ADMINISTRADOR', 'RESIDENTE'])(
      'AC7: %s sí ve el resultado',
      (role) => {
        expect(guard.canActivate(requestAs(role, 'getResult'))).toBe(true);
      },
    );
  });
});
