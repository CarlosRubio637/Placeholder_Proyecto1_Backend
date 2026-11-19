import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AREAS_USAGE_MESSAGES } from '../areas-usage.constants.js';
import { AreasUsageQueryDto } from './areas-usage-query.dto.js';

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(AreasUsageQueryDto, raw);
  const errors = await validate(dto);
  return { dto, errors };
}

function messagesOf(
  errors: Awaited<ReturnType<typeof validate>>,
  property: string,
) {
  return Object.values(
    errors.find((e) => e.property === property)?.constraints ?? {},
  );
}

describe('AreasUsageQueryDto', () => {
  it('sin parámetros es válido (el servicio usa el mes actual)', async () => {
    const { dto, errors } = await check({});
    expect(errors).toHaveLength(0);
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it('acepta fechas AAAA-MM-DD', async () => {
    const { errors } = await check({ from: '2026-11-01', to: '2026-11-19' });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['texto', 'ayer'],
    ['otro formato', '19/11/2026'],
    ['fecha con hora', '2026-11-19T10:00:00Z'],
    ['un día que no existe', '2026-02-30'],
  ])('rechaza %s en from y en to', async (_caso, value) => {
    const { errors } = await check({ from: value, to: value });
    expect(messagesOf(errors, 'from')).toContain(
      AREAS_USAGE_MESSAGES.dateFormat,
    );
    expect(messagesOf(errors, 'to')).toContain(AREAS_USAGE_MESSAGES.dateFormat);
  });
});
