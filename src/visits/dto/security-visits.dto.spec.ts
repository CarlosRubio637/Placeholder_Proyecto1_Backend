import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ENTRY_MESSAGES, VISIT_MESSAGES } from '../visits.constants.js';
import {
  CreateVisitRequestDto,
  SearchVisitsQueryDto,
} from './security-visits.dto.js';

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

const UNIT = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';
const REQUEST = {
  visitorName: '  Rosa   Martínez ',
  documentType: 'DUI',
  documentNumber: '01234567-8',
  reason: 'Visita familiar',
  unitId: UNIT,
};

describe('SearchVisitsQueryDto (H16)', () => {
  it.each([
    ['un código en minúsculas', ' k7m2qx ', 'K7M2QX'],
    ['un DUI', '01234567-8', '01234567-8'],
    ['un pasaporte', 'a1234567', 'A1234567'],
  ])('acepta %s y lo normaliza', async (_caso, q, expected) => {
    const { dto, fields } = await check(SearchVisitsQueryDto, { q });
    expect(fields).toEqual([]);
    expect(dto.q).toBe(expected);
  });

  it.each([
    ['vacía', ''],
    ['de 5 caracteres', 'K7M2Q'],
    ['de 13 caracteres', 'A123456789012'],
    ['con espacios en medio', 'K7M 2QX'],
    ['con símbolos', "K7M2Q'"],
  ])('rechaza una búsqueda %s', async (_caso, q) => {
    const { fields, messages } = await check(SearchVisitsQueryDto, { q });
    expect(fields).toEqual(['q']);
    expect(messages).toEqual([ENTRY_MESSAGES.search]);
  });

  it('la búsqueda es obligatoria', async () => {
    await expect(check(SearchVisitsQueryDto, {})).resolves.toMatchObject({
      fields: ['q'],
    });
  });
});

describe('CreateVisitRequestDto (H16)', () => {
  it('acepta una solicitud y limpia el nombre como H14', async () => {
    const { dto, fields } = await check(CreateVisitRequestDto, REQUEST);
    expect(fields).toEqual([]);
    expect(dto.visitorName).toBe('Rosa Martínez');
  });

  it.each<[string, object, string, string]>([
    [
      'un nombre con números',
      { visitorName: 'R2D2' },
      'visitorName',
      VISIT_MESSAGES.name,
    ],
    [
      'un tipo de documento inválido',
      { documentType: 'CARNET' },
      'documentType',
      VISIT_MESSAGES.documentType,
    ],
    [
      'un DUI mal formado',
      { documentNumber: '1234' },
      'documentNumber',
      VISIT_MESSAGES.dui,
    ],
    [
      'un pasaporte mal formado',
      { documentType: 'PASAPORTE', documentNumber: 'A1' },
      'documentNumber',
      VISIT_MESSAGES.passport,
    ],
    ['un motivo corto', { reason: 'Hola' }, 'reason', VISIT_MESSAGES.reason],
    [
      'una unidad que no es uuid',
      { unitId: 'A-101' },
      'unitId',
      ENTRY_MESSAGES.unitId,
    ],
  ])(
    'rechaza %s con el mensaje de H14',
    async (_caso, change, field, message) => {
      const { fields, messages } = await check(CreateVisitRequestDto, {
        ...REQUEST,
        ...change,
      });
      expect(fields).toEqual([field]);
      expect(messages).toEqual([message]);
    },
  );

  it('no acepta fecha ni hora: una solicitud siempre es para hoy', async () => {
    const { fields } = await check(CreateVisitRequestDto, {
      ...REQUEST,
      visitDate: '2026-11-20',
      expectedTime: '10:00',
    });
    expect(fields.sort()).toEqual(['expectedTime', 'visitDate']);
  });
});
