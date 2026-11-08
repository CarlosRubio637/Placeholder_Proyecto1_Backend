// class-transformer (@Type) necesita la metadata de decoradores; en la app la
// carga Nest al arrancar.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import {
  ASSEMBLY_MESSAGES as M,
  CreateAssemblyDto,
} from './create-assembly.dto.js';
import { ListAssembliesQueryDto } from './list-assemblies-query.dto.js';

/** Campos con error (incluidos los anidados, como topics.0.options) y sus mensajes. */
function collect(
  errors: ValidationError[],
  parent = '',
): { path: string; messages: string[] }[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? [{ path, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...collect(error.children ?? [], path)];
  });
}

async function check<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const found = collect(errors);
  return {
    dto,
    fields: found.map((item) => item.path),
    messages: [...new Set(found.flatMap((item) => item.messages))],
  };
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

  it.each<[string, object, string, string]>([
    ['título de 4 caracteres', { title: 'Hola' }, 'title', M.title],
    ['título de 101 caracteres', { title: 'x'.repeat(101) }, 'title', M.title],
    ['título solo con espacios', { title: '      ' }, 'title', M.title],
    ['título ausente', { title: undefined }, 'title', M.title],
    [
      'descripción de 1001 caracteres',
      { description: 'x'.repeat(1001) },
      'description',
      M.description,
    ],
    ['inicio que no es fecha', { startsAt: 'mañana' }, 'startsAt', M.startsAt],
    ['cierre que no es fecha', { endsAt: '' }, 'endsAt', M.endsAt],
    ['sin temas', { topics: [] }, 'topics', M.topics],
    ['temas que no son lista', { topics: 'uno' }, 'topics', M.topics],
    [
      'más de 10 temas',
      { topics: Array.from({ length: 11 }, () => valid.topics[0]) },
      'topics',
      M.topics,
    ],
    [
      'pregunta de 4 caracteres',
      { topics: [{ question: '¿Sí?', options: ['A', 'B'] }] },
      'topics.0.question',
      M.question,
    ],
    [
      'un tema con 1 opción',
      { topics: topicWith(['A favor']) },
      'topics.0.options',
      M.options,
    ],
    [
      'un tema con 7 opciones',
      { topics: topicWith(['1', '2', '3', '4', '5', '6', '7']) },
      'topics.0.options',
      M.options,
    ],
    [
      'una opción vacía',
      { topics: topicWith(['A favor', '   ']) },
      'topics.0.options',
      M.option,
    ],
    [
      'una opción de 81 caracteres',
      { topics: topicWith(['A favor', 'x'.repeat(81)]) },
      'topics.0.options',
      M.option,
    ],
  ])(
    'rechaza %s con el mensaje en español',
    async (_caso, change, field, message) => {
      const { fields, messages } = await check(CreateAssemblyDto, {
        ...valid,
        ...change,
      });
      expect(fields).toContain(field);
      expect(messages).toEqual([message]);
    },
  );

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

  it.each<[object, string, string]>([
    [
      { status: 'BORRADOR' },
      'status',
      'El estado debe ser PROGRAMADA, ABIERTA o CERRADA.',
    ],
    [
      { page: '0' },
      'page',
      'page debe ser un número entero mayor o igual a 1.',
    ],
    [
      { pageSize: '51' },
      'pageSize',
      'pageSize debe ser un entero entre 1 y 50.',
    ],
  ])('rechaza %o con el mensaje en español', async (query, field, message) => {
    const { fields, messages } = await check(ListAssembliesQueryDto, query);
    expect(fields).toEqual([field]);
    expect(messages).toEqual([message]);
  });
});
