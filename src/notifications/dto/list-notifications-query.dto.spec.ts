import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListNotificationsQueryDto } from './list-notifications-query.dto.js';
import { validationExceptionFactory } from '../../common/validation/index.js';

// Misma configuración que el ValidationPipe global de main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});

const parse = (query: Record<string, string>) =>
  pipe.transform(query, {
    type: 'query',
    metatype: ListNotificationsQueryDto,
  }) as Promise<ListNotificationsQueryDto>;

async function fieldOf(query: Record<string, string>) {
  const error = await parse(query).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return ((error as BadRequestException).getResponse() as { field: string })
    .field;
}

describe('ListNotificationsQueryDto', () => {
  it('sin parámetros: página 1 de 20, sin filtros', async () => {
    const dto = await parse({});
    expect(dto).toMatchObject({ page: 1, pageSize: 20 });
    expect(dto.sourceModule).toBeUndefined();
    expect(dto.unread).toBeUndefined();
  });

  it('convierte los textos del query a número y booleano', async () => {
    const dto = await parse({
      sourceModule: 'PAQUETERIA',
      unread: 'true',
      page: '2',
      pageSize: '10',
    });
    expect(dto).toMatchObject({
      sourceModule: 'PAQUETERIA',
      unread: true,
      page: 2,
      pageSize: 10,
    });
  });

  it('unread=false significa todas', async () => {
    expect((await parse({ unread: 'false' })).unread).toBe(false);
  });

  it.each<[string, Record<string, string>, string]>([
    ['módulo fuera del enum', { sourceModule: 'DIRECTORIO' }, 'sourceModule'],
    ['unread que no es booleano', { unread: 'si' }, 'unread'],
    ['página 0', { page: '0' }, 'page'],
    ['página no numérica', { page: 'abc' }, 'page'],
    ['página decimal', { page: '1.5' }, 'page'],
    ['tamaño de página 0', { pageSize: '0' }, 'pageSize'],
    ['tamaño de página mayor a 100', { pageSize: '101' }, 'pageSize'],
    ['parámetro desconocido', { userId: 'otro' }, 'userId'],
  ])('rechaza con 400 si hay %s', async (_caso, query, field) => {
    expect(await fieldOf(query)).toBe(field);
  });
});
