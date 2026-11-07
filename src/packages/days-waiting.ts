// Días completos desde receivedAt hasta hoy, contados en hora de El Salvador.
//
// Se calcula por días de calendario local, no por 24-horas: un paquete que
// llegó ayer a las 11 p. m. ya lleva "1 día" aunque solo hayan pasado 10
// horas. Así la pantalla coincide con lo que esperaría un residente.

const SV_TIME_ZONE = 'America/El_Salvador';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SV_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Devuelve AAAAMMDD del día de El Salvador para un Date UTC.
function svDayNumber(date: Date): number {
  const [year, month, day] = dayFormatter.format(date).split('-');
  return Number(`${year}${month}${day}`);
}

export function daysWaiting(receivedAt: Date, now: Date = new Date()): number {
  // Diferencia de días calendario. svDayNumber da 20261107, 20261108...
  // La resta no es la cantidad de días, así que se pasa por fechas UTC a
  // medianoche del día local.
  const [ry, rm, rd] = dayFormatter.format(receivedAt).split('-').map(Number);
  const [ny, nm, nd] = dayFormatter.format(now).split('-').map(Number);
  const received = Date.UTC(ry, rm - 1, rd);
  const today = Date.UTC(ny, nm - 1, nd);
  const diff = Math.round((today - received) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

// Últimos 4 caracteres del documento (o null si no hay).
export function docLast4(doc: string | null | undefined): string | null {
  if (!doc) return null;
  return doc.length <= 4 ? doc : doc.slice(-4);
}
