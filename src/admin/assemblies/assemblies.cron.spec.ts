import { AssembliesCronService } from './assemblies.cron.js';
import type { NotificationsService } from '../../notifications/services/index.js';
import type { PrismaService } from '../../prisma/services/index.js';

const ENDS_AT = new Date('2026-11-10T20:00:00Z'); // 10 nov, 2:00 p. m. en El Salvador

type Row = { id: string };

/**
 * `prisma.assembly.findMany` se usa dos veces por corrida: primero busca las
 * Programadas por abrir y luego (H24) las Abiertas por cerrar. Cada test fija
 * qué devuelve cada búsqueda con `due.open` y `due.close`.
 */
function setup() {
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
      count: vi.fn().mockResolvedValue(4),
    },
    assemblyTopic: {
      findMany: vi.fn().mockResolvedValue([
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
        Promise.resolve(args.where.status === 'PROGRAMADA' ? due.open : due.close),
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

describe('AssembliesCronService: apertura (H22)', () => {
  it('abre las asambleas que ya iniciaron, condicionado por el estado Programada', async () => {
    const { cron, prisma, tx } = setup();

    await cron.handleAssembliesLifecycle();

    const findArgs = prisma.assembly.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe('PROGRAMADA');
    expect((findArgs.where as unknown as { startsAt: { lte: Date } }).startsAt.lte).toBeInstanceOf(Date);
    const claim = tx.assembly.updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: 'as-1', status: 'PROGRAMADA' });
    expect(claim.data.status).toBe('ABIERTA');
    expect(claim.data.openedAt).toBeInstanceOf(Date);
  });

  it('guarda como habilitadas las unidades con algún residente activo', async () => {
    const { cron, tx } = setup();
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

  it('avisa a todos los residentes con el texto de H22', async () => {
    const { cron, notifications } = setup();
    await cron.handleAssembliesLifecycle();

    const input = notifications.send.mock.calls[0][0];
    expect(input).toMatchObject({
      recipient: { type: 'TODOS', ids: [] },
      title: 'Asamblea abierta: Asamblea ordinaria',
      sourceModule: 'VOTACIONES',
      reference: { type: 'assembly', id: 'as-1' },
    });
    expect(input.message).toMatch(
      /^Ya puedes votar 2 temas hasta el 10 de noviembre de 2026/,
    );
  });

  it('si otra corrida ya la abrió (count 0), no guarda unidades ni avisa otra vez', async () => {
    const { cron, tx, notifications } = setup();
    tx.assembly.updateMany.mockResolvedValue({ count: 0 });

    await cron.handleAssembliesLifecycle();

    expect(tx.assemblyEligibleUnit.createMany).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('recorta el título del aviso a 100 caracteres (límite de H30)', async () => {
    const { cron, tx, notifications } = setup();
    tx.assembly.findUniqueOrThrow.mockResolvedValue({
      title: 'x'.repeat(100),
      endsAt: ENDS_AT,
      _count: { topics: 1 },
    });

    await cron.handleAssembliesLifecycle();

    const title: string = notifications.send.mock.calls[0][0].title;
    expect(title).toHaveLength(100);
    expect(title.startsWith('Asamblea abierta: ')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
  });

  it('si el aviso falla, la asamblea queda abierta y la corrida sigue con el cierre', async () => {
    const { cron, prisma, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));

    await expect(cron.handleAssembliesLifecycle()).resolves.toBeUndefined();
    // La segunda búsqueda es la de asambleas por cerrar.
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.assembly.findMany.mock.calls[1][0].where.status).toBe('ABIERTA');
  });

  it('un error al abrir una asamblea no impide abrir las demás', async () => {
    const { cron, tx, notifications, due } = setup();
    due.open = [{ id: 'falla' }, { id: 'as-2' }];
    tx.assembly.updateMany
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ count: 1 });

    await cron.handleAssembliesLifecycle();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send.mock.calls[0][0].reference.id).toBe('as-2');
  });
});

describe('AssembliesCronService: cierre y resultado (H22 + H24)', () => {
  it('busca las Abiertas vencidas y cierra cada una condicionada por estado Abierta', async () => {
    const { cron, prisma, tx, due } = setup();
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
    expect(claim.data.closedAt).toBeInstanceOf(Date);
  });

  it('guarda el resultado de cada tema en la misma transacción del cierre', async () => {
    const { cron, prisma, tx, due } = setup();
    due.open = [];
    due.close = [{ id: 'as-9' }];

    await cron.handleAssembliesLifecycle();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.assemblyEligibleUnit.count).toHaveBeenCalledWith({
      where: { assemblyId: 'as-9' },
    });
    expect(tx.voteParticipation.count).toHaveBeenCalledWith({
      where: { topicId: 't1' },
    });
    const data = tx.topicResult.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      topicId: 't1',
      eligibleUnits: 4,
      votedUnits: 3,
      totalVotes: 3,
      // Todas las opciones, en el orden del tema, también las de 0 votos.
      optionCounts: [
        { optionId: 'o1', votes: 2 },
        { optionId: 'o2', votes: 1 },
        { optionId: 'o3', votes: 0 },
      ],
      winnerOptionId: 'o1',
    });
    // La hora del cálculo es la misma del cierre.
    expect(data.computedAt).toEqual(tx.assembly.updateMany.mock.calls[0][0].data.closedAt);
  });

  it('si hay empate en el máximo, no hay opción ganadora', async () => {
    const { cron, tx, due } = setup();
    due.open = [];
    due.close = [{ id: 'as-9' }];
    tx.ballot.groupBy.mockResolvedValue([
      { optionId: 'o1', _count: { _all: 1 } },
      { optionId: 'o2', _count: { _all: 1 } },
    ]);

    await cron.handleAssembliesLifecycle();

    expect(tx.topicResult.create.mock.calls[0][0].data.winnerOptionId).toBeNull();
  });

  it('si otra corrida ya la cerró (count 0), no calcula ni guarda el resultado', async () => {
    const { cron, tx, due } = setup();
    due.open = [];
    due.close = [{ id: 'as-9' }];
    tx.assembly.updateMany.mockResolvedValue({ count: 0 });

    await cron.handleAssembliesLifecycle();

    expect(tx.assemblyTopic.findMany).not.toHaveBeenCalled();
    expect(tx.topicResult.create).not.toHaveBeenCalled();
  });

  it('un error al cerrar una asamblea no impide cerrar las demás', async () => {
    const { cron, tx, due } = setup();
    due.open = [];
    due.close = [{ id: 'falla' }, { id: 'as-9' }];
    tx.assembly.updateMany
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ count: 1 });

    await expect(cron.handleAssembliesLifecycle()).resolves.toBeUndefined();

    expect(tx.topicResult.create).toHaveBeenCalledTimes(1);
  });

  it('un error al buscar las asambleas por cerrar no rompe la tarea', async () => {
    const { cron, prisma } = setup();
    prisma.assembly.findMany.mockImplementation((args: { where: { status: string } }) =>
      args.where.status === 'PROGRAMADA'
        ? Promise.resolve([])
        : Promise.reject(new Error('db')),
    );
    await expect(cron.handleAssembliesLifecycle()).resolves.toBeUndefined();
  });
});

describe('AssembliesCronService: corridas superpuestas (H22)', () => {
  it('si una corrida sigue en curso, la siguiente no hace nada', async () => {
    const { cron, prisma } = setup();
    let release!: () => void;
    prisma.assembly.findMany.mockImplementationOnce(
      () => new Promise<Row[]>((resolve) => (release = () => resolve([]))),
    );

    const first = cron.handleAssembliesLifecycle();
    await cron.handleAssembliesLifecycle(); // la segunda sale enseguida
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
    // La primera corrida terminó: buscó por abrir y por cerrar.
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(2);
    // Una nueva corrida sí trabaja.
    await cron.handleAssembliesLifecycle();
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(4);
  });
});
