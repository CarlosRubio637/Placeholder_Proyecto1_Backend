import { BadRequestException } from '@nestjs/common';
import type {
  DelinquencyRepository,
  UnitDebt,
} from './delinquency.repository.js';
import {
  DelinquencyService,
  twelveMonthsBefore,
} from './delinquency.service.js';
import { DELINQUENCY_MESSAGES } from './reports.constants.js';

// Sábado 7 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-07T16:00:00Z');
const TODAY = '2026-11-07';

function debt(
  unitCode: string,
  owedAmount: number,
  oldestDueDate: string,
): UnitDebt {
  return {
    unitCode,
    owedAmount,
    oldestDueDate: new Date(`${oldestDueDate}T00:00:00.000Z`),
  };
}

function setup(
  overrides: Partial<Record<keyof DelinquencyRepository, unknown>> = {},
) {
  const repository = {
    owedAmount: vi.fn().mockResolvedValue(0),
    overdueUnitIds: vi.fn().mockResolvedValue([]),
    countActiveUnits: vi.fn().mockResolvedValue(0),
    unitDebts: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  const service = new DelinquencyService(
    repository as unknown as DelinquencyRepository,
  );
  return { service, repository };
}

const query = (extra: Record<string, unknown> = {}) => ({
  page: 1,
  pageSize: 20,
  ...extra,
});

async function expectBadRequest(promise: Promise<unknown>, message: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    field: 'to',
    message: [message],
  });
}

describe('twelveMonthsBefore', () => {
  it('resta un año a la fecha', () => {
    expect(twelveMonthsBefore('2026-11-07')).toBe('2025-11-07');
  });

  it('pasa el 29 de febrero al 28', () => {
    expect(twelveMonthsBefore('2028-02-29')).toBe('2027-02-28');
  });
});

describe('DelinquencyService.resolveRange', () => {
  const { service } = setup();

  it('sin fechas usa los últimos 12 meses hasta hoy', () => {
    expect(service.resolveRange({}, TODAY)).toEqual({
      from: '2025-11-07',
      to: TODAY,
    });
  });

  it('con solo `to` usa los 12 meses anteriores a esa fecha', () => {
    expect(service.resolveRange({ to: '2026-06-30' }, TODAY)).toEqual({
      from: '2025-06-30',
      to: '2026-06-30',
    });
  });

  it('el rango por defecto es válido aunque incluya un 29 de febrero', () => {
    expect(service.resolveRange({}, '2028-03-01')).toEqual({
      from: '2027-03-01',
      to: '2028-03-01',
    });
  });

  it('acepta un rango de un solo día', () => {
    expect(service.resolveRange({ from: TODAY, to: TODAY }, TODAY)).toEqual({
      from: TODAY,
      to: TODAY,
    });
  });

  it('acepta exactamente 366 días de diferencia', () => {
    expect(
      service.resolveRange({ from: '2025-11-06', to: TODAY }, TODAY),
    ).toEqual({
      from: '2025-11-06',
      to: TODAY,
    });
  });
});

