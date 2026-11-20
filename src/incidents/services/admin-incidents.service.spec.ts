import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import {
  AdminIncidentRepository,
  IncidentNotFoundError,
  IncidentResolvedError,
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
  const service = new AdminIncidentsService(
    repository as unknown as AdminIncidentRepository,
  );
  return { service, repository };
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
