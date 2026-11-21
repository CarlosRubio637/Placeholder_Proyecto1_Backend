import {
  addDays,
  condominiumDayStart,
  currentTime,
  daysInRange,
  formatDateEs,
  fromDbDate,
  todayIso,
  toDbDate,
} from './condominium-time.js';

describe('todayIso', () => {
  it.each([
    // El Salvador es UTC-6: antes de las 06:00 UTC todavía es el día anterior.
    ['2026-11-08T05:59:59Z', '2026-11-07'],
    ['2026-11-08T06:00:00Z', '2026-11-08'],
    ['2026-11-08T23:59:59Z', '2026-11-08'],
    ['2027-01-01T03:00:00Z', '2026-12-31'],
    ['2026-03-01T02:00:00Z', '2026-02-28'],
  ])('%s es %s en el condominio', (instant, expected) => {
    expect(todayIso(new Date(instant))).toBe(expected);
  });

  it('no aplica horario de verano: julio también es UTC-6', () => {
    expect(todayIso(new Date('2026-07-15T05:59:00Z'))).toBe('2026-07-14');
  });
});

describe('currentTime', () => {
  it.each([
    ['2026-11-08T16:42:10Z', '10:42'],
    ['2026-11-08T23:05:00Z', '17:05'],
    // Medianoche debe ser 00:xx, no 24:xx.
    ['2026-11-08T06:00:00Z', '00:00'],
    ['2026-11-08T06:30:00Z', '00:30'],
    ['2026-11-08T05:59:00Z', '23:59'],
  ])('%s son las %s', (instant, expected) => {
    expect(currentTime(new Date(instant))).toBe(expected);
  });
});

describe('fechas de columnas DATE', () => {
  it('toDbDate da la medianoche UTC', () => {
    expect(toDbDate('2026-11-08').toISOString()).toBe(
      '2026-11-08T00:00:00.000Z',
    );
  });

  it.each(['2026-11-08', '2026-01-01', '2026-12-31', '2028-02-29'])(
    'ida y vuelta sin correr el día: %s',
    (iso) => {
      expect(fromDbDate(toDbDate(iso))).toBe(iso);
    },
  );
});

describe('daysInRange', () => {
  it.each([
    ['2026-11-08', '2026-11-08', 1],
    ['2026-11-08', '2026-11-10', 3],
    ['2026-10-30', '2026-11-02', 4],
    ['2026-12-31', '2027-01-01', 2],
    ['2028-02-28', '2028-03-01', 3], // año bisiesto
  ])('de %s a %s son %i días', (start, end, expected) => {
    expect(daysInRange(start, end)).toBe(expected);
  });
});

describe('formatDateEs', () => {
  it('cambia a DD/MM/AAAA conservando los ceros', () => {
    expect(formatDateEs('2026-03-07')).toBe('07/03/2026');
  });
});

describe('addDays', () => {
  it.each([
    ['2026-11-08', 0, '2026-11-08'],
    ['2026-11-08', 2, '2026-11-10'],
    ['2026-11-30', 1, '2026-12-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-02-28', 1, '2028-02-29'], // año bisiesto
    ['2026-10-10', 31, '2026-11-10'],
  ])('%s %+i días es %s', (iso, days, expected) => {
    expect(addDays(iso, days)).toBe(expected);
  });
});

describe('condominiumDayStart', () => {
  it('el día empieza a las 06:00 UTC', () => {
    expect(condominiumDayStart('2026-11-08').toISOString()).toBe(
      '2026-11-08T06:00:00.000Z',
    );
  });

  it('coincide con el cambio de día de todayIso', () => {
    const start = condominiumDayStart('2026-11-08');
    expect(todayIso(start)).toBe('2026-11-08');
    expect(todayIso(new Date(start.getTime() - 1))).toBe('2026-11-07');
  });
});
