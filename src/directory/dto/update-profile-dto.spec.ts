import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DIRECTORY_MESSAGES } from '../directory.constants.js';
import { UpdateProfileDto } from './index.js';

async function check(plain: object) {
  const dto = plainToInstance(UpdateProfileDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    errors,
    fields: errors.map((error) => error.property),
    messages: errors.flatMap((error) => Object.values(error.constraints ?? {})),
  };
}

const valid = {
  phone: '7845-1290',
  directory: {
    visible: true,
    showName: true,
    showUnit: true,
    showPhone: false,
    showEmail: false,
  },
};

describe('DTO del perfil', () => {
  it('acepta un perfil válido', async () => {
    const { fields } = await check(valid);
    expect(fields).toEqual([]);
  });

  it('recorta los espacios del teléfono', async () => {
    const { dto, fields } = await check({ ...valid, phone: ' 7845-1290 ' });
    expect(fields).toEqual([]);
    expect(dto.phone).toBe('7845-1290');
  });

  it.each(['78451290', '7845-12a0', '', undefined])(
    'rechaza el teléfono %j con el mensaje de la card',
    async (phone) => {
      const { fields, messages } = await check({ ...valid, phone });
      expect(fields).toEqual(['phone']);
      expect(messages).toContain(DIRECTORY_MESSAGES.phone);
    },
  );

  it('rechaza el perfil sin preferencias', async () => {
    const { fields, messages } = await check({ phone: valid.phone });
    expect(fields).toEqual(['directory']);
    expect(messages).toContain(DIRECTORY_MESSAGES.directory);
  });

  it.each([
    [
      'showUnit',
      { visible: true, showName: true, showPhone: false, showEmail: false },
    ],
    ['visible', { ...valid.directory, visible: 'true' }],
  ])(
    'rechaza la preferencia %s ausente o como texto',
    async (child, directory) => {
      const { errors, fields } = await check({ ...valid, directory });
      expect(fields).toEqual(['directory']);
      const children = errors[0].children ?? [];
      expect(children.map((error) => error.property)).toEqual([child]);
      expect(Object.values(children[0].constraints ?? {})).toContain(
        DIRECTORY_MESSAGES.directory,
      );
    },
  );
});
