import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PARTICIPATION_MESSAGES } from '../participation-report.constants.js';
import { ParticipationReportQueryDto } from './participation-report-query.dto.js';

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(ParticipationReportQueryDto, raw);
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

describe('ParticipationReportQueryDto', () => {
  it('sin parámetros usa la página 1 y 10 por página', async () => {
    const { dto, errors } = await check({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, pageSize: 10 });
    expect(dto.assemblyId).toBeUndefined();
  });

  it('acepta asamblea, fechas y paginación', async () => {
    const { dto, errors } = await check({
      assemblyId: '3f0b6a3e-8d55-4c5b-9a3e-2b1f6f7d9c10',
      from: '2026-01-01',
      to: '2026-11-19',
      page: '2',
      pageSize: '50',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, pageSize: 50 });
  });

  it('rechaza una asamblea que no es uuid', async () => {
    const { errors } = await check({ assemblyId: '123' });
    expect(messagesOf(errors, 'assemblyId')).toContain(
      PARTICIPATION_MESSAGES.assemblyId,
    );
  });

  it.each(['ayer', '19/11/2026', '2026-02-30'])(
    'rechaza la fecha %s',
    async (value) => {
      const { errors } = await check({ from: value, to: value });
      expect(messagesOf(errors, 'from')).toContain(
        PARTICIPATION_MESSAGES.dateFormat,
      );
      expect(messagesOf(errors, 'to')).toContain(
        PARTICIPATION_MESSAGES.dateFormat,
      );
    },
  );

  it.each([
    ['page', '0', PARTICIPATION_MESSAGES.page],
    ['page', '1.5', PARTICIPATION_MESSAGES.page],
    ['pageSize', '0', PARTICIPATION_MESSAGES.pageSize],
    ['pageSize', '51', PARTICIPATION_MESSAGES.pageSize],
  ])('rechaza %s=%s', async (field, value, message) => {
    const { errors } = await check({ [field]: value });
    expect(messagesOf(errors, field)).toContain(message);
  });
});
