import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FEE_MESSAGES } from '../fees.constants.js';
import { FeeGenerationsPageQueryDto, GenerateFeesDto } from './index.js';

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

const valid = { period: '2026-12', amount: 35.5, dueDate: '2026-12-10' };

describe('DTO de la generación de cuotas', () => {
  it.each([1, 19.99, 35.5, 5000])('acepta el monto %s', async (amount) => {
    const { fields } = await check(GenerateFeesDto, { ...valid, amount });
    expect(fields).toEqual([]);
  });

  it.each([0, 0.99, 5000.01, 35.555, '35.50'])(
    'rechaza el monto %s con el mensaje de la card',
    async (amount) => {
      const { fields, messages } = await check(GenerateFeesDto, {
        ...valid,
        amount,
      });
      expect(fields).toEqual(['amount']);
      expect(messages).toContain(FEE_MESSAGES.amount);
    },
  );

  it('rechaza un periodo sin formato AAAA-MM y una fecha imposible', async () => {
    const badPeriod = await check(GenerateFeesDto, {
      ...valid,
      period: '2026-13',
    });
    expect(badPeriod.fields).toEqual(['period']);
    expect(badPeriod.messages).toContain(FEE_MESSAGES.periodFormat);

    const badDate = await check(GenerateFeesDto, {
      ...valid,
      dueDate: '2026-02-30',
    });
    expect(badDate.fields).toEqual(['dueDate']);
    expect(badDate.messages).toContain(FEE_MESSAGES.dueDateFormat);
  });

  it('recorta el concepto, toma el vacío como ausente y rechaza más de 60 caracteres', async () => {
    const blank = await check(GenerateFeesDto, { ...valid, concept: '   ' });
    expect(blank.dto.concept).toBeUndefined();
    expect(blank.fields).toEqual([]);

    const padded = await check(GenerateFeesDto, {
      ...valid,
      concept: '  Cuota extra  ',
    });
    expect(padded.dto.concept).toBe('Cuota extra');

    const tooLong = await check(GenerateFeesDto, {
      ...valid,
      concept: 'x'.repeat(61),
    });
    expect(tooLong.fields).toEqual(['concept']);
    expect(tooLong.messages).toContain(FEE_MESSAGES.concept);
  });

  it('el historial pide la página 1 de 10 filas por defecto y no acepta más de 50', async () => {
    const defaults = await check(FeeGenerationsPageQueryDto, {});
    expect(defaults.dto).toMatchObject({ page: 1, pageSize: 10 });
    expect(defaults.fields).toEqual([]);

    const custom = await check(FeeGenerationsPageQueryDto, {
      page: '2',
      pageSize: '20',
    });
    expect(custom.dto).toMatchObject({ page: 2, pageSize: 20 });

    const tooBig = await check(FeeGenerationsPageQueryDto, { pageSize: '51' });
    expect(tooBig.fields).toEqual(['pageSize']);
    expect(tooBig.messages).toContain(FEE_MESSAGES.pageSize);

    const zero = await check(FeeGenerationsPageQueryDto, { page: '0' });
    expect(zero.fields).toEqual(['page']);
    expect(zero.messages).toContain(FEE_MESSAGES.page);
  });
});
