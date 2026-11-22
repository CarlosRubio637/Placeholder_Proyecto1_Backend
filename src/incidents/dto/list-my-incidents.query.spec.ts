import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '@Common/validation';
import { ListMyIncidentsQuery } from './list-my-incidents.query.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: validationExceptionFactory,
});

function parse(query: object) {
  return pipe.transform(query, {
    type: 'query',
    metatype: ListMyIncidentsQuery,
  }) as Promise<ListMyIncidentsQuery>;
}

describe('H11. Mis incidencias y detalle con historial', () => {
  it('AC1: por defecto pide la página 1 de 10 incidencias', async () => {
    await expect(parse({})).resolves.toMatchObject({ page: 1, pageSize: 10 });
  });

  it.each(['PENDIENTE', 'EN_PROCESO', 'RESUELTO'])(
    'AC2: acepta el filtro de estado %s',
    async (status) => {
      await expect(parse({ status })).resolves.toMatchObject({ status });
    },
  );

  it('AC2: sin estado son todos; un estado inválido responde 400', async () => {
    await expect(parse({})).resolves.toMatchObject({ status: undefined });

    const error = await parse({ status: 'CERRADA' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'status',
    });
  });

  it('AC5: no deja elegir la unidad: sale del token', async () => {
    const error = await parse({ unitId: 'otra' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
  });
});
