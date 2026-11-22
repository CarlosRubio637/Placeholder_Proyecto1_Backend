import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationsService } from '@Notifications';
import type { User } from '@PrismaClient';
import {
  AdminIncidentRepository,
  AssigneeRequiredError,
  IncidentNotFoundError,
  IncidentResolvedError,
  StatusChangedError,
  TransitionNotAllowedError,
} from '../repositories/index.js';
import { AdminIncidentsService } from './admin-incidents.service.js';

const ADMIN = { id: 'admin-1' } as User;
// Jueves 19 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-19T16:00:00Z');
const STAFF = { id: 'staff-1', name: 'Pedro Alvarado' };

const row = (change: object = {}) => ({
  id: 'inc-1',
  number: 'INC-2026-00001',
  title: 'Fuga de agua',
  location: 'TORRE_A',
  status: 'PENDIENTE',
  priority: 'MEDIA',
  createdAt: new Date('2026-11-16T15:00:00Z'),
  unit: { code: 'A-101' },
  assignee: null,
  ...change,
});

function setup() {
  const repository = {
    list: vi.fn().mockResolvedValue({ data: [row()], total: 1 }),
    activeStaff: vi.fn().mockResolvedValue([]),
    findActiveStaff: vi.fn().mockResolvedValue(STAFF),
    applyStatusChange: vi.fn().mockResolvedValue({
      incident: { id: 'inc-1', status: 'RESUELTO', resolvedAt: NOW },
      event: {
        id: 'ev-2',
        fromStatus: 'EN_PROCESO',
        toStatus: 'RESUELTO',
        note: 'Se cambió la tubería del baño.',
        createdAt: NOW,
      },
      reporterId: 'resident-1',
      number: 'INC-2026-00001',
      title: 'Fuga de agua',
    }),
    applyManagement: vi.fn().mockResolvedValue({
      incident: {
        id: 'inc-1',
        number: 'INC-2026-00001',
        status: 'PENDIENTE',
        priority: 'ALTA',
        assignee: null,
      },
      event: {
        id: 'ev-1',
        type: 'PRIORIDAD',
        fromValue: 'MEDIA',
        toValue: 'ALTA',
        createdAt: NOW,
      },
    }),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 1 }) };
  const service = new AdminIncidentsService(
    repository as unknown as AdminIncidentRepository,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, notifications };
}

const query = (change: object = {}) => ({ page: 1, pageSize: 20, ...change });

