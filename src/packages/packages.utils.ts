// Fechas del módulo de paquetería (H19).
//
// El condominio está en El Salvador (UTC-6, sin horario de verano). El
// servidor puede correr en UTC (Docker), así que el día del código y la fecha
// del aviso se calculan siempre en la hora de El Salvador, no en la del
// servidor. Así un paquete recibido a las 8 p. m. no se cuenta como "mañana".

const SV_TIME_ZONE = 'America/El_Salvador';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SV_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(date: Date) {
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    map[part.type] = part.value;
  }
  return map as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
}

/** AAAAMMDD del día en El Salvador: la llave del contador y parte del código. */
export function dayKey(date: Date): string {
  const p = parts(date);
  return `${p.year}${p.month}${p.day}`;
}

/** DD/MM/AAAA en hora de El Salvador. */
export function formatDate(date: Date): string {
  const p = parts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** HH:mm (24 horas) en hora de El Salvador. */
export function formatTime(date: Date): string {
  const p = parts(date);
  return `${p.hour}:${p.minute}`;
}

/** PQ-AAAAMMDD-NNNN */
export function packageCode(day: string, sequence: number): string {
  return `PQ-${day}-${String(sequence).padStart(4, '0')}`;
}
