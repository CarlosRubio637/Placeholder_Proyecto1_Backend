import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MY_VISITS_MESSAGES as M } from '../visits.constants.js';
import { MyVisitsQueryDto, VisitResponseDto } from './my-visits.dto.js';

async function check<T extends object>(cls: new () => T, plain: object) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    fields: errors.map((error) => error.property),
    messages: [
      ...new Set(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      ),
    ],
  };
}

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  it('AC1: por defecto pide Activas, página 1 de 10', async () => {
    const { dto, fields } = await check(MyVisitsQueryDto, {});
    expect(fields).toEqual([]);
    expect(dto).toMatchObject({ tab: 'activas', page: 1, pageSize: 10 });
  });

  it.each<[object, string, string]>([
    [{ tab: 'todas' }, 'tab', M.tab],
    [{ page: '0' }, 'page', M.page],
    [{ pageSize: '51' }, 'pageSize', M.pageSize],
  ])(
    'AC1: rechaza la consulta %o con 400 y el campo',
    async (query, field, message) => {
      const { fields, messages } = await check(MyVisitsQueryDto, query);
      expect(fields).toEqual([field]);
      expect(messages).toEqual([message]);
    },
  );

  it('AC5: no deja elegir la unidad: sale del token', async () => {
    const { fields } = await check(MyVisitsQueryDto, {
      unitId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11',
    });
    expect(fields).toEqual(['unitId']);
  });
});

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  it.each([
    ['aprobar', { decision: 'APROBAR' }],
    ['rechazar sin motivo', { decision: 'RECHAZAR' }],
    [
      'rechazar con motivo de 100',
      { decision: 'RECHAZAR', reason: 'x'.repeat(100) },
    ],
  ])('AC3: acepta %s', async (_caso, body) => {
    await expect(check(VisitResponseDto, body)).resolves.toMatchObject({
      fields: [],
    });
  });

  it('AC3: recorta el motivo opcional y uno vacío cuenta como sin motivo', async () => {
    const trimmed = await check(VisitResponseDto, {
      decision: 'RECHAZAR',
      reason: '  No lo conozco  ',
    });
    expect(trimmed.dto.reason).toBe('No lo conozco');
    const empty = await check(VisitResponseDto, {
      decision: 'RECHAZAR',
      reason: '   ',
    });
    expect(empty.dto.reason).toBeUndefined();
  });

  it.each<[object, string, string]>([
    [{ decision: 'TAL_VEZ' }, 'decision', M.decision],
    [{ decision: 'RECHAZAR', reason: 'x'.repeat(101) }, 'reason', M.reason],
  ])(
    'AC3: rechaza la respuesta %o con 400 y el campo',
    async (body, field, message) => {
      const { fields, messages } = await check(VisitResponseDto, body);
      expect(fields).toEqual([field]);
      expect(messages).toEqual([message]);
    },
  );
});
