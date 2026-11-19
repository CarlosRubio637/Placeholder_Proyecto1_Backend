import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';
import {
  AdminAnnouncementsQueryDto,
  AnnouncementReadsQueryDto,
} from './index.js';

async function check<T extends object>(
  type: new () => T,
  plain: object,
): Promise<{ dto: T; fields: string[]; messages: string[] }> {
  const dto = plainToInstance(type, plain);
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

describe('consulta de comunicados del administrador', () => {
  it('sin parámetros trae todos los estados, página 1 y 20 por página', async () => {
    const { dto, fields } = await check(AdminAnnouncementsQueryDto, {});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
    expect(dto.status).toBeUndefined();
    expect(dto.category).toBeUndefined();
  });

  it('acepta un estado, una categoría y la paginación como texto', async () => {
    const { dto, fields } = await check(AdminAnnouncementsQueryDto, {
      status: 'ARCHIVADO',
      category: 'MANTENIMIENTO',
      page: '2',
      pageSize: '50',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({
      status: 'ARCHIVADO',
      category: 'MANTENIMIENTO',
      page: 2,
      pageSize: 50,
    });
  });

  it('rechaza un estado desconocido', async () => {
    const { fields, messages } = await check(AdminAnnouncementsQueryDto, {
      status: 'vigente',
    });
    expect(fields).toEqual(['status']);
    expect(messages).toEqual(['Elige el estado: VIGENTE o ARCHIVADO.']);
  });

  it('rechaza una categoría desconocida', async () => {
    const { fields, messages } = await check(AdminAnnouncementsQueryDto, {
      category: 'URGENTE',
    });
    expect(fields).toEqual(['category']);
    expect(messages).toEqual([ANNOUNCEMENT_MESSAGES.category]);
  });

  it('rechaza la página 100001 y 51 por página', async () => {
    const { fields, messages } = await check(AdminAnnouncementsQueryDto, {
      page: '100001',
      pageSize: '51',
    });
    expect(fields).toEqual(['page', 'pageSize']);
    expect(messages).toEqual([
      'La página no puede ser mayor que 100,000.',
      'El tamaño de página debe estar entre 1 y 50.',
    ]);
  });
});

describe('consulta de lecturas de un comunicado', () => {
  it('sin parámetros trae todos los destinatarios, página 1 y 50 por página', async () => {
    const { dto, fields } = await check(AnnouncementReadsQueryDto, {});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 50 });
    expect(dto.read).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('read=%s filtra por %s', async (read, expected) => {
    const { dto, fields } = await check(AnnouncementReadsQueryDto, { read });
    expect(fields).toEqual([]);
    expect(dto.read).toBe(expected);
  });

  it('rechaza read=si', async () => {
    const { fields, messages } = await check(AnnouncementReadsQueryDto, {
      read: 'si',
    });
    expect(fields).toEqual(['read']);
    expect(messages).toEqual(['El filtro de lectura debe ser true o false.']);
  });

  it('rechaza la página 0 y 51 por página', async () => {
    const { fields, messages } = await check(AnnouncementReadsQueryDto, {
      page: '0',
      pageSize: '51',
    });
    expect(fields).toEqual(['page', 'pageSize']);
    expect(messages).toEqual([
      'La página debe ser un número entero mayor o igual a 1.',
      'El tamaño de página debe estar entre 1 y 50.',
    ]);
  });
});
