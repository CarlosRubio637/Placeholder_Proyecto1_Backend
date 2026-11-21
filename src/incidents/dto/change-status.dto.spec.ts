import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeStatusDto, STATUS_MESSAGES } from './change-status.dto.js';

async function check(plain: object) {
  const dto = plainToInstance(ChangeStatusDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    fields: errors.map((error) => error.property),
    // Sin repetidos, como los devuelve el ValidationPipe global.
    messages: [
      ...new Set(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      ),
    ],
  };
}

const VALID = {
  toStatus: 'EN_PROCESO',
  note: 'Se envió al fontanero.',
  expectedStatus: 'PENDIENTE',
};

describe('ChangeStatusDto (H13)', () => {
  it('acepta un cambio válido y recorta la observación', async () => {
    const { dto, fields } = await check({
      ...VALID,
      note: '  Se envió al fontanero.  ',
    });
    expect(fields).toEqual([]);
    expect(dto.note).toBe('Se envió al fontanero.');
  });

  it.each([
    ['de 9 caracteres', 'x'.repeat(9)],
    ['solo con espacios', '            '],
    ['de 501 caracteres', 'x'.repeat(501)],
    ['ausente', undefined],
  ])('rechaza una observación %s', async (_caso, note) => {
    const { fields, messages } = await check({ ...VALID, note });
    expect(fields).toEqual(['note']);
    expect(messages).toEqual([
      'Escribe una observación de 10 a 500 caracteres.',
    ]);
  });

  it('acepta exactamente 10 y 500 caracteres', async () => {
    for (const note of ['x'.repeat(10), 'x'.repeat(500)]) {
      await expect(check({ ...VALID, note })).resolves.toMatchObject({
        fields: [],
      });
    }
  });

  it.each([
    ['PENDIENTE', 'no se vuelve a Pendiente'],
    ['CERRADA', 'no existe'],
  ])('rechaza toStatus %s (%s)', async (toStatus) => {
    const { fields, messages } = await check({ ...VALID, toStatus });
    expect(fields).toEqual(['toStatus']);
    expect(messages).toEqual([STATUS_MESSAGES.toStatus]);
  });

  it('expectedStatus es obligatorio', async () => {
    const { fields } = await check({ ...VALID, expectedStatus: undefined });
    expect(fields).toEqual(['expectedStatus']);
  });
});
