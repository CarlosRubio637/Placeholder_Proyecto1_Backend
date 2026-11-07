import { AssembliesCronService } from './assemblies.cron.js';
import type { NotificationsService } from '../../notifications/services/index.js';
import type { PrismaService } from '../../prisma/services/index.js';

const ENDS_AT = new Date('2026-11-10T20:00:00Z'); // 10 nov, 2:00 p. m. en El Salvador

function setup() {
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
    },
  };
  const prisma = {
    assembly: {
      findMany: vi.fn().mockResolvedValue([{ id: 'as-1' }]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 6 }) };
  const cron = new AssembliesCronService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { cron, prisma, tx, notifications };
}

describe('AssembliesCronService: apertura (H22)', () => {
  it('abre las asambleas que ya iniciaron, condicionado por el estado Programada', async () => {
    const { cron, prisma, tx } = setup();

    await cron.handleAssembliesLifecycle();

    const findArgs = prisma.assembly.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe('PROGRAMADA');
    expect(findArgs.where.startsAt.lte).toBeInstanceOf(Date);
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
    expect(prisma.assembly.updateMany).toHaveBeenCalled();
  });

  it('un error al abrir una asamblea no impide abrir las demás', async () => {
    const { cron, prisma, tx, notifications } = setup();
    prisma.assembly.findMany.mockResolvedValue([
      { id: 'falla' },
      { id: 'as-2' },
    ]);
    tx.assembly.updateMany
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ count: 1 });

    await cron.handleAssembliesLifecycle();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send.mock.calls[0][0].reference.id).toBe('as-2');
  });
});

describe('AssembliesCronService: cierre (H22)', () => {
  it('cierra en una sola sentencia condicionada por estado Abierta y fecha de cierre', async () => {
    const { cron, prisma } = setup();
    prisma.assembly.findMany.mockResolvedValue([]);
    prisma.assembly.updateMany.mockResolvedValue({ count: 2 });

    await cron.handleAssembliesLifecycle();

    const args = prisma.assembly.updateMany.mock.calls[0][0];
    expect(args.where.status).toBe('ABIERTA');
    expect(args.where.endsAt.lte).toBeInstanceOf(Date);
    expect(args.data.status).toBe('CERRADA');
    expect(args.data.closedAt).toBeInstanceOf(Date);
  });

  it('un error al cerrar no rompe la tarea', async () => {
    const { cron, prisma } = setup();
    prisma.assembly.findMany.mockResolvedValue([]);
    prisma.assembly.updateMany.mockRejectedValue(new Error('db'));
    await expect(cron.handleAssembliesLifecycle()).resolves.toBeUndefined();
  });
});

describe('AssembliesCronService: corridas superpuestas (H22)', () => {
  it('si una corrida sigue en curso, la siguiente no hace nada', async () => {
    const { cron, prisma } = setup();
    let release!: () => void;
    prisma.assembly.findMany.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = cron.handleAssembliesLifecycle();
    await cron.handleAssembliesLifecycle(); // la segunda sale enseguida
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
    // Terminada la primera, una nueva corrida sí trabaja.
    await cron.handleAssembliesLifecycle();
    expect(prisma.assembly.findMany).toHaveBeenCalledTimes(2);
  });
});
