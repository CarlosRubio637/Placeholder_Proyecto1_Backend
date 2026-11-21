import { CONDOMINIUM_TIME_ZONE } from '../incidents.constants.js';

/** INC-AAAA-NNNNN, por ejemplo INC-2026-00042. */
export function formatIncidentNumber(year: number, sequence: number): string {
  return `INC-${year}-${String(sequence).padStart(5, '0')}`;
}

/** Año actual en la zona horaria del condominio (no la del servidor). */
export function currentYear(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CONDOMINIUM_TIME_ZONE,
      year: 'numeric',
    }).format(now),
  );
}
