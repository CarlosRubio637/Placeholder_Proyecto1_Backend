import { buildAvailability, findSlot, reservationCode, slotKey } from './reservation.js';

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

describe('buildAvailability', () => {
  const schedule = { openTime: '08:00', closeTime: '11:00', slotMinutes: 60 };
  const base = {
    schedule,
    blocked: false,
    currentTime: null,
    reservations: [],
    unitId: 'mine',
  };
  const statuses = (slots: { status: string }[]) => slots.map((s) => s.status);

  it('genera todas las franjas disponibles en un día libre', () => {
    const slots = buildAvailability(base);
    expect(slots.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
      '08:00-09:00',
      '09:00-10:00',
      '10:00-11:00',
    ]);
    expect(statuses(slots)).toEqual(['DISPONIBLE', 'DISPONIBLE', 'DISPONIBLE']);
  });

  it('marca como propia solo la reserva de la unidad que consulta', () => {
    const slots = buildAvailability({
      ...base,
      reservations: [
        { id: 'r1', startTime: '08:00', unitId: 'mine' },
        { id: 'r2', startTime: '09:00', unitId: 'other' },
      ],
    });
    expect(statuses(slots)).toEqual(['RESERVADO', 'RESERVADO', 'DISPONIBLE']);
    expect(slots.map((s) => s.ownReservationId)).toEqual(['r1', null, null]);
    expect(JSON.stringify(slots)).not.toContain('other');
  });

  it('el Administrador no tiene reservas propias', () => {
    const slots = buildAvailability({
      ...base,
      unitId: null,
      reservations: [{ id: 'r1', startTime: '08:00', unitId: 'mine' }],
    });
    expect(slots[0]).toMatchObject({ status: 'RESERVADO', ownReservationId: null });
  });

  it('un día bloqueado queda en mantenimiento', () => {
    expect(statuses(buildAvailability({ ...base, blocked: true }))).toEqual([
      'MANTENIMIENTO',
      'MANTENIMIENTO',
      'MANTENIMIENTO',
    ]);
  });

  it('hoy, la franja cuyo inicio ya pasó es PASADO aunque esté reservada o bloqueada', () => {
    const slots = buildAvailability({
      ...base,
      currentTime: '09:00',
      reservations: [{ id: 'r1', startTime: '08:00', unitId: 'other' }],
    });
    expect(statuses(slots)).toEqual(['PASADO', 'PASADO', 'DISPONIBLE']);
    expect(statuses(buildAvailability({ ...base, currentTime: '08:30', blocked: true }))).toEqual([
      'PASADO',
      'MANTENIMIENTO',
      'MANTENIMIENTO',
    ]);
  });
});
