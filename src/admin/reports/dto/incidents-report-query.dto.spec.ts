import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { INCIDENTS_REPORT_MESSAGES } from '../incidents-report.constants.js';
import { IncidentsReportQueryDto } from './incidents-report-query.dto.js';

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(IncidentsReportQueryDto, raw);
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

describe('IncidentsReportQueryDto', () => {
  it('sin parámetros usa página 1 y 20 por página', async () => {
    const { dto, errors } = await check({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
    expect(dto.from).toBeUndefined();
  });

  it('acepta fechas AAAA-MM-DD y convierte la paginación', async () => {
    const { dto, errors } = await check({
      from: '2026-11-01',
      to: '2026-11-08',
      page: '3',
      pageSize: '50',
    });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(50);
  });

  it.each(['2026-11-8', '2026-02-30', '08/11/2026', '2026-11-08T00:00:00Z'])(
    'rechaza la fecha %s',
    async (from) => {
      const { errors } = await check({ from });
      expect(messagesOf(errors, 'from')).toContain(
        INCIDENTS_REPORT_MESSAGES.dateFormat,
      );
    },
  );

  it('rechaza una página menor a 1 y un tamaño mayor a 50', async () => {
    const { errors } = await check({ page: '0', pageSize: '51' });
    expect(messagesOf(errors, 'page')).toContain(
      INCIDENTS_REPORT_MESSAGES.page,
    );
    expect(messagesOf(errors, 'pageSize')).toContain(
      INCIDENTS_REPORT_MESSAGES.pageSize,
    );
  });
});