describe('DelinquencyService.getReport', () => {
  it('rechaza un fin anterior al inicio (400, field "to")', async () => {
    const { service, repository } = setup();
    await expectBadRequest(
      service.getReport(query({ from: '2026-10-01', to: '2026-09-30' }), NOW),
      DELINQUENCY_MESSAGES.endBeforeStart,
    );
    expect(repository.owedAmount).not.toHaveBeenCalled();
  });

  it('rechaza más de 366 días (400, field "to")', async () => {
    const { service } = setup();
    await expectBadRequest(
      service.getReport(query({ from: '2025-11-05', to: TODAY }), NOW),
      DELINQUENCY_MESSAGES.rangeTooLong,
    );
  });

  it('consulta con el rango por defecto y la fecha del condominio', async () => {
    const { service, repository } = setup();
    await service.getReport(query(), NOW);
    const range = { from: '2025-11-07', to: TODAY };
    expect(repository.owedAmount).toHaveBeenCalledWith(range);
    expect(repository.overdueUnitIds).toHaveBeenCalledWith(range);
    expect(repository.unitDebts).toHaveBeenCalledWith([], range);
  });

  it('calcula el resumen sobre todas las unidades', async () => {
    const { service } = setup({
      owedAmount: vi.fn().mockResolvedValue(1275.5),
      overdueUnitIds: vi.fn().mockResolvedValue(['u1', 'u2', 'u3']),
      countActiveUnits: vi.fn().mockResolvedValue(40),
    });
    const report = await service.getReport(query(), NOW);
    expect(report.summary).toEqual({
      owedAmount: 1275.5,
      overdueUnits: 3,
      activeUnits: 40,
      overduePct: 7.5,
    });
  });

  it('redondea el porcentaje a un decimal', async () => {
    const { service } = setup({
      overdueUnitIds: vi.fn().mockResolvedValue(['u1']),
      countActiveUnits: vi.fn().mockResolvedValue(3),
    });
    const report = await service.getReport(query(), NOW);
    expect(report.summary.overduePct).toBe(33.3);
  });

  it('devuelve 0 % si no hay unidades activas', async () => {
    const { service } = setup({
      overdueUnitIds: vi.fn().mockResolvedValue(['u1']),
      countActiveUnits: vi.fn().mockResolvedValue(0),
    });
    const report = await service.getReport(query(), NOW);
    expect(report.summary.overduePct).toBe(0);
  });

  it('calcula la antigüedad en días completos hasta hoy y nunca negativa', async () => {
    const { service } = setup({
      unitDebts: vi
        .fn()
        .mockResolvedValue([
          debt('A-101', 85, '2026-10-31'),
          debt('B-202', 85, '2026-11-07'),
          debt('C-303', 85, '2026-12-10'),
        ]),
    });
    const report = await service.getReport(query({ to: '2026-12-31' }), NOW);
    expect(report.data.map((row) => [row.unitCode, row.ageDays])).toEqual([
      ['A-101', 7],
      ['B-202', 0],
      ['C-303', 0],
    ]);
  });

  it('ordena por antigüedad descendente y, en empate, por código ascendente', async () => {
    const { service } = setup({
      unitDebts: vi
        .fn()
        .mockResolvedValue([
          debt('C-101', 85, '2026-09-10'),
          debt('B-404', 170, '2026-08-10'),
          debt('A-201', 85, '2026-09-10'),
        ]),
    });
    const report = await service.getReport(query(), NOW);
    expect(report.data).toEqual([
      { unitCode: 'B-404', owedAmount: 170, ageDays: 89 },
      { unitCode: 'A-201', owedAmount: 85, ageDays: 58 },
      { unitCode: 'C-101', owedAmount: 85, ageDays: 58 },
    ]);
  });

  it('pagina después de ordenar y devuelve el total', async () => {
    const debts = Array.from({ length: 25 }, (_, i) =>
      debt(
        `A-${String(100 + i)}`,
        85,
        `2026-10-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    const { service } = setup({ unitDebts: vi.fn().mockResolvedValue(debts) });

    const second = await service.getReport(query({ page: 2 }), NOW);
    expect(second.total).toBe(25);
    expect(second.page).toBe(2);
    expect(second.pageSize).toBe(20);
    expect(second.data).toHaveLength(5);
    // Las más recientes (menor antigüedad) quedan al final.
    expect(second.data.at(-1)?.unitCode).toBe('A-124');
  });

  it('redondea los montos a dos decimales', async () => {
    const { service } = setup({
      owedAmount: vi.fn().mockResolvedValue(0.1 + 0.2),
      unitDebts: vi
        .fn()
        .mockResolvedValue([debt('A-101', 0.1 + 0.2, '2026-10-01')]),
    });
    const report = await service.getReport(query(), NOW);
    expect(report.summary.owedAmount).toBe(0.3);
    expect(report.data[0]?.owedAmount).toBe(0.3);
  });
});
