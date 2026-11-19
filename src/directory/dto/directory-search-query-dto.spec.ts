import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DirectorySearchQueryDto } from './index.js';

const TOWER_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

async function check(plain: object) {
  const dto = plainToInstance(DirectorySearchQueryDto, plain);
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

describe('H29. Búsqueda de contacto de vecinos', () => {
  it('AC6: rechaza un nombre de 2 caracteres', async () => {
    const { fields, messages } = await check({ name: ' ab ' });
    expect(fields).toEqual(['name']);
    expect(messages).toEqual(['Escribe al menos 3 caracteres del nombre.']);
  });

  it('AC6: rechaza más de 20 por página', async () => {
    const { fields, messages } = await check({ name: 'gomez', pageSize: '21' });
    expect(fields).toEqual(['pageSize']);
    expect(messages).toEqual(['El tamaño de página debe estar entre 1 y 20.']);
  });
});

describe('consulta del directorio', () => {
  it('sin paginación usa la página 1 y 20 por página, y recorta el nombre', async () => {
    const { dto, fields } = await check({ name: '  Gómez ' });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ name: 'Gómez', page: 1, pageSize: 20 });
  });

  it('acepta torre y número de unidad con la paginación como texto', async () => {
    const { dto, fields } = await check({
      towerId: TOWER_ID,
      unitNumber: '101',
      page: '2',
      pageSize: '10',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({
      towerId: TOWER_ID,
      unitNumber: '101',
      page: 2,
      pageSize: 10,
    });
  });

  it('rechaza un nombre de 81 caracteres', async () => {
    const { fields, messages } = await check({ name: 'a'.repeat(81) });
    expect(fields).toEqual(['name']);
    expect(messages).toEqual(['Escribe como máximo 80 caracteres del nombre.']);
  });

  it.each(['1a', '1010', ''])('rechaza la unidad "%s"', async (unitNumber) => {
    const { fields, messages } = await check({ towerId: TOWER_ID, unitNumber });
    expect(fields).toEqual(['unitNumber']);
    expect(messages).toEqual(['Ingresa el número de unidad de 3 dígitos.']);
  });

  it('rechaza una torre que no es uuid', async () => {
    const { fields, messages } = await check({
      towerId: 'A',
      unitNumber: '101',
    });
    expect(fields).toEqual(['towerId']);
    expect(messages).toEqual(['Elige una torre válida.']);
  });

  it('rechaza la página 0', async () => {
    const { fields, messages } = await check({ name: 'gomez', page: '0' });
    expect(fields).toEqual(['page']);
    expect(messages).toEqual([
      'La página debe ser un número entero mayor o igual a 1.',
    ]);
  });
});
