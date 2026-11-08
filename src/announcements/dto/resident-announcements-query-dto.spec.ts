import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ANNOUNCEMENT_MESSAGES,
  RESIDENT_ANNOUNCEMENT_MESSAGES,
} from '../announcements.constants.js';
import { ResidentAnnouncementsQueryDto } from './index.js';

async function check(plain: object) {
  const dto = plainToInstance(ResidentAnnouncementsQueryDto, plain);
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

describe('consulta de comunicados del residente', () => {
  it('sin parámetros usa vigentes, página 1 y 10 por página', async () => {
    const { dto, fields } = await check({});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ tab: 'vigentes', page: 1, pageSize: 10 });
    expect(dto.category).toBeUndefined();
  });

  it('acepta archivados, una categoría y la paginación como texto', async () => {
    const { dto, fields } = await check({
      tab: 'archivados',
      category: 'MANTENIMIENTO',
      page: '2',
      pageSize: '20',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({
      tab: 'archivados',
      category: 'MANTENIMIENTO',
      page: 2,
      pageSize: 20,
    });
  });

  it('rechaza una pestaña desconocida', async () => {
    const { fields, messages } = await check({ tab: 'todos' });
    expect(fields).toEqual(['tab']);
    expect(messages).toEqual(['Elige la pestaña: vigentes o archivados.']);
    expect(RESIDENT_ANNOUNCEMENT_MESSAGES.tab).toBe(messages[0]);
  });

  it('rechaza una categoría desconocida', async () => {
    const { fields, messages } = await check({ category: 'URGENTE' });
    expect(fields).toEqual(['category']);
    expect(messages).toEqual([ANNOUNCEMENT_MESSAGES.category]);
  });

  it('rechaza la página 0', async () => {
    const { fields, messages } = await check({ page: '0' });
    expect(fields).toEqual(['page']);
    expect(messages).toEqual([
      'La página debe ser un número entero mayor o igual a 1.',
    ]);
  });

  it.each(['100001', '1e20'])('rechaza la página %s', async (page) => {
    const { fields, messages } = await check({ page });
    expect(fields).toEqual(['page']);
    expect(messages).toEqual(['La página no puede ser mayor que 100,000.']);
  });

  it('acepta la página 100000', async () => {
    const { dto, fields } = await check({ page: '100000' });
    expect(fields).toEqual([]);
    expect(dto.page).toBe(100000);
  });

  it('rechaza 51 por página', async () => {
    const { fields, messages } = await check({ pageSize: '51' });
    expect(fields).toEqual(['pageSize']);
    expect(messages).toEqual(['El tamaño de página debe estar entre 1 y 50.']);
  });
});
