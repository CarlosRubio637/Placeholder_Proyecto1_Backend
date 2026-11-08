import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DELINQUENCY_MESSAGES } from '../reports.constants.js';
import { DelinquencyQueryDto } from './delinquency-query.dto.js';

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(DelinquencyQueryDto, raw);
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

describe('DelinquencyQueryDto', () => {
  it('sin parámetros usa página 1 y 20 por página', async () => {
    const { dto, errors } = await check({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it('acepta fechas AAAA-MM-DD y convierte la paginación', async () => {
    const { dto, errors } = await check({
      from: '2025-11-07',
      to: '2026-11-07',
      page: '2',
      pageSize: '50',
    });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it.each(['07/11/2026', '2026-11-07T00:00:00Z', '2026-02-30', 'hoy'])(
    'rechaza la fecha %s',
    async (value) => {
      const { errors } = await check({ from: value });
      expect(messagesOf(errors, 'from')).toContain(
        DELINQUENCY_MESSAGES.dateFormat,
      );
    },
  );

  it.each(['0', '1.5', 'abc'])('rechaza la página %s', async (page) => {
    const { errors } = await check({ page });
    expect(messagesOf(errors, 'page')).toContain(DELINQUENCY_MESSAGES.page);
  });

  it.each(['0', '51'])('rechaza el tamaño de página %s', async (pageSize) => {
    const { errors } = await check({ pageSize });
    expect(messagesOf(errors, 'pageSize')).toContain(
      DELINQUENCY_MESSAGES.pageSize,
    );
  });
});
