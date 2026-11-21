import {
  allowedPeriods,
  defaultConcept,
  isAllowedPeriod,
  isValidDueDate,
  periodLabel,
} from './billing-period.js';

describe('periodos de facturación', () => {
  it('la ventana va del mes actual a 3 meses adelante y cruza el año', () => {
    expect(allowedPeriods('2026-11-06')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('rechaza el mes anterior y el cuarto mes adelante', () => {
    expect(isAllowedPeriod('2026-10', '2026-11-06')).toBe(false);
    expect(isAllowedPeriod('2026-11', '2026-11-06')).toBe(true);
    expect(isAllowedPeriod('2027-02', '2026-11-06')).toBe(true);
    expect(isAllowedPeriod('2027-03', '2026-11-06')).toBe(false);
  });

  it('el vencimiento cae dentro del periodo y no antes de hoy', () => {
    expect(isValidDueDate('2026-12-10', '2026-12', '2026-11-06')).toBe(true);
    expect(isValidDueDate('2026-11-06', '2026-11', '2026-11-06')).toBe(true);
    expect(isValidDueDate('2026-11-05', '2026-11', '2026-11-06')).toBe(false);
    expect(isValidDueDate('2027-01-01', '2026-12', '2026-11-06')).toBe(false);
  });

  it('nombra el periodo con el mes en minúscula para el concepto por defecto', () => {
    expect(periodLabel('2027-01')).toBe('enero 2027');
    expect(defaultConcept('2026-12')).toBe(
      'Cuota de mantenimiento diciembre 2026',
    );
  });
});
