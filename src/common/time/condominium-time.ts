/**
 * Fechas y horas en la zona horaria del condominio, no en la del servidor.
 *
 * Las fechas "de calendario" (reservas, bloqueos) viajan como "AAAA-MM-DD" y
 * se guardan en columnas DATE. Prisma las representa como Date a medianoche
 * UTC, así que la conversión siempre pasa por UTC para no correr un día.
 */
export const CONDOMINIUM_TIME_ZONE = 'America/El_Salvador';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha de hoy en el condominio, "AAAA-MM-DD". */
export function todayIso(now = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONDOMINIUM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Hora actual en el condominio, "HH:mm" (24 h). */
export function currentTime(now = new Date()): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: CONDOMINIUM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return time;
}

/** "AAAA-MM-DD" → Date para una columna DATE de Prisma. */
export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Date de una columna DATE → "AAAA-MM-DD". */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Días del rango inclusivo: del 1 al 1 es 1 día. */
export function daysInRange(startIso: string, endIso: string): number {
  return (toDbDate(endIso).getTime() - toDbDate(startIso).getTime()) / DAY_MS + 1;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA", para mensajes al usuario. */
export function formatDateEs(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}
