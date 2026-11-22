import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ADMIN_INCIDENT_MESSAGES as M,
  AdminIncidentsQuery,
  UpdateIncidentDto,
} from './admin-incidents.dto.js';

async function check<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    fields: errors.map((error) => error.property),
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const UUID = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  it('AC1: por defecto pide la página 1 de 20', async () => {
    const { dto, fields } = await check(AdminIncidentsQuery, {});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
  });

  it('AC2: acepta los filtros de estado, prioridad, ubicación y responsable, y recorta la búsqueda', async () => {
    const { dto, fields } = await check(AdminIncidentsQuery, {
      status: 'EN_PROCESO',
      priority: 'ALTA',
      location: 'PISCINA',
      assigneeId: 'none',
      search: '  fuga  ',
      page: '2',
      pageSize: '50',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ search: 'fuga', page: 2, pageSize: 50 });
  });

  it('AC2: una búsqueda solo con espacios cuenta como vacía', async () => {
    const { dto } = await check(AdminIncidentsQuery, { search: '   ' });
    expect(dto.search).toBeUndefined();
  });

  it.each<[object, string, string]>([
    [{ status: 'ABIERTA' }, 'status', M.status],
    [{ priority: 'URGENTE' }, 'priority', M.priority],
    [{ location: 'TECHO' }, 'location', M.location],
    [{ assigneeId: 'pedro' }, 'assigneeId', M.assigneeFilter],
    [{ search: 'x'.repeat(81) }, 'search', M.search],
    [{ page: '0' }, 'page', M.page],
    [{ pageSize: '51' }, 'pageSize', M.pageSize],
  ])(
    'AC2: rechaza el filtro %o con 400 y el campo',
    async (query, field, message) => {
      const { fields, messages } = await check(AdminIncidentsQuery, query);
      expect(fields).toEqual([field]);
      expect(messages).toEqual([message]);
    },
  );

  it('AC2: acepta un uuid de responsable', async () => {
    const { fields } = await check(AdminIncidentsQuery, { assigneeId: UUID });
    expect(fields).toEqual([]);
  });
});

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  it.each([
    ['solo la prioridad', { priority: 'BAJA' }],
    ['solo el responsable', { assigneeId: UUID }],
    ['quitar el responsable con null', { assigneeId: null }],
    ['los dos', { priority: 'ALTA', assigneeId: UUID }],
  ])('AC3: acepta cambiar %s', async (_caso, body) => {
    const { fields } = await check(UpdateIncidentDto, body);
    expect(fields).toEqual([]);
  });

  it('AC3: conserva el null para quitar el responsable', async () => {
    const { dto } = await check(UpdateIncidentDto, { assigneeId: null });
    expect(dto.assigneeId).toBeNull();
  });

  it.each<[object, string, string]>([
    [{ priority: 'URGENTE' }, 'priority', M.priority],
    [{ assigneeId: 'pedro' }, 'assigneeId', M.assigneeId],
  ])('AC7: rechaza %o con 400 y el campo', async (body, field, message) => {
    const { fields, messages } = await check(UpdateIncidentDto, body);
    expect(fields).toEqual([field]);
    expect(messages).toEqual([message]);
  });

  it('AC3: desde la gestión solo cambian prioridad y responsable, no el estado (es H13)', async () => {
    const { fields } = await check(UpdateIncidentDto, { status: 'RESUELTO' });
    expect(fields).toEqual(['status']);
  });
});
