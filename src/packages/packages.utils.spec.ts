import { daysWaiting, docLast4 } from './days-waiting.js';
import {
  dayKey,
  formatDate,
  formatTime,
  packageCode,
} from './packages.utils.js';

describe('fechas de paquetería en hora de El Salvador (H19)', () => {
  // El Salvador es UTC-6 todo el año.
  const nightInSv = new Date('2026-11-08T02:30:00Z'); // 7 nov 20:30 en SV

  it('dayKey usa el día de El Salvador, no el del servidor (UTC)', () => {
    expect(dayKey(nightInSv)).toBe('20261107');
    expect(dayKey(new Date('2026-11-08T06:00:00Z'))).toBe('20261108');
  });

  it('formatDate y formatTime dan DD/MM/AAAA y HH:mm de 24 horas', () => {
    expect(formatDate(nightInSv)).toBe('07/11/2026');
    expect(formatTime(nightInSv)).toBe('20:30');
    expect(formatTime(new Date('2026-11-07T06:05:00Z'))).toBe('00:05');
  });

  it('packageCode arma PQ-AAAAMMDD-NNNN con ceros a la izquierda', () => {
    expect(packageCode('20261107', 1)).toBe('PQ-20261107-0001');
    expect(packageCode('20261107', 1234)).toBe('PQ-20261107-1234');
  });
});

describe('daysWaiting (H20)', () => {
  it('cuenta días de calendario en El Salvador, no bloques de 24 horas', () => {
    // Llegó el 6 nov 23:00 SV; ahora es 7 nov 09:00 SV: solo 10 horas, pero 1 día.
    const received = new Date('2026-11-07T05:00:00Z');
    const now = new Date('2026-11-07T15:00:00Z');
    expect(daysWaiting(received, now)).toBe(1);
  });

  it('es 0 el mismo día y cuenta varios días', () => {
    const received = new Date('2026-11-01T15:00:00Z');
    expect(daysWaiting(received, new Date('2026-11-01T23:00:00Z'))).toBe(0);
    expect(daysWaiting(received, new Date('2026-11-08T15:00:00Z'))).toBe(7);
  });

  it('nunca es negativo (reloj adelantado o fecha futura)', () => {
    expect(
      daysWaiting(
        new Date('2026-11-10T15:00:00Z'),
        new Date('2026-11-07T15:00:00Z'),
      ),
    ).toBe(0);
  });
});

describe('docLast4 (H20)', () => {
  it('muestra solo los últimos 4 caracteres del documento', () => {
    expect(docLast4('04567890-1')).toBe('90-1');
    expect(docLast4('1234')).toBe('1234');
    expect(docLast4('12')).toBe('12');
  });

  it('devuelve null si no hay documento', () => {
    expect(docLast4(null)).toBeNull();
    expect(docLast4(undefined)).toBeNull();
    expect(docLast4('')).toBeNull();
  });
});
