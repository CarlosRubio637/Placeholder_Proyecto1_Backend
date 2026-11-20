import type { PrismaService } from '@Prisma/services';
import {
  AdminIncidentRepository,
  IncidentNotFoundError,
  IncidentResolvedError,
} from './admin-incident.repository.js';

const current = (change: object = {}) => ({
  status: 'PENDIENTE',
  priority: 'MEDIA',
  assignee: null as { id: string; name: string } | null,
  ...change,
});

function setup(state = current()) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'inc-1' }]),
    incident: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValueOnce(state)
        .mockResolvedValue({ id: 'inc-1', number: 'INC-2026-00001' }),
      update: vi.fn().mockResolvedValue({}),
    },
    incidentEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: 'ev-1' }),
    },
  };
  const prisma = {
    incident: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as unknown[]),
    ),
  };
  const repository = new AdminIncidentRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, prisma, tx };
}

const base = { incidentId: 'inc-1', actorId: 'admin-1' };

describe('AdminIncidentRepository.list (H12)', () => {
  it('ordena Alta → Baja y, dentro de cada prioridad, la más antigua primero', async () => {
    const { repository, prisma } = setup();
    await repository.list({ page: 2, pageSize: 20 });
    expect(prisma.incident.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { number: 'asc' }],
      skip: 20,
      take: 20,
    });
  });

  it.each([
    [{ assigneeId: 'none' }, { assigneeId: null }],
    [{ assigneeId: 'staff-1' }, { assigneeId: 'staff-1' }],
    [{ search: 'fuga' }, { searchKey: { contains: 'fuga' } }],
  ])('filtra %o', async (params, where) => {
    const { repository, prisma } = setup();
    await repository.list({ page: 1, pageSize: 20, ...params });
    expect(prisma.incident.findMany.mock.calls[0][0].where).toMatchObject(
      where,
    );
  });
});

describe('AdminIncidentRepository.applyManagement (H12)', () => {
  it('bloquea la fila antes de leer el valor anterior', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({ ...base, priority: 'ALTA' });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.incident.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });

  it('cambia la prioridad y guarda el evento con el valor anterior y el nuevo', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({ ...base, priority: 'ALTA' });
    expect(tx.incident.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { priority: 'ALTA' },
    });
    expect(tx.incidentEvent.create).toHaveBeenCalledWith({
      data: {
        incidentId: 'inc-1',
        type: 'PRIORIDAD',
        fromValue: 'MEDIA',
        toValue: 'ALTA',
        authorId: 'admin-1',
      },
    });
  });

  it('reasignar guarda los nombres anterior y nuevo', async () => {
    const { repository, tx } = setup(
      current({ assignee: { id: 'staff-1', name: 'Pedro Alvarado' } }),
    );
    await repository.applyManagement({
      ...base,
      assignee: { id: 'staff-2', name: 'Rosa Méndez' },
    });
    expect(tx.incidentEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'ASIGNACION',
      fromValue: 'Pedro Alvarado',
      toValue: 'Rosa Méndez',
    });
  });

  it('los dos cambios a la vez dejan dos eventos', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({
      ...base,
      priority: 'BAJA',
      assignee: { id: 'staff-1', name: 'Pedro Alvarado' },
    });
    expect(tx.incidentEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.incident.update.mock.calls[0][0].data).toEqual({
      priority: 'BAJA',
      assigneeId: 'staff-1',
    });
  });

  it('si los valores ya eran esos, no guarda nada ni evento', async () => {
    const { repository, tx } = setup(
      current({ assignee: { id: 'staff-1', name: 'Pedro Alvarado' } }),
    );
    const result = await repository.applyManagement({
      ...base,
      priority: 'MEDIA',
      assignee: { id: 'staff-1', name: 'Pedro Alvarado' },
    });
    expect(tx.incident.update).not.toHaveBeenCalled();
    expect(tx.incidentEvent.create).not.toHaveBeenCalled();
    expect(result.event).toBeNull();
  });

  it('quitar el responsable sin tener uno no genera evento', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({ ...base, assignee: null });
    expect(tx.incidentEvent.create).not.toHaveBeenCalled();
  });

  it('una incidencia Resuelto no se modifica', async () => {
    const { repository, tx } = setup(current({ status: 'RESUELTO' }));
    await expect(
      repository.applyManagement({ ...base, priority: 'ALTA' }),
    ).rejects.toBeInstanceOf(IncidentResolvedError);
    expect(tx.incident.update).not.toHaveBeenCalled();
  });

  it('una incidencia inexistente da error de dominio', async () => {
    const { repository, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      repository.applyManagement({ ...base, priority: 'ALTA' }),
    ).rejects.toBeInstanceOf(IncidentNotFoundError);
  });
});
