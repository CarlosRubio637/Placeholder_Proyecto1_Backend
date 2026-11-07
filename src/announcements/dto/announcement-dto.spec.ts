import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';
import { AudienceQueryDto, CreateAnnouncementDto } from './index.js';

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

const TOWER_A = '0b6f4c1e-8a57-4b55-9a52-5a3f4c7d2e11';
const TOWER_B = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b';
const TOWER_C = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const TOWER_D = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';

const valid = {
  title: 'Corte de agua el 4 de noviembre',
  body: 'No habrá agua de 08:00 a 16:00 en las tres torres.',
  category: 'CORTE_SERVICIO',
  audience: 'TORRES',
  towerIds: [TOWER_A],
  expiresOn: '2026-11-14',
};

describe('DTO del comunicado', () => {
  it('acepta un comunicado TORRES válido', async () => {
    const { fields } = await check(CreateAnnouncementDto, valid);
    expect(fields).toEqual([]);
  });

  it('acepta un comunicado TODOS sin torres', async () => {
    const { towerIds: _towerIds, ...rest } = valid;
    const { fields } = await check(CreateAnnouncementDto, {
      ...rest,
      audience: 'TODOS',
    });
    expect(fields).toEqual([]);
  });

  it('recorta los espacios del título y del contenido', async () => {
    const { dto } = await check(CreateAnnouncementDto, {
      ...valid,
      title: '  Corte de agua  ',
      body: '  Primera línea\nSegunda línea  ',
    });
    expect(dto.title).toBe('Corte de agua');
    expect(dto.body).toBe('Primera línea\nSegunda línea');
  });

  it.each([['abcd'], ['   abcd   '], ['x'.repeat(101)], [undefined]])(
    'rechaza el título %j con el mensaje de la card',
    async (title) => {
      const { fields, messages } = await check(CreateAnnouncementDto, {
        ...valid,
        title,
      });
      expect(fields).toEqual(['title']);
      expect(messages).toContain(ANNOUNCEMENT_MESSAGES.title);
    },
  );

  it.each([['x'.repeat(9)], ['x'.repeat(2001)]])(
    'rechaza el contenido de %#',
    async (body) => {
      const { fields, messages } = await check(CreateAnnouncementDto, {
        ...valid,
        body,
      });
      expect(fields).toEqual(['body']);
      expect(messages).toContain(ANNOUNCEMENT_MESSAGES.body);
    },
  );

  it('rechaza la categoría y la audiencia desconocidas', async () => {
    const { fields } = await check(CreateAnnouncementDto, {
      ...valid,
      category: 'URGENTE',
      audience: 'UNIDAD',
    });
    expect(fields).toEqual(['category', 'audience']);
  });

  it.each([
    ['sin torres', []],
    ['sin la lista', undefined],
    ['con torres repetidas', [TOWER_A, TOWER_A]],
  ])('rechaza TORRES %s', async (_case, towerIds) => {
    const { fields, messages } = await check(CreateAnnouncementDto, {
      ...valid,
      towerIds,
    });
    expect(fields).toEqual(['towerIds']);
    expect(messages).toContain(ANNOUNCEMENT_MESSAGES.towerIds);
  });

  it('rechaza TORRES con 4 torres con el máximo de torres', async () => {
    const { fields, messages } = await check(CreateAnnouncementDto, {
      ...valid,
      towerIds: [TOWER_A, TOWER_B, TOWER_C, TOWER_D],
    });
    expect(fields).toEqual(['towerIds']);
    expect(messages).toEqual([ANNOUNCEMENT_MESSAGES.maxTowers]);
  });

  it('cuenta los emojis como los cuenta Postgres', async () => {
    const heart = '❤️';
    const title = await check(CreateAnnouncementDto, {
      ...valid,
      title: heart.repeat(60),
    });
    const body = await check(CreateAnnouncementDto, {
      ...valid,
      body: heart.repeat(1001),
    });
    expect(title.fields).toEqual(['title']);
    expect(body.fields).toEqual(['body']);
  });

  it('rechaza una torre que no es uuid', async () => {
    const { fields, messages } = await check(CreateAnnouncementDto, {
      ...valid,
      towerIds: ['torre-a'],
    });
    expect(fields).toEqual(['towerIds']);
    expect(messages).toContain(ANNOUNCEMENT_MESSAGES.towerIdFormat);
  });

  it.each([['2026-13-01'], ['30/11/2026'], [undefined]])(
    'rechaza la fecha %j',
    async (expiresOn) => {
      const { fields, messages } = await check(CreateAnnouncementDto, {
        ...valid,
        expiresOn,
      });
      expect(fields).toEqual(['expiresOn']);
      expect(messages).toContain(ANNOUNCEMENT_MESSAGES.expiresOnFormat);
    },
  );
});

describe('consulta de la audiencia', () => {
  it.each([
    ['separados por coma', `${TOWER_A},${TOWER_B}`],
    ['repetidos', [TOWER_A, TOWER_B]],
  ])('acepta ids %s', async (_case, towerIds) => {
    const { dto, fields } = await check(AudienceQueryDto, { towerIds });
    expect(fields).toEqual([]);
    expect(dto.towerIds).toEqual([TOWER_A, TOWER_B]);
  });

  it.each([[''], [undefined]])(
    'deja undefined una consulta %j',
    async (towerIds) => {
      const { dto, fields } = await check(AudienceQueryDto, { towerIds });
      expect(fields).toEqual([]);
      expect(dto.towerIds).toBeUndefined();
    },
  );

  it('rechaza una torre que no es uuid', async () => {
    const { fields } = await check(AudienceQueryDto, { towerIds: 'x' });
    expect(fields).toEqual(['towerIds']);
  });
});

describe('máximo de torres en la audiencia', () => {
  it('rechaza 4 torres con el mensaje del máximo', async () => {
    const { fields, messages } = await check(AudienceQueryDto, {
      towerIds: [TOWER_A, TOWER_B, TOWER_C, TOWER_D].join(','),
    });
    expect(fields).toEqual(['towerIds']);
    expect(messages).toEqual([ANNOUNCEMENT_MESSAGES.maxTowers]);
  });
});
