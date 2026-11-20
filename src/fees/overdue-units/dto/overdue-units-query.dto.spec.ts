import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OverdueUnitsQueryDto } from './overdue-units-query.dto.js';

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(OverdueUnitsQueryDto, raw);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('Consulta del reporte de unidades morosas', () => {
  it('sin parámetros pide la página 1 de 20 filas, sin torre ni búsqueda', async () => {
    const { dto, errors } = await check({});

    expect(errors).toHaveLength(0);
    expect(dto).toEqual({ page: 1, pageSize: 20 });
  });

  it('acepta una torre, 20 caracteres de búsqueda y 50 filas por página', async () => {
    const { dto, errors } = await check({
      towerId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11',
      search: 'x'.repeat(20),
      page: '3',
      pageSize: '50',
    });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(50);
  });

  it('recorta la búsqueda y la descarta si queda vacía', async () => {
    expect((await check({ search: '  b-2 ' })).dto.search).toBe('b-2');
    expect((await check({ search: '   ' })).dto.search).toBeUndefined();
  });

  it.each([
    [
      'towerId',
      { towerId: 'torre-a' },
      'La torre debe ser un identificador válido.',
    ],
    [
      'search',
      { search: 'x'.repeat(21) },
      'La búsqueda debe ser un texto de hasta 20 caracteres.',
    ],
    [
      'search',
      { search: ['A-101', 'B-203'] },
      'La búsqueda debe ser un texto de hasta 20 caracteres.',
    ],
    [
      'page',
      { page: '0' },
      'La página debe ser un número entero mayor o igual a 1.',
    ],
    [
      'pageSize',
      { pageSize: '51' },
      'El tamaño de página debe estar entre 1 y 50.',
    ],
  ])('rechaza %s inválido: %j', async (property, raw, message) => {
    const { errors } = await check(raw);

    expect(errors.map((error) => error.property)).toEqual([property]);
    expect(Object.values(errors[0].constraints ?? {})).toContain(message);
  });
});
