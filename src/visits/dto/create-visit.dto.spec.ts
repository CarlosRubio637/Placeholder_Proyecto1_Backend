import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VISIT_MESSAGES } from '../visits.constants.js';
import { CreateVisitDto } from './create-visit.dto.js';

const VALID = {
  visitorName: 'Ana María López',
  documentType: 'DUI',
  documentNumber: '01234567-8',
  visitDate: '2026-11-10',
  expectedTime: '15:30',
  reason: 'Visita familiar',
};

async function check(raw: Record<string, unknown>) {
  const dto = plainToInstance(CreateVisitDto, { ...VALID, ...raw });
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

describe('CreateVisitDto', () => {
  it('acepta una autorización válida y limpia el nombre', async () => {
    const { dto, errors } = await check({
      visitorName: '  Ana   María López ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.visitorName).toBe('Ana María López');
  });

  it.each(['Al', 'A'.repeat(81), 'Ana 123', '   '])(
    'rechaza el nombre %j',
    async (visitorName) => {
      const { errors } = await check({ visitorName });
      expect(messagesOf(errors, 'visitorName')).toContain(VISIT_MESSAGES.name);
    },
  );

  it('rechaza un tipo de documento distinto de DUI o Pasaporte', async () => {
    const { errors } = await check({ documentType: 'LICENCIA' });
    expect(messagesOf(errors, 'documentType')).toContain(
      VISIT_MESSAGES.documentType,
    );
    // Sin tipo válido no se acusa también el número.
    expect(messagesOf(errors, 'documentNumber')).toHaveLength(0);
  });

  it.each(['012345678', '0123456-78', 'AB123456-7'])(
    'rechaza el DUI %s',
    async (documentNumber) => {
      const { errors } = await check({ documentNumber });
      expect(messagesOf(errors, 'documentNumber')).toEqual([
        VISIT_MESSAGES.dui,
      ]);
    },
  );

  it('acepta un pasaporte de 6 a 12 letras o números', async () => {
    const { errors } = await check({
      documentType: 'PASAPORTE',
      documentNumber: 'ab12345',
    });
    expect(errors).toHaveLength(0);
  });

  it.each(['A1234', 'A1234567890123', 'AB-12345'])(
    'rechaza el pasaporte %s',
    async (documentNumber) => {
      const { errors } = await check({
        documentType: 'PASAPORTE',
        documentNumber,
      });
      expect(messagesOf(errors, 'documentNumber')).toEqual([
        VISIT_MESSAGES.passport,
      ]);
    },
  );

  it.each(['10/11/2026', '2026-02-30', ''])(
    'rechaza la fecha %j',
    async (visitDate) => {
      const { errors } = await check({ visitDate });
      expect(messagesOf(errors, 'visitDate')).toContain(
        VISIT_MESSAGES.dateFormat,
      );
    },
  );

  it.each(['3:30', '24:00', '15:60', ''])(
    'rechaza la hora %j',
    async (expectedTime) => {
      const { errors } = await check({ expectedTime });
      expect(messagesOf(errors, 'expectedTime')).toContain(
        VISIT_MESSAGES.hours,
      );
    },
  );

  it.each(['Hola', 'x'.repeat(101)])('rechaza el motivo %j', async (reason) => {
    const { errors } = await check({ reason });
    expect(messagesOf(errors, 'reason')).toContain(VISIT_MESSAGES.reason);
  });
});