describe('AdminIncidentsService.list (H12)', () => {
  it('pasa los filtros y normaliza la búsqueda como el searchKey', async () => {
    const { service, repository } = setup();

    await service.list(
      query({
        status: 'PENDIENTE',
        priority: 'ALTA',
        location: 'PISCINA',
        assigneeId: 'NONE',
        search: 'Fúga ÁGUA',
      }),
      NOW,
    );

    expect(repository.list).toHaveBeenCalledWith({
      status: 'PENDIENTE',
      priority: 'ALTA',
      location: 'PISCINA',
      assigneeId: 'none',
      search: 'fuga agua',
      page: 1,
      pageSize: 20,
    });
  });

  it('devuelve las columnas de la bandeja y los días desde la creación', async () => {
    const { service } = setup();

    const result = await service.list(query(), NOW);

    expect(result).toEqual({
      data: [
        {
          id: 'inc-1',
          number: 'INC-2026-00001',
          title: 'Fuga de agua',
          unitCode: 'A-101',
          location: 'TORRE_A',
          status: 'PENDIENTE',
          priority: 'MEDIA',
          assignee: null,
          daysOpen: 3,
          createdAt: row().createdAt,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('los días son de calendario del condominio: anoche a las 23:00 ya es 1', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValue({
      // 18 de noviembre, 23:00 en El Salvador.
      data: [row({ createdAt: new Date('2026-11-19T05:00:00Z') })],
      total: 1,
    });
    const { data } = await service.list(query(), NOW);
    expect(data[0].daysOpen).toBe(1);
  });
});

describe('AdminIncidentsService.update (H12)', () => {
  it('400 si no viene ni prioridad ni responsable', async () => {
    const { service, repository } = setup();
    const error = await service
      .update(ADMIN, 'inc-1', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'priority',
      message: ['Indica la prioridad o el responsable.'],
    });
    expect(repository.applyManagement).not.toHaveBeenCalled();
  });

  it('400 con el campo si el responsable no existe o está inactivo', async () => {
    const { service, repository } = setup();
    repository.findActiveStaff.mockResolvedValue(null);

    const error = await service
      .update(ADMIN, 'inc-1', { assigneeId: 'staff-x' })
      .catch((e: unknown) => e);

    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'assigneeId',
      message: ['El responsable no existe o está inactivo.'],
    });
    expect(repository.applyManagement).not.toHaveBeenCalled();
  });

  it('asigna con el nombre del responsable para el historial', async () => {
    const { service, repository } = setup();
    await service.update(ADMIN, 'inc-1', { assigneeId: 'staff-1' });
    expect(repository.applyManagement).toHaveBeenCalledWith({
      incidentId: 'inc-1',
      actorId: 'admin-1',
      priority: undefined,
      assignee: STAFF,
    });
  });

  it('null quita el responsable sin buscarlo', async () => {
    const { service, repository } = setup();
    await service.update(ADMIN, 'inc-1', { assigneeId: null });
    expect(repository.findActiveStaff).not.toHaveBeenCalled();
    expect(repository.applyManagement.mock.calls[0][0].assignee).toBeNull();
  });

  it('solo la prioridad no toca al responsable', async () => {
    const { service, repository } = setup();
    const result = await service.update(ADMIN, 'inc-1', { priority: 'ALTA' });
    expect(repository.applyManagement.mock.calls[0][0]).toMatchObject({
      priority: 'ALTA',
      assignee: undefined,
    });
    expect(result.event).toMatchObject({ type: 'PRIORIDAD', toValue: 'ALTA' });
  });

  it.each([
    [
      new IncidentNotFoundError(),
      NotFoundException,
      'La incidencia no existe.',
    ],
    [
      new IncidentResolvedError(),
      ConflictException,
      'La incidencia está resuelta. Reábrela para modificarla.',
    ],
  ])('traduce %o', async (domainError, httpError, message) => {
    const { service, repository } = setup();
    repository.applyManagement.mockRejectedValue(domainError);
    const error = await service
      .update(ADMIN, 'inc-1', { priority: 'BAJA' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(httpError);
    expect((error as Error).message).toBe(message);
  });

  it('otros errores no se disfrazan', async () => {
    const { service, repository } = setup();
    repository.applyManagement.mockRejectedValue(new Error('db caída'));
    await expect(
      service.update(ADMIN, 'inc-1', { priority: 'BAJA' }),
    ).rejects.toThrow('db caída');
  });
});

describe('H13. Cambio de estado y seguimiento de incidencias', () => {
  const dto = {
    toStatus: 'RESUELTO' as const,
    note: 'Se cambió la tubería del baño.',
    expectedStatus: 'EN_PROCESO' as const,
  };

  it('AC5: aplica el cambio con la hora del servidor y responde incidencia y evento', async () => {
    const { service, repository } = setup();

    const result = await service.changeStatus(ADMIN, 'inc-1', dto, NOW);

    expect(repository.applyStatusChange).toHaveBeenCalledWith({
      incidentId: 'inc-1',
      actorId: 'admin-1',
      expectedStatus: 'EN_PROCESO',
      toStatus: 'RESUELTO',
      note: 'Se cambió la tubería del baño.',
      now: NOW,
    });
    expect(result).toEqual({
      incident: { id: 'inc-1', status: 'RESUELTO', resolvedAt: NOW },
      event: {
        id: 'ev-2',
        fromStatus: 'EN_PROCESO',
        toStatus: 'RESUELTO',
        note: 'Se cambió la tubería del baño.',
        createdAt: NOW,
      },
    });
    expect(result).not.toHaveProperty('reporterId');
  });

  it('AC8: avisa al residente que reportó con el título, el mensaje, el módulo y la referencia de la card', async () => {
    const { service, notifications } = setup();
    await service.changeStatus(ADMIN, 'inc-1', dto, NOW);
    expect(notifications.send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['resident-1'] },
      title: 'Incidencia INC-2026-00001: Resuelto',
      message:
        'Tu reporte “Fuga de agua” pasó a Resuelto. Se cambió la tubería del baño.',
      sourceModule: 'INCIDENCIAS',
      reference: { type: 'incident', id: 'inc-1' },
    });
  });

  it('AC8: recorta el aviso a 500 caracteres; la observación completa queda en el historial', async () => {
    const { service, repository, notifications } = setup();
    const note = 'x'.repeat(500);
    repository.applyStatusChange.mockResolvedValue({
      incident: { id: 'inc-1', status: 'EN_PROCESO', resolvedAt: null },
      event: {
        id: 'ev',
        fromStatus: 'PENDIENTE',
        toStatus: 'EN_PROCESO',
        note,
        createdAt: NOW,
      },
      reporterId: 'resident-1',
      number: 'INC-2026-00001',
      title: 'y'.repeat(80),
    });

    const result = await service.changeStatus(
      ADMIN,
      'inc-1',
      { toStatus: 'EN_PROCESO', note, expectedStatus: 'PENDIENTE' },
      NOW,
    );

    const message: string = notifications.send.mock.calls[0][0].message;
    expect(message).toHaveLength(500);
    expect(message.endsWith('…')).toBe(true);
    expect(result.event.note).toHaveLength(500);
  });

  it('AC8: si el aviso falla, el cambio igual responde bien', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('caído'));
    await expect(
      service.changeStatus(ADMIN, 'inc-1', dto, NOW),
    ).resolves.toMatchObject({ incident: { status: 'RESUELTO' } });
  });

  it.each([
    [
      new IncidentNotFoundError(),
      NotFoundException,
      'La incidencia no existe.',
    ],
    [
      new TransitionNotAllowedError(),
      ConflictException,
      'No se puede pasar de En proceso a Resuelto.',
    ],
    [
      new StatusChangedError(),
      ConflictException,
      'La incidencia cambió de estado. Actualiza la página.',
    ],
    [
      new AssigneeRequiredError(),
      ConflictException,
      'Asigna un responsable antes de iniciar la atención.',
    ],
  ])(
    'AC6: traduce %o al error HTTP con su mensaje y no avisa',
    async (domainError, httpError, message) => {
      const { service, repository, notifications } = setup();
      repository.applyStatusChange.mockRejectedValue(domainError);
      const error = await service
        .changeStatus(ADMIN, 'inc-1', dto, NOW)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(httpError);
      expect((error as Error).message).toBe(message);
      expect(notifications.send).not.toHaveBeenCalled();
    },
  );
});
