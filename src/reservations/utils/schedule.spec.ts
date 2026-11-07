import {
  currentTime,
  daysInRange,
  formatDateEs,
  fromDbDate,
  todayIso,
  toDbDate,
} from '../../common/time/index.js';
import {
  buildSlots,
  CANCEL_REASONS,
  reservationsAffectedByChange,
  validateSchedule,
} from './schedule.js';

const base = { openTime: '08:00', closeTime: '20:00', slotMinutes: 60 };

describe('validateSchedule', () => {
  it('acepta un horario que se divide en franjas completas', () => {
    expect(validateSchedule(base)).toBeNull();
    expect(validateSchedule({ ...base, slotMinutes: 120 })).toBeNull();
  });

  it('rechaza un cierre igual o anterior a la apertura', () => {
    for (const closeTime of ['08:00', '07:30']) {
      expect(validateSchedule({ ...base, closeTime })).toEqual({
        field: 'closeTime',
        message: 'La hora de cierre debe ser posterior a la de apertura.',
      });
    }
  });

  it('rechaza un horario que no es múltiplo de la franja', () => {
    expect(validateSchedule({ ...base, closeTime: '19:00', slotMinutes: 120 })).toEqual({
      field: 'closeTime',
      message: 'El horario debe dividirse en franjas completas de 120 minutos.',
    });
    expect(validateSchedule({ ...base, closeTime: '19:30' })?.field).toBe('closeTime');
  });
});

describe('buildSlots', () => {
  it('arma las franjas del horario', () => {
    const slots = buildSlots({ openTime: '08:30', closeTime: '12:30', slotMinutes: 120 });
    expect(slots).toEqual([
      { startTime: '08:30', endTime: '10:30' },
      { startTime: '10:30', endTime: '12:30' },
    ]);
  });
});

describe('reservationsAffectedByChange', () => {
  const reservations = [
    { id: 'r1', startTime: '08:00', endTime: '09:00' },
    { id: 'r2', startTime: '09:00', endTime: '10:00' },
    { id: 'r3', startTime: '19:00', endTime: '20:00' },
  ];

  it('deshabilitar cancela todas las reservas futuras', () => {
    const result = reservationsAffectedByChange({ ...base, isActive: false }, base, reservations);
    expect(result).toEqual({ ids: ['r1', 'r2', 'r3'], reason: CANCEL_REASONS.disabled });
  });

  it('sin cambio de horario no cancela nada', () => {
    expect(reservationsAffectedByChange({ ...base, isActive: true }, base, reservations).ids).toEqual([]);
  });

  it('acortar el horario cancela las franjas que quedan fuera', () => {
    const next = { ...base, closeTime: '18:00', isActive: true };
    expect(reservationsAffectedByChange(next, base, reservations).ids).toEqual(['r3']);
  });

  it('cambiar la franja a 120 cancela las que ya no coinciden con una franja', () => {
    const next = { ...base, slotMinutes: 120, isActive: true };
    // Franjas nuevas: 08-10, 10-12, ..., 18-20: ninguna reserva de 60 min coincide.
    expect(reservationsAffectedByChange(next, base, reservations).ids).toEqual(['r1', 'r2', 'r3']);
  });
});

describe('hora del condominio', () => {
  // 2026-11-07 03:30 UTC = 2026-11-06 21:30 en El Salvador (UTC-6).
  const now = new Date('2026-11-07T03:30:00Z');

  it('usa la zona horaria del condominio, no la del servidor', () => {
    expect(todayIso(now)).toBe('2026-11-06');
    expect(currentTime(now)).toBe('21:30');
  });

  it('convierte fechas DATE sin correr un día', () => {
    expect(fromDbDate(toDbDate('2026-11-06'))).toBe('2026-11-06');
    expect(daysInRange('2026-11-06', '2026-11-06')).toBe(1);
    expect(daysInRange('2026-11-06', '2027-02-03')).toBe(90);
    expect(formatDateEs('2026-11-06')).toBe('06/11/2026');
  });
});
