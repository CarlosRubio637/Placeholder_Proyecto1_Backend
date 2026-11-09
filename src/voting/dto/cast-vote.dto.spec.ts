import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CastVoteDto } from './cast-vote.dto.js';

async function errorsOf(plain: object) {
  const errors = await validate(plainToInstance(CastVoteDto, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => ({
    field: error.property,
    messages: Object.values(error.constraints ?? {}),
  }));
}

describe('CastVoteDto (H23)', () => {
  it('acepta un uuid', async () => {
    await expect(
      errorsOf({ optionId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11' }),
    ).resolves.toEqual([]);
  });

  it.each([
    ['ausente', {}],
    ['vacía', { optionId: '' }],
    ['que no es uuid', { optionId: 'a-favor' }],
    ['que no es texto', { optionId: 5 }],
  ])('rechaza una opción %s', async (_caso, body) => {
    await expect(errorsOf(body)).resolves.toEqual([
      { field: 'optionId', messages: ['Selecciona una opción.'] },
    ]);
  });

  it('rechaza campos extra, como una unidad elegida por el cliente', async () => {
    const errors = await errorsOf({
      optionId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11',
      unitId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11',
    });
    expect(errors.map((error) => error.field)).toEqual(['unitId']);
  });
});
