import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IsNormalizedEmail } from './is-normalized-email.decorator.js';

class EmailDto {
  @IsNormalizedEmail()
  email!: string;
}

async function check(email: unknown) {
  const dto = plainToInstance(EmailDto, { email });
  const errors = await validate(dto);
  return {
    email: dto.email,
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const FORMAT = 'El email no tiene un formato válido.';
const LENGTH = 'El email no puede superar los 254 caracteres.';

describe('IsNormalizedEmail', () => {
  it.each([
    ['admin@condominio.test', 'admin@condominio.test'],
    ['  admin@condominio.test  ', 'admin@condominio.test'],
    ['Admin@Condominio.TEST', 'admin@condominio.test'],
    ['\tAdmin@condominio.test\n', 'admin@condominio.test'],
  ])('normaliza %j antes de validar', async (input, expected) => {
    await expect(check(input)).resolves.toEqual({
      email: expected,
      messages: [],
    });
  });

  it.each([[''], ['   '], ['sin-arroba'], ['a@'], ['@condominio.test']])(
    'rechaza %j con el mensaje en español',
    async (input) => {
      const { messages } = await check(input);
      expect(messages).toEqual([FORMAT]);
    },
  );

  it.each([[undefined], [null], [123]])(
    'no falla con un valor %j que no es texto',
    async (input) => {
      const { messages } = await check(input);
      expect(messages).toContain(FORMAT);
    },
  );

  it('rechaza un correo de más de 254 caracteres', async () => {
    const label = 'a'.repeat(60);
    const email = `usuario@${label}.${label}.${label}.${label}.${label}.com`;
    expect(email.length).toBeGreaterThan(254);

    const { messages } = await check(email);

    expect(messages).toContain(LENGTH);
  });
});
