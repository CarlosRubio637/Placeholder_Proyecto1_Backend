// class-transformer (@Type) necesita la metadata de decoradores; en la app la
// carga Nest al arrancar.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CreateAssemblyDto } from './create-assembly.dto.js';
import { ListAssembliesQueryDto } from './list-assemblies-query.dto.js';

/** Rutas de los campos con error, incluidos los anidados (topics.0.options). */
function paths(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [path] : [];
    return [...own, ...paths(error.children ?? [], path)];
  });
}

async function check<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, fields: paths(errors) };
}

const valid = {
  title: 'Asamblea ordinaria',
  startsAt: '2026-12-01T14:00:00.000Z',
  endsAt: '2026-12-03T14:00:00.000Z',
  topics: [
    { question: '¿Aprobar el presupuesto?', options: ['A favor', 'En contra'] },
  ],
};

const topicWith = (options: string[]) => [
  { question: '¿Aprobar el presupuesto?', options },
];

describe('CreateAssemblyDto (H22)', () => {
  it('acepta una asamblea válida y recorta título y opciones', async () => {
    const { dto, fields } = await check(CreateAssemblyDto, {
      ...valid,
      title: '  Asamblea ordinaria  ',
      topics: topicWith([' A favor ', 'En contra ']),
    });
    expect(fields).toEqual([]);
    expect(dto.title).toBe('Asamblea ordinaria');
    expect(dto.topics[0].options).toEqual(['A favor', 'En contra']);
  });

  it('la descripción es opcional', async () => {
    expect((await check(CreateAssemblyDto, valid)).fields).toEqual([]);
  });

  it.each<[string, object, string]>([
    ['título de 4 caracteres', { title: 'Hola' }, 'title'],
    ['título de 101 caracteres', { title: 'x'.repeat(101) }, 'title'],
    ['título solo con espacios', { title: '      ' }, 'title'],
    [
      'descripción de 1001 caracteres',
      { description: 'x'.repeat(1001) },
      'description',
    ],
    ['inicio que no es fecha', { startsAt: 'mañana' }, 'startsAt'],
    ['cierre que no es fecha', { endsAt: '' }, 'endsAt'],
    ['sin temas', { topics: [] }, 'topics'],
    [
      'más de 10 temas',
      { topics: Array.from({ length: 11 }, () => valid.topics[0]) },
      'topics',
    ],
    [
      'pregunta de 4 caracteres',
      { topics: [{ question: '¿Sí?', options: ['A', 'B'] }] },
      'topics.0.question',
    ],
    [
      'un tema con 1 opción',
      { topics: topicWith(['A favor']) },
      'topics.0.options',
    ],
    [
      'un tema con 7 opciones',
      { topics: topicWith(['1', '2', '3', '4', '5', '6', '7']) },
      'topics.0.options',
    ],
    [
      'una opción vacía',
      { topics: topicWith(['A favor', '   ']) },
      'topics.0.options',
    ],
    [
      'una opción de 81 caracteres',
      { topics: topicWith(['A favor', 'x'.repeat(81)]) },
      'topics.0.options',
    ],
  ])('rechaza %s', async (_caso, change, field) => {
    const { fields } = await check(CreateAssemblyDto, { ...valid, ...change });
    expect(fields).toContain(field);
  });

  it('rechaza campos que no existen en el contrato', async () => {
    const { fields } = await check(CreateAssemblyDto, {
      ...valid,
      status: 'ABIERTA',
    });
    expect(fields).toEqual(['status']);
  });
});

describe('ListAssembliesQueryDto (H22)', () => {
  it('por defecto página 1 de 10', async () => {
    const { dto, fields } = await check(ListAssembliesQueryDto, {});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, pageSize: 10 });
  });

  it.each<[object, string]>([
    [{ status: 'BORRADOR' }, 'status'],
    [{ page: '0' }, 'page'],
    [{ pageSize: '51' }, 'pageSize'],
  ])('rechaza %o', async (query, field) => {
    expect((await check(ListAssembliesQueryDto, query)).fields).toEqual([
      field,
    ]);
  });
});
