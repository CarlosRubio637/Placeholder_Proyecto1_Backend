import type { PrismaService } from '@Prisma/services';
import {
  AdminIncidentRepository,
  AssigneeRequiredError,
  IncidentNotFoundError,
  IncidentResolvedError,
  StatusChangedError,
  TransitionNotAllowedError,
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

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  it('AC1: ordena Alta → Baja y, dentro de cada prioridad, la más antigua primero', async () => {
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
  ])('AC2: filtra %o', async (params, where) => {
    const { repository, prisma } = setup();
    await repository.list({ page: 1, pageSize: 20, ...params });
    expect(prisma.incident.findMany.mock.calls[0][0].where).toMatchObject(
      where,
    );
  });
});

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  it('AC6: bloquea la fila antes de leer el valor anterior', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({ ...base, priority: 'ALTA' });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.incident.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });

  it('AC6: cambia la prioridad y guarda el evento con autor, valor anterior y valor nuevo', async () => {
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

  it('AC6: reasignar guarda el responsable anterior y el nuevo', async () => {
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

  it('AC6: los dos cambios a la vez dejan dos eventos', async () => {
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

  it('AC6: si los valores ya eran esos, no guarda nada ni evento', async () => {
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

  it('AC6: quitar el responsable sin tener uno no genera evento', async () => {
    const { repository, tx } = setup();
    await repository.applyManagement({ ...base, assignee: null });
    expect(tx.incidentEvent.create).not.toHaveBeenCalled();
  });

  it('AC7: una incidencia Resuelto no se modifica', async () => {
    const { repository, tx } = setup(current({ status: 'RESUELTO' }));
    await expect(
      repository.applyManagement({ ...base, priority: 'ALTA' }),
    ).rejects.toBeInstanceOf(IncidentResolvedError);
    expect(tx.incident.update).not.toHaveBeenCalled();
  });

  it('AC7: una incidencia inexistente da error de dominio', async () => {
    const { repository, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      repository.applyManagement({ ...base, priority: 'ALTA' }),
    ).rejects.toBeInstanceOf(IncidentNotFoundError);
  });
});

describe('AdminIncidentRepository.applyStatusChange (H13)', () => {
  const NOW = new Date('2026-11-19T16:00:00Z');

  function statusSetup(state: object) {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'inc-1' }]),
      incident: {
        findUnique: vi.fn().mockResolvedValue({
          number: 'INC-2026-00001',
          title: 'Fuga de agua',
          reporterId: 'resident-1',
          assigneeId: 'staff-1',
          status: 'PENDIENTE',
          ...state,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      incidentEvent: {
        create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'ev-1',
            fromStatus: data.fromStatus,
            toStatus: data.toStatus,
            note: data.note,
            createdAt: data.createdAt,
          }),
        ),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const repository = new AdminIncidentRepository(
      prisma as unknown as PrismaService,
    );
    return { repository, tx };
  }

  const change = (expectedStatus: string, toStatus: string) =>
    ({
      incidentId: 'inc-1',
      actorId: 'admin-1',
      expectedStatus,
      toStatus,
      note: 'Observación de prueba.',
      now: NOW,
    }) as Parameters<AdminIncidentRepository['applyStatusChange']>[0];

  it.each([
    ['PENDIENTE', 'EN_PROCESO', null],
    ['EN_PROCESO', 'RESUELTO', NOW],
    ['RESUELTO', 'EN_PROCESO', null],
  ])('%s → %s con resolvedAt %s', async (from, to, resolvedAt) => {
    const { repository, tx } = statusSetup({ status: from });

    const result = await repository.applyStatusChange(change(from, to));

    expect(tx.incident.updateMany).toHaveBeenCalledWith({
      where: { id: 'inc-1', status: from },
      data: { status: to, resolvedAt },
    });
    expect(tx.incidentEvent.create.mock.calls[0][0].data).toEqual({
      incidentId: 'inc-1',
      type: 'ESTADO',
      fromStatus: from,
      toStatus: to,
      note: 'Observación de prueba.',
      authorId: 'admin-1',
      createdAt: NOW,
    });
    expect(result.incident).toEqual({ id: 'inc-1', status: to, resolvedAt });
    expect(result.reporterId).toBe('resident-1');
  });

  it.each([
    ['PENDIENTE', 'RESUELTO'],
    ['EN_PROCESO', 'EN_PROCESO'],
    ['RESUELTO', 'RESUELTO'],
    ['EN_PROCESO', 'PENDIENTE'],
  ])('%s → %s no está en la tabla de estados', async (from, to) => {
    const { repository, tx } = statusSetup({ status: from });
    await expect(
      repository.applyStatusChange(change(from, to)),
    ).rejects.toBeInstanceOf(TransitionNotAllowedError);
    expect(tx.incident.updateMany).not.toHaveBeenCalled();
  });

  it('pasar a En proceso exige responsable, también al reabrir', async () => {
    for (const from of ['PENDIENTE', 'RESUELTO']) {
      const { repository, tx } = statusSetup({
        status: from,
        assigneeId: null,
      });
      await expect(
        repository.applyStatusChange(change(from, 'EN_PROCESO')),
      ).rejects.toBeInstanceOf(AssigneeRequiredError);
      expect(tx.incident.updateMany).not.toHaveBeenCalled();
    }
  });

  it('resolver no exige responsable', async () => {
    const { repository } = statusSetup({
      status: 'EN_PROCESO',
      assigneeId: null,
    });
    await expect(
      repository.applyStatusChange(change('EN_PROCESO', 'RESUELTO')),
    ).resolves.toBeTruthy();
  });

  it('si el estado ya no es el que vio el administrador, no toca nada', async () => {
    const { repository, tx } = statusSetup({ status: 'EN_PROCESO' });
    await expect(
      repository.applyStatusChange(change('PENDIENTE', 'EN_PROCESO')),
    ).rejects.toBeInstanceOf(StatusChangedError);
    expect(tx.incident.updateMany).not.toHaveBeenCalled();
  });

  it('si la actualización condicionada no afecta filas, tampoco guarda el evento', async () => {
    const { repository, tx } = statusSetup({ status: 'PENDIENTE' });
    tx.incident.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.applyStatusChange(change('PENDIENTE', 'EN_PROCESO')),
    ).rejects.toBeInstanceOf(StatusChangedError);
    expect(tx.incidentEvent.create).not.toHaveBeenCalled();
  });

  it('bloquea la fila antes de revisar; 404 si no existe', async () => {
    const { repository, tx } = statusSetup({});
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      repository.applyStatusChange(change('PENDIENTE', 'EN_PROCESO')),
    ).rejects.toBeInstanceOf(IncidentNotFoundError);
    expect(tx.incident.findUnique).not.toHaveBeenCalled();
  });
});
