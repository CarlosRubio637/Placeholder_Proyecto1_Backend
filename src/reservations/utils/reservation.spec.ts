import { findSlot, reservationCode, slotKey } from './reservation.js';

describe('reservationCode', () => {
  it('arma RS-AAAAMMDD-NNNN con el consecutivo en 4 cifras', () => {
    expect(reservationCode('2026-11-06', 7)).toBe('RS-20261106-0007');
  });
});

describe('slotKey', () => {
  it('une área, fecha e inicio', () => {
    expect(slotKey('a', '2026-11-10', '10:00')).toBe('a|2026-11-10|10:00');
  });
});

describe('findSlot', () => {
  const schedule = { openTime: '08:00', closeTime: '12:00', slotMinutes: 120 };

  it('devuelve la franja que empieza a esa hora', () => {
    expect(findSlot(schedule, '10:00')).toEqual({ startTime: '10:00', endTime: '12:00' });
  });

  it('rechaza una hora que no es inicio de franja', () => {
    expect(findSlot(schedule, '09:00')).toBeNull();
    expect(findSlot(schedule, '12:00')).toBeNull();
  });
});
