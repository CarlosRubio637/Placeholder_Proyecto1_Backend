import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePackageDto,
  ListPackagesQueryDto,
  MyPackagesQueryDto,
} from './index.js';

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

const UNIT = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

describe('CreatePackageDto (H19)', () => {
  it('acepta un paquete válido y recorta espacios', async () => {
    const { dto, fields } = await check(CreatePackageDto, {
      unitId: UNIT,
      courier: '  DHL  ',
      trackingNumber: ' 4581-2203 ',
      notes: ' Caja mediana ',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({
      courier: 'DHL',
      trackingNumber: '4581-2203',
      notes: 'Caja mediana',
    });
  });

  it('guía y observaciones vacías cuentan como no enviadas', async () => {
    const { dto, fields } = await check(CreatePackageDto, {
      unitId: UNIT,
      courier: 'DHL',
      trackingNumber: '   ',
      notes: '',
    });
    expect(fields).toEqual([]);
    expect(dto.trackingNumber).toBeUndefined();
    expect(dto.notes).toBeUndefined();
  });

  it.each<[string, object, string, string]>([
    [
      'unidad que no es uuid',
      { unitId: 'A-101' },
      'unitId',
      'Selecciona la unidad destino.',
    ],
    [
      'empresa de 1 carácter',
      { courier: 'D' },
      'courier',
      'Ingresa la empresa de mensajería (2 a 40 caracteres).',
    ],
    [
      'empresa de 41 caracteres',
      { courier: 'x'.repeat(41) },
      'courier',
      'Ingresa la empresa de mensajería (2 a 40 caracteres).',
    ],
    [
      'guía con espacios internos',
      { trackingNumber: '4581 2203' },
      'trackingNumber',
      'La guía solo admite letras, números y guiones (4 a 40).',
    ],
    [
      'guía de 3 caracteres',
      { trackingNumber: 'AB1' },
      'trackingNumber',
      'La guía solo admite letras, números y guiones (4 a 40).',
    ],
    [
      'observaciones de 201 caracteres',
      { notes: 'x'.repeat(201) },
      'notes',
      'Las observaciones no pueden superar los 200 caracteres.',
    ],
  ])('rechaza %s', async (_caso, change, field, message) => {
    const { fields, messages } = await check(CreatePackageDto, {
      unitId: UNIT,
      courier: 'DHL',
      ...change,
    });
    expect(fields).toEqual([field]);
    expect(messages).toContain(message);
  });
});

describe('ListPackagesQueryDto (H19)', () => {
  it('convierte la paginación a número y deja vacíos como no enviados', async () => {
    const { dto, fields } = await check(ListPackagesQueryDto, {
      page: '2',
      pageSize: '50',
      status: '',
      search: '  ',
    });
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ page: 2, pageSize: 50 });
    expect(dto.status).toBeUndefined();
    expect(dto.search).toBeUndefined();
  });

  it.each<[object, string]>([
    [{ pageSize: '101' }, 'pageSize'],
    [{ page: '0' }, 'page'],
    [{ status: 'PERDIDO' }, 'status'],
    [{ towerId: 'A' }, 'towerId'],
    [{ search: 'x'.repeat(41) }, 'search'],
  ])('rechaza %o', async (query, field) => {
    expect((await check(ListPackagesQueryDto, query)).fields).toEqual([field]);
  });
});

describe('MyPackagesQueryDto (H20)', () => {
  it('exige la pestaña (estado)', async () => {
    expect((await check(MyPackagesQueryDto, {})).fields).toEqual(['status']);
    expect(
      (await check(MyPackagesQueryDto, { status: 'ENTREGADO' })).fields,
    ).toEqual([]);
  });

  it('no acepta unitId: la unidad sale del token', async () => {
    const { fields } = await check(MyPackagesQueryDto, {
      status: 'PENDIENTE_ENTREGA',
      unitId: UNIT,
    });
    expect(fields).toEqual(['unitId']);
  });
});
